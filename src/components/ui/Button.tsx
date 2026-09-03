'use client';

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Note the `primary` variant: it is the inverted one — near-white on dark,
 * near-black on light. That inversion is the single loudest move in the whole
 * interface, which is why everything else here stays a bordered ghost.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
    'transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 ' +
    'active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:opacity-90 shadow-xs border border-transparent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border shadow-xs',
        outline:
          'border border-border bg-card/80 hover:bg-muted text-foreground shadow-xs hover:border-border-contrast',
        ghost:
          'bg-transparent hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-transparent',
        destructive:
          'border border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25',
        accent:
          'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs border border-transparent dark:bg-indigo-500 dark:hover:bg-indigo-600',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs font-medium',
        md: 'h-9 px-3.5 text-sm font-medium',
        lg: 'h-11 px-5 text-sm font-semibold rounded-xl',
        icon: 'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  )
);
Button.displayName = 'Button';

export { button as buttonVariants };
