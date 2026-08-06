import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug.toLowerCase().trim();
    const supabase = createAdminClient();

    // Fetch room or auto-create if non-existent
    let { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!room) {
      // Auto create room on first visit
      const { data: newRoom, error: createError } = await supabase
        .from('rooms')
        .insert([{ slug, content: '' }])
        .select('*')
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      room = newRoom;
    } else {
      // Touch last_seen_at timestamp async
      supabase
        .from('rooms')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', room.id)
        .then(() => {});
    }

    // Fetch attachments linked to this room
    const { data: rawAttachments } = await supabase
      .from('attachments')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const attachments = (rawAttachments || []).map((att) => {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/clipsync-attachments/${att.storage_path}`;
      return {
        ...att,
        public_url: publicUrl,
      };
    });

    return NextResponse.json({
      room: {
        id: room.id,
        slug: room.slug,
        hasPin: !!room.pin_hash,
        content: room.content || '',
        updated_at: room.updated_at,
        created_at: room.created_at,
      },
      attachments,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug.toLowerCase().trim();
    const supabase = createAdminClient();

    // Find room
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!room) {
      return NextResponse.json({ success: true });
    }

    // Get all attachments to delete storage files
    const { data: attachments } = await supabase
      .from('attachments')
      .select('storage_path')
      .eq('room_id', room.id);

    if (attachments && attachments.length > 0) {
      const storagePaths = attachments.map((a) => a.storage_path);
      await supabase.storage.from('clipsync-attachments').remove(storagePaths);
    }

    // Delete room record (cascade deletes attachments DB rows)
    const { error } = await supabase.from('rooms').delete().eq('id', room.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
