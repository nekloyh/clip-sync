/**
 * Stable error codes.
 *
 * Two audiences, one vocabulary. The client sees a code plus a human message
 * and can branch on the code without parsing prose; the log and the error
 * monitor record the same code, so "the upload failures at 14:03" is one grep
 * and not a translation exercise.
 *
 * These strings are an API contract: rename one and you break a client's
 * branch and every saved dashboard query at the same time. Add instead.
 *
 * Nothing here is derived from a provider message. A Supabase or Storage error
 * is *classified* into one of these; its text never travels, because it carries
 * table names, bucket names, object paths and request ids.
 */
export const ErrorCode = {
  BAD_SLUG: 'bad_slug',
  NOT_FOUND: 'not_found',
  LOCKED: 'locked',
  FORBIDDEN: 'forbidden',
  UNAUTHORIZED: 'unauthorized',
  INVALID_REQUEST: 'invalid_request',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  UNSUPPORTED_MEDIA: 'unsupported_media',
  ROOM_FULL: 'room_full',
  RATE_LIMITED: 'rate_limited',
  /** The distributed limiter is unreachable and the policy refuses to guess. */
  RATE_LIMITER_UNAVAILABLE: 'rate_limiter_unavailable',
  UPLOAD_FAILED: 'upload_failed',
  STORAGE_DELETE_FAILED: 'storage_delete_failed',
  STORAGE_UNAVAILABLE: 'storage_unavailable',
  DB_ERROR: 'db_error',
  SCHEMA_MISSING: 'schema_missing',
  CONFIG_MISSING: 'config_missing',
  NOT_CONFIGURED: 'not_configured',
  INTERNAL: 'internal',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

export function isErrorCode(value: unknown): value is ErrorCodeValue {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

/**
 * A provider's own error *code*, if it published one that is safe to record.
 *
 * Codes are safe in a way messages are not: `42703` is a fact about the schema,
 * while the message that accompanies it names the column, the table and
 * sometimes the value that failed. The shape check is what enforces that
 * distinction — anything longer or containing punctuation is a sentence
 * wearing a code's clothes, and is dropped.
 */
export function providerCodeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return undefined;
  if (!/^[A-Za-z0-9_]{1,12}$/.test(code)) return undefined;
  return code;
}
