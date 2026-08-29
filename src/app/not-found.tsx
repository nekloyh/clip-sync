'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * The only 404 in the app, and it has to serve two audiences.
 *
 * A nested `not-found.tsx` under `/r/[slug]` would be the tidier home for the
 * room-specific wording, but `notFound()` thrown from a dynamic segment unwinds
 * past it to this file (Next 14.2 — adding a segment layout does not change
 * it), so a nested file is dead code that only looks like it works. The copy
 * therefore lives here.
 *
 * What it must not do is repeat the old mistake of blaming the format. Rooms
 * are no longer created by visiting a URL, so the overwhelmingly common way to
 * land here is a code that was typed perfectly and points at a room that has
 * aged out of its 7-day window or was closed by its owner. Telling that person
 * their code is malformed sends them off to re-check characters that were fine.
 *
 * It also has to stand on its own: Next renders the root not-found boundary
 * outside the root layout, so anything that needs a provider from there — the
 * toast context, for one — throws during SSR and turns this page into an empty
 * error shell. Failures are reported inline instead.
 */
export default function NotFound() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) throw new Error(data.error || 'Không tạo được phòng');
      router.push(`/r/${data.slug}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được phòng');
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card">
        <div className="hairline-b flex items-center justify-between bg-header px-4 py-3">
          <h1 className="text-sm font-semibold text-foreground">Không tìm thấy</h1>
          <span className="font-mono text-xs text-foreground-tertiary">404</span>
        </div>

        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Đường dẫn này không tồn tại. Nếu bạn đang mở một phòng, thường là vì:
          </p>

          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-foreground-tertiary">·</span>
              Phòng đã quá 7 ngày không ai dùng và bị tự động xóa.
            </li>
            <li className="flex gap-2">
              <span className="text-foreground-tertiary">·</span>
              Chủ phòng đã chủ động xóa phòng.
            </li>
            <li className="flex gap-2">
              <span className="text-foreground-tertiary">·</span>
              Mã phòng bị gõ sai một vài ký tự.
            </li>
          </ul>

          <p className="mt-3 text-sm text-muted-foreground">
            Nội dung của phòng đã xóa không khôi phục được. Nếu ai đó gửi link cho bạn, hãy hỏi
            lại họ một link mới.
          </p>

          <div className="mt-4 space-y-2">
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateRoom}
              disabled={creating}
              className="w-full"
            >
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang tạo phòng
                </>
              ) : (
                <>
                  Tạo phòng mới
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>

            <Link
              href="/"
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Về trang chủ
            </Link>

            {error && (
              <p role="status" className="text-xs text-[var(--dark-red)]">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
