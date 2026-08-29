'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, ClipboardPaste, ImageDown, Timer } from 'lucide-react';
import { normalizeSlug, isValidSlug } from '@/lib/slug';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { SupabaseSetupNotice } from '@/components/ui/SupabaseSetupNotice';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Wordmark } from '@/components/ui/Wordmark';
import { StatusChip, Dot } from '@/components/ui/StatusChip';

const FEATURES = [
  {
    icon: ClipboardPaste,
    title: 'Dán rồi quên',
    body: 'Gõ hoặc dán vào ô văn bản. Nội dung tự lưu sau 500ms và hiện trên mọi thiết bị đang mở cùng URL.',
  },
  {
    icon: ImageDown,
    title: 'Ảnh đi kèm văn bản',
    body: 'Ctrl+V ảnh chụp màn hình thẳng vào phòng, tối đa 20 ảnh và 5MB mỗi ảnh. Copy lại ra clipboard bằng một cú nhấp.',
  },
  {
    icon: Timer,
    title: 'Tự dọn',
    body: 'Phòng không đụng tới trong 7 ngày sẽ bị xóa cùng toàn bộ ảnh. Đặt PIN 4–6 số nếu cần khóa sớm hơn.',
  },
];

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

  /**
   * Rooms are no longer created by visiting a URL, so a code that does not
   * resolve is a dead end rather than a new room. Checking existence here —
   * instead of navigating and letting the room page 404 — is what lets the two
   * failures be told apart: a malformed code is the person's typing, a valid
   * code with nothing behind it is a room that expired or was closed. Sending
   * both to the same 404 page made the second look like the first.
   */
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const cleaned = normalizeSlug(joinSlug);
    if (!isValidSlug(cleaned)) {
      setJoinError('Mã phòng chỉ gồm chữ thường, số và dấu gạch ngang, tối thiểu 3 ký tự.');
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
        setJoinError('Không có phòng nào với mã này. Phòng có thể đã hết hạn hoặc bị chủ xóa.');
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
    <div className="flex min-h-screen flex-col">
      <header className="hairline-b sticky top-0 z-30 bg-header">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/nekloyh/clip-sync"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Mã nguồn
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Centred in whatever height is left, so a short viewport and a tall one
          both put the hero at the optical middle instead of stranding it. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 sm:px-6">
        {!isSupabaseConfigured() && (
          <div className="py-8">
            <SupabaseSetupNotice />
          </div>
        )}

        <div className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14">
          {/* Left: the pitch, kept to one claim and one instruction. */}
          <div className="animate-slide-up">
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-foreground-tertiary">
              Clipboard dùng chung
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
              Dán vào một URL.
              <br />
              Mở URL đó ở máy khác.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Văn bản, đoạn code và ảnh chụp màn hình đi giữa laptop, PC và điện thoại qua một
              đường link. Không tài khoản, không cài đặt.
            </p>

            <div className="mt-8 max-w-md space-y-4">
              <Button
                variant="primary"
                size="lg"
                onClick={handleCreateRoom}
                disabled={loadingCreate}
                className="w-full"
              >
                {loadingCreate ? (
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

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="font-mono text-xs text-foreground-tertiary">hoặc</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-sm text-foreground-tertiary">
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
                    className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 font-mono text-sm text-foreground placeholder:text-foreground-tertiary focus:border-ring focus:outline-none"
                  />
                </div>
                <Button type="submit" size="lg" disabled={loadingJoin || !joinSlug.trim()}>
                  {loadingJoin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Vào phòng'}
                </Button>
              </form>

              {joinError && (
                <p id="join-error" role="status" className="text-xs text-[var(--dark-red)]">
                  {joinError}
                </p>
              )}
            </div>
          </div>

          {/* Right: a specimen of the room itself, at rest. It is the product,
              so it does the arguing instead of a graphic. */}
          <RoomSpecimen />
        </div>
      </main>

      <section className="hairline-t">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="px-4 py-8 sm:px-6">
              <Icon className="mb-3 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <h2 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="hairline-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-5 font-mono text-xs text-foreground-tertiary sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>ClipSync</span>
          <span>Next.js · Supabase · noindex</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Static, and deliberately truthful: the chrome, the buffer and the status rail
 * are the same three parts a real room has, in the same order.
 */
function RoomSpecimen() {
  return (
    <div className="animate-fade-in overflow-hidden rounded-lg border border-border bg-card">
      <div className="hairline-b flex h-9 items-center justify-between bg-header px-3">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-foreground-tertiary">/r/</span>
          <span className="text-foreground">quiet-fox-h7k2mq9d</span>
        </div>
        {/* Neutral here on purpose: green is reserved for a room that is
            genuinely live, so the specimen must not outshout it. */}
        <StatusChip tone="neutral">
          <Dot />2 thiết bị
        </StatusChip>
      </div>

      <div className="bg-surface-code px-4 py-5 font-mono text-sm leading-relaxed">
        <p className="text-foreground">ssh deploy@10.0.4.19 -p 2202</p>
        <p className="text-muted-foreground">TOKEN=sk-live-8f2c...b41d</p>
        <p className="text-foreground">
          kubectl -n staging rollout undo deploy/api
          <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-foreground/70" />
        </p>
      </div>

      <div className="hairline-t flex items-center justify-between bg-header px-3 py-2 font-mono text-xs text-foreground-tertiary">
        <span>3 dòng · 6 từ</span>
        <span>Đã lưu 14:22:07</span>
      </div>
    </div>
  );
}
