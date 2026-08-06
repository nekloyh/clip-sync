'use client';

import React, { useEffect } from 'react';
import { X, Copy, Download, Trash2 } from 'lucide-react';
import { Attachment } from '@/lib/types';
import { Button } from '@/components/ui/Button';

interface ImageLightboxProps {
  attachment: Attachment | null;
  onClose: () => void;
  onCopy: (att: Attachment) => void;
  onDownload: (att: Attachment) => void;
  onDelete: (att: Attachment) => void;
}

export function ImageLightbox({
  attachment,
  onClose,
  onCopy,
  onDownload,
  onDelete,
}: ImageLightboxProps) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [attachment, onClose]);

  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-background/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
    >
      <div
        className="hairline-b flex h-11 shrink-0 items-center justify-between gap-3 bg-header px-3 sm:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
          <span className="truncate text-foreground">{attachment.filename}</span>
          <span className="shrink-0 text-foreground-tertiary">
            {(attachment.size / 1024).toFixed(0)} KB
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onCopy(attachment)}>
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chép</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDownload(attachment)}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tải về</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(attachment)}
            className="hover:bg-[var(--light-red)] hover:text-[var(--dark-red)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Xóa</span>
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-code p-4">
        {/* next/image is deliberately unused: these are authenticated,
            single-view, already-size-capped uploads. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-h-full max-w-full rounded-md object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
