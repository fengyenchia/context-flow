import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DATA_MODE: z.enum(['memory', 'neon']).default('memory'),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ISSUER: z.string().default('context-flow-api'),
  JWT_AUDIENCE: z.string().default('context-flow-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  USER_API_KEY_ENCRYPTION_KEY: z.string().optional(),
  USER_API_KEY_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  INITIAL_ADMIN_USERNAME: z.string().optional(),
  INITIAL_ADMIN_PASSWORD_HASH: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  LIVEBLOCKS_SECRET_KEY: z.string().optional(),
  LIVEBLOCKS_WEBHOOK_SECRET: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
});

const parsed = schema.parse(process.env);
const devSecret = () => randomBytes(32).toString('hex');

if (parsed.NODE_ENV === 'production') {
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const) {
    if (!parsed[name]) throw new Error(`${name} is required in production`);
  }
}

export const env = {
  ...parsed,
  JWT_ACCESS_SECRET: parsed.JWT_ACCESS_SECRET ?? devSecret(),
  JWT_REFRESH_SECRET: parsed.JWT_REFRESH_SECRET ?? devSecret(),
};

export function configured(...keys: (keyof typeof env)[]) {
  return keys.every((key) => Boolean(env[key]));
}
