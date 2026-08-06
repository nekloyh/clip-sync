import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { hashPin, verifyPin, isLegacyHash, hashFingerprint } from './crypto';

describe('hashPin / verifyPin', () => {
  it('accepts the correct PIN and rejects a wrong one', async () => {
    const stored = await hashPin('4821');

    await expect(verifyPin('4821', stored, 'quiet-fox')).resolves.toBe(true);
    await expect(verifyPin('4822', stored, 'quiet-fox')).resolves.toBe(false);
    await expect(verifyPin('', stored, 'quiet-fox')).resolves.toBe(false);
  });

  it('salts each hash, so the same PIN never produces the same digest', async () => {
    const a = await hashPin('123456');
    const b = await hashPin('123456');
    expect(a).not.toBe(b);
    await expect(verifyPin('123456', a, 's')).resolves.toBe(true);
    await expect(verifyPin('123456', b, 's')).resolves.toBe(true);
  });

  it('encodes its own cost parameters', async () => {
    const stored = await hashPin('1234');
    expect(stored.split('$')).toHaveLength(6);
    expect(stored.startsWith('scrypt$32768$8$1$')).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPin('1234', 'not-a-hash', 's')).resolves.toBe(false);
    await expect(verifyPin('1234', 'scrypt$1$2$3', 's')).resolves.toBe(false);
    await expect(verifyPin('1234', '', 's')).resolves.toBe(false);
  });
});

describe('legacy sha256 hashes', () => {
  const legacy = (pin: string, slug: string) =>
    createHash('sha256').update(`clipsync-salt:${slug}:${pin}`).digest('hex');

  it('still unlocks rooms created before the scrypt migration', async () => {
    const stored = legacy('4821', 'quiet-fox');
    expect(isLegacyHash(stored)).toBe(true);

    await expect(verifyPin('4821', stored, 'quiet-fox')).resolves.toBe(true);
    await expect(verifyPin('4821', stored, 'other-room')).resolves.toBe(false);
    await expect(verifyPin('9999', stored, 'quiet-fox')).resolves.toBe(false);
  });

  it('does not mistake a scrypt hash for a legacy one', async () => {
    expect(isLegacyHash(await hashPin('1234'))).toBe(false);
  });
});

describe('hashFingerprint', () => {
  it('changes whenever the stored hash changes', async () => {
    const a = await hashPin('1111');
    const b = await hashPin('2222');
    expect(hashFingerprint(a)).not.toBe(hashFingerprint(b));
    expect(hashFingerprint(a)).toBe(hashFingerprint(a));
  });

  it('has a distinct value for "no PIN"', async () => {
    expect(hashFingerprint(null)).not.toBe(hashFingerprint(await hashPin('1234')));
    expect(hashFingerprint(null)).toHaveLength(16);
  });
});
