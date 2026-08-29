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
    <div className="hairline-b flex items-start gap-2.5 bg-header px-3 py-2 sm:px-4">
      <KeyRound
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dark-yellow)]"
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Bạn là chủ phòng này.</span> Quyền đặt PIN
        và xóa phòng gắn với trình duyệt hiện tại, không phải tài khoản. Xóa cookie, đổi máy hay
        mở link ở cửa sổ ẩn danh sẽ khiến bạn thành cộng tác viên và{' '}
        <span className="text-foreground">không lấy lại được</span>. Phòng vẫn tự xóa sau 7 ngày.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="-m-1 shrink-0 rounded-sm p-1 text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
        title="Đã hiểu"
        aria-label="Đóng thông báo"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
