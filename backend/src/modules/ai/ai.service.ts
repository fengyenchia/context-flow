import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service.js';

@Injectable()
export class AiService {
  constructor(private readonly credentials: AiCredentialsService) {}

  async chat(userId: string, prompt: string, concise = false) {
    const apiKey = this.credentials.decryptForUser(userId);
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: concise
          ? 'You are ContextFlow, a concise project thinking partner. Reply in the user language using Markdown. For ordinary conversation, answer directly in at most 5 short bullet points or about 400 Chinese characters. Do not repeat the context or add lengthy background unless asked.'
          : 'You are ContextFlow, a project thinking partner. Reply in the user language using Markdown. For ordinary divergent thinking, explore multiple creative but feasible directions instead of prematurely narrowing the answer.',
        ...(concise ? { maxOutputTokens: 512 } : {}),
      },
    });
    return { content: response.text ?? '', model: env.GEMINI_MODEL };
  }
}
