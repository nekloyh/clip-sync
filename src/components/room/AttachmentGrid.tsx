'use client';

import React, { useState } from 'react';
import { Attachment } from '@/lib/types';
import { Copy, Download, Trash2, Maximize2, Image as ImageIcon, Loader2 } from 'lucide-react';
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
    try {
      if (!att.public_url) return;
      const response = await fetch(att.public_url);
      const blob = await response.blob();

      // Safari/Firefox compatibility check for ClipboardItem png conversion
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = URL.createObjectURL(blob);
        await new Promise((resolve) => (img.onload = resolve));

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        pngBlob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b || blob), 'image/png')
        );
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [pngBlob.type]: pngBlob,
        }),
      ]);

      showToast('Đã chép hình ảnh vào clipboard!', 'success');
    } catch (err: any) {
      console.error(err);
      try {
        await navigator.clipboard.writeText(att.public_url || '');
        showToast('Đã chép đường dẫn hình ảnh!', 'info');
      } catch {
        showToast('Không thể copy ảnh trên trình duyệt này', 'error');
      }
    }
  };

  const handleDownloadImage = (att: Attachment) => {
    if (!att.public_url) return;
    const a = document.createElement('a');
    a.href = att.public_url;
    a.download = att.filename || 'clipsync-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Đang tải ảnh xuống...', 'info');
  };

  const handleDelete = async (att: Attachment) => {
    if (confirm('Bạn có chắc chắn muốn xóa hình ảnh này?')) {
      setDeletingId(att.id);
      try {
        await onDeleteAttachment(att.id);
        if (selectedImage?.id === att.id) {
          setSelectedImage(null);
        }
        showToast('Đã xóa ảnh thành công', 'success');
      } catch (err: any) {
        showToast(err.message || 'Xóa ảnh thất bại', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (attachments.length === 0 && !uploading) {
    return null;
  }

  return (
    <>
      <div className="w-full bg-slate-950/90 border-t border-white/10 p-4 sm:p-5 backdrop-blur-xl z-20">
        <div className="flex items-center justify-between mb-3.5 px-1 select-none">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <ImageIcon className="w-3 h-3 text-blue-400" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
              Ảnh đính kèm ({attachments.length}/20)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            Kéo thả hoặc Ctrl+V dán ảnh trực tiếp
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {uploading && (
            <div className="aspect-square bg-slate-900/80 border border-blue-500/50 border-dashed rounded-2xl flex flex-col items-center justify-center p-3 text-center animate-pulse">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-1.5" />
              <span className="text-xs text-blue-300 font-medium font-mono">Đang tải lên...</span>
            </div>
          )}

          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative aspect-square bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-500/5"
            >
              {/* Image Thumbnail */}
              <img
                src={att.public_url}
                alt={att.filename}
                className="w-full h-full object-cover cursor-pointer transition-transform duration-500 group-hover:scale-105"
                onClick={() => setSelectedImage(att)}
              />

              {/* Top Gradient Header */}
              <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between pointer-events-none font-mono">
                <span className="text-[10px] text-slate-200 truncate max-w-[75%] font-medium">
                  {att.filename}
                </span>
                <span className="text-[9px] text-slate-400 bg-black/60 px-1.5 py-0.5 rounded">
                  {(att.size / 1024).toFixed(0)}KB
                </span>
              </div>

              {/* Bottom Actions Overlay */}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                <button
                  onClick={() => setSelectedImage(att)}
                  className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors"
                  title="Xem phóng to"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleCopyImage(att)}
                  className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors"
                  title="Sao chép ảnh vào Clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDownloadImage(att)}
                  className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors"
                  title="Tải ảnh về"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDelete(att)}
                  disabled={deletingId === att.id}
                  className="p-1.5 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-800/40 text-rose-300 transition-colors disabled:opacity-50"
                  title="Xóa ảnh"
                >
                  {deletingId === att.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

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
