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
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="hairline-b bg-header px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Chưa cấu hình Supabase</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          ClipSync sử dụng Supabase để đồng bộ thời gian thực và lưu ảnh. Cần bổ sung biến môi trường để chạy đầy đủ chức năng lưu trữ.
        </p>
      </div>

      <ol className="divide-y divide-border text-xs sm:text-sm">
        <li className="flex items-start gap-3.5 px-5 py-4">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/80 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            1
          </span>
          <span className="text-muted-foreground leading-relaxed">
            Tạo dự án tại{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Supabase Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
            , sau đó chạy 2 file migration trong <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">supabase/migrations/</code>.
          </span>
        </li>

        <li className="flex items-start gap-3.5 px-5 py-4">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/80 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            2
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-muted-foreground">
              Điền các khóa API vào file <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.env.local</code> ở thư mục gốc:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-surface-code p-3.5 font-mono text-xs leading-relaxed text-foreground border border-border/60">
              {ENV_TEMPLATE}
            </pre>
          </div>
        </li>

        <li className="flex items-start gap-3.5 px-5 py-4">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/80 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            3
          </span>
          <span className="text-muted-foreground leading-relaxed">
            Khởi động lại <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">npm run dev</code> và tải lại trang để bắt đầu sử dụng.
          </span>
        </li>
      </ol>
    </div>
  );
}
