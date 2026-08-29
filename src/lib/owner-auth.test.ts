import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-owner-auth-at-least-32-chars';
});

const {
  createOwnerToken,
  verifyOwnerToken,
  generateOwnerSecret,
  ownerSecretHash,
  ownerCookieName,
  ownerCookieOptions,
  ownerSecretFromToken,
  renewOwnerToken,
  tokenExpiryMs,
} = await import('./owner-auth');

const NOW = 1_700_000_000_000;

const SECRET = 'zzzz-a-fixed-secret-for-tests-zzzz';
const owned = { owner_secret_hash: ownerSecretHash(SECRET), owner_version: 1 };

describe('owner capability tokens', () => {
  it('verifies a token it just issued', () => {
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    expect(verifyOwnerToken(token, 'quiet-fox', owned, NOW + 1000)).toBe(true);
  });

  it('is bound to one room', () => {
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    expect(verifyOwnerToken(token, 'other-room', owned, NOW)).toBe(false);
  });

  it('is rejected when it carries a different secret than the room stores', () => {
    const token = createOwnerToken('quiet-fox', 1, generateOwnerSecret(), NOW);
    expect(verifyOwnerToken(token, 'quiet-fox', owned, NOW)).toBe(false);
  });

  it('is revoked by bumping the room owner version', () => {
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    expect(verifyOwnerToken(token, 'quiet-fox', { ...owned, owner_version: 2 }, NOW)).toBe(false);
  });

  it('expires', () => {
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    expect(verifyOwnerToken(token, 'quiet-fox', owned, NOW + thirtyOneDays)).toBe(false);
  });

  it('rejects tampering with the payload', () => {
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    const [slug, version, , secret, signature] = token.split('.');

    // Push the expiry a decade out but keep the original signature.
    const forged = `${slug}.${version}.${NOW + 10 ** 12}.${secret}.${signature}`;
    expect(verifyOwnerToken(forged, 'quiet-fox', owned, NOW)).toBe(false);
  });

  it('rejects an unsigned, truncated or garbage token', () => {
    expect(verifyOwnerToken(undefined, 'quiet-fox', owned, NOW)).toBe(false);
    expect(verifyOwnerToken('', 'quiet-fox', owned, NOW)).toBe(false);
    expect(verifyOwnerToken('garbage', 'quiet-fox', owned, NOW)).toBe(false);
    expect(verifyOwnerToken(`quiet-fox.1.${NOW + 1000}.${SECRET}.`, 'quiet-fox', owned, NOW)).toBe(
      false
    );
    // Valid signature, but the envelope is the wrong shape.
    expect(verifyOwnerToken(createOwnerToken('quiet-fox', 1, 'a.b', NOW), 'quiet-fox', owned, NOW))
      .toBe(false);
  });

  it('never treats a room without an owner as owned', () => {
    const legacy = { owner_secret_hash: null, owner_version: 1 };
    const token = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    expect(verifyOwnerToken(token, 'quiet-fox', legacy, NOW)).toBe(false);
    expect(verifyOwnerToken(undefined, 'quiet-fox', legacy, NOW)).toBe(false);
  });

  it('stores a digest, not the capability', () => {
    const secret = generateOwnerSecret();
    const hash = ownerSecretHash(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
  });

  it('mints unguessable secrets', () => {
    const a = generateOwnerSecret();
    const b = generateOwnerSecret();
    expect(a).not.toBe(b);
    // 32 random bytes, base64url-encoded.
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
  });

  it('names its cookie per room and keeps it httpOnly', () => {
    expect(ownerCookieName('quiet-fox')).toBe('cs_owner_quiet-fox');
    expect(ownerCookieName('a')).not.toBe(ownerCookieName('b'));
    expect(ownerCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});

describe('renewal', () => {
  it('slides the expiry forward while keeping the same secret', () => {
    const issued = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    const later = NOW + 20 * 24 * 60 * 60 * 1000;

    const renewed = renewOwnerToken(issued, 'quiet-fox', owned, later)!;
    expect(renewed).toBeTruthy();
    expect(tokenExpiryMs(renewed)!).toBeGreaterThan(tokenExpiryMs(issued)!);
    expect(ownerSecretFromToken(renewed)).toBe(SECRET);
    expect(verifyOwnerToken(renewed, 'quiet-fox', owned, later)).toBe(true);
  });

  it('renews nothing it would not have verified', () => {
    const valid = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    const expired = createOwnerToken('quiet-fox', 1, SECRET, NOW - 400 * 24 * 60 * 60 * 1000);
    const legacy = { owner_secret_hash: null, owner_version: 1 };

    expect(renewOwnerToken(expired, 'quiet-fox', owned, NOW)).toBeNull();
    expect(renewOwnerToken(valid, 'other-room', owned, NOW)).toBeNull();
    expect(renewOwnerToken(valid, 'quiet-fox', { ...owned, owner_version: 2 }, NOW)).toBeNull();
    expect(renewOwnerToken(valid, 'quiet-fox', legacy, NOW)).toBeNull();
    expect(renewOwnerToken('garbage', 'quiet-fox', owned, NOW)).toBeNull();
    expect(
      renewOwnerToken(`${valid.slice(0, valid.lastIndexOf('.'))}.forged`, 'quiet-fox', owned, NOW)
    ).toBeNull();
  });

  it('cannot extend a capability past its own ceiling without being used', () => {
    // Renewal is driven by use: a token left untouched for the full window is
    // simply expired, and no amount of later renewal brings it back.
    const issued = createOwnerToken('quiet-fox', 1, SECRET, NOW);
    const tooLate = NOW + 31 * 24 * 60 * 60 * 1000;
    expect(renewOwnerToken(issued, 'quiet-fox', owned, tooLate)).toBeNull();
  });
});

describe('token field extraction', () => {
  it('reads the secret only from a well-formed envelope', () => {
    expect(ownerSecretFromToken(createOwnerToken('quiet-fox', 1, SECRET, NOW))).toBe(SECRET);
    expect(ownerSecretFromToken('a.b.c')).toBeNull();
    expect(ownerSecretFromToken('nodots')).toBeNull();
    expect(ownerSecretFromToken('')).toBeNull();
  });

  it('reads expiry for cookie ordering, and refuses non-finite values', () => {
    expect(tokenExpiryMs(createOwnerToken('quiet-fox', 1, SECRET, NOW))).toBe(
      NOW + 30 * 24 * 60 * 60 * 1000
    );
    expect(tokenExpiryMs('a.b.Infinity.d.e')).toBeNull();
    expect(tokenExpiryMs('a.b.nope.d.e')).toBeNull();
    expect(tokenExpiryMs('short')).toBeNull();
  });
});
