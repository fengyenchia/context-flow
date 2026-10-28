import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import { assertPreviewApi } from './src/lib/preview-deployment';

assertPreviewApi({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  webpack(config, { dev, webpack }) {
    // Only isolated development E2E substitutes the cloud transport. Production
    // always uses the official Liveblocks provider and server-issued ID tokens.
    if (dev && process.env.COLLABORATION_E2E === 'true') {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/collaboration-connection$/, (resource: { request: string }) => {
        resource.request = resolve(import.meta.dirname, 'test-fixtures/collaboration-connection.ts');
      }));
    }
    return config;
  },
};

export default nextConfig;
