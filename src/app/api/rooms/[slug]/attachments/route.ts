import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS_PER_ROOM = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug.toLowerCase().trim();
    const supabase = createAdminClient();

    // Fetch room
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', slug)
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: 'Không tìm thấy phòng' }, { status: 404 });
    }

    // Check current attachment count
    const { count, error: countErr } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    if ((count || 0) >= MAX_ATTACHMENTS_PER_ROOM) {
      return NextResponse.json(
        { error: `Phòng đã đạt giới hạn tối đa ${MAX_ATTACHMENTS_PER_ROOM} ảnh.` },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file tải lên' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Kích thước file vượt quá giới hạn tối đa 5MB.' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Chỉ chấp nhận các định dạng tập tin hình ảnh.' },
        { status: 400 }
      );
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${room.id}/${Date.now()}_${cleanFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from('clipsync-attachments')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Tải ảnh lên Supabase Storage thất bại: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    // Insert database attachment row
    const { data: attachment, error: insertErr } = await supabase
      .from('attachments')
      .insert([
        {
          room_id: room.id,
          storage_path: storagePath,
          filename: file.name,
          mime: file.type,
          size: file.size,
        },
      ])
      .select('*')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/clipsync-attachments/${storagePath}`;

    return NextResponse.json({
      attachment: {
        ...attachment,
        public_url: publicUrl,
      },
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
    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get('id');

    if (!attachmentId) {
      return NextResponse.json({ error: 'ID ảnh là bắt buộc' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch attachment details to get storage_path
    const { data: att } = await supabase
      .from('attachments')
      .select('id, storage_path')
      .eq('id', attachmentId)
      .maybeSingle();

    if (att) {
      // Remove file from storage
      await supabase.storage.from('clipsync-attachments').remove([att.storage_path]);
      // Remove row from DB
      await supabase.from('attachments').delete().eq('id', att.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
