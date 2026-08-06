'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PinModal } from './PinModal';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';

/**
 * Rendered *instead of* the room when the server could not verify an unlock
 * cookie. Nothing about the room's contents reaches this page, so there is
 * nothing to reveal by poking at the DOM.
 */
export function RoomLockScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="hairline-b flex h-11 items-center bg-header px-3 sm:px-4">
        <Link href="/" className="text-foreground transition-opacity hover:opacity-70">
          <Wordmark />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-xs overflow-hidden rounded-lg border border-border bg-card">
          <div className="hairline-b flex items-center gap-2 bg-header px-4 py-3">
            <Lock className="h-3.5 w-3.5 text-[var(--dark-yellow)]" />
            <span className="truncate font-mono text-xs text-foreground">/r/{slug}</span>
          </div>

          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Phòng này được khóa bằng mã PIN. Nhập PIN để xem nội dung và ảnh đính kèm.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setOpen(true)}
              className="mt-4 w-full"
            >
              Nhập mã PIN
            </Button>
          </div>
        </div>
      </main>

      <PinModal
        isOpen={open}
        mode="unlock"
        slug={slug}
        hasPin
        // The unlock cookie is set by the API; a refresh is what lets the
        // server re-render the room with its content.
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
