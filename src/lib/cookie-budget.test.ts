import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-cookie-budget-32-chars';
});

const {
  parseJar,
  entrySlug,
  findOwnerEntry,
  upsertOwnerEntry,
  legacyOwnerEntries,
  cookiesToEvict,
  writeOwnerJar,
  OWNER_COOKIE,
  LEGACY_OWNER_PREFIX,
  ACCESS_COOKIE_PREFIX,
  MAX_OWNER_JAR_BYTES,
  MAX_ACCESS_COOKIES,
} = await import('./cookie-budget');

/** Shaped like a real token: `<slug>.<version>.<expiry>.<secret>.<signature>`. */
function entry(slug: string, expiry: number, pad = 40) {
  return `${slug}.1.${expiry}.${'s'.repeat(pad)}.${'g'.repeat(43)}`;
}

describe('reading a capability out of the jar', () => {
  it('finds the entry for one room and ignores the rest', () => {
    const a = entry('room-a', 2000);
    const b = entry('room-b', 3000);
    const cookies = [{ name: OWNER_COOKIE, value: `${a}~${b}` }];

    expect(findOwnerEntry(cookies, 'room-a')).toBe(a);
    expect(findOwnerEntry(cookies, 'room-b')).toBe(b);
    expect(findOwnerEntry(cookies, 'room-c')).toBeUndefined();
  });

  it('does not confuse a room with one whose slug shares its prefix', () => {
    const short = entry('abc', 2000);
    const long = entry('abcd', 3000);
    const cookies = [{ name: OWNER_COOKIE, value: `${short}~${long}` }];

    expect(findOwnerEntry(cookies, 'abc')).toBe(short);
    expect(findOwnerEntry(cookies, 'abcd')).toBe(long);
    expect(findOwnerEntry(cookies, 'ab')).toBeUndefined();
  });

  it('falls back to a pre-consolidation per-room cookie', () => {
    const legacy = entry('room-x', 2000);
    const cookies = [{ name: `${LEGACY_OWNER_PREFIX}room-x`, value: legacy }];
    expect(findOwnerEntry(cookies, 'room-x')).toBe(legacy);
  });

  it('prefers the jar over the legacy cookie for the same room', () => {
    const fresh = entry('room-x', 9000);
    const cookies = [
      { name: OWNER_COOKIE, value: fresh },
      { name: `${LEGACY_OWNER_PREFIX}room-x`, value: entry('room-x', 2000) },
    ];
    expect(findOwnerEntry(cookies, 'room-x')).toBe(fresh);
  });

  it('survives a jar that is empty, malformed or absent', () => {
    expect(parseJar(undefined)).toEqual([]);
    expect(parseJar('')).toEqual([]);
    expect(parseJar('~~~')).toEqual([]);
    expect(findOwnerEntry([], 'room-a')).toBeUndefined();
    expect(findOwnerEntry([{ name: OWNER_COOKIE, value: 'garbage' }], 'room-a')).toBeUndefined();
    expect(entrySlug('')).toBeNull();
  });

  it('leaves a damaged neighbour costing only its own room', () => {
    const good = entry('room-good', 5000);
    const cookies = [{ name: OWNER_COOKIE, value: `truncated-entry~${good}` }];
    expect(findOwnerEntry(cookies, 'room-good')).toBe(good);
  });
});

describe('writing a capability into the jar', () => {
  it('adds a new room without disturbing the others', () => {
    const existing = [entry('room-a', 2000), entry('room-b', 3000)];
    const added = entry('room-c', 4000);

    const jar = parseJar(upsertOwnerEntry(existing, added));
    expect(jar).toHaveLength(3);
    expect(jar.map(entrySlug).sort()).toEqual(['room-a', 'room-b', 'room-c']);
  });

  it('replaces rather than duplicates when a room is renewed', () => {
    const old = entry('room-a', 2000);
    const renewed = entry('room-a', 9000);

    const jar = parseJar(upsertOwnerEntry([old, entry('room-b', 3000)], renewed));
    expect(jar.filter((e) => entrySlug(e) === 'room-a')).toEqual([renewed]);
    expect(jar).toHaveLength(2);
  });

  it('never exceeds the byte budget', () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`room-${i}`, 1000 + i));
    const value = upsertOwnerEntry(many, entry('room-new', 99999));
    expect(value.length).toBeLessThanOrEqual(MAX_OWNER_JAR_BYTES);
  });

  it('evicts oldest-first and always keeps the entry being written', () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`room-${i}`, 1000 + i));
    const fresh = entry('room-new', 50);  // deliberately the *lowest* expiry
    const jar = parseJar(upsertOwnerEntry(many, fresh));

    // The room being written is the one in use, so it survives regardless.
    expect(jar).toContain(fresh);
    expect(jar).toContain(entry('room-199', 1199)); // newest of the rest
    expect(jar).not.toContain(entry('room-0', 1000)); // oldest of the rest
  });

  it('treats an unreadable expiry as oldest', () => {
    const fill = Array.from({ length: 60 }, (_, i) => entry(`room-${i}`, 5000 + i));
    const junk = 'rubbish-entry-with-no-parseable-expiry';
    const jar = parseJar(upsertOwnerEntry([junk, ...fill], entry('room-new', 9999)));
    expect(jar).not.toContain(junk);
  });

  it('produces a jar that reads back entry-for-entry', () => {
    const value = upsertOwnerEntry([entry('room-a', 2000)], entry('room-b', 3000));
    const cookies = [{ name: OWNER_COOKIE, value }];
    expect(findOwnerEntry(cookies, 'room-a')).toBeTruthy();
    expect(findOwnerEntry(cookies, 'room-b')).toBeTruthy();
  });
});

