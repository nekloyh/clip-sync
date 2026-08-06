'use client';

import React, { useState } from 'react';
import { Lock, KeyRound, ShieldCheck, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface PinModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'set';
  slug: string;
  hasPin: boolean;
  onClose?: () => void;
  onSuccess: () => void;
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
      setError('PIN phải từ 4 đến 6 chữ số');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${slug}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'unlock' ? 'verify' : 'set',
          pin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Thao tác thất bại');
      }

      if (mode === 'unlock') {
        if (data.verified) {
          localStorage.setItem(`clipsync_unlocked_${slug}`, 'true');
          showToast('Đã mở khóa phòng!', 'success');
          onSuccess();
        } else {
          setError('Mã PIN không đúng, vui lòng thử lại');
        }
      } else {
        if (pin.trim() === '') {
          showToast('Đã xóa bảo vệ PIN cho phòng', 'info');
        } else {
          localStorage.setItem(`clipsync_unlocked_${slug}`, 'true');
          showToast('Đã thiết lập mã PIN bảo vệ', 'success');
        }
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl relative">
        {mode === 'set' && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
            {mode === 'unlock' ? (
              <Lock className="w-6 h-6 text-blue-400" />
            ) : (
              <KeyRound className="w-6 h-6 text-blue-400" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-white">
            {mode === 'unlock'
              ? 'Phòng này được bảo vệ bằng PIN'
              : hasPin
              ? 'Cập nhật mã PIN'
              : 'Đặt mã PIN bảo vệ'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'unlock'
              ? 'Vui lòng nhập mã PIN 4–6 số để truy cập nội dung'
              : 'Nhập 4–6 số để đặt PIN, hoặc để trống để xóa bảo vệ PIN'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Nhập 4-6 chữ số..."
              autoFocus
              className="w-full text-center tracking-[0.5em] text-xl font-mono px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder:tracking-normal placeholder:text-sm placeholder:font-sans focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {error && (
              <p className="text-xs text-rose-400 mt-2 text-center">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            {mode === 'set' && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{mode === 'unlock' ? 'Mở khóa' : 'Lưu cài đặt'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
