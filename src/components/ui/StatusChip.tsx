import React from 'react';
import { cn } from '@/lib/cn';

type Tone = 'green' | 'yellow' | 'red' | 'violet' | 'neutral';

const TONES: Record<Tone, string> = {
  green: 'bg-[var(--light-green)] text-[var(--dark-green)]',
  yellow: 'bg-[var(--light-yellow)] text-[var(--dark-yellow)]',
  red: 'bg-[var(--light-red)] text-[var(--dark-red)]',
  violet: 'bg-light-violet text-dark-violet',
  neutral: 'bg-muted text-muted-foreground',
};

/**
 * The only element allowed to carry saturated color, and only at this size.
 * A tinted ground with matching ink, never a solid fill.
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
    <span className={cn('chip font-mono', TONES[tone], className)}>{children}</span>
  );
}

/** 6px dot used inside chips to stand in for a live state. */
export function Dot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current', className)}
    />
  );
}
