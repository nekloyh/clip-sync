import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The room page used to be a second, unguarded creation path: visiting
 * `/r/anything` minted a row and handed the visitor a room indistinguishable
 * from one they had created. These tests pin that door shut.
 */

const H = vi.hoisted(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-room-page-at-least-32-chars';
  return {
    jar: new Map<string, string>(),
    rooms: new Map<string, Record<string, unknown>>(),
    createCalls: 0,
  };
});

class NotFoundError extends Error {}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

vi.mock('next/headers', () => ({
  headers: () => new Headers(),
  cookies: () => ({
    get: (name: string) => (H.jar.has(name) ? { name, value: H.jar.get(name)! } : undefined),
    getAll: () => [...H.jar].map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }));

vi.mock('@/lib/rooms', () => ({
  getRoom: async (slug: string) => H.rooms.get(slug) ?? null,
  createRoom: async () => {
    H.createCalls += 1;
    return null;
  },
  listAttachments: async () => [],
  touchRoom: async () => {},
}));

vi.mock('@/components/room/TextEditor', () => ({ TextEditor: () => null }));
vi.mock('@/components/room/RoomLockScreen', () => ({ RoomLockScreen: () => null }));
vi.mock('@/components/ui/SupabaseSetupNotice', () => ({ SupabaseSetupNotice: () => null }));

import RoomPage from '@/app/r/[slug]/page';
import { RoomLockScreen } from '@/components/room/RoomLockScreen';
import { createOwnerToken, generateOwnerSecret, ownerSecretHash } from '@/lib/owner-auth';
import { OWNER_COOKIE } from '@/lib/cookie-budget';
import { memoryStore, setSharedStore } from '@/lib/limiter';

beforeEach(() => {
  H.jar.clear();
  H.rooms.clear();
  H.createCalls = 0;
  // No shared store: the page's visit limit falls back to the per-instance one,
  // which is what a local run does too.
  setSharedStore(null);
  memoryStore.reset();
});

function seedRoom(slug: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const room = {
    id: `id-${slug}`,
    slug,
    pin_hash: null,
    content: '',
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

describe('visiting a room URL', () => {
  it('is a not-found for a slug with nothing behind it, and creates no row', async () => {
    await expect(RoomPage({ params: { slug: 'quiet-fox-notaroom' } })).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(H.createCalls).toBe(0);
    expect(H.rooms.size).toBe(0);
  });

  it('shows the lock screen for a PIN-protected room without an unlock cookie', async () => {
    seedRoom('quiet-fox-locked01', { pin_hash: 'scrypt$32768$8$1$AAAA$BBBB' });

    const result = (await RoomPage({ params: { slug: 'quiet-fox-locked01' } })) as {
      type: unknown;
    };
    expect(result.type).toBe(RoomLockScreen);
  });

  it('renders a visitor as a contributor', async () => {
    seedRoom('quiet-fox-openroom');

    const result = (await RoomPage({ params: { slug: 'quiet-fox-openroom' } })) as {
      props: { initialCapabilities: unknown };
    };
    expect(result.props.initialCapabilities).toEqual({
      canManage: false,
      canDeleteEvidence: false,
    });
  });

  it('tells a creator, once, that ownership lives in this browser', async () => {
    const secret = generateOwnerSecret();
    seedRoom('quiet-fox-freshmad', { owner_secret_hash: ownerSecretHash(secret) });
    H.jar.set(OWNER_COOKIE, createOwnerToken('quiet-fox-freshmad', 1, secret));

    const created = (await RoomPage({
      params: { slug: 'quiet-fox-freshmad' },
      searchParams: { new: '1' },
    })) as { props: { justCreated: boolean } };
    expect(created.props.justCreated).toBe(true);

    // Not on any later visit: it is a warning, not furniture.
    const revisited = (await RoomPage({
      params: { slug: 'quiet-fox-freshmad' },
    })) as { props: { justCreated: boolean } };
    expect(revisited.props.justCreated).toBe(false);
  });

  it('renders the creator as the owner', async () => {
    const secret = generateOwnerSecret();
    seedRoom('quiet-fox-ownedroo', { owner_secret_hash: ownerSecretHash(secret) });
    H.jar.set(OWNER_COOKIE, createOwnerToken('quiet-fox-ownedroo', 1, secret));

    const result = (await RoomPage({ params: { slug: 'quiet-fox-ownedroo' } })) as {
      props: { initialCapabilities: unknown };
    };
    expect(result.props.initialCapabilities).toEqual({
      canManage: true,
      canDeleteEvidence: true,
    });
  });
});
