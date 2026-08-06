'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  Plus,
  LogIn,
  Shield,
  Zap,
  RefreshCw,
  Image as ImageIcon,
  Copy,
  Clock,
  Smartphone,
  Laptop,
} from 'lucide-react';
import { generateRandomSlug } from '@/lib/slug';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { SupabaseSetupNotice } from '@/components/ui/SupabaseSetupNotice';

export default function HomePage() {
  const router = useRouter();
  const [joinSlug, setJoinSlug] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  const handleCreateRoom = async () => {
    setLoadingCreate(true);
    const newSlug = generateRandomSlug();
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug }),
      });
      const data = await res.json();
      const targetSlug = data.slug || newSlug;
      router.push(`/r/${targetSlug}`);
    } catch {
      router.push(`/r/${newSlug}`);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleaned) return;
    setLoadingJoin(true);
    router.push(`/r/${cleaned}`);
  };

  return (
    <div className="min-h-screen bg-radial-glow bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden">
      {/* Background Decorative Mesh Grids */}
      <div className="absolute inset-0 bg-editor-grid opacity-30 pointer-events-none" />

      {/* Top Navbar */}
      <header className="max-w-6xl w-full mx-auto py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            ClipSync
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] font-mono text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            Realtime Engine Active
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-3xl w-full mx-auto my-auto z-10 py-12 flex flex-col items-center">
        {/* Pill Announcement */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-white/10 backdrop-blur-md text-xs text-slate-300 mb-6 shadow-xl">
          <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider">
            Mới
          </span>
          <span>Dán ảnh Ctrl+V trực tiếp • Không cần đăng ký</span>
        </div>

        {/* Hero Title & Subtitle */}
        <h1 className="text-4xl sm:text-6xl font-extrabold text-center tracking-tight leading-[1.1] mb-5">
          Notepad dùng chung{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
            siêu tốc
          </span>{' '}
          giữa các thiết bị.
        </h1>
        <p className="text-slate-400 text-base sm:text-lg text-center max-w-xl leading-relaxed mb-10">
          Chuyển qua lại văn bản, link, đoạn code và ảnh chụp màn hình giữa Laptop, PC và Điện thoại trong chưa đầy 1 giây qua URL ngẫu nhiên.
        </p>

        {!isSupabaseConfigured() && <SupabaseSetupNotice />}

        {/* Main Action Glass Card */}
        <div className="w-full glass-panel glass-panel-hover rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 border border-white/10">
          {/* Create Room Button */}
          <div>
            <button
              onClick={handleCreateRoom}
              disabled={loadingCreate}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-base shadow-xl shadow-blue-600/25 hover:shadow-blue-500/40 transition-all duration-300 flex items-center justify-center gap-3 group relative overflow-hidden"
            >
              {loadingCreate ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Đang khởi tạo không gian...</span>
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 transition-transform group-hover:scale-125" />
                  <span>Tạo phòng mới ngay</span>
                  <ArrowRight className="w-5 h-5 text-blue-200 transition-transform group-hover:translate-x-1.5" />
                </>
              )}
            </button>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2.5 px-1 font-mono">
              <span>Tự động sinh URL dạng <code className="text-blue-400">quiet-fox-4821</code></span>
              <span className="hidden sm:inline text-slate-600">Bảo mật RLS + SSL</span>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Hoặc nhập mã phòng có sẵn
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Join Room Form */}
          <form onSubmit={handleJoinRoom} className="flex gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm select-none">
                /r/
              </span>
              <input
                type="text"
                value={joinSlug}
                onChange={(e) => setJoinSlug(e.target.value)}
                placeholder="quiet-fox-4821..."
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-white/10 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loadingJoin || !joinSlug.trim()}
              className="px-6 py-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-medium text-sm disabled:opacity-40 transition-all flex items-center gap-2 shrink-0 border border-white/10"
            >
              {loadingJoin ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Vào phòng</span>
                  <LogIn className="w-4 h-4 text-blue-400" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-10">
          <div className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-2.5">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">Đồng bộ &lt; 1 giây</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Realtime 2 chiều bằng Supabase Websocket. Không mất con trỏ khi gõ.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2.5">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">Dán ảnh (Ctrl+V)</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Paste hoặc kéo thả bất kỳ đâu. Xem full lightbox, copy binary vào clipboard.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2.5">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">Bảo mật & Tự hủy</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Đặt PIN 4-6 số tùy chọn. Dữ liệu và ảnh tự động xóa sạch sau 7 ngày.
            </p>
          </div>
        </div>

        {/* Workflow Devices Visual */}
        <div className="flex items-center gap-6 text-slate-500 text-xs font-mono mt-12">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-blue-400" />
            <span>Laptop</span>
          </div>
          <span className="text-blue-500">↔</span>
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-indigo-400" />
            <span>PC</span>
          </div>
          <span className="text-indigo-500">↔</span>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Mobile</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 z-10 font-mono">
        <div>ClipSync • Designed for Power Users</div>
        <div className="flex items-center gap-4">
          <span>No-index Secured</span>
          <span>•</span>
          <span>Next.js App Router & Supabase</span>
        </div>
      </footer>
    </div>
  );
}
