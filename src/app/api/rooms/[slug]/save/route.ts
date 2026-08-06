import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const MAX_CONTENT_LENGTH = 100000; // 100k characters

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug.toLowerCase().trim();
    const body = await req.json();
    const { content } = body;

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Nội dung không hợp lệ' }, { status: 400 });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Nội dung vượt quá giới hạn ${MAX_CONTENT_LENGTH.toLocaleString()} ký tự.` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: updatedRoom, error } = await supabase
      .from('rooms')
      .update({
        content,
        updated_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq('slug', slug)
      .select('updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated_at: updatedRoom.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
