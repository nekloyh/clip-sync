'use client';

import React from 'react';
import { X, Copy, Download, Trash2, ExternalLink } from 'lucide-react';
import { Attachment } from '@/lib/types';

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
  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-slate-200 truncate max-w-xs md:max-w-md">
            {attachment.filename}
          </span>
          <span className="text-xs text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded">
            {(attachment.size / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onCopy(attachment)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
            title="Copy image to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copy</span>
          </button>

          <button
            onClick={() => onDownload(attachment)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
            title="Tải ảnh về"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tải về</span>
          </button>

          <button
            onClick={() => onDelete(attachment)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-950/80 hover:bg-rose-900 border border-rose-800/50 text-rose-300 rounded-lg transition-colors"
            title="Xóa ảnh này"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xóa</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image container */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-auto"
        onClick={onClose}
      >
        <img
          src={attachment.public_url || ''}
          alt={attachment.filename}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
