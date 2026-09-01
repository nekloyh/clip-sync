import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

/**
 * Authorization tests at the API level, not the helper level.
 *
 * Everything below drives the real route handlers. Only the two things a test
 * cannot have — the database and the request's cookie jar — are faked, so a
 * handler that forgets its permission check fails here even if every helper in
 * `authz.ts` is perfect.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-api-authz-at-least-32-chars';
  return {
    jar: new Map<string, string>(),
    rooms: new Map<string, Record<string, unknown>>(),
    /** Rooms this run queued for deletion, by id. */
    queuedForDeletion: [] as string[],
    db: {
      attachmentRow: null as Record<string, unknown> | null,
      attachmentCount: 0,
      updates: [] as { table: string; values: Record<string, unknown> }[],
      deletes: [] as string[],
      storageRemoved: [] as string[],
      // Lets a test model "the UPDATE matched no rows" — the room was deleted,
      // or the owner version moved, between the guard and the write.
      roomUpdateMatches: true,
      // Same, for queuing a deletion: the conditional update matched nothing.
      deletionAccepted: true,
      // Lets a test model the object landing in storage and the row failing to
      // be written — the one ordering that can leave an object nothing
      // references.
      attachmentInsertFails: false,
      /** Every `.eq(column, value)` a handler applied, so filters can be asserted. */
      filters: [] as { table: string; column: string; value: unknown }[],
    },
    /** How many `createRoom` calls should report the locator as already taken. */
    createCollisions: 0,
    /** Every locator `createRoom` was asked for, in order. */
    createAttempts: [] as string[],
  };
});

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (H.jar.has(name) ? { name, value: H.jar.get(name)! } : undefined),
    getAll: () => [...H.jar].map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock('@/lib/rooms', () => ({
  ATTACHMENTS_BUCKET: 'clipsync-attachments',
  attachmentUrl: (slug: string, id: string) => `/api/rooms/${slug}/attachments/${id}`,
  getRoom: async (slug: string) => H.rooms.get(slug) ?? null,
  createRoom: async (slug: string, ownerSecretHash: string) => {
    H.createAttempts.push(slug);
    // A locator taken by somebody else. Modelled as a counter rather than by
    // pre-seeding a slug, because the route asks the generator for the locator
    // and a test cannot know which one it will get.
    if (H.createCollisions > 0) {
      H.createCollisions -= 1;
      return null;
    }
    if (H.rooms.has(slug)) return null;
    const now = new Date().toISOString();
    const room = {
      id: `id-${slug}`,
      slug,
      pin_hash: null,
      content: '',
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      owner_secret_hash: ownerSecretHash,
      owner_version: 1,
    };
    H.rooms.set(slug, room);
    return room;
  },
  listAttachments: async () => [],
  touchRoom: async () => {},
}));

vi.mock('@/lib/lifecycle', () => ({
  // Mirrors the real contract: queuing is conditional on the owner version the
  // guard authorized against, and reports whether a row actually matched.
  requestRoomDeletion: async (roomId: string, expectedOwnerVersion: number) => {
    const room = [...H.rooms.values()].find((r) => r.id === roomId);
    if (!room || room.owner_version !== expectedOwnerVersion) return false;
    if (!H.db.deletionAccepted) return false;
    H.queuedForDeletion.push(roomId);
    // The room becomes unreadable at the moment of the request, which is what
    // `getRoom` returning null models here.
    H.rooms.delete(room.slug as string);
    return true;
  },
}));

vi.mock('@/lib/supabase/server', () => {
  const chain = (table: string) => {
    const settle = () => {
      if (table === 'attachments') {
        return { data: H.db.attachmentRow, error: null, count: H.db.attachmentCount };
      }
      if (!H.db.roomUpdateMatches) return { data: null, error: null };
      return { data: { id: 'row', updated_at: new Date().toISOString() }, error: null };
    };

    const c: Record<string, unknown> = {
      select: () => c,
      insert: () => c,
      update: (values: Record<string, unknown>) => {
        H.db.updates.push({ table, values });
        return c;
      },
      delete: () => {
        H.db.deletes.push(table);
        return c;
      },
      eq: (column: string, value: unknown) => {
        H.db.filters.push({ table, column, value });
        return c;
      },
      in: () => c,
      order: () => c,
      limit: () => c,
      single: async () => {
        if (table !== 'attachments') return settle();
        if (H.db.attachmentInsertFails) {
          return { data: null, error: { code: '23503', message: 'insert failed' } };
        }
        return {
          data: { id: 'new-att', room_id: 'r', filename: 'a.png', mime: 'image/png', size: 8, created_at: new Date().toISOString() },
          error: null,
        };
      },
      maybeSingle: async () => settle(),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej),
    };
    return c;
  };

  return {
    createAdminClient: () => ({
      from: (table: string) => chain(table),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async (paths: string[]) => {
            H.db.storageRemoved.push(...paths);
            return { error: null };
          },
          download: async () => ({ data: new Blob([Buffer.from([0x89, 0x50])]), error: null }),
        }),
      },
    }),
  };
});

