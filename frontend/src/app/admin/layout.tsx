import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { privateMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = { ...privateMetadata, title: '帳號管理' };

export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AppShell>{children}</AppShell>; }

