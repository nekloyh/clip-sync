import React from 'react';
import { cn } from '@/lib/cn';

type Tone = 'green' | 'yellow' | 'red' | 'violet' | 'neutral';

const TONES: Record<Tone, string> = {
  green: 'bg-[var(--light-green)] text-[var(--dark-green)] border border-[var(--dark-green)]/15',
  yellow: 'bg-[var(--light-yellow)] text-[var(--dark-yellow)] border border-[var(--dark-yellow)]/20',
  red: 'bg-[var(--light-red)] text-[var(--dark-red)] border border-[var(--dark-red)]/20',
  violet: 'bg-light-violet text-dark-violet border border-dark-violet/20',
  neutral: 'bg-muted/90 text-muted-foreground border border-border/60',
};

/**
 * Calm pill status chip with matching tint and crisp label.
 */
export function StatusChip({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn('chip select-none transition-colors', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Dot indicator for live or active state, with optional gentle pulse. */
export function Dot({
  className,
  pulse = false,
}: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className="relative inline-flex items-center justify-center">
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full opacity-60 bg-current',
            className
          )}
        />
      )}
      <span
        aria-hidden
        className={cn('relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current', className)}
      />
    </span>
  );
}
