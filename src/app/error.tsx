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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card">
        <div className="hairline-b bg-header px-4 py-3">
          <h1 className="text-sm font-semibold text-foreground">Không tải được trang</h1>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Máy chủ không trả về nội dung. Thử lại; nếu vẫn lỗi, kiểm tra biến môi trường Supabase.
          </p>
          {error.digest && (
            <p className="mt-3 font-mono text-xs text-foreground-tertiary">
              digest {error.digest}
            </p>
          )}
          <Button variant="primary" size="lg" onClick={reset} className="mt-4 w-full">
            Thử lại
          </Button>
        </div>
      </div>
    </div>
  );
}
