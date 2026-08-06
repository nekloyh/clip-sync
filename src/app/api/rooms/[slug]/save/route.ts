import { NextRequest, NextResponse } from 'next/server';
import { guardRoom } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { fail, tooManyRequests, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CONTENT_LENGTH = 100_000;
const SAVE_LIMIT = 120; // ~1 save every 500ms of continuous typing
const SAVE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(
    `save:${clientKey(req)}:${guarded.slug}`,
    SAVE_LIMIT,
    SAVE_WINDOW_MS
  );
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const body = await req.json().catch(() => null);
  const content = body && typeof body === 'object' ? (body as any).content : undefined;

  if (typeof content !== 'string') {
    return fail('Nội dung không hợp lệ', 400);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return fail(
      `Nội dung vượt quá giới hạn ${MAX_CONTENT_LENGTH.toLocaleString()} ký tự.`,
      400
    );
  }

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('rooms')
      .update({ content, updated_at: nowIso, last_seen_at: nowIso })
      .eq('id', guarded.room.id)
      .select('updated_at')
      .maybeSingle();

    if (error) return fail(ERR_INTERNAL, 500, error);
    // The room can be deleted between the guard and this update.
    if (!data) return fail(ERR_NOT_FOUND, 404);

    return NextResponse.json({ success: true, updated_at: data.updated_at });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}
