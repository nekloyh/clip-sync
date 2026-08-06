import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashPin } from '@/lib/crypto';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug.toLowerCase().trim();
    const body = await req.json();
    const { action, pin } = body;

    const supabase = createAdminClient();

    // Fetch room
    const { data: room, error: fetchErr } = await supabase
      .from('rooms')
      .select('id, pin_hash')
      .eq('slug', slug)
      .single();

    if (fetchErr || !room) {
      return NextResponse.json({ error: 'Không tìm thấy phòng' }, { status: 404 });
    }

    if (action === 'verify') {
      if (!room.pin_hash) {
        return NextResponse.json({ verified: true });
      }
      if (!pin) {
        return NextResponse.json({ verified: false, error: 'Mã PIN là bắt buộc' }, { status: 400 });
      }
      const hashedInput = await hashPin(pin, slug);
      const isMatch = hashedInput === room.pin_hash;
      return NextResponse.json({ verified: isMatch });
    }

    if (action === 'set') {
      if (!pin || pin.trim() === '') {
        // Remove PIN
        await supabase
          .from('rooms')
          .update({ pin_hash: null })
          .eq('id', room.id);
        return NextResponse.json({ success: true, hasPin: false });
      }

      if (!/^\d{4,6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'Mã PIN phải từ 4 đến 6 chữ số' },
          { status: 400 }
        );
      }

      const hashed = await hashPin(pin, slug);
      const { error: updateErr } = await supabase
        .from('rooms')
        .update({ pin_hash: hashed })
        .eq('id', room.id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, hasPin: true });
    }

    return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
