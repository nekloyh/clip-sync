'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, ShieldAlert, ArrowLeft } from 'lucide-react';
import { PinModal } from './PinModal';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function RoomLockScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="hairline-b flex h-11 items-center justify-between px-4 sm:px-6 bg-header/90">
        <Link href="/" className="text-foreground transition-opacity hover:opacity-75" aria-label="Về trang chủ">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm animate-slide-up overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="hairline-b flex items-center justify-between bg-header px-4 py-3">
            <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
              <span className="text-foreground-tertiary">/r/</span>
              <span className="font-medium">{slug}</span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--dark-yellow)]">
              <Lock className="h-3 w-3" />
              Khóa PIN
            </span>
          </div>

          <div className="p-5 text-center space-y-4">
            <div className="space-y-1.5">
              <h1 className="text-sm font-semibold text-foreground">
                Phòng có mã PIN bảo vệ
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Nhập đúng mã PIN (4–6 số) do người tạo phòng chia sẻ để xem và sửa nội dung.
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => setOpen(true)}
                className="w-full justify-center h-9 text-xs"
              >
                Nhập mã PIN
              </Button>

              <Link
                href="/"
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Quay lại trang chủ</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <PinModal
        isOpen={open}
        mode="unlock"
        slug={slug}
        hasPin
        onClose={() => setOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