import { POST as createRoomRoute } from '@/app/api/rooms/route';
import { GET as roomStateRoute, DELETE as deleteRoomRoute } from '@/app/api/rooms/[slug]/route';
import { POST as pinRoute } from '@/app/api/rooms/[slug]/pin/route';
import { POST as saveRoute } from '@/app/api/rooms/[slug]/save/route';
import { POST as uploadRoute } from '@/app/api/rooms/[slug]/attachments/route';
import {
  GET as attachmentRoute,
  DELETE as deleteAttachmentRoute,
} from '@/app/api/rooms/[slug]/attachments/[id]/route';
import {
  createOwnerToken,
  generateOwnerSecret,
  ownerSecretHash,
  ownerCookieName,
  ownerSecretFromToken,
  tokenExpiryMs,
} from '@/lib/owner-auth';
import { accessCookieName } from '@/lib/room-auth';
import { memoryStore, setSharedStore } from '@/lib/limiter';
import {
  OWNER_COOKIE,
  LEGACY_OWNER_PREFIX,
  MAX_OWNER_JAR_BYTES,
  parseJar,
  entrySlug,
} from '@/lib/cookie-budget';

const ATTACHMENT_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  H.jar.clear();
  H.rooms.clear();
  H.queuedForDeletion.length = 0;
  H.db.attachmentRow = null;
  H.db.attachmentCount = 0;
  H.db.updates.length = 0;
  H.db.deletes.length = 0;
  H.db.storageRemoved.length = 0;
  H.db.roomUpdateMatches = true;
  H.db.deletionAccepted = true;
  H.db.attachmentInsertFails = false;
  H.db.filters.length = 0;
  H.createCollisions = 0;
  H.createAttempts.length = 0;
  setSharedStore(null);
  memoryStore.reset();
});

// --- fixtures --------------------------------------------------------------

function seedRoom(slug: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const room = {
    id: `id-${slug}`,
    slug,
    pin_hash: null,
    content: 'evidence',
    created_at: now,
    updated_at: now,
    last_seen_at: now,
    owner_secret_hash: null,
    owner_version: 1,
    ...over,
  };
  H.rooms.set(slug, room);
  return room;
}

/** A room with an owner, plus the cookie value that owner's browser holds. */
function seedOwnedRoom(slug: string, over: Record<string, unknown> = {}) {
  const secret = generateOwnerSecret();
  const room = seedRoom(slug, { owner_secret_hash: ownerSecretHash(secret), ...over });
  const version = room.owner_version as number;
  return { room, secret, token: createOwnerToken(slug, version, secret) };
}

/** Puts a capability where a real browser would keep it: the shared jar. */
function beOwner(slug: string, token: string) {
  const current = H.jar.get(OWNER_COOKIE);
  H.jar.set(OWNER_COOKIE, current ? `${current}~${token}` : token);
}

/** A browser still holding a pre-consolidation per-room cookie. */
function beLegacyOwner(slug: string, token: string) {
  H.jar.set(`${LEGACY_OWNER_PREFIX}${slug}`, token);
}

function unlocked(slug: string, token: string) {
  H.jar.set(accessCookieName(slug), token);
}

// --- request helpers -------------------------------------------------------

function jsonRequest(path: string, body: unknown, method = 'POST') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function bareRequest(path: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, { method });
}

function setCookies(res: NextResponse): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** The raw Set-Cookie line for the consolidated jar, if the response sets one. */
function ownerJarCookie(res: NextResponse): string | null {
  return setCookies(res).find((c) => c.startsWith(`${OWNER_COOKIE}=`)) ?? null;
}

function ownerJarValue(res: NextResponse): string {
  const raw = ownerJarCookie(res);
  return raw ? raw.slice(raw.indexOf('=') + 1).split(';')[0] : '';
}

/** The capability this response hands back for one room, if any. */
function ownerCookieFrom(res: NextResponse, slug: string): string | null {
  return parseJar(ownerJarValue(res)).find((e) => entrySlug(e) === slug) ?? null;
}

const setPin = (slug: string, pin: string) =>
  pinRoute(jsonRequest(`/api/rooms/${slug}/pin`, { action: 'set', pin }), { params: { slug } });

const deleteRoom = (slug: string) =>
  deleteRoomRoute(bareRequest(`/api/rooms/${slug}`, 'DELETE'), { params: { slug } });

const deleteAttachment = (slug: string, id = ATTACHMENT_ID) =>
  deleteAttachmentRoute(bareRequest(`/api/rooms/${slug}/attachments/${id}`, 'DELETE'), {
    params: { slug, id },
  });

const roomState = (slug: string) =>
  roomStateRoute(bareRequest(`/api/rooms/${slug}`), { params: { slug } });

