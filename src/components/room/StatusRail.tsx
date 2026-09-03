'use client';

import React from 'react';
import { StatusChip, Dot } from '@/components/ui/StatusChip';
import { RotateCcw, Clock, Check, Cloud, WifiOff, AlertCircle } from 'lucide-react';
import type { RequestFailure } from '@/lib/request-failure';

export type SaveStatus = 'saving' | 'saved' | 'idle' | 'error' | 'offline';

interface StatusRailProps {
  onlineCount: number;
  saveStatus: SaveStatus;
  /** Why the last save failed, when it did. Drives the message and the button. */
  saveFailure?: RequestFailure | null;
  onRetrySave?: () => void;
  lastSavedAt: string | null;
  lines: number;
  words: number;
  chars: number;
  maxChars: number;
}

export function StatusRail({
  onlineCount,
  saveStatus,
  saveFailure,
  onRetrySave,
  lastSavedAt,
  lines,
  words,
  chars,
  maxChars,
}: StatusRailProps) {
  const nearLimit = chars >= maxChars * 0.9;

  return (
    <div className="hairline-t flex h-8 shrink-0 select-none items-center justify-between gap-3 bg-header px-3 font-mono text-[11px] text-muted-foreground sm:px-4">
      {/* Left: Device presence & Autosave status */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <Dot pulse className="bg-emerald-500" />
          <span>{onlineCount}</span>
          <span className="hidden sm:inline text-muted-foreground">kết nối</span>
        </span>

        <span className="h-2.5 w-px bg-border" />

        <SaveState
          status={saveStatus}
          failure={saveFailure}
          lastSavedAt={lastSavedAt}
          onRetry={onRetrySave}
        />
      </div>

      {/* Right: Metrics */}
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="hidden sm:inline text-foreground-tertiary">
          {lines}L · {words}W
        </span>

        <span className={nearLimit ? 'text-[var(--dark-yellow)] font-medium' : undefined}>
          <span className="text-foreground">{chars.toLocaleString('vi-VN')}</span>
          <span className="text-foreground-tertiary">/{maxChars.toLocaleString('vi-VN')}</span>
        </span>
      </div>
    </div>
  );
}

function SaveState({
  status,
  failure,
  lastSavedAt,
  onRetry,
}: {
  status: SaveStatus;
  failure?: RequestFailure | null;
  lastSavedAt: string | null;
  onRetry?: () => void;
}) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
        <Cloud className="h-3.5 w-3.5 animate-pulse" />
        <span className="hidden sm:inline">Đang lưu…</span>
      </span>
    );
  }

  if (status === 'offline') {
    return (
      <StatusChip tone="yellow" className="gap-1.5">
        <WifiOff className="h-3 w-3 text-[var(--dark-yellow)]" />
        <span>Ngoại tuyến · Giữ nội dung</span>
      </StatusChip>
    );
  }

  if (status === 'error') {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <StatusChip tone="red" className="gap-1.5">
          <AlertCircle className="h-3 w-3 text-[var(--dark-red)]" />
          <span>
            {failure?.kind === 'rate_limited'
              ? failure.retryAfterSeconds
                ? `Chờ ${failure.retryAfterSeconds}s`
                : 'Hệ thống bận'
              : failure?.kind === 'timeout'
                ? 'Hết giờ'
                : failure?.kind === 'rejected'
                  ? 'Bị từ chối'
                  : 'Lưu thất bại'}
          </span>
        </StatusChip>
        {onRetry && failure?.retryable !== false && (
          <button
            type="button"
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
            title={failure?.message ?? 'Thử lưu lại'}
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Thử lại</span>
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3 w-3 text-[var(--dark-green)]" />
      <span className="truncate">
        {lastSavedAt ? `Đã lưu ${lastSavedAt}` : 'Đã tự động lưu'}
      </span>
    </span>
  );
}
