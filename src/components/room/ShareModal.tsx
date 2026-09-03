'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, QrCode, X, Smartphone, Globe, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface ShareModalProps {
  isOpen: boolean;
  slug: string;
  hasPin: boolean;
  onClose: () => void;
}

export function ShareModal({ isOpen, slug, hasPin, onClose }: ShareModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [roomUrl, setRoomUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/r/${slug}`;
      setRoomUrl(url);

      QRCode.toDataURL(url, {
        margin: 1.5,
        width: 280,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((dataUri) => setQrDataUrl(dataUri))
        .catch((err) => console.error('Error generating QR code', err));
    }
  }, [slug, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      showToast('Đã sao chép liên kết phòng vào clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Không thể truy cập clipboard', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-slide-up overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hairline-b flex items-center justify-between px-4 py-3 bg-header">
          <h2 id="share-modal-title" className="text-sm font-semibold text-foreground">
            Chia sẻ phòng
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng" className="h-7 w-7">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* QR Code Section */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-lg border border-border bg-white p-2.5">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`QR Code ${slug}`}
                  className="h-40 w-40 rounded object-contain"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center font-mono text-xs text-muted-foreground">
                  Đang tạo mã…
                </div>
              )}
            </div>

            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Quét bằng camera điện thoại để mở ngay</span>
            </p>
          </div>

          {/* Direct Link Box */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={roomUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground select-all focus:border-ring focus:outline-none"
              />
              <Button
                variant={copied ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleCopyLink}
                className="h-9 shrink-0 gap-1.5 px-3"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--dark-green)]" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Chép link</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {hasPin && (
            <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Phòng có mã PIN</p>
              <p className="mt-0.5">Người mở liên kết cần nhập mã PIN để xem và sửa nội dung.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="hairline-t flex items-center justify-end bg-header px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
