'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

interface PinModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'set';
  slug: string;
  hasPin: boolean;
  onClose?: () => void;
  onSuccess: (hasPin: boolean) => void;
}

export function PinModal({
  isOpen,
  mode,
  slug,
  hasPin,
  onClose,
  onSuccess,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'set' && pin.trim() !== '' && !/^\d{4,6}$/.test(pin)) {
      setError('PIN cần từ 4 đến 6 chữ số');
      return;
    }
    if (mode === 'unlock' && pin.trim() === '') {
      setError('Nhập mã PIN để tiếp tục');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${slug}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode === 'unlock' ? 'verify' : 'set', pin }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Thao tác không thành công');

      if (mode === 'unlock') {
        // Access is granted by the httpOnly cookie the API just set — the
        // client keeps no unlock state of its own any more.
        if (data.verified) {
          showToast('Đã mở khóa phòng', 'success');
          onSuccess(true);
        } else {
          setPin('');
          setError('Mã PIN không đúng');
        }
        return;
      }

      showToast(data.hasPin ? 'Đã đặt mã PIN' : 'Đã gỡ mã PIN', data.hasPin ? 'success' : 'info');
      setPin('');
      onSuccess(!!data.hasPin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác không thành công');
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'unlock' ? 'Phòng đang khóa PIN' : hasPin ? 'Đổi mã PIN phòng' : 'Đặt mã PIN bảo vệ';
  const hint =
    mode === 'unlock'
      ? 'Nhập mã PIN gồm 4–6 số để mở và xem nội dung phòng này.'
      : 'Nhập 4–6 chữ số để khóa phòng. Để trống rồi bấm Lưu nếu muốn gỡ bỏ mã PIN.';

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm animate-slide-up overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hairline-b flex items-start justify-between bg-header px-5 py-4">
          <div>
            <h2 id="pin-modal-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{hint}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
              aria-label="Mã PIN"
              aria-invalid={!!error}
              className="h-12 w-full rounded-xl border border-input bg-muted/30 text-center font-mono text-2xl tracking-[0.5em] text-foreground placeholder:tracking-[0.4em] placeholder:text-foreground-tertiary focus:border-ring focus:bg-background focus:outline-none transition-colors"
            />
            <p className="text-center text-[11px] text-muted-foreground">
              {pin.length > 0 ? `${pin.length}/6 ký tự số` : 'Từ 4 đến 6 chữ số'}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-[var(--light-red)] p-2.5 text-center text-xs font-medium text-[var(--dark-red)]" role="alert">
              {error}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            {mode === 'set' && onClose && (
              <Button type="button" variant="outline" size="md" onClick={onClose} className="flex-1">
                Hủy
              </Button>
            )}
            <Button type="submit" variant="primary" size="md" disabled={loading} className="flex-1">
              {loading ? 'Đang xử lý…' : mode === 'unlock' ? 'Mở khóa phòng' : hasPin && pin.trim() === '' ? 'Gỡ mã PIN' : 'Lưu mã PIN'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
