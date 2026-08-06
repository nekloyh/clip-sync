import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { cronSecret } from '@/lib/env';
import { ATTACHMENTS_BUCKET } from '@/lib/rooms';
import { fail, ERR_INTERNAL } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_DAYS = 7;
const BATCH_SIZE = 200;

/**
 * The 7-day TTL the README promises. The SQL function alone was never enough:
 * nothing invoked it, and it could not reach Supabase Storage, so deleted rooms
 * left their images behind forever. This runs from a schedule and purges both.
 */
export async function GET(req: NextRequest) {
  const secret = cronSecret();
  if (!secret) return fail('Cleanup endpoint chưa được cấu hình', 503);

  const provided = req.headers.get('authorization') ?? '';
  if (!safeEqual(provided, `Bearer ${secret}`)) {
    return fail('Unauthorized', 401);
  }

  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: expired, error } = await supabase
      .from('rooms')
      .select('id')
      .lt('last_seen_at', cutoff)
      .limit(BATCH_SIZE);

    if (error) return fail(ERR_INTERNAL, 500, error);

    const roomIds = (expired ?? []).map((r) => r.id);
    if (roomIds.length === 0) {
      return NextResponse.json({ deletedRooms: 0, deletedObjects: 0 });
    }

    const { data: attachments } = await supabase
      .from('attachments')
      .select('storage_path')
      .in('room_id', roomIds);

    const paths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: removeErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove(paths);
      if (removeErr) console.error('[clipsync] cleanup storage remove failed', removeErr);
    }

    const { error: deleteErr } = await supabase.from('rooms').delete().in('id', roomIds);
    if (deleteErr) return fail(ERR_INTERNAL, 500, deleteErr);

    return NextResponse.json({
      deletedRooms: roomIds.length,
      deletedObjects: paths.length,
      hasMore: roomIds.length === BATCH_SIZE,
    });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
