'use client';

import React, { useState } from 'react';
import { Attachment } from '@/lib/types';
import { Copy, Download, Trash2, Maximize2, Loader2 } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import { useToast } from '@/components/ui/Toast';

interface AttachmentGridProps {
  attachments: Attachment[];
  uploading: boolean;
  onDeleteAttachment: (id: string) => Promise<void>;
}

export function AttachmentGrid({
  attachments,
  uploading,
  onDeleteAttachment,
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

  if (attachments.length === 0 && !uploading) return null;

  return (
    <>
      <section className="hairline-t shrink-0 bg-background">
        <div className="flex h-8 items-center justify-between px-3 font-mono text-xs text-foreground-tertiary sm:px-4">
          <span>Ảnh đính kèm {attachments.length}/20</span>
          <span className="hidden sm:inline">Ctrl+V hoặc kéo thả</span>
        </div>

        <div className="grid max-h-[34vh] grid-cols-3 gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-5 sm:px-4 sm:pb-4 lg:grid-cols-8">
          {uploading && (
            <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border-contrast">
              <Loader2 className="h-4 w-4 animate-spin text-foreground-tertiary" />
            </div>
          )}

          {attachments.map((att) => (
            <figure
              key={att.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.url}
                alt={att.filename}
                loading="lazy"
                className="h-full w-full cursor-pointer object-cover"
                onClick={() => setSelectedImage(att)}
              />

              {/* Actions stay hidden until hover, and are always reachable by
                  keyboard through the lightbox. */}
              <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/90 p-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <IconAction label="Phóng to" onClick={() => setSelectedImage(att)}>
                  <Maximize2 className="h-3 w-3" />
                </IconAction>
                <IconAction label="Chép ảnh" onClick={() => handleCopyImage(att)}>
                  <Copy className="h-3 w-3" />
                </IconAction>
                <IconAction label="Tải về" onClick={() => handleDownloadImage(att)}>
                  <Download className="h-3 w-3" />
                </IconAction>
                <IconAction
                  label="Xóa ảnh"
                  onClick={() => handleDelete(att)}
                  disabled={deletingId === att.id}
                  className="hover:bg-[var(--light-red)] hover:text-[var(--dark-red)]"
                >
                  {deletingId === att.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </IconAction>
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
        onDelete={handleDelete}
      />
    </>
  );
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
