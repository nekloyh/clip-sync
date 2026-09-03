'use client';

import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';

/**
 * Told once, to the person who just created the room.
 *
 * Ownership here is a capability in this browser's cookie jar, not an account,
 * and that has a consequence nobody would guess from the UI: clearing cookies,
 * switching devices or opening the same link in a private window makes you a
 * contributor to your own room, permanently, with no recovery path. That is a
 * deliberate design choice — a recovery backdoor is also a takeover backdoor —
 * but it is only a defensible one if the person is told while they can still
 * act on it. Silence here means someone learns it at the worst possible moment.
 *
 * Dismissible and shown only on the first load after creation: it is a warning,
 * not a permanent fixture.
 */
export function OwnerNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <aside
      aria-label="Thông báo quyền chủ phòng"
      className="hairline-b flex items-center justify-between gap-3 bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 shrink-0 text-foreground" />
        <p className="min-w-0 flex-1 leading-normal">
          <span className="font-medium text-foreground">Bạn là chủ phòng.</span> Quyền đổi PIN và xóa phòng lưu trên trình duyệt này. Phòng tự xóa sau 7 ngày không hoạt động.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 text-foreground-tertiary hover:bg-muted hover:text-foreground transition-colors"
        title="Đóng"
        aria-label="Đóng"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}
