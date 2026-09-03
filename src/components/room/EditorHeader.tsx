'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  Link2,
  Lock,
  QrCode,
  Trash2,
  Unlock,
  Users,
  Sparkles,
  Type,
  Code2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Wordmark } from '@/components/ui/Wordmark';
import { ShareModal } from './ShareModal';

interface EditorHeaderProps {
  slug: string;
  hasPin: boolean;
  /** Owner of the room. Everyone else is a contributor. */
  canManage: boolean;
  fontMode?: 'sans' | 'mono';
  onToggleFontMode?: () => void;
  onUploadImage?: () => void;
  onCopyAllText: () => void;
  onOpenPinModal: () => void;
  onDeleteRoom: () => void;
}

export function EditorHeader({
  slug,
  hasPin,
  canManage,
  fontMode = 'sans',
  onToggleFontMode,
  onUploadImage,
  onCopyAllText,
  onOpenPinModal,
  onDeleteRoom,
}: EditorHeaderProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
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
    <>
      <header className="hairline-b sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between gap-3 bg-header/90 px-3 sm:px-4 backdrop-blur-sm">
        {/* Left: Brand and slug */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="text-foreground transition-opacity hover:opacity-75"
            aria-label="Về trang chủ"
          >
            <Wordmark showText={false} className="sm:hidden" />
            <Wordmark className="hidden sm:inline-flex" />
          </Link>

          <span className="h-4 w-px bg-border" />

          {/* Room Pill */}
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
            <span className="hidden text-foreground-tertiary sm:inline">/r/</span>
            <span className="truncate text-foreground max-w-[140px] sm:max-w-[220px]">
              {slug}
            </span>
            <button
              onClick={handleCopyLink}
              className="rounded p-1 text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
              title="Sao chép link phòng"
              aria-label="Sao chép link phòng"
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5 text-[var(--dark-green)]" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Font Toggle */}
          {onToggleFontMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFontMode}
              title={fontMode === 'sans' ? 'Chuyển sang phông Code (Monospace)' : 'Chuyển sang phông Thường (Sans)'}
              className="hidden md:inline-flex"
            >
              {fontMode === 'sans' ? (
                <Type className="h-3.5 w-3.5" />
              ) : (
                <Code2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden lg:inline">{fontMode === 'sans' ? 'Thường' : 'Code'}</span>
            </Button>
          )}

          {/* Upload image button */}
          {onUploadImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUploadImage}
              title="Đính kèm ảnh (hoặc Ctrl+V / kéo thả vào màn hình)"
            >
              <Copy className="h-3.5 w-3.5 rotate-90" />
              <span className="hidden sm:inline">Ảnh</span>
            </Button>
          )}

          {/* Copy All Text */}
          <Button variant="outline" size="sm" onClick={onCopyAllText}>
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chép chữ</span>
          </Button>

          {/* Share & QR Code */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareModalOpen(true)}
            title="Mở mã QR và link chia sẻ"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chia sẻ</span>
          </Button>

          {/* Owner controls / Contributor badge */}
          {canManage ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenPinModal}
                title={hasPin ? 'Phòng đang khóa PIN (nhấn để đổi)' : 'Đặt mã PIN'}
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
                className="hover:bg-[var(--light-red)] hover:text-[var(--dark-red)] text-foreground-tertiary"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <ContributorBadge hasPin={hasPin} />
          )}

          <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
          <ThemeToggle />
        </div>
      </header>

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        slug={slug}
        hasPin={hasPin}
        onClose={() => setShareModalOpen(false)}
      />
    </>
  );
}

function ContributorBadge({ hasPin }: { hasPin: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-muted-foreground"
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