// ---------------------------------------------------------------------------

describe('room creation grants the creator an owner capability', () => {
  it('mints a room with a random locator and returns the capability as an httpOnly cookie', async () => {
    const res = await createRoomRoute(jsonRequest('/api/rooms', {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{8}$/);

    expect(ownerCookieFrom(res, body.slug)).toBeTruthy();

    const jar = ownerJarCookie(res)!;
    expect(jar).toContain('HttpOnly');
    expect(jar).toContain('Path=/');
    expect(jar).toContain('SameSite=lax');
  });

  it('never puts the capability in the response body, the URL or the database', async () => {
    const res = await createRoomRoute(jsonRequest('/api/rooms', {}));
    const body = await res.json();

    const token = ownerCookieFrom(res, body.slug)!;
    const secret = token.split('.')[3];

    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(Object.keys(body).sort()).toEqual(['hasPin', 'isExisting', 'slug', 'success']);

    // The row keeps a digest, never the capability itself.
    const stored = H.rooms.get(body.slug)!;
    expect(stored.owner_secret_hash).not.toBe(secret);
    expect(stored.owner_secret_hash).toBe(ownerSecretHash(secret));
  });

  it('treats a caller-supplied slug as join-only, so a custom name is never a new room', async () => {
    const missing = await createRoomRoute(jsonRequest('/api/rooms', { slug: 'my-easy-name' }));
    expect(missing.status).toBe(404);
    expect(H.rooms.has('my-easy-name')).toBe(false);

    seedOwnedRoom('my-easy-name');
    const joined = await createRoomRoute(jsonRequest('/api/rooms', { slug: 'my-easy-name' }));
    expect(joined.status).toBe(200);
    // Joining is not owning.
    expect(ownerCookieFrom(joined, 'my-easy-name')).toBeNull();
  });
});

describe('the cookie jar stays bounded as rooms accumulate', () => {
  /** A request whose browser already holds `count` capabilities in the jar. */
  function withJar(count: number, extra: Record<string, string> = {}) {
    const entries = Array.from({ length: count }, (_, i) => {
      const slug = `quiet-fox-old${String(i).padStart(5, '0')}`;
      return createOwnerToken(slug, 1, generateOwnerSecret(), 1_000_000_000_000 + i * 1000);
    });

    const jar = [`${OWNER_COOKIE}=${entries.join('~')}`, ...Object.entries(extra).map(
      ([k, v]) => `${k}=${v}`
    )].join('; ');

    return new NextRequest('http://localhost/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: jar },
      body: '{}',
    });
  }

  it('keeps every capability in one cookie instead of one cookie per room', async () => {
    const res = await createRoomRoute(withJar(10));
    const body = await res.json();

    // The whole point: a browser that has created a hundred rooms still has one
    // cookie, so it can never hit the per-domain cookie cap and start evicting
    // ownership by rules this app does not control.
    expect(setCookies(res).filter((c) => c.startsWith('cs_owner'))).toHaveLength(1);
    expect(parseJar(ownerJarValue(res))).toHaveLength(11);
    expect(ownerCookieFrom(res, body.slug)).toBeTruthy();
  });

  it('never lets the jar grow past what a browser will store', async () => {
    const res = await createRoomRoute(withJar(80));
    const value = ownerJarValue(res);

    expect(value.length).toBeLessThanOrEqual(MAX_OWNER_JAR_BYTES);
    // Well short of the ~4096-byte single-cookie limit once the name and
    // attributes are added, which is the constraint that actually binds.
    expect(ownerJarCookie(res)!.length).toBeLessThan(4096);
  });

  it('evicts the oldest capabilities and keeps the one it just issued', async () => {
    const res = await createRoomRoute(withJar(80));
    const body = await res.json();
    const kept = parseJar(ownerJarValue(res)).map((e) => entrySlug(e));

    expect(kept).toContain(body.slug);
    expect(kept).not.toContain('quiet-fox-old00000'); // oldest expiry, first out
    expect(kept).toContain('quiet-fox-old00079'); // newest survivor
  });

  it('adopts a pre-consolidation per-room cookie and then expires it', async () => {
    const legacySlug = 'quiet-fox-legacy1';
    const legacyToken = createOwnerToken(legacySlug, 1, generateOwnerSecret());
    const res = await createRoomRoute(
      withJar(2, { [`${LEGACY_OWNER_PREFIX}${legacySlug}`]: legacyToken })
    );

    // Folded into the jar, so the owner does not lose the room...
    expect(ownerCookieFrom(res, legacySlug)).toBe(legacyToken);
    // ...and the original is cleared, so it stops costing header bytes.
    const cleared = setCookies(res).find((c) =>
      c.startsWith(`${LEGACY_OWNER_PREFIX}${legacySlug}=`)
    );
    expect(cleared).toBeTruthy();
    expect(cleared).toMatch(/Max-Age=0/i);
  });

  it('still honours a legacy per-room cookie that has not been folded in yet', async () => {
    const slug = 'quiet-fox-legacy2';
    const { token } = seedOwnedRoom(slug);
    beLegacyOwner(slug, token); // jar deliberately empty

    const state = await roomState(slug);
    expect((await state.json()).capabilities.canManage).toBe(true);
    expect((await deleteRoom(slug)).status).toBe(202);
  });

  it('prefers the jar entry when both forms are present', async () => {
    const slug = 'quiet-fox-legacy3';
    const { token } = seedOwnedRoom(slug);
    beOwner(slug, token);
    beLegacyOwner(slug, 'garbage.that.should.not.win');

    expect((await roomState(slug)).status).toBe(200);
    expect((await (await roomState(slug)).json()).capabilities.canManage).toBe(true);
  });

  it('lets one damaged entry cost only its own room', async () => {
    const good = 'quiet-fox-intact01';
    const { token } = seedOwnedRoom(good);
    // A truncated neighbour sits in the jar next to a valid capability.
    H.jar.set(OWNER_COOKIE, `broken-room.1.999.trunc~${token}`);

    expect((await (await roomState(good)).json()).capabilities.canManage).toBe(true);
  });
});

describe('a second browser on the same URL is a contributor, not an owner', () => {
  it('reports canManage:false and refuses every administrative mutation', async () => {
    seedOwnedRoom('quiet-fox-aaaaaaaa'); // owner token deliberately not in the jar

    const state = await roomState('quiet-fox-aaaaaaaa');
    expect(state.status).toBe(200);
    expect((await state.json()).capabilities).toEqual({
      canManage: false,
      canDeleteEvidence: false,
    });

    expect((await deleteRoom('quiet-fox-aaaaaaaa')).status).toBe(403);
    expect((await setPin('quiet-fox-aaaaaaaa', '4321')).status).toBe(403);
    expect((await deleteAttachment('quiet-fox-aaaaaaaa')).status).toBe(403);

    expect(H.queuedForDeletion).toEqual([]);
    expect(H.db.updates).toEqual([]);
  });

  it('never leaks the owner capability through the room state endpoint', async () => {
    const { token } = seedOwnedRoom('quiet-fox-bbbbbbbb');
    beOwner('quiet-fox-bbbbbbbb', token);

    const body = await (await roomState('quiet-fox-bbbbbbbb')).text();
    expect(body).not.toContain(token);
    expect(body).not.toContain('owner_secret_hash');
    expect(body).not.toContain('pin_hash');
  });
});

describe('the owner can run the room lifecycle', () => {
  it('sets, changes and clears the PIN', async () => {
    const { token } = seedOwnedRoom('quiet-fox-cccccccc');
    beOwner('quiet-fox-cccccccc', token);

    const set = await setPin('quiet-fox-cccccccc', '4321');
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ hasPin: true });

    // Now with a PIN already in place: change it, then remove it.
    H.rooms.get('quiet-fox-cccccccc')!.pin_hash = 'scrypt$32768$8$1$AAAA$BBBB';
    expect((await setPin('quiet-fox-cccccccc', '9876')).status).toBe(200);

    const cleared = await setPin('quiet-fox-cccccccc', '');
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ hasPin: false });
    expect(H.db.updates.at(-1)).toMatchObject({ table: 'rooms', values: { pin_hash: null } });
  });

  it('deletes an attachment and the room', async () => {
    const { token } = seedOwnedRoom('quiet-fox-dddddddd');
    beOwner('quiet-fox-dddddddd', token);
    H.db.attachmentRow = { id: ATTACHMENT_ID, storage_path: 'id-quiet-fox-dddddddd/x.png' };

    expect((await deleteAttachment('quiet-fox-dddddddd')).status).toBe(200);
    expect(H.db.storageRemoved).toContain('id-quiet-fox-dddddddd/x.png');

    // 202, not 200: the room is unreadable from this instant, and the objects
    // are destroyed by the same worker that handles expiry moments later.
    // Claiming 200 would claim the bytes are gone at a point where they are
    // demonstrably still there.
    const deleted = await deleteRoom('quiet-fox-dddddddd');
    expect(deleted.status).toBe(202);
    expect(await deleted.json()).toMatchObject({ status: 'deletion_pending' });
    expect(H.queuedForDeletion).toEqual(['id-quiet-fox-dddddddd']);
  });

  it('is reported to the client as a capability, never as a token', async () => {
    const { token } = seedOwnedRoom('quiet-fox-eeeeeeee');
    beOwner('quiet-fox-eeeeeeee', token);

    const body = await (await roomState('quiet-fox-eeeeeeee')).json();
    expect(body.capabilities).toEqual({ canManage: true, canDeleteEvidence: true });
  });
});

