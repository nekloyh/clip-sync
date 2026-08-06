import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { TextEditor } from '@/components/room/TextEditor';
import { SupabaseSetupNotice } from '@/components/ui/SupabaseSetupNotice';
import { Room, Attachment } from '@/lib/types';

export const metadata: Metadata = {
  title: 'ClipSync Room',
  robots: {
    index: false,
    follow: false,
  },
};

export const revalidate = 0;

export default async function RoomPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug.toLowerCase().trim();

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-radial-glow">
        <SupabaseSetupNotice />
      </div>
    );
  }

  const supabase = createAdminClient();

  // Fetch or auto-create room
  let { data: roomData } = await supabase
    .from('rooms')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!roomData) {
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert([{ slug, content: '' }])
      .select('*')
      .single();
    roomData = newRoom;
  }

  // Fetch linked attachments
  const { data: rawAttachments } = await supabase
    .from('attachments')
    .select('*')
    .eq('room_id', roomData?.id)
    .order('created_at', { ascending: false });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const attachments: Attachment[] = (rawAttachments || []).map((att) => ({
    ...att,
    public_url: `${supabaseUrl}/storage/v1/object/public/clipsync-attachments/${att.storage_path}`,
  }));

  const room: Room = {
    id: roomData.id,
    slug: roomData.slug,
    pin_hash: roomData.pin_hash,
    hasPin: !!roomData.pin_hash,
    content: roomData.content || '',
    created_at: roomData.created_at,
    updated_at: roomData.updated_at,
    last_seen_at: roomData.last_seen_at,
  };

  return <TextEditor initialRoom={room} initialAttachments={attachments} slug={slug} />;
}
