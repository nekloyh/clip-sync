import React from 'react';
import { cn } from '@/lib/cn';

export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-foreground shrink-0"
        aria-hidden
      >
        <rect
          x="1"
          y="4.5"
          width="9.5"
          height="10"
          rx="2"
          className="stroke-current opacity-40"
          strokeWidth="1.5"
        />
        <rect
          x="5.5"
          y="1.5"
          width="9.5"
          height="10"
          rx="2"
          className="fill-background stroke-current"
          strokeWidth="1.5"
        />
      </svg>

      {showText && (
        <span className="text-sm font-semibold tracking-tight text-foreground">
          ClipSync
        </span>
      )}
    </span>
  );
}
