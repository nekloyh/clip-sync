import { NextRequest, NextResponse } from 'next/server';
import { guardRoom } from '@/lib/guard';
import { listAttachments, touchRoom, deleteRoomCascade } from '@/lib/rooms';
import { toPublicRoom } from '@/lib/types';
import { fail, ERR_INTERNAL } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authoritative room state. Clients call this on load and whenever a realtime
 * ping tells them something changed, so this response — not the broadcast
 * payload — is the source of truth.
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;

  try {
    const [attachments] = await Promise.all([
      listAttachments(guarded.room.id, guarded.slug),
      touchRoom(guarded.room.id),
    ]);

    return NextResponse.json(
      { room: toPublicRoom(guarded.room), attachments },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;

  try {
    await deleteRoomCascade(guarded.room.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}
