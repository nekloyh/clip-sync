import { NextResponse } from 'next/server';
import { ErrorCode, type ErrorCodeValue } from './errors';
import { captureThrown, captureError } from './monitoring';

/**
 * The one way a route handler produces an error response.
 *
 * Two rules, both enforced here rather than remembered at each call site:
 *
 *   1. The client gets a stable machine code plus a human message, and nothing
 *      else. The underlying Postgres or Storage message never travels: it names
 *      tables, columns, constraints, buckets and object paths, and an object
 *      path in this application begins with the room id.
 *   2. The detail that does not travel is not discarded either — it goes to the
 *      error monitor, which reduces it to the same two codes the log uses.
 *
 * The `code` is what makes this more than cosmetic. Before, a client could only
 * tell "rate limited" from "server error" by matching Vietnamese prose, so the
 * upload UI could not offer the right recovery for the right failure. Branching
 * on prose also silently breaks the first time a message is reworded.
 */
export interface FailContext {
  requestId?: string;
  route?: string;
  roomRef?: string;
  /** The caught value. Classified and reported; never serialized into the response. */
  cause?: unknown;
}

export function fail(
  status: number,
  code: ErrorCodeValue,
  message: string,
  context: FailContext = {}
): NextResponse {
  const { cause, ...rest } = context;

  // 4xx below 500 is an expected outcome of the protocol, not an incident.
  // Reporting every wrong PIN and every 404 to the monitor buries the failures
  // that actually need someone.
  if (status >= 500) {
    if (cause !== undefined) {
      captureThrown(cause, { event: 'http.error', fallbackCode: code, ...rest });
    } else {
      captureError({ event: 'http.error', errorCode: code, ...rest });
    }
  }

  return NextResponse.json({ error: message, code }, { status });
}

export const ERR_NOT_FOUND = 'Không tìm thấy phòng';
export const ERR_LOCKED = 'Phòng này yêu cầu mã PIN';
export const ERR_INTERNAL = 'Đã có lỗi xảy ra, vui lòng thử lại';
export const ERR_BAD_SLUG = 'Mã phòng không hợp lệ';
/**
 * One message for every insufficient-permission case. It says nothing about
 * whether the room has an owner, whether a cookie was sent, or why it failed.
 */
export const ERR_FORBIDDEN = 'Chỉ người tạo phòng mới thực hiện được thao tác này';
/**
 * Shown when the shared rate limiter is unreachable on a path that refuses to
 * proceed without it. Deliberately says "tạm thời" and not "quá nhanh": the
 * person did nothing wrong, and telling them they did sends them away instead
 * of back in a minute.
 */
export const ERR_LIMITER_DOWN =
  'Dịch vụ đang tạm thời hạn chế thao tác này. Vui lòng thử lại sau ít phút.';

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSeconds}s.`,
      code: ErrorCode.RATE_LIMITED,
      retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/**
 * The shared limiter is down and this policy will not guess. 503, not 429: the
 * client is not over its limit, the service cannot tell, and a 429 would teach
 * a well-behaved client to back off from a limit it never hit.
 */
export function limiterUnavailable(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: ERR_LIMITER_DOWN,
      code: ErrorCode.RATE_LIMITER_UNAVAILABLE,
      retryAfterSeconds,
    },
    { status: 503, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** Turns a limiter refusal into the right response for its reason. */
export function rateLimitResponse(outcome: {
  retryAfterSeconds: number;
  errorCode: ErrorCodeValue;
}): NextResponse {
  return outcome.errorCode === ErrorCode.RATE_LIMITER_UNAVAILABLE
    ? limiterUnavailable(outcome.retryAfterSeconds)
    : tooManyRequests(outcome.retryAfterSeconds);
}
