import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Decorative mark: the adjacent ContextFlow wordmark supplies the link name. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/context-flow-logo.png"
      width={40}
      height={40}
      alt=""
      draggable={false}
      className={cn('size-10 shrink-0 rounded-primary object-contain', className)}
    />
  );
}
