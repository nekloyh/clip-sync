import { NextRequest, NextResponse } from 'next/server';
import { guardRoom } from '@/lib/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { ATTACHMENTS_BUCKET } from '@/lib/rooms';
import { fail, ERR_INTERNAL, ERR_NOT_FOUND } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams an attachment through the room's authorization check, replacing the
 * previous public storage URLs. Images in a PIN-locked room are now locked too.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;
  if (!UUID.test(params.id)) return fail(ERR_NOT_FOUND, 404);

  try {
    const supabase = createAdminClient();

    // Scoped by room_id — the old handler looked the attachment up by id alone,
    // which let any room address any other room's files.
    const { data: att, error } = await supabase
      .from('attachments')
      .select('storage_path, mime, filename')
      .eq('id', params.id)
      .eq('room_id', guarded.room.id)
      .maybeSingle();

    if (error) return fail(ERR_INTERNAL, 500, error);
    if (!att) return fail(ERR_NOT_FOUND, 404);

    const { data: blob, error: downloadErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .download(att.storage_path);

    if (downloadErr || !blob) return fail(ERR_NOT_FOUND, 404, downloadErr);

    return new NextResponse(blob.stream(), {
      headers: {
        'Content-Type': att.mime,
        'Content-Length': String(blob.size),
        'Content-Disposition': 'inline',
        // Belt and braces against a mis-sniffed or malicious payload being
        // interpreted as anything other than an image on our own origin.
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const guarded = await guardRoom(params.slug);
  if (!guarded.ok) return guarded.response;
  if (!UUID.test(params.id)) return fail(ERR_NOT_FOUND, 404);

  try {
    const supabase = createAdminClient();

    const { data: att, error } = await supabase
      .from('attachments')
      .select('id, storage_path')
      .eq('id', params.id)
      .eq('room_id', guarded.room.id)
      .maybeSingle();

    if (error) return fail(ERR_INTERNAL, 500, error);
    if (!att) return NextResponse.json({ success: true });

    const { error: removeErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([att.storage_path]);
    if (removeErr) console.error('[clipsync] storage remove failed', removeErr);

    const { error: deleteErr } = await supabase
      .from('attachments')
      .delete()
      .eq('id', att.id)
      .eq('room_id', guarded.room.id);

    if (deleteErr) return fail(ERR_INTERNAL, 500, deleteErr);

    return NextResponse.json({ success: true });
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}
