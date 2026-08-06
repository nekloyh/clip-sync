import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getOrCreateRoom, listAttachments, touchRoom } from '@/lib/rooms';
import { hasRoomAccess } from '@/lib/room-auth';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { rateLimit } from '@/lib/rate-limit';
import { toPublicRoom } from '@/lib/types';
import { TextEditor } from '@/components/room/TextEditor';
import { RoomLockScreen } from '@/components/room/RoomLockScreen';
import { SupabaseSetupNotice } from '@/components/ui/SupabaseSetupNotice';

export const metadata: Metadata = {
  title: 'ClipSync Room',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VISIT_LIMIT = 60;
const VISIT_WINDOW_MS = 60_000;

export default async function RoomPage({ params }: { params: { slug: string } }) {
  const slug = normalizeSlug(params.slug);
  if (!isValidSlug(slug)) notFound();
  // One room per canonical spelling, so `/r/Quiet-Fox` and `/r/quiet-fox`
  // cannot end up as two separate rows.
  if (slug !== params.slug) redirect(`/r/${slug}`);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <SupabaseSetupNotice />
      </div>
    );
  }

  // Visiting an unknown URL creates a room, so the entry point needs a cap.
  const ip = headers().get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`visit:${ip}`, VISIT_LIMIT, VISIT_WINDOW_MS).ok) {
    throw new Error('Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.');
  }

  const record = await getOrCreateRoom(slug);

  // The gate lives here, before any content is fetched — the previous version
  // rendered the full room into HTML and only hid it client-side.
  if (record.pin_hash && !hasRoomAccess(slug, record.pin_hash)) {
    return <RoomLockScreen slug={slug} />;
  }

  const [attachments] = await Promise.all([
    listAttachments(record.id, slug),
    touchRoom(record.id),
  ]);

  return (
    <TextEditor
      initialRoom={toPublicRoom(record)}
      initialAttachments={attachments}
      slug={slug}
    />
  );
}
