import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { siteMetadata } from '@/lib/site-metadata';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className={`${geist.variable} ${mono.variable} min-h-screen font-[var(--font-geist-sans)] antialiased`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-primary focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg">跳至主要內容</a>
        <ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider>
      </body>
    </html>
  );
}

