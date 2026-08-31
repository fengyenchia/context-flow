import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service.js';

@Injectable()
export class AiService {
  constructor(private readonly credentials: AiCredentialsService) {}

  async chat(userId: string, prompt: string) {
    const apiKey = this.credentials.decryptForUser(userId);
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { systemInstruction: 'You are ContextFlow, a concise project thinking partner. Reply in the user language using Markdown.' },
    });
    return { content: response.text ?? '', model: env.GEMINI_MODEL };
  }
}
