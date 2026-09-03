'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Wordmark } from '@/components/ui/Wordmark';

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [joinSlug, setJoinSlug] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setLoadingCreate(true);
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
      showToast(err instanceof Error ? err.message : 'Không tạo được phòng', 'error');
      setLoadingCreate(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const cleaned = normalizeSlug(joinSlug);
    if (!isValidSlug(cleaned)) {
      setJoinError('Mã phòng chỉ gồm chữ thường, số và dấu gạch ngang (tối thiểu 3 ký tự).');
      return;
    }

    setLoadingJoin(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleaned }),
      });

      if (res.status === 404) {
        setJoinError('Không có phòng nào với mã này. Phòng có thể đã hết hạn hoặc bị chủ phòng xóa.');
        setLoadingJoin(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setJoinError(data.error || 'Không vào được phòng, vui lòng thử lại.');
        setLoadingJoin(false);
        return;
      }

      router.push(`/r/${cleaned}`);
    } catch {
      setJoinError('Không kết nối được, vui lòng thử lại.');
      setLoadingJoin(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="hairline-b sticky top-0 z-30 bg-header/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/nekloyh/clip-sync"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Mã nguồn
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Focus Canvas */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-xl animate-slide-up space-y-8">
          {/* Header Copy */}
          <div className="space-y-3 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Đồng bộ tức thì giữa các thiết bị.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Dán văn bản, đoạn code hoặc ảnh vào một đường link duy nhất rồi mở ở máy khác.
              Không cần tài khoản, không cài đặt phần mềm.
            </p>
          </div>

          {/* Action Card */}
          <div className="rounded-lg border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateRoom}
              disabled={loadingCreate}
              className="w-full text-sm font-medium h-10"
            >
              {loadingCreate ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang tạo phòng…</span>
                </>
              ) : (
                <>
                  <span>Tạo phòng mới</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative bg-card px-2.5 text-xs text-foreground-tertiary">
                hoặc vào phòng bằng mã
              </span>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-foreground-tertiary">
                    /r/
                  </span>
                  <input
                    type="text"
                    value={joinSlug}
                    onChange={(e) => {
                      setJoinSlug(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    aria-invalid={joinError ? true : undefined}
                    aria-describedby={joinError ? 'join-error' : undefined}
                    placeholder="quiet-fox-h7k2mq9d"
                    aria-label="Mã phòng"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 font-mono text-xs sm:text-sm text-foreground placeholder:text-foreground-tertiary focus:border-ring focus:outline-none"
                  />
                </div>
                <Button
                  type="submit"
                  size="md"
                  disabled={loadingJoin || !joinSlug.trim()}
                  className="shrink-0 h-9 px-3"
                >
                  {loadingJoin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Vào phòng'}
                </Button>
              </div>

              {joinError && (
                <p id="join-error" role="status" className="text-xs text-[var(--dark-red)] pt-0.5">
                  {joinError}
                </p>
              )}
            </form>
          </div>

          {/* Authentic Utility Notes */}
          <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3 text-xs text-muted-foreground leading-relaxed">
            <div>
              <span className="font-medium text-foreground block mb-0.5">Tự lưu 500ms</span>
              Nội dung tự đồng bộ đến mọi thiết bị đang mở cùng liên kết.
            </div>
            <div>
              <span className="font-medium text-foreground block mb-0.5">Dán & thả ảnh</span>
              Ctrl+V ảnh chụp màn hình, tối đa 20 ảnh và 5MB mỗi ảnh.
            </div>
            <div>
              <span className="font-medium text-foreground block mb-0.5">Tự dọn sau 7 ngày</span>
              Phòng tự hủy khi không hoạt động. Tùy chọn đặt mã PIN bảo vệ.
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="hairline-t py-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 font-mono text-xs text-foreground-tertiary sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>ClipSync</span>
          <span>Next.js · Supabase Realtime · noindex</span>
        </div>
      </footer>
    </div>
  );
}