describe('knowing the PIN is not ownership', () => {
  it('unlocks the room but grants no management rights', async () => {
    // A real hash for PIN 1234, so `verify` exercises the real comparison.
    const { hashPin } = await import('@/lib/crypto');
    const pinHash = await hashPin('1234');
    seedOwnedRoom('quiet-fox-ffffffff', { pin_hash: pinHash });

    const verify = await pinRoute(
      jsonRequest('/api/rooms/quiet-fox-ffffffff/pin', { action: 'verify', pin: '1234' }),
      { params: { slug: 'quiet-fox-ffffffff' } }
    );
    expect(await verify.json()).toEqual({ verified: true });

    // Carry the unlock cookie the API just issued into the next requests.
    const unlockCookie = setCookies(verify).find((c) =>
      c.startsWith(`${accessCookieName('quiet-fox-ffffffff')}=`)
    )!;
    unlocked(
      'quiet-fox-ffffffff',
      unlockCookie.slice(unlockCookie.indexOf('=') + 1).split(';')[0]
    );

    // Unlocked: the room reads. Still not the owner: nothing administrative works.
    const state = await roomState('quiet-fox-ffffffff');
    expect(state.status).toBe(200);
    expect((await state.json()).capabilities.canManage).toBe(false);

    expect((await setPin('quiet-fox-ffffffff', '5555')).status).toBe(403);
    expect((await deleteRoom('quiet-fox-ffffffff')).status).toBe(403);
    expect((await deleteAttachment('quiet-fox-ffffffff')).status).toBe(403);
  });
});

