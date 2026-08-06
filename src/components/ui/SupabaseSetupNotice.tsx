'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

const ENV_TEMPLATE = `NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...`;

/**
 * An empty screen is an invitation to act: this says exactly what is missing
 * and what to type, rather than apologising for the state it is in.
 */
export function SupabaseSetupNotice() {
  return (
    <div className="mx-auto w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card">
      <div className="hairline-b bg-header px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Chưa cấu hình Supabase</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          ClipSync cần một dự án Supabase để lưu văn bản và ảnh. Thiếu biến môi trường nên chưa
          kết nối được.
        </p>
      </div>

      <ol className="divide-y divide-border text-sm">
        <li className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 font-mono text-xs text-foreground-tertiary">1</span>
          <span className="text-muted-foreground">
            Tạo dự án tại{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-link hover:underline"
            >
              Supabase Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
            , rồi chạy 2 file trong <code className="font-mono text-xs">supabase/migrations/</code>.
          </span>
        </li>

        <li className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 font-mono text-xs text-foreground-tertiary">2</span>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-muted-foreground">
              Tạo <code className="font-mono text-xs">.env.local</code> ở thư mục gốc:
            </p>
            <pre className="overflow-x-auto rounded-md bg-surface-code p-3 font-mono text-xs leading-relaxed text-foreground">
              {ENV_TEMPLATE}
            </pre>
          </div>
        </li>

        <li className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 font-mono text-xs text-foreground-tertiary">3</span>
          <span className="text-muted-foreground">
            Khởi động lại <code className="font-mono text-xs">npm run dev</code> và tải lại trang.
          </span>
        </li>
      </ol>
    </div>
  );
}
