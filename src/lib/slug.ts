const ADJECTIVES = [
  "quiet", "swift", "clever", "bright", "calm", "gentle", "happy", "brave",
  "silent", "eager", "cozy", "noble", "vibrant", "zen", "keen", "fuzzy",
  "sleek", "nimble", "misty", "cosmic", "solar", "lunar", "wild", "mellow"
];

const NOUNS = [
  "fox", "owl", "bear", "wolf", "hawk", "lion", "tiger", "deer",
  "koala", "panda", "otter", "eagle", "falcon", "lynx", "hare", "robin",
  "dolph", "breeze", "comet", "orbit", "pulse", "spark", "node", "stream"
];

// Unambiguous lowercase base32 (no l/1, no o/0) — the slug gets read aloud and
// retyped on a phone, so confusable characters are worth dropping.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SUFFIX_LEN = 8;

export const MAX_SLUG_LENGTH = 64;

/**
 * The room URL *is* the credential for rooms without a PIN, so the slug needs
 * real entropy. adjective+noun (~9.2 bits) plus 8 random base32 chars puts this
 * at ~49 bits — enumeration is no longer practical, unlike the previous
 * ~22-bit `adj-noun-4digits` scheme.
 */
export function generateRandomSlug(): string {
  const bytes = new Uint8Array(SUFFIX_LEN + 2);
  globalThis.crypto.getRandomValues(bytes);

  const adj = ADJECTIVES[bytes[0] % ADJECTIVES.length];
  const noun = NOUNS[bytes[1] % NOUNS.length];

  let suffix = '';
  for (let i = 0; i < SUFFIX_LEN; i++) {
    suffix += ALPHABET[bytes[i + 2] % ALPHABET.length];
  }

  return `${adj}-${noun}-${suffix}`;
}

/**
 * Canonical slug form. Every entry point (page params, API params, user input)
 * must run through this so the same room can never be reached under two
 * spellings, and so nothing but `[a-z0-9-]` ever reaches the database.
 */
export function normalizeSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= MAX_SLUG_LENGTH && /^[a-z0-9-]+$/.test(slug);
}
