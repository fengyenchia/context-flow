import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = privateMetadata;

export default function AuthPagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
