import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { privateMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = { ...privateMetadata, title: '帳號設定' };

export default function SettingsLayout({ children }: { children: React.ReactNode }) { return <AppShell>{children}</AppShell>; }

