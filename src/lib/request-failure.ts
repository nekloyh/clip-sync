/**
 * Turning a failed request into something the UI can act on.
 *
 * Deliberately not server code and deliberately not inside a component: this is
 * the piece that decides whether a person is told "you are offline" or "that
 * file is too big", and getting it wrong sends them to fix the wrong thing.
 * Keeping it a pure function is what makes it testable without a browser.
 *
 * The classification exists because the old code had exactly one branch -
 * `showToast(err.message)` - so a dropped wifi connection, a rate limit, a 5MB
 * cap and a Supabase outage all looked identical: one red toast that vanished
 * after a few seconds, with nothing to press. The person's only recourse was to
 * pick the file again and hope.
 */

export type FailureKind =
  /** The device has no network. Retrying now cannot work; retrying later will. */
  | 'offline'
  /** The request went out and nothing came back in time. */
  | 'timeout'
  /** Refused by a limiter. Retryable, but only after `retryAfterSeconds`. */
  | 'rate_limited'
  /** The server refused the input itself. Retrying the same bytes cannot help. */
  | 'rejected'
  /** The server broke. Retrying is reasonable. */
  | 'server';

export interface RequestFailure {
  kind: FailureKind;
  /** Ready to display. Vietnamese, and specific to the kind. */
  message: string;
  /** True when offering a retry button makes sense. */
  retryable: boolean;
  retryAfterSeconds?: number;
}

/**
 * Codes that mean "this input will never be accepted".
 *
 * Offering a retry on these is worse than offering nothing: it implies the
 * upload might succeed if pressed again, and the person presses it repeatedly
 * on a file that is 8MB and will still be 8MB.
 */
const PERMANENT_CODES = new Set([
  'payload_too_large',
  'unsupported_media',
  'room_full',
  'invalid_request',
  'bad_slug',
]);

/** A response the request actually got. */
export function failureFromResponse(
  status: number,
  body: { error?: unknown; code?: unknown; retryAfterSeconds?: unknown } | null,
  retryAfterHeader?: string | null
): RequestFailure {
  const code = typeof body?.code === 'string' ? body.code : '';
  const serverMessage = typeof body?.error === 'string' ? body.error : '';

  if (status === 429 || code === 'rate_limited') {
    const retryAfter = retrySeconds(body?.retryAfterSeconds, retryAfterHeader);
    return {
      kind: 'rate_limited',
      message: serverMessage || 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.',
      retryable: true,
      retryAfterSeconds: retryAfter,
    };
  }

  // The shared limiter is unreachable and the server will not guess. Presented
  // as a temporary service condition rather than as the person's fault, because
  // it is not: they did nothing at all.
  if (code === 'rate_limiter_unavailable') {
    return {
      kind: 'rate_limited',
      message: serverMessage || 'Dịch vụ đang bận. Vui lòng thử lại sau ít phút.',
      retryable: true,
      retryAfterSeconds: retrySeconds(body?.retryAfterSeconds, retryAfterHeader),
    };
  }

  if (PERMANENT_CODES.has(code) || (status >= 400 && status < 500 && status !== 408)) {
    return {
      kind: 'rejected',
      message: serverMessage || 'Yêu cầu không hợp lệ.',
      retryable: false,
    };
  }

  return {
    kind: 'server',
    message: serverMessage || 'Máy chủ gặp sự cố. Vui lòng thử lại.',
    retryable: true,
  };
}

/** A request that never produced a response. */
export function failureFromThrown(thrown: unknown, online = true): RequestFailure {
  if (!online) {
    return {
      kind: 'offline',
      message: 'Mất kết nối mạng. Nội dung vẫn được giữ, sẽ thử lại khi có mạng.',
      retryable: true,
    };
  }

  // `AbortError` is what an AbortController timeout throws. Worth telling apart
  // from a generic network error: a timeout usually means the request is too
  // big for the connection, and retrying on the same connection will time out
  // again, where a transient network error usually will not.
  if (thrown instanceof Error && thrown.name === 'AbortError') {
    return {
      kind: 'timeout',
      message: 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.',
      retryable: true,
    };
  }

  return {
    kind: 'server',
    message: 'Không kết nối được máy chủ. Vui lòng thử lại.',
    retryable: true,
  };
}

function retrySeconds(fromBody: unknown, fromHeader?: string | null): number | undefined {
  const body = Number(fromBody);
  if (Number.isFinite(body) && body > 0) return Math.ceil(body);

  const header = Number(fromHeader);
  if (Number.isFinite(header) && header > 0) return Math.ceil(header);

  return undefined;
}

/** `fetch` with a deadline, so a hung request becomes a timeout rather than a spinner. */
export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
