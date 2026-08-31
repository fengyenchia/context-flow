import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export const db = env.DATABASE_URL
  ? drizzle(neon(env.DATABASE_URL), { schema })
  : null;
