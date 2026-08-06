'use client';

import React, { useState } from 'react';
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
    mode === 'unlock' ? 'Phòng đang khóa' : hasPin ? 'Đổi mã PIN' : 'Đặt mã PIN';
  const hint =
    mode === 'unlock'
      ? 'Nhập mã PIN 4–6 số để xem nội dung phòng này.'
      : 'Nhập 4–6 chữ số để khóa phòng. Để trống rồi lưu để gỡ khóa.';

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="w-full max-w-xs animate-slide-up overflow-hidden rounded-lg border border-border bg-card">
        <div className="hairline-b bg-header px-4 py-3">
          <h2 id="pin-modal-title" className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4">
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
            className="h-10 w-full rounded-md border border-input bg-background text-center font-mono text-lg tracking-[0.4em] text-foreground placeholder:tracking-[0.3em] placeholder:text-foreground-tertiary focus:border-ring focus:outline-none"
          />

          {error && (
            <p className="font-mono text-xs text-[var(--dark-red)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {mode === 'set' && onClose && (
              <Button type="button" variant="ghost" size="lg" onClick={onClose} className="flex-1">
                Hủy
              </Button>
            )}
            <Button type="submit" variant="primary" size="lg" disabled={loading} className="flex-1">
              {loading ? 'Đang xử lý…' : mode === 'unlock' ? 'Mở khóa' : 'Lưu'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