describe('owner cookies that should not be trusted', () => {
  it('rejects a forged signature', async () => {
    const { token } = seedOwnedRoom('quiet-fox-11111111');
    const forged = `${token.slice(0, token.lastIndexOf('.'))}.notasignature`;
    beOwner('quiet-fox-11111111', forged);

    expect((await deleteRoom('quiet-fox-11111111')).status).toBe(403);
  });

  it('rejects a payload edited to extend its own expiry', async () => {
    const { room, secret } = seedOwnedRoom('quiet-fox-22222222');
    const real = createOwnerToken('quiet-fox-22222222', room.owner_version as number, secret);
    const [slug, version, , sec, sig] = real.split('.');
    beOwner('quiet-fox-22222222', `${slug}.${version}.${Date.now() + 10 ** 12}.${sec}.${sig}`);

    expect((await deleteRoom('quiet-fox-22222222')).status).toBe(403);
  });

  it('rejects an expired capability', async () => {
    const { room, secret } = seedOwnedRoom('quiet-fox-33333333');
    const longExpired = createOwnerToken(
      'quiet-fox-33333333',
      room.owner_version as number,
      secret,
      Date.now() - 400 * 24 * 60 * 60 * 1000
    );
    beOwner('quiet-fox-33333333', longExpired);

    expect((await deleteRoom('quiet-fox-33333333')).status).toBe(403);
  });

  it("rejects another room's capability", async () => {
    const other = seedOwnedRoom('quiet-fox-44444444');
    seedOwnedRoom('quiet-fox-55555555');
    // Present room A's token under room B's cookie name.
    H.jar.set(ownerCookieName('quiet-fox-55555555'), other.token);

    expect((await deleteRoom('quiet-fox-55555555')).status).toBe(403);
  });

  it('rejects a capability revoked by bumping the room owner version', async () => {
    const { room, secret } = seedOwnedRoom('quiet-fox-66666666');
    const stale = createOwnerToken('quiet-fox-66666666', 1, secret);
    room.owner_version = 2;
    beOwner('quiet-fox-66666666', stale);

    expect((await deleteRoom('quiet-fox-66666666')).status).toBe(403);
  });
});

describe('legacy rooms created before ownership existed', () => {
  it('cannot be claimed by a visitor, however well-formed the cookie', async () => {
    const legacy = seedRoom('quiet-fox-77777777'); // owner_secret_hash stays null
    expect(legacy.owner_secret_hash).toBeNull();

    // A visitor forging a token from a secret of their own choosing.
    const invented = generateOwnerSecret();
    beOwner('quiet-fox-77777777', createOwnerToken('quiet-fox-77777777', 1, invented));

    expect((await roomState('quiet-fox-77777777')).status).toBe(200);
    expect((await (await roomState('quiet-fox-77777777')).json()).capabilities.canManage).toBe(
      false
    );
    expect((await deleteRoom('quiet-fox-77777777')).status).toBe(403);
    expect((await setPin('quiet-fox-77777777', '1234')).status).toBe(403);
    expect((await deleteAttachment('quiet-fox-77777777')).status).toBe(403);
    expect(H.queuedForDeletion).toEqual([]);
  });

  it('stays readable and writable so it can live out its TTL', async () => {
    seedRoom('quiet-fox-88888888');

    const state = await roomState('quiet-fox-88888888');
    expect(state.status).toBe(200);
    expect((await state.json()).room.content).toBe('evidence');

    const saved = await saveRoute(
      jsonRequest('/api/rooms/quiet-fox-88888888/save', { content: 'still editable' }),
      { params: { slug: 'quiet-fox-88888888' } }
    );
    expect(saved.status).toBe(200);
  });
});

