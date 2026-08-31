import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppStore } from '../../db/app-store.js';

@Injectable()
export class AiCredentialsService {
  constructor(private readonly store: AppStore) {}

  list(userId: string) {
    const credential = this.store.credentials.get(userId);
    return credential
      ? [{ provider: 'gemini', keyHint: credential.keyHint, status: credential.status, lastValidatedAt: credential.lastValidatedAt, updatedAt: credential.updatedAt }]
      : [];
  }

  async save(userId: string, apiKey: string) {
    const normalized = apiKey.trim();
    await this.validate(normalized);
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    this.store.credentials.set(userId, {
      userId,
      encryptedApiKey: encrypted.toString('base64'),
      encryptionIv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyHint: `...${normalized.slice(-4)}`,
      status: 'active',
      lastValidatedAt: new Date(),
      updatedAt: new Date(),
    });
    return this.list(userId)[0];
  }

  remove(userId: string) {
    this.store.credentials.delete(userId);
  }

  decryptForUser(userId: string) {
    const credential = this.store.credentials.get(userId);
    if (!credential) throw new BadRequestException('Add your Gemini API key in account settings first');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(credential.encryptionIv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(credential.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(credential.encryptedApiKey, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async testStored(userId: string) {
    await this.validate(this.decryptForUser(userId));
    const credential = this.store.credentials.get(userId)!;
    credential.status = 'active';
    credential.lastValidatedAt = new Date();
    return { ok: true, validatedAt: credential.lastValidatedAt };
  }

  private async validate(apiKey: string) {
    try {
      const client = new GoogleGenAI({ apiKey });
      await client.models.generateContent({ model: env.GEMINI_MODEL, contents: 'Reply with OK only.' });
    } catch {
      throw new BadRequestException('Gemini API key could not be validated');
    }
  }

  private encryptionKey() {
    if (!env.USER_API_KEY_ENCRYPTION_KEY) {
      throw new ServiceUnavailableException('USER_API_KEY_ENCRYPTION_KEY is not configured');
    }
    const key = Buffer.from(env.USER_API_KEY_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException('USER_API_KEY_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }
    return key;
  }
}
