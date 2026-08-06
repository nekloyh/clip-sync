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
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border-contrast bg-transparent hover:bg-muted text-foreground',
        ghost: 'bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground',
        destructive:
          'border border-border-contrast bg-transparent text-[var(--dark-red)] hover:bg-[var(--light-red)]',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-sm',
        icon: 'h-7 w-7',
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
