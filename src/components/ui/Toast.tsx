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
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 sm:bottom-6 sm:right-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, color } = TONE[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex animate-slide-up items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md px-4 py-3 shadow-card transition-all"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex shrink-0 items-center justify-center">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                </div>
                <span className="text-sm font-medium text-foreground leading-snug">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 rounded-md p-1 text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Đóng thông báo"
              >
                <X className="h-3.5 w-3.5" />
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
