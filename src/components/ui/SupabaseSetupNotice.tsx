'use client';

import React from 'react';
import { AlertTriangle, KeyRound, Terminal, ExternalLink, CheckCircle } from 'lucide-react';

export function SupabaseSetupNotice() {
  return (
    <div className="max-w-2xl w-full mx-auto my-8 p-6 glass-panel rounded-3xl border border-amber-500/30 bg-amber-950/20 text-slate-100 shadow-2xl animate-in fade-in">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-amber-300 mb-1">
            Cần cấu hình biến môi trường Supabase
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Ứng dụng cần kết nối với dự án Supabase để lưu văn bản và hình ảnh realtime. File <code className="text-amber-300 font-mono">.env.local</code> của bạn hiện chưa được thiết lập.
          </p>

          <div className="space-y-3 bg-slate-950/80 border border-white/10 rounded-2xl p-4 text-xs font-mono">
            <div className="font-semibold text-slate-200 flex items-center gap-2 font-sans">
              <KeyRound className="w-4 h-4 text-blue-400" />
              <span>3 bước kết nối nhanh:</span>
            </div>

            <ol className="list-decimal list-inside space-y-2 text-slate-300 font-sans">
              <li>
                Tạo dự án trên{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline font-medium inline-flex items-center gap-1"
                >
                  Supabase Dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                Tạo file <code className="text-amber-300 font-mono">.env.local</code> tại thư mục gốc dự án:
              </li>
            </ol>

            <div className="p-3 bg-slate-900 rounded-xl border border-white/5 text-[11px] text-emerald-300 select-all overflow-x-auto">
              NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co<br />
              NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...<br />
              SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
            </div>

            <div className="flex items-center gap-2 text-slate-400 font-sans text-[11px] pt-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Chi tiết xem tại hướng dẫn [`README.md`](file:///f:/ClipOnline/README.md). Sau khi tạo file `.env.local`, refresh lại trang này.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