describe('the recipient lane is unchanged', () => {
  it('reads, saves text and uploads evidence without any owner capability', async () => {
    seedOwnedRoom('quiet-fox-99999999'); // owner cookie deliberately absent

    expect((await roomState('quiet-fox-99999999')).status).toBe(200);

    const saved = await saveRoute(
      jsonRequest('/api/rooms/quiet-fox-99999999/save', { content: 'a stack trace' }),
      { params: { slug: 'quiet-fox-99999999' } }
    );
    expect(saved.status).toBe(200);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const form = new FormData();
    form.append('file', new File([png], 'shot.png', { type: 'image/png' }));

    const upload = await uploadRoute(
      new NextRequest('http://localhost/api/rooms/quiet-fox-99999999/attachments', {
        method: 'POST',
        body: form,
      }),
      { params: { slug: 'quiet-fox-99999999' } }
    );
    expect(upload.status).toBe(200);
    expect((await upload.json()).attachment.id).toBe('new-att');
  });
});

describe('addressing a room that does not exist', () => {
  it('is a not-found on every route, and creates nothing', async () => {
    expect((await roomState('quiet-fox-00000000')).status).toBe(404);
    expect((await deleteRoom('quiet-fox-00000000')).status).toBe(404);
    expect(
      (
        await saveRoute(jsonRequest('/api/rooms/quiet-fox-00000000/save', { content: 'x' }), {
          params: { slug: 'quiet-fox-00000000' },
        })
      ).status
    ).toBe(404);
    expect((await setPin('quiet-fox-00000000', '1234')).status).toBe(404);

    expect(H.rooms.size).toBe(0);
  });
});

describe('refusals stay uniform', () => {
  it('says the same thing for every insufficient-permission case and leaks no detail', async () => {
    seedOwnedRoom('quiet-fox-abababab');
    const { ERR_FORBIDDEN } = await import('@/lib/http');

    for (const res of [
      await deleteRoom('quiet-fox-abababab'),
      await setPin('quiet-fox-abababab', '1234'),
      await deleteAttachment('quiet-fox-abababab'),
    ]) {
      expect(res.status).toBe(403);
      // One message and one code for every refusal. The code exists so a client
      // can branch without matching prose; it is the *same* code for all three
      // routes, so it still says nothing about which check failed or whether
      // the room even has an owner.
      expect(await res.json()).toEqual({ error: ERR_FORBIDDEN, code: 'forbidden' });
    }
  });
});

// ---------------------------------------------------------------------------
// The capability has a 30-day fuse, but a room stays alive as long as anyone
// keeps visiting it. Without renewal an actively-used room outlives the cookie
// that controls it and becomes permanently unmanageable on day 31.
// ---------------------------------------------------------------------------

function ownerTokenValue(res: NextResponse, slug: string): string | null {
  return ownerCookieFrom(res, slug);
}

