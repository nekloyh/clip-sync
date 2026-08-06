import React from 'react';
import { cn } from '@/lib/cn';

/**
 * Two offset squares — the same buffer held on two devices, the top one
 * catching the accent. Drawn rather than imported so it inherits currentColor
 * and stays crisp at 16px.
 */
export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="0.75"
          y="4.75"
          width="9.5"
          height="9.5"
          rx="1.75"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.45"
        />
        <rect
          x="5.75"
          y="1.75"
          width="9.5"
          height="9.5"
          rx="1.75"
          className="fill-background"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      {showText && (
        <span className="text-sm font-semibold tracking-tight text-foreground">ClipSync</span>
      )}
    </span>
  );
}
