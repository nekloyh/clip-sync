import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.CLIPSYNC_AUTH_SECRET = 'test-secret-for-room-auth-at-least-32-chars';
});

const { createAccessToken, verifyAccessToken, accessCookieName } = await import('./room-auth');

const HASH_A = 'scrypt$32768$8$1$AAAA$BBBB';
const HASH_B = 'scrypt$32768$8$1$CCCC$DDDD';
const NOW = 1_700_000_000_000;

describe('room access tokens', () => {
  it('verifies a token it just issued', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    expect(verifyAccessToken(token, 'quiet-fox', HASH_A, NOW + 1000)).toBe(true);
  });

  it('is bound to one slug', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    expect(verifyAccessToken(token, 'other-room', HASH_A, NOW)).toBe(false);
  });

  it('is revoked when the PIN changes or is removed', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    expect(verifyAccessToken(token, 'quiet-fox', HASH_B, NOW)).toBe(false);
    expect(verifyAccessToken(token, 'quiet-fox', null, NOW)).toBe(false);
  });

  it('expires', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    expect(verifyAccessToken(token, 'quiet-fox', HASH_A, NOW + eightDays)).toBe(false);
  });

  it('rejects tampering with the payload', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    const [slug, fingerprint, , signature] = token.split('.');

    // Push the expiry a decade out but keep the original signature.
    const forged = `${slug}.${fingerprint}.${NOW + 10 ** 12}.${signature}`;
    expect(verifyAccessToken(forged, 'quiet-fox', HASH_A, NOW)).toBe(false);
  });

  it('rejects an unsigned or truncated token', () => {
    expect(verifyAccessToken(undefined, 'quiet-fox', HASH_A, NOW)).toBe(false);
    expect(verifyAccessToken('', 'quiet-fox', HASH_A, NOW)).toBe(false);
    expect(verifyAccessToken('garbage', 'quiet-fox', HASH_A, NOW)).toBe(false);
    expect(verifyAccessToken(`quiet-fox.abc.${NOW + 1000}.`, 'quiet-fox', HASH_A, NOW)).toBe(false);
  });

  it('does not carry the PIN hash itself', () => {
    const token = createAccessToken('quiet-fox', HASH_A, NOW);
    expect(token).not.toContain(HASH_A);
    expect(token).not.toContain('BBBB');
  });

  it('names its cookie per room', () => {
    expect(accessCookieName('quiet-fox')).toBe('cs_room_quiet-fox');
    expect(accessCookieName('a')).not.toBe(accessCookieName('b'));
  });
});
