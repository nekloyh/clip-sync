'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[clipsync] render error', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-slide-up overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="hairline-b bg-header px-5 py-4">
          <h1 className="text-base font-semibold text-foreground">Không tải được trang</h1>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Hệ thống không thể kết nối hoặc tải dữ liệu phòng. Bạn vui lòng thử lại; nếu vẫn gặp sự cố, hãy kiểm tra lại kết nối mạng hoặc biến môi trường Supabase.
          </p>
          {error.digest && (
            <p className="rounded-lg bg-muted/60 p-2 font-mono text-[11px] text-foreground-tertiary">
              Mã lỗi: {error.digest}
            </p>
          )}
          <div className="space-y-2 pt-2">
            <Button variant="primary" size="md" onClick={reset} className="w-full">
              Thử lại
            </Button>
            <a
              href="/"
              className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Về trang chủ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
