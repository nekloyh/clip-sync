'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  Check,
  Lock,
  Unlock,
  Trash2,
  Share2,
  Users,
  Loader2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface EditorHeaderProps {
  slug: string;
  onlineCount: number;
  saveStatus: 'saving' | 'saved' | 'idle' | 'error';
  lastSavedAt: string | null;
  hasPin: boolean;
  onCopyAllText: () => void;
  onOpenPinModal: () => void;
  onDeleteRoom: () => void;
}

export function EditorHeader({
  slug,
  onlineCount,
  saveStatus,
  lastSavedAt,
  hasPin,
  onCopyAllText,
  onOpenPinModal,
  onDeleteRoom,
}: EditorHeaderProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const { showToast } = useToast();

  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    showToast('Đã sao chép đường dẫn phòng!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <header className="h-14 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-3 z-30 shrink-0 select-none">
      {/* Left section: Branding & Slug Badge */}
      <div className="flex items-center gap-3.5 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 font-extrabold text-white tracking-tight hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent text-sm hidden md:inline">
            ClipSync
          </span>
        </Link>

        <div className="h-4 w-px bg-white/10 hidden sm:block" />

        {/* Room Slug Pill */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-white/10 rounded-xl px-3 py-1 min-w-0 shadow-inner">
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">/r/</span>
          <span className="text-xs font-mono font-semibold text-blue-300 truncate max-w-[110px] sm:max-w-[180px]">
            {slug}
          </span>
          <button
            onClick={handleCopyLink}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
            title="Sao chép đường dẫn phòng"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Center section: Presence & Save Status */}
      <div className="flex items-center gap-3.5 text-xs font-mono">
        {/* Presence Badge */}
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full font-medium shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>{onlineCount} online</span>
        </div>

        {/* Save Status Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-white/5 text-slate-400">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span className="text-blue-400 font-medium">Đang lưu...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <span className="text-slate-400">
              Đã lưu {lastSavedAt ? `lúc ${lastSavedAt}` : ''}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-rose-400 font-medium">Lỗi lưu tự động</span>
          )}
        </div>
      </div>

      {/* Right section: Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Copy All Text Button */}
        <button
          onClick={onCopyAllText}
          className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-95"
          title="Copy toàn bộ văn bản (Ctrl+A+C)"
        >
          <Copy className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Copy toàn bộ text</span>
        </button>

        {/* PIN Protection Button */}
        <button
          onClick={onOpenPinModal}
          className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 active:scale-95 ${
            hasPin
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
              : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title={hasPin ? 'Phòng có PIN bảo vệ' : 'Đặt mã PIN bảo vệ'}
        >
          {hasPin ? (
            <>
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">PIN On</span>
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đặt PIN</span>
            </>
          )}
        </button>

        {/* Delete Room Button */}
        <button
          onClick={onDeleteRoom}
          className="p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all active:scale-95"
          title="Xóa phòng này ngay"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
