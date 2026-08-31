import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env, configured } from '../../config/env.js';

@Injectable()
export class StorageService {
  async createUploadUrl(projectId: string, fileName: string, contentType: string) {
    if (!configured('R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY')) {
      throw new ServiceUnavailableException('Cloudflare R2 is not configured');
    }
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const storageKey = `projects/${projectId}/${randomUUID()}-${safeName}`;
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    });
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: storageKey, ContentType: contentType }), { expiresIn: 600 });
    return { uploadUrl, storageKey, expiresInSeconds: 600 };
  }
}
