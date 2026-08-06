import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// promisify() picks the 3-argument overload, so the options-taking form has to
// be spelled out.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

// scrypt cost parameters. N=2^15 keeps a single verification around ~60ms on a
// typical serverless CPU, which is what makes a 4-6 digit PIN survivable: a
// full 6-digit sweep costs ~17 CPU-hours per room instead of milliseconds.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

const PREFIX = 'scrypt';

/**
 * Hashes a PIN. The returned string is self-describing:
 *   scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(pin.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time PIN verification.
 *
 * Also accepts the legacy `sha256(clipsync-salt:<slug>:<pin>)` hex digests that
 * earlier versions wrote, so existing rooms keep unlocking. Callers should
 * re-hash with {@link hashPin} whenever {@link isLegacyHash} reports true.
 */
export async function verifyPin(
  pin: string,
  storedHash: string,
  legacySalt: string
): Promise<boolean> {
  if (!storedHash) return false;

  if (isLegacyHash(storedHash)) {
    return timingSafeEqualString(legacyHashPin(pin, legacySalt), storedHash);
  }

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length === 0) return false;

  const derived = await scryptAsync(pin.normalize('NFKC'), salt, expected.length, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  });

  return timingSafeEqual(derived, expected);
}

/** True for the pre-scrypt 64-char hex digests. */
export function isLegacyHash(storedHash: string): boolean {
  return /^[0-9a-f]{64}$/.test(storedHash);
}

function legacyHashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`clipsync-salt:${salt}:${pin}`).digest('hex');
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Short, non-reversible fingerprint of a stored hash. Embedded in access
 * cookies so that changing or clearing a room PIN invalidates every cookie
 * issued under the old one.
 */
export function hashFingerprint(storedHash: string | null): string {
  return createHash('sha256')
    .update(storedHash ?? 'no-pin')
    .digest('hex')
    .slice(0, 16);
}
