import { NextRequest, NextResponse } from 'next/server';
import { generateRandomSlug, normalizeSlug, isValidSlug } from '@/lib/slug';
import { getRoom, getOrCreateRoom } from '@/lib/rooms';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { fail, tooManyRequests, ERR_BAD_SLUG, ERR_INTERNAL } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREATE_LIMIT = 20;
const CREATE_WINDOW_MS = 60_000;
const MAX_SLUG_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const limit = rateLimit(`create:${clientKey(req)}`, CREATE_LIMIT, CREATE_WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  try {
    // Explicit slug: join-or-create, same as visiting the URL directly.
    if (body && typeof body === 'object' && 'slug' in body && body.slug) {
      const slug = normalizeSlug(body.slug);
      if (!isValidSlug(slug)) return fail(ERR_BAD_SLUG, 400);

      const room = await getOrCreateRoom(slug);
      return NextResponse.json({
        success: true,
        slug: room.slug,
        isExisting: room.created_at !== room.updated_at || !!room.content,
        hasPin: !!room.pin_hash,
      });
    }

    // No slug: the server picks one. Retrying on collision matters — the old
    // code silently handed the caller somebody else's existing room instead.
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = generateRandomSlug();
      if (await getRoom(slug)) continue;

      const room = await getOrCreateRoom(slug);
      if (room.slug !== slug) continue; // lost the race, try another name
      return NextResponse.json({
        success: true,
        slug: room.slug,
        isExisting: false,
        hasPin: false,
      });
    }

    return fail(ERR_INTERNAL, 503);
  } catch (err) {
    return fail(ERR_INTERNAL, 500, err);
  }
}