describe('writeOwnerJar', () => {
  function recorder() {
    const written: { name: string; value: string; options: Record<string, unknown> }[] = [];
    return {
      written,
      writer: {
        set(name: string, value: string, options: Record<string, unknown>) {
          written.push({ name, value, options });
        },
      },
    };
  }

  it('writes exactly one owner cookie', () => {
    const { written, writer } = recorder();
    writeOwnerJar(writer, [], entry('room-a', 2000), { path: '/' });

    expect(written.filter((w) => w.name === OWNER_COOKIE)).toHaveLength(1);
  });

  it('folds legacy per-room cookies in and expires them', () => {
    const legacyA = entry('old-a', 2000);
    const legacyB = entry('old-b', 3000);
    const { written, writer } = recorder();

    writeOwnerJar(
      writer,
      [
        { name: `${LEGACY_OWNER_PREFIX}old-a`, value: legacyA },
        { name: `${LEGACY_OWNER_PREFIX}old-b`, value: legacyB },
      ],
      entry('room-new', 4000),
      { path: '/' }
    );

    const jar = written.find((w) => w.name === OWNER_COOKIE)!;
    expect(parseJar(jar.value).map(entrySlug).sort()).toEqual(['old-a', 'old-b', 'room-new']);

    for (const name of [`${LEGACY_OWNER_PREFIX}old-a`, `${LEGACY_OWNER_PREFIX}old-b`]) {
      const cleared = written.find((w) => w.name === name)!;
      expect(cleared.value).toBe('');
      expect(cleared.options.maxAge).toBe(0);
    }
  });

  it('does not mistake the consolidated cookie for a legacy one', () => {
    // `cs_owner` is a prefix of `cs_owner_<slug>`, so a careless filter would
    // fold the jar into itself and then expire it.
    const jarValue = entry('room-a', 2000);
    const { written, writer } = recorder();

    writeOwnerJar(
      writer,
      [{ name: OWNER_COOKIE, value: jarValue }],
      entry('room-b', 3000),
      { path: '/' }
    );

    expect(legacyOwnerEntries([{ name: OWNER_COOKIE, value: jarValue }])).toEqual([]);
    const cleared = written.filter((w) => w.options.maxAge === 0);
    expect(cleared).toEqual([]);
  });
});

describe('access cookies are still per-room and still capped', () => {
  function fill(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      name: `${ACCESS_COOKIE_PREFIX}room${i}`,
      value: entry(`room${i}`, 1_000_000 + i),
    }));
  }

  it('evicts nothing under the cap', () => {
    expect(cookiesToEvict(fill(MAX_ACCESS_COOKIES - 5), ACCESS_COOKIE_PREFIX, 'cs_room_new')).toEqual(
      []
    );
  });

  it('makes exactly one slot at the cap, oldest first', () => {
    const evicted = cookiesToEvict(fill(MAX_ACCESS_COOKIES), ACCESS_COOKIE_PREFIX, 'cs_room_new');
    expect(evicted).toEqual([`${ACCESS_COOKIE_PREFIX}room0`]);
  });

  it('never evicts the cookie being written, or unrelated cookies', () => {
    const keep = `${ACCESS_COOKIE_PREFIX}room0`;
    const existing = [...fill(MAX_ACCESS_COOKIES + 5), { name: 'clipsync-theme', value: 'dark' }];
    const evicted = cookiesToEvict(existing, ACCESS_COOKIE_PREFIX, keep);

    expect(evicted).not.toContain(keep);
    expect(evicted).not.toContain('clipsync-theme');
  });
});
