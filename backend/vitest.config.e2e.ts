import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
      'next/server': require.resolve('next/server.js'),
    },
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    fileParallelism: false,
    root: import.meta.dirname,
    include: ['server/**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: '',
      R2_ACCOUNT_ID: '',
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
      INITIAL_ADMIN_USERNAME: '',
      INITIAL_ADMIN_PASSWORD_HASH: '',
      COLLABORATION_ENABLED: 'false',
      LIVEBLOCKS_SECRET_KEY: '',
      LIVEBLOCKS_WEBHOOK_SECRET: '',
      CANVAS_BACKUP_ENABLED: 'false',
      CANVAS_BACKUP_BUCKET_NAME: '',
      PROJECT_INVITES_ENABLED: 'false',
      CANVAS_BACKUP_RETENTION_ENABLED: 'false',
      INNGEST_EVENT_KEY: '',
      INNGEST_SIGNING_KEY: '',
    },
  },
});
