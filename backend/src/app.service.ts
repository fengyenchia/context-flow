import { Injectable } from '@nestjs/common';
import { configured, env } from './config/env.js';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'context-flow-api',
      dataMode: env.DATA_MODE,
      integrations: {
        neon: configured('DATABASE_URL'),
        r2: configured('R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'),
        liveblocks: configured('LIVEBLOCKS_SECRET_KEY'),
        inngest: configured('INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'),
        apiKeyEncryption: configured('USER_API_KEY_ENCRYPTION_KEY'),
      },
    };
  }
}
