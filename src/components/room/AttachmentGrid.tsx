'use client';

import React, { useState } from 'react';
import { Attachment } from '@/lib/types';
import {
  Copy,
  Download,
  Trash2,
  Maximize2,
  Loader2,
  RotateCcw,
  X,
  WifiOff,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { RequestFailure } from '@/lib/request-failure';
import { ImageLightbox } from './ImageLightbox';
import { useToast } from '@/components/ui/Toast';

/**
 * A file the person handed over that the server has not confirmed.
 *
 * Kept as its own type, separate from `Attachment`, precisely so the two cannot
 * be confused in the UI. An `Attachment` has a row id and a URL because the
 * server stored it; a `PendingUpload` has neither, so there is nothing to
 * render it with that would make it look finished.
 */
export interface PendingUpload {
  id: string;
  file: File;
  name: string;
  status: 'uploading' | 'failed';
  failure?: RequestFailure;
}

interface AttachmentGridProps {
  attachments: Attachment[];
  /** In-flight and failed uploads, newest first. */
  pending: PendingUpload[];
  /** Owner-only. Contributors can add evidence but not remove it. */
  canDelete: boolean;
  onDeleteAttachment: (id: string) => Promise<void>;
  onRetryUpload: (id: string) => void;
  onDismissUpload: (id: string) => void;
}

export function AttachmentGrid({
  attachments,
  pending,
  canDelete,
  onDeleteAttachment,
  onRetryUpload,
  onDismissUpload,
}: AttachmentGridProps) {
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleCopyImage = async (att: Attachment) => {
    let objectUrl: string | null = null;
    try {
      const response = await fetch(att.url);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();

      // Only PNG is universally accepted by the async clipboard API, so
      // anything else goes through a canvas. Same-origin now, so the canvas
      // is never tainted.
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('decode failed'));
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);

        pngBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png')
        );
      }

      await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
      showToast('Đã chép ảnh vào clipboard', 'success');
    } catch (err) {
      console.error('[clipsync] copy image failed', err);
      try {
        await navigator.clipboard.writeText(new URL(att.url, window.location.origin).toString());
        showToast('Đã chép link ảnh', 'info');
      } catch {
        showToast('Trình duyệt này không chép được ảnh', 'error');
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const handleDownloadImage = (att: Attachment) => {
    const a = document.createElement('a');
    a.href = att.url;
    a.download = att.filename || 'clipsync-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (att: Attachment) => {
    if (!confirm('Xóa ảnh này khỏi phòng?')) return;

    setDeletingId(att.id);
    try {
      await onDeleteAttachment(att.id);
      if (selectedImage?.id === att.id) setSelectedImage(null);
      showToast('Đã xóa ảnh', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Xóa ảnh thất bại', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (attachments.length === 0 && pending.length === 0) return null;

  const failedCount = pending.filter((entry) => entry.status === 'failed').length;

  return (
    <>
      <section className="hairline-t shrink-0 bg-card/60 backdrop-blur-sm">
        <div className="flex h-9 items-center justify-between px-3.5 text-xs text-muted-foreground sm:px-5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              Ảnh đính kèm ({attachments.length}/20)
            </span>
            <span className="hidden sm:inline text-foreground-tertiary">
              · Tối đa 5MB/ảnh
            </span>
          </div>
          {failedCount > 0 ? (
            <span className="font-medium text-[var(--dark-red)]">
              {failedCount} ảnh tải lên chưa thành công
            </span>
          ) : (
            <span className="hidden sm:inline text-foreground-tertiary">
              Dán (Ctrl+V) hoặc kéo thả vào ô soạn thảo
            </span>
          )}
        </div>

        <div className="grid max-h-[36vh] grid-cols-2 gap-2.5 overflow-y-auto p-3.5 sm:grid-cols-4 sm:p-5 lg:grid-cols-6 xl:grid-cols-8">
          {pending.map((entry) =>
            entry.status === 'uploading' ? (
              <div
                key={entry.id}
                title={`Đang tải lên ${entry.name}`}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2"
              >
                <Loader2 className="h-4 w-4 animate-spin text-foreground-tertiary" />
                <span className="px-1 text-center font-mono text-[10px] text-foreground-tertiary truncate max-w-full">
                  Đang tải…
                </span>
              </div>
            ) : (
              <FailedUpload
                key={entry.id}
                entry={entry}
                onRetry={() => onRetryUpload(entry.id)}
                onDismiss={() => onDismissUpload(entry.id)}
              />
            )
          )}

          {attachments.map((att) => (
            <figure
              key={att.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border/80 bg-muted/50 shadow-xs transition-all hover:shadow-card hover:border-border-contrast"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.url}
                alt={att.filename}
                loading="lazy"
                className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-105"
                onClick={() => setSelectedImage(att)}
              />

              {/* Actions bar on hover */}
              <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/90 backdrop-blur-sm p-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <IconAction label="Phóng to" onClick={() => setSelectedImage(att)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction label="Sao chép ảnh" onClick={() => handleCopyImage(att)}>
                  <Copy className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction label="Tải về" onClick={() => handleDownloadImage(att)}>
                  <Download className="h-3.5 w-3.5" />
                </IconAction>
                {canDelete && (
                  <IconAction
                    label="Xóa ảnh"
                    onClick={() => handleDelete(att)}
                    disabled={deletingId === att.id}
                    className="hover:bg-[var(--light-red)] hover:text-[var(--dark-red)]"
                  >
                    {deletingId === att.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </IconAction>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <ImageLightbox
        attachment={selectedImage}
        onClose={() => setSelectedImage(null)}
        onCopy={handleCopyImage}
        onDownload={handleDownloadImage}
        onDelete={canDelete ? handleDelete : undefined}
      />
    </>
  );
}

/**
 * A tile for an upload that did not land.
 *
 * It states which of the four failures happened, because the recovery differs:
 * being offline means wait, a rate limit means wait a stated number of seconds,
 * a rejection means pick a different file, and a server error means press
 * retry. A single red "upload failed" - which is what this replaced - leaves
 * the person guessing which of those four they are in.
 *
 * The retry button is absent, not disabled, when the failure is permanent.
 */
function FailedUpload({
  entry,
  onRetry,
  onDismiss,
}: {
  entry: PendingUpload;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failure = entry.failure;
  const Icon =
    failure?.kind === 'offline'
      ? WifiOff
      : failure?.kind === 'rate_limited' || failure?.kind === 'timeout'
        ? Clock
        : AlertTriangle;

  return (
    <div
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-[var(--dark-red)] bg-[var(--light-red)] p-1 text-center"
      title={failure?.message ?? 'Tải ảnh lên thất bại'}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--dark-red)]" />
      <span className="line-clamp-2 font-mono text-[10px] leading-tight text-[var(--dark-red)]">
        {shortLabel(failure)}
      </span>
      <div className="flex items-center gap-0.5">
        {failure?.retryable !== false && (
          <IconAction label="Thử lại" onClick={onRetry}>
            <RotateCcw className="h-3 w-3" />
          </IconAction>
        )}
        <IconAction label="Bỏ qua" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </IconAction>
      </div>
    </div>
  );
}

function shortLabel(failure?: RequestFailure): string {
  switch (failure?.kind) {
    case 'offline':
      return 'Mất mạng';
    case 'timeout':
      return 'Quá thời gian';
    case 'rate_limited':
      return failure.retryAfterSeconds ? `Chờ ${failure.retryAfterSeconds}s` : 'Đang bận';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return 'Lỗi máy chủ';
  }
}

function IconAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
