import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-primary px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-surface hover:bg-primary-strong disabled:hover:bg-primary',
        secondary: 'bg-secondary text-[var(--foreground)] hover:bg-[var(--secondary-strong)] disabled:hover:bg-secondary',
        outline: 'border border-border bg-surface hover:bg-secondary disabled:hover:bg-surface',
        ghost: 'hover:bg-secondary disabled:hover:bg-transparent',
        destructive: 'bg-[var(--destructive)] text-surface hover:brightness-90 disabled:hover:brightness-100',
      },
      size: { default: 'h-10', sm: 'h-9 px-3', lg: 'h-12 px-6 text-base', icon: 'size-10 px-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(variants({ variant, size }), className)} {...props} />;
}

