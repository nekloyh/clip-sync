import { NextResponse } from 'next/server';

/**
 * Error responses never carry the underlying Postgres/Storage message — those
 * leak table names, constraint names and column types. The detail goes to the
 * server log; the client gets a stable Vietnamese message.
 */
export function fail(message: string, status: number, cause?: unknown): NextResponse {
  if (cause) {
    console.error(`[clipsync] ${status} ${message}`, cause);
  }
  return NextResponse.json({ error: message }, { status });
}

export const ERR_NOT_FOUND = 'Không tìm thấy phòng';
export const ERR_LOCKED = 'Phòng này yêu cầu mã PIN';
export const ERR_INTERNAL = 'Đã có lỗi xảy ra, vui lòng thử lại';
export const ERR_BAD_SLUG = 'Mã phòng không hợp lệ';

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSeconds}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}
