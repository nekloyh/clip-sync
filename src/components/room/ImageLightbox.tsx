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
  /** Omitted for contributors: only the owner may remove evidence. */
  onDelete?: (att: Attachment) => void;
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
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-background/95 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
    >
      <div
        className="hairline-b glass-header flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2.5 text-xs">
          <span className="truncate font-medium text-foreground max-w-[200px] sm:max-w-md">{attachment.filename}</span>
          <span className="shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-foreground-tertiary">
            {(attachment.size / 1024).toFixed(0)} KB
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onCopy(attachment)}>
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sao chép ảnh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDownload(attachment)}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tải về</span>
          </Button>
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(attachment)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Xóa ảnh</span>
            </Button>
          )}
          <span className="mx-1 h-4 w-px bg-border/80" />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-h-full max-w-full rounded-xl object-contain shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
