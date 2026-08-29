import { describe, it, expect } from 'vitest';
import { failureFromResponse, failureFromThrown } from './request-failure';

/**
 * The four failures a person can be in, and telling them apart.
 *
 * The old upload path had one branch — `showToast(err.message)` — so a dropped
 * wifi connection, a rate limit, a 5MB cap and a Supabase outage all produced
 * the same red toast that vanished after a few seconds with nothing to press.
 * The recoveries are different in each case, and the person's only recourse was
 * to pick the file again and hope.
 */

describe('rate limiting', () => {
  it('reads the wait from the body', () => {
    const failure = failureFromResponse(
      429,
      { error: 'Bạn thao tác quá nhanh.', code: 'rate_limited', retryAfterSeconds: 42 },
      '42'
    );

    expect(failure).toMatchObject({ kind: 'rate_limited', retryable: true, retryAfterSeconds: 42 });
  });

  it('falls back to the Retry-After header', () => {
    const failure = failureFromResponse(429, { code: 'rate_limited' }, '17');
    expect(failure.retryAfterSeconds).toBe(17);
  });

  it('treats a limiter outage as the service being busy, not the person being wrong', () => {
    const failure = failureFromResponse(
      503,
      { error: 'Dịch vụ đang tạm thời hạn chế thao tác này.', code: 'rate_limiter_unavailable' },
      '30'
    );

    // The person did nothing at all. Telling them they are going too fast sends
    // them away instead of back in a minute.
    expect(failure).toMatchObject({ kind: 'rate_limited', retryable: true });
    expect(failure.message).not.toMatch(/quá nhanh/);
  });
});

describe('permanent rejections', () => {
  it('offers no retry for a file that is too large', () => {
    const failure = failureFromResponse(400, {
      error: 'Kích thước file vượt quá giới hạn tối đa 5MB.',
      code: 'payload_too_large',
    });

    // A retry here is worse than nothing: it implies the upload might succeed
    // if pressed again, on a file that is 8MB and will still be 8MB.
    expect(failure).toMatchObject({ kind: 'rejected', retryable: false });
  });

  it('offers no retry for an unsupported type or a full room', () => {
    expect(failureFromResponse(400, { code: 'unsupported_media' }).retryable).toBe(false);
    expect(failureFromResponse(400, { code: 'room_full' }).retryable).toBe(false);
  });

  it('shows the server message, which is the specific one', () => {
    const failure = failureFromResponse(400, {
      error: 'Chỉ chấp nhận ảnh PNG, JPEG, GIF, WebP, AVIF hoặc BMP.',
      code: 'unsupported_media',
    });

    expect(failure.message).toContain('PNG');
  });
});

describe('server failures', () => {
  it('is retryable', () => {
    expect(failureFromResponse(500, { code: 'db_error' })).toMatchObject({
      kind: 'server',
      retryable: true,
    });
  });

  it('produces a message even when the body is unparseable', () => {
    // A 502 from a proxy is HTML, not JSON, so `res.json()` gives null.
    const failure = failureFromResponse(502, null);
    expect(failure.kind).toBe('server');
    expect(failure.message).not.toBe('');
  });

  it('treats a request timeout status as retryable rather than a rejection', () => {
    expect(failureFromResponse(408, null).retryable).toBe(true);
  });
});

describe('requests that never got a response', () => {
  it('names being offline, and says the content is kept', () => {
    const failure = failureFromThrown(new TypeError('Failed to fetch'), false);

    expect(failure.kind).toBe('offline');
    // The reassurance is the point: the person needs to know their text is not
    // gone before they decide whether to copy it out somewhere safe.
    expect(failure.message).toMatch(/giữ/);
    expect(failure.retryable).toBe(true);
  });

  it('tells a timeout apart from a generic network error', () => {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';

    // A timeout usually means the request is too big for the connection and
    // will time out again; a transient network error usually will not.
    expect(failureFromThrown(aborted, true).kind).toBe('timeout');
    expect(failureFromThrown(new TypeError('Failed to fetch'), true).kind).toBe('server');
  });

  it('prefers "offline" over "timeout" when the network is actually down', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';

    expect(failureFromThrown(aborted, false).kind).toBe('offline');
  });
});