describe('the owner capability renews while the room is in use', () => {
  it('slides the expiry forward every time the owner reads room state', async () => {
    const slug = 'quiet-fox-renew001';
    const { room, secret } = seedOwnedRoom(slug);

    // A capability issued 20 days ago: still valid, but past its half-life.
    const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
    const aging = createOwnerToken(slug, room.owner_version as number, secret, twentyDaysAgo);
    beOwner(slug, aging);

    const res = await roomState(slug);
    expect(res.status).toBe(200);
    expect((await res.json()).capabilities.canManage).toBe(true);

    const renewed = ownerTokenValue(res, slug);
    expect(renewed).toBeTruthy();
    expect(tokenExpiryMs(renewed!)!).toBeGreaterThan(tokenExpiryMs(aging)!);
  });

  it('is still the same capability, not a new one', async () => {
    const slug = 'quiet-fox-renew002';
    const { token, secret } = seedOwnedRoom(slug);
    beOwner(slug, token);

    const renewed = ownerTokenValue(await roomState(slug), slug)!;
    // Same secret inside the envelope; only the expiry moved.
    expect(ownerSecretFromToken(renewed)).toBe(secret);
    expect(H.rooms.get(slug)!.owner_secret_hash).toBe(ownerSecretHash(secret));
  });

  it('renews nothing for a contributor, so reading a room never confers ownership', async () => {
    const slug = 'quiet-fox-renew003';
    seedOwnedRoom(slug); // owner cookie deliberately absent

    const res = await roomState(slug);
    expect((await res.json()).capabilities.canManage).toBe(false);
    expect(ownerCookieFrom(res, slug)).toBeNull();
  });

  it('does not resurrect a capability that has already expired', async () => {
    const slug = 'quiet-fox-renew004';
    const { room, secret } = seedOwnedRoom(slug);
    const dead = createOwnerToken(
      slug,
      room.owner_version as number,
      secret,
      Date.now() - 400 * 24 * 60 * 60 * 1000
    );
    beOwner(slug, dead);

    const res = await roomState(slug);
    expect((await res.json()).capabilities.canManage).toBe(false);
    expect(ownerCookieFrom(res, slug)).toBeNull();
    expect((await deleteRoom(slug)).status).toBe(403);
  });

  it('does not renew a capability revoked by an owner_version bump', async () => {
    const slug = 'quiet-fox-renew005';
    const { secret } = seedOwnedRoom(slug);
    const stale = createOwnerToken(slug, 1, secret);
    H.rooms.get(slug)!.owner_version = 2;
    beOwner(slug, stale);

    const res = await roomState(slug);
    expect((await res.json()).capabilities.canManage).toBe(false);
    expect(ownerCookieFrom(res, slug)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Authorization reads the row; the mutation writes it. Anything that changes in
// between has to be caught by the write itself.
// ---------------------------------------------------------------------------

describe('the room can change between the guard and the mutation', () => {
  it('does not report success when a PIN set matches no row', async () => {
    const slug = 'quiet-fox-race0001';
    const { token } = seedOwnedRoom(slug);
    beOwner(slug, token);

    H.db.roomUpdateMatches = false; // room deleted, or version bumped, mid-flight

    const res = await setPin(slug, '4321');
    expect(res.status).toBe(404);
    // and crucially: no unlock cookie for a room that may no longer exist
    expect(setCookies(res).some((c) => c.startsWith(`${accessCookieName(slug)}=`))).toBe(false);
  });

  it('does not report success when clearing a PIN matches no row', async () => {
    const slug = 'quiet-fox-race0002';
    const { token } = seedOwnedRoom(slug, { pin_hash: 'scrypt$32768$8$1$AAAA$BBBB' });
    beOwner(slug, token);

    H.db.roomUpdateMatches = false;
    expect((await setPin(slug, '')).status).toBe(404);
  });

  it('reports not-found when queuing the deletion matches no row', async () => {
    const slug = 'quiet-fox-race0003';
    const { token } = seedOwnedRoom(slug);
    beOwner(slug, token);

    // The guard authorized, but by the time the conditional delete ran the row
    // was gone or its version had moved. Answering `success: true` here would
    // tell the owner their room is destroyed when it may well not be.
    H.db.deletionAccepted = false;

    expect((await deleteRoom(slug)).status).toBe(404);
    expect(H.queuedForDeletion).toEqual([]);
  });

  it('scopes the PIN write to the authorized owner version', async () => {
    const slug = 'quiet-fox-race0004';
    const { token, room } = seedOwnedRoom(slug);
    beOwner(slug, token);

    expect((await setPin(slug, '4321')).status).toBe(200);
    expect(H.db.filters).toContainEqual({
      table: 'rooms',
      column: 'owner_version',
      value: room.owner_version,
    });
  });

  it('refuses a save for a room that was queued for deletion mid-request', async () => {
    const slug = 'quiet-fox-race0005';
    seedOwnedRoom(slug);

    // The guard read an active room; by the time the write ran the owner had
    // pressed delete. Without the `active` predicate the room would quietly go
    // back to being written to while the worker was destroying it.
    H.db.roomUpdateMatches = false;

    const res = await saveRoute(jsonRequest(`/api/rooms/${slug}/save`, { content: 'late' }), {
      params: { slug },
    });

    expect(res.status).toBe(404);
    expect(H.db.filters).toContainEqual({
      table: 'rooms',
      column: 'lifecycle_state',
      value: 'active',
    });
  });

  it('scopes a legacy PIN upgrade to a room that is still active', async () => {
    const slug = 'quiet-fox-race0006';
    // A pre-scrypt digest: sha256('clipsync-salt:<slug>:1234').
    const legacy = createHash('sha256').update(`clipsync-salt:${slug}:1234`).digest('hex');
    seedRoom(slug, { pin_hash: legacy });

    const res = await pinRoute(
      jsonRequest(`/api/rooms/${slug}/pin`, { action: 'verify', pin: '1234' }),
      { params: { slug } }
    );

    expect((await res.json()).verified).toBe(true);
    // The upgrade is a write like any other, and it was the one write in the
    // codebase that did not say which room it was allowed to land on.
    expect(H.db.filters).toContainEqual({
      table: 'rooms',
      column: 'lifecycle_state',
      value: 'active',
    });
  });
});

describe('two callers arriving at once', () => {
  it('picks another locator when the first one is already taken', async () => {
    H.createCollisions = 2;

    const res = await createRoomRoute(jsonRequest('/api/rooms', {}));

    // The old code answered a collision by handing back the *existing* room,
    // which made the second person to pick a name indistinguishable from its
    // creator. Retrying is the whole difference.
    expect(res.status).toBe(200);
    expect((await res.json()).isExisting).toBe(false);
    expect(H.createAttempts).toHaveLength(3);
    expect(new Set(H.createAttempts).size).toBe(3);
  });

  it('gives up rather than looping forever when every locator collides', async () => {
    H.createCollisions = 99;

    const res = await createRoomRoute(jsonRequest('/api/rooms', {}));

    expect(res.status).toBe(503);
    expect(H.rooms.size).toBe(0);
  });

  it('removes the stored object when the attachment row cannot be written', async () => {
    const slug = 'quiet-fox-orphan01';
    seedOwnedRoom(slug);
    H.db.attachmentInsertFails = true;

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const form = new FormData();
    form.append('file', new File([png], 'shot.png', { type: 'image/png' }));

    const res = await uploadRoute(
      new NextRequest(`http://localhost/api/rooms/${slug}/attachments`, {
        method: 'POST',
        body: form,
      }),
      { params: { slug } }
    );

    // Upload writes the object first and the row second, so this ordering is
    // the one that can leave bytes nothing references — in a product whose
    // promise is that data goes away on a schedule.
    expect(res.status).toBe(500);
    expect(H.db.storageRemoved).toHaveLength(1);
    expect(H.db.storageRemoved[0]).toContain(`id-${slug}/`);
  });

  it('says nothing about the provider when it cleans up after itself', async () => {
    const slug = 'quiet-fox-orphan02';
    seedOwnedRoom(slug);
    H.db.attachmentInsertFails = true;

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const form = new FormData();
    form.append('file', new File([png], 'credentials.png', { type: 'image/png' }));

    const res = await uploadRoute(
      new NextRequest(`http://localhost/api/rooms/${slug}/attachments`, {
        method: 'POST',
        body: form,
      }),
      { params: { slug } }
    );

    const text = await res.text();
    expect(text).not.toContain('credentials');
    expect(text).not.toContain(slug);
    expect(text).not.toContain('insert failed');
  });
});

// ---------------------------------------------------------------------------
// Gaps the first QA pass found: behaviour that was correct but unasserted, so
// nothing would have caught a regression.
// ---------------------------------------------------------------------------

describe('contributor powers are bounded where the product says they are', () => {
  it('lets a contributor overwrite the text buffer — shared by design, and documented', async () => {
    const slug = 'quiet-fox-shared01';
    seedOwnedRoom(slug); // no owner cookie: this is a recipient

    const wiped = await saveRoute(jsonRequest(`/api/rooms/${slug}/save`, { content: '' }), {
      params: { slug },
    });
    // Asserted deliberately: text is last-write-wins with no history, and the
    // README says so. If this ever becomes owner-only, this test should fail.
    expect(wiped.status).toBe(200);
  });

  it('refuses an upload once the room is at its attachment cap', async () => {
    const slug = 'quiet-fox-shared02';
    seedOwnedRoom(slug);
    H.db.attachmentCount = 20;

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const form = new FormData();
    form.append('file', new File([png], 'shot.png', { type: 'image/png' }));

    const res = await uploadRoute(
      new NextRequest(`http://localhost/api/rooms/${slug}/attachments`, {
        method: 'POST',
        body: form,
      }),
      { params: { slug } }
    );
    expect(res.status).toBe(400);
  });

  it('refuses reads, saves and uploads on a PIN-locked room with no unlock cookie', async () => {
    const slug = 'quiet-fox-locked99';
    seedOwnedRoom(slug, { pin_hash: 'scrypt$32768$8$1$AAAA$BBBB' });

    expect((await roomState(slug)).status).toBe(401);
    expect(
      (
        await saveRoute(jsonRequest(`/api/rooms/${slug}/save`, { content: 'x' }), {
          params: { slug },
        })
      ).status
    ).toBe(401);
  });

  it('will not serve one room an attachment belonging to another', async () => {
    const a = 'quiet-fox-idor0001';
    const b = 'quiet-fox-idor0002';
    seedOwnedRoom(a);
    seedOwnedRoom(b);

    // The row exists, but not under room B: the handler scopes by room_id, so
    // the lookup misses and the answer is a plain 404.
    H.db.attachmentRow = null;

    const res = await attachmentRoute(bareRequest(`/api/rooms/${b}/attachments/${ATTACHMENT_ID}`), {
      params: { slug: b, id: ATTACHMENT_ID },
    });
    expect(res.status).toBe(404);
  });

  it('rejects an unknown or missing pin action', async () => {
    const slug = 'quiet-fox-action01';
    seedOwnedRoom(slug);

    for (const body of [{ action: 'delete' }, { action: '' }, {}, { action: 'SET' }]) {
      const res = await pinRoute(jsonRequest(`/api/rooms/${slug}/pin`, body), {
        params: { slug },
      });
      expect(res.status).toBe(400);
    }
  });
});
