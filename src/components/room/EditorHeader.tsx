'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Link2, Lock, Trash2, Unlock, Users } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Wordmark } from '@/components/ui/Wordmark';

interface EditorHeaderProps {
  slug: string;
  hasPin: boolean;
  /** Owner of the room. Everyone else is a contributor. */
  canManage: boolean;
  onCopyAllText: () => void;
  onOpenPinModal: () => void;
  onDeleteRoom: () => void;
}

/**
 * Identity and actions only. Live state lives in the status rail at the bottom
 * of the buffer, so the eye has one place to check rather than two.
 */
export function EditorHeader({
  slug,
  hasPin,
  canManage,
  onCopyAllText,
  onOpenPinModal,
  onDeleteRoom,
}: EditorHeaderProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const { showToast } = useToast();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      showToast('Đã chép link phòng', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast('Trình duyệt chặn truy cập clipboard', 'error');
    }
  };

  return (
    <header className="hairline-b flex h-11 shrink-0 items-center justify-between gap-3 bg-header px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="rounded-md text-foreground transition-opacity hover:opacity-70"
          aria-label="Về trang chủ"
        >
          <Wordmark showText={false} className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>

        <span className="h-4 w-px bg-border" />

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="hidden font-mono text-xs text-foreground-tertiary sm:inline">/r/</span>
          <span className="truncate font-mono text-xs text-foreground">{slug}</span>
          <button
            onClick={handleCopyLink}
            className="shrink-0 rounded-sm p-1 text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
            title="Chép link phòng"
            aria-label="Chép link phòng"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-[var(--dark-green)]" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={onCopyAllText}>
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Chép văn bản</span>
        </Button>

        {/* Owner-only controls. Hiding them is courtesy, not enforcement — the
            API refuses these mutations regardless of what is on screen. */}
        {canManage ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenPinModal}
              title={hasPin ? 'Phòng đang khóa PIN' : 'Đặt mã PIN'}
            >
              {hasPin ? (
                <Lock className="h-3.5 w-3.5 text-[var(--dark-yellow)]" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
              <span className="hidden md:inline">{hasPin ? 'Đã khóa' : 'Đặt PIN'}</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteRoom}
              title="Xóa phòng"
              aria-label="Xóa phòng"
              className="hover:bg-[var(--light-red)] hover:text-[var(--dark-red)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <ContributorBadge hasPin={hasPin} />
        )}

        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <ThemeToggle />
      </div>
    </header>
  );
}

/**
 * Tells a recipient what they are. Without it the missing PIN and delete
 * buttons read as a bug rather than as "this room belongs to someone else" —
 * and the person needs to know that the owner can close the room at any time.
 */
function ContributorBadge({ hasPin }: { hasPin: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground"
      title="Bạn có thể đọc, sửa văn bản và gửi ảnh. Chỉ người tạo phòng mới đổi PIN hoặc xóa phòng."
    >
      {hasPin ? (
        <Lock className="h-3.5 w-3.5 text-[var(--dark-yellow)]" />
      ) : (
        <Users className="h-3.5 w-3.5" />
      )}
      <span className="hidden md:inline">Cộng tác viên</span>
    </span>
  );
}
