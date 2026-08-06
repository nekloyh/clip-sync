import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateRandomSlug } from '@/lib/slug';

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    let slug = body.slug ? String(body.slug).trim().toLowerCase() : generateRandomSlug();

    // Sanitize slug format (alphanumeric and hyphens only)
    slug = slug.replace(/[^a-z0-9-]/g, '');
    if (!slug) {
      slug = generateRandomSlug();
    }

    // Check if room already exists
    const { data: existing } = await supabase
      .from('rooms')
      .select('id, slug, pin_hash')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        slug: existing.slug,
        isExisting: true,
        hasPin: !!existing.pin_hash,
      });
    }

    // Create new room
    const { data: newRoom, error } = await supabase
      .from('rooms')
      .insert([{ slug, content: '' }])
      .select('id, slug, pin_hash, content, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      slug: newRoom.slug,
      isExisting: false,
      hasPin: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
