'use client';

import React from 'react';
import { StatusChip, Dot } from '@/components/ui/StatusChip';

export type SaveStatus = 'saving' | 'saved' | 'idle' | 'error';

interface StatusRailProps {
  onlineCount: number;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  lines: number;
  words: number;
  chars: number;
  maxChars: number;
}

/**
 * A single hairline strip of telemetry under the buffer: who is connected,
 * whether the last keystroke landed, and how big the buffer is. Every field is
 * state the person actually needs while pasting; none of it is decoration.
 */
export function StatusRail({
  onlineCount,
  saveStatus,
  lastSavedAt,
  lines,
  words,
  chars,
  maxChars,
}: StatusRailProps) {
  const nearLimit = chars >= maxChars * 0.9;

  return (
    <div className="hairline-t flex h-8 shrink-0 select-none items-center justify-between gap-3 bg-header px-3 font-mono text-xs text-foreground-tertiary sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* The dot carries the "live" signal; the chip stays neutral so the
            rail never outshouts the text the person is actually reading. */}
        <StatusChip tone="neutral">
          <Dot className="bg-[var(--dark-green)]" />
          {onlineCount}
          <span className="hidden sm:inline">thiết bị</span>
        </StatusChip>

        <SaveState status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden sm:inline">
          {lines} dòng · {words} từ
        </span>
        <span className={nearLimit ? 'text-[var(--dark-yellow)]' : undefined}>
          {chars.toLocaleString('vi-VN')}
          <span className="text-foreground-tertiary">/{maxChars.toLocaleString('vi-VN')}</span>
        </span>
      </div>
    </div>
  );
}

function SaveState({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
}) {
  if (status === 'saving') {
    return <span className="text-muted-foreground">Đang lưu…</span>;
  }
  if (status === 'error') {
    return (
      <StatusChip tone="red">
        <Dot />
        Lưu thất bại
      </StatusChip>
    );
  }
  return (
    <span className="truncate">{lastSavedAt ? `Đã lưu ${lastSavedAt}` : 'Đã lưu'}</span>
  );
}
