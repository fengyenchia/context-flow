import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { privateMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = { ...privateMetadata, title: '工作區' };

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) { return <AppShell>{children}</AppShell>; }

