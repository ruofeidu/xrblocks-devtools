import {google} from '@ai-sdk/google';
import type {LanguageModel} from 'ai';

export const DEFAULT_AI_MODEL = 'gemini-3.6-flash';
export const DEFAULT_AI_MAX_RETRIES = 3;

const DEFAULT_AI_TIMEOUT_MS = 40_000;
const GOOGLE_AI_API_KEY_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';
const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';

export class AiUnavailableError extends Error {
  constructor() {
    super(`AI requires ${GOOGLE_AI_API_KEY_ENV}.`);
    this.name = 'AiUnavailableError';
  }
}

export function createAiModel(model?: string): LanguageModel {
  mapGoogleAiApiKey();
  return google(model?.trim() || DEFAULT_AI_MODEL);
}

export function aiTimeoutMs(timeoutMs = DEFAULT_AI_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('AI timeoutMs must be a positive finite number.');
  return timeoutMs;
}

export function aiImagePart(image: string, mimeType?: string) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(image);
  const mediaType = mimeType ?? match?.[1] ?? 'image/png';
  const data = match?.[2] ?? image;
  if (!mediaType.startsWith('image/'))
    throw new TypeError('AI image MIME type must start with image/.');
  if (!data.trim()) throw new Error('AI image must not be empty.');
  return {
    type: 'file' as const,
    mediaType,
    data: {type: 'data' as const, data},
  };
}

function mapGoogleAiApiKey() {
  if (process.env[GOOGLE_AI_API_KEY_ENV]?.trim()) return;
  const compatibilityKey = process.env[GEMINI_API_KEY_ENV]?.trim();
  if (!compatibilityKey) throw new AiUnavailableError();
  process.env[GOOGLE_AI_API_KEY_ENV] = compatibilityKey;
}
