import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRoom, listAttachments, touchRoom } from '@/lib/rooms';
import { canAccessRoom, roomCapabilities } from '@/lib/authz';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { POLICIES, enforce, clientIdentity } from '@/lib/limiter';
import { toPublicRoom } from '@/lib/types';
import { TextEditor } from '@/components/room/TextEditor';
import { RoomLockScreen } from '@/components/room/RoomLockScreen';
import { SupabaseSetupNotice } from '@/components/ui/SupabaseSetupNotice';

export const metadata: Metadata = {
  title: 'ClipSync Room',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { new?: string };
}) {
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

  // Room visits fall back to the per-instance limiter when the shared store is
  // unreachable rather than refusing: this is the read path, and a cache outage
  // that 500s every room URL would take the product down for everyone using it
  // correctly. The weaker guarantee is logged, not assumed.
  const visit = await enforce(POLICIES.roomVisit, clientIdentity(headers()));
  if (!visit.allowed) {
    throw new Error('Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.');
  }

  // Visiting an unknown URL used to mint a room here, which made the first
  // person to guess a slug indistinguishable from its creator. Rooms are now
  // born only in POST /api/rooms; an address with nothing behind it is a 404.
  const record = await getRoom(slug);
  if (!record) notFound();

  // The gate lives here, before any content is fetched — the previous version
  // rendered the full room into HTML and only hid it client-side.
  if (!canAccessRoom(slug, record)) {
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
      initialCapabilities={roomCapabilities(slug, record)}
      justCreated={searchParams?.new === '1'}
      slug={slug}
    />
  );
}
