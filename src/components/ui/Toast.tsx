'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TONE = {
  success: { icon: CheckCircle2, color: 'text-[var(--dark-green)]' },
  error: { icon: AlertCircle, color: 'text-[var(--dark-red)]' },
  info: { icon: Info, color: 'text-dark-violet' },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    },
    []
  );

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, color } = TONE[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex animate-slide-up items-start justify-between gap-2 rounded-md border border-border bg-popover px-3 py-2"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${color}`} />
                <span className="text-sm text-foreground">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 rounded-sm p-0.5 text-foreground-tertiary transition-colors hover:text-foreground"
                aria-label="Đóng thông báo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
