import {google} from '@ai-sdk/google';
import {
  Output,
  generateText,
  jsonSchema,
  type LanguageModel,
  type ToolSet,
  type UserContent,
} from 'ai';
import type {JsonObject} from './types.js';

export const DEFAULT_AI_MODEL = 'gemini-3.7-flash';

const DEFAULT_AI_TIMEOUT_MS = 40_000;
const GOOGLE_AI_API_KEY_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';
const GOOGLE_GEMINI_KEY_ENV = 'GOOGLE_GEMINI_KEY';

export type AiPart =
  {text: string} | {image: {data: string; mimeType?: string}};

export type AiToolDeclaration = {
  name: string;
  description?: string;
  parameters: JsonObject;
};

export type AiToolCall = {name: string; args: JsonObject};

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

type AiRequest = {
  operation: string;
  model?: string;
  systemInstruction: string;
  parts: AiPart[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

type AiDependencies = {
  createModel?: (model: string) => LanguageModel;
};

export class AiUnavailableError extends Error {
  constructor() {
    super(`AI requires GEMINI_API_KEY.`);
    this.name = 'AiUnavailableError';
  }
}

export class Ai {
  /** @internal */
  constructor(private readonly createModel: (model: string) => LanguageModel) {}

  async generateJson<T>(
    request: AiRequest & {schema: Record<string, unknown>}
  ): Promise<T> {
    const result = await generateText({
      model: this.createModel(resolveModel(request.model)),
      instructions: request.systemInstruction,
      messages: [{role: 'user', content: normalizeParts(request.parts)}],
      output: Output.object<T>({schema: jsonSchema<T>(request.schema)}),
      temperature: 0,
      maxRetries: 1,
      timeout: aiTimeoutMs(request.timeoutMs),
      abortSignal: request.signal,
    });
    return result.output;
  }

  async generateTools(
    request: AiRequest & {tools: AiToolDeclaration[]}
  ): Promise<{toolCalls: AiToolCall[]; usage: AiUsage}> {
    const result = await generateText({
      model: this.createModel(resolveModel(request.model)),
      instructions: request.systemInstruction,
      messages: [{role: 'user', content: normalizeParts(request.parts)}],
      tools: aiTools(request.tools),
      toolChoice: 'required',
      maxRetries: 1,
      timeout: aiTimeoutMs(request.timeoutMs),
      abortSignal: request.signal,
    });
    return {
      toolCalls: result.toolCalls.map((call) => ({
        name: call.toolName,
        args: toJsonObject(call.input),
      })),
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    };
  }
}

export async function createAi(): Promise<Ai> {
  return createAiWithDependencies();
}

/** @internal */
export async function createAiWithDependencies(
  dependencies: AiDependencies = {}
): Promise<Ai> {
  if (dependencies.createModel) return new Ai(dependencies.createModel);
  mapGoogleAiApiKey();
  return new Ai((model) => google(model));
}

function mapGoogleAiApiKey() {
  if (process.env[GOOGLE_AI_API_KEY_ENV]?.trim()) return;
  const compatibilityKey = process.env[GOOGLE_GEMINI_KEY_ENV]?.trim();
  if (!compatibilityKey) throw new AiUnavailableError();
  process.env[GOOGLE_AI_API_KEY_ENV] = compatibilityKey;
}

function aiTools(declarations: AiToolDeclaration[]): ToolSet {
  const tools: ToolSet = {};
  for (const declaration of declarations) {
    tools[declaration.name] = {
      description: declaration.description,
      inputSchema: jsonSchema<JsonObject>(declaration.parameters),
      outputSchema: jsonSchema<JsonObject>({
        type: 'object',
        additionalProperties: true,
      }),
    };
  }
  return tools;
}

function normalizeParts(parts: AiPart[]): UserContent {
  return parts.map((part) => {
    if ('text' in part) return {type: 'text' as const, text: part.text};
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(part.image.data);
    const mediaType = part.image.mimeType ?? match?.[1] ?? 'image/png';
    const data = match?.[2] ?? part.image.data;
    if (!mediaType.startsWith('image/'))
      throw new TypeError('AI image MIME type must start with image/.');
    if (!data.trim()) throw new Error('AI image must not be empty.');
    return {
      type: 'file' as const,
      mediaType,
      data: {type: 'data' as const, data},
    };
  });
}

function aiTimeoutMs(timeoutMs = DEFAULT_AI_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('AI timeoutMs must be a positive finite number.');
  return timeoutMs;
}

function resolveModel(model?: string) {
  return model?.trim() || DEFAULT_AI_MODEL;
}

function toJsonObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('AI tool input must be a JSON object.');
  }
  return value as JsonObject;
}
