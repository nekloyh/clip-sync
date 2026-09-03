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
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md animate-slide-up overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="hairline-b flex items-center justify-between bg-header px-5 py-4">
          <h1 className="text-base font-semibold text-foreground">Không tìm thấy phòng</h1>
          <span className="font-mono text-xs rounded-full bg-muted/80 px-2.5 py-0.5 text-foreground-tertiary">
            404
          </span>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Đường dẫn phòng này hiện không tồn tại trên hệ thống. Điều này thường do một trong các lý do sau:
          </p>

          <ul className="space-y-2 rounded-xl bg-muted/30 p-3.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              <span>Phòng đã quá 7 ngày không có ai sử dụng và đã tự động dọn dẹp để bảo vệ quyền riêng tư.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              <span>Chủ phòng đã chủ động xóa phòng trước đó.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              <span>Mã phòng có thể bị gõ thiếu hoặc nhầm một vài ký tự.</span>
            </li>
          </ul>

          <p className="text-xs text-foreground-tertiary leading-relaxed">
            Nội dung đã xóa không thể khôi phục. Nếu người khác gửi cho bạn liên kết này, vui lòng yêu cầu họ tạo và gửi một mã phòng mới.
          </p>

          <div className="pt-2 space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateRoom}
              disabled={creating}
              className="w-full"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tạo phòng mới…
                </>
              ) : (
                <>
                  Tạo phòng mới ngay
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>

            <Link
              href="/"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Quay về trang chủ
            </Link>

            {error && (
              <p role="status" className="text-center text-xs font-medium text-[var(--dark-red)] pt-1">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
