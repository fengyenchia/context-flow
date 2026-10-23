import type { Metadata } from 'next';

export const site = {
  name: 'ContextFlow',
  url: 'https://context-flow.fengyenchia.com',
  title: 'ContextFlow｜專案協作畫布',
  description: '用節點畫布整理資料、想法與決策，支援個人與共享工作區、AI 輔助整理，以及 PDF、PNG 匯出。',
  image: '/brand/og-image.png',
  imageAlt: 'ContextFlow 專案協作畫布：串起資料、想法與決策',
} as const;

export const siteMetadata = {
  metadataBase: new URL(site.url),
  applicationName: site.name,
  title: { default: site.title, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    url: site.url,
    siteName: site.name,
    title: site.title,
    description: site.description,
    images: [{ url: site.image, width: 1200, height: 630, type: 'image/png', alt: site.imageAlt }],
  },
  twitter: {
    card: 'summary_large_image',
    title: site.title,
    description: site.description,
    images: [{ url: site.image, alt: site.imageAlt }],
  },
  icons: {
    icon: { url: '/brand/context-flow-logo.png', type: 'image/png' },
    apple: '/brand/context-flow-logo.png',
  },
  robots: { index: true, follow: true },
} satisfies Metadata;

export const privateMetadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
} satisfies Metadata;
