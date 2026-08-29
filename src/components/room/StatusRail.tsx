'use client';

import React from 'react';
import { StatusChip, Dot } from '@/components/ui/StatusChip';
import { RotateCcw } from 'lucide-react';
import type { RequestFailure } from '@/lib/request-failure';

/**
 * `offline` is its own state and not a flavour of `error`.
 *
 * "Lưu thất bại" on a device with no network is both alarming and wrong: the
 * save did not fail, it has not been attempted, and the text is safe. The two
 * states also imply different actions - one is "press retry", the other is
 * "wait, we will retry for you" - so collapsing them would leave the person
 * pressing a button that cannot work.
 */
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

/**
 * A single hairline strip of telemetry under the buffer: who is connected,
 * whether the last keystroke landed, and how big the buffer is. Every field is
 * state the person actually needs while pasting; none of it is decoration.
 */
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
    <div className="hairline-t flex h-8 shrink-0 select-none items-center justify-between gap-3 bg-header px-3 font-mono text-xs text-foreground-tertiary sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* The dot carries the "live" signal; the chip stays neutral so the
            rail never outshouts the text the person is actually reading. */}
        <StatusChip tone="neutral">
          <Dot className="bg-[var(--dark-green)]" />
          {onlineCount}
          <span className="hidden sm:inline">thiết bị</span>
        </StatusChip>

        <SaveState
          status={saveStatus}
          failure={saveFailure}
          lastSavedAt={lastSavedAt}
          onRetry={onRetrySave}
        />
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
    return <span className="text-muted-foreground">Đang lưu…</span>;
  }

  if (status === 'offline') {
    // Reassurance, not an alarm. The text is held locally and resent
    // automatically when the network comes back, so there is nothing to press.
    return (
      <StatusChip tone="yellow">
        <Dot />
        Ngoại tuyến · giữ nội dung
      </StatusChip>
    );
  }

  if (status === 'error') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <StatusChip tone="red">
          <Dot />
          {failure?.kind === 'rate_limited'
            ? failure.retryAfterSeconds
              ? `Chờ ${failure.retryAfterSeconds}s`
              : 'Đang bận'
            : failure?.kind === 'timeout'
              ? 'Quá thời gian'
              : failure?.kind === 'rejected'
                ? 'Bị từ chối'
                : 'Lưu thất bại'}
        </StatusChip>
        {/* Present only when resending can actually help. A permanently
            rejected save (too long, for instance) needs an edit, not a retry,
            and a button that cannot work is worse than no button. */}
        {onRetry && failure?.retryable !== false && (
          <button
            type="button"
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
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
    <span className="truncate">{lastSavedAt ? `Đã lưu ${lastSavedAt}` : 'Đã lưu'}</span>
  );
}
