import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['server/**/*.spec.ts'],
    env: { DATABASE_URL: '', INITIAL_ADMIN_USERNAME: '', INITIAL_ADMIN_PASSWORD_HASH: '' },
  },
});
