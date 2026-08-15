import type {GoogleGenAI} from '@google/genai';
import {raceWithSignal} from './abort.js';
import type {JsonObject} from './types.js';

export const DEFAULT_AI_MODEL = 'gemini-3.6-flash';

const DEFAULT_AI_TIMEOUT_MS = 40_000;
const AI_ATTEMPTS = 2;
const RETRY_DELAY_MIN_MS = 250;
const RETRY_DELAY_JITTER_MS = 250;

export type AiPart =
  {text: string} | {image: {data: string; mimeType?: string}};

export type AiToolDeclaration = {
  name: string;
  description?: string;
  parameters: JsonObject;
};

export type AiToolCall = {name: string; args: JsonObject};

type AiRequest = {
  operation: string;
  model?: string;
  systemInstruction: string;
  parts: AiPart[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

type AiDependencies = {
  loadSdk?: () => Promise<typeof import('@google/genai') | undefined>;
};

export type AiUnavailableReason = 'missing-api-key' | 'missing-package';

export class AiUnavailableError extends Error {
  constructor(readonly reason: AiUnavailableReason) {
    super(
      reason === 'missing-api-key'
        ? 'AI requires GEMINI_API_KEY.'
        : 'AI requires @google/genai. Install it with `npm install --save-dev @google/genai`.'
    );
    this.name = 'AiUnavailableError';
  }
}

export class Ai {
  /** @internal */
  constructor(
    private readonly client: GoogleGenAI,
    private readonly sdk: typeof import('@google/genai')
  ) {}

  generateJson<T>(
    request: AiRequest & {schema: Record<string, unknown>}
  ): Promise<T> {
    return this.generate(request, {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: request.schema,
    }).then((response) => parseJson<T>(response.text));
  }

  generateTools(
    request: AiRequest & {tools: AiToolDeclaration[]}
  ): Promise<AiToolCall[]> {
    const names = request.tools.map(({name}) => name);
    return this.generate(request, {
      toolConfig: {
        functionCallingConfig: {
          mode: this.sdk.FunctionCallingConfigMode.ANY,
          allowedFunctionNames: names,
        },
      },
      tools: [{functionDeclarations: request.tools}],
    }).then(toolCalls);
  }

  private async generate(
    request: AiRequest,
    outputConfig: Record<string, unknown>
  ) {
    const timeoutMs = aiTimeoutMs(request.timeoutMs);
    const model = request.model?.trim() || DEFAULT_AI_MODEL;
    for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt++) {
      request.signal?.throwIfAborted();
      const startedAt = Date.now();
      console.info(
        `[xrblocks-devtools] AI ${request.operation} request started ` +
          `(model=${model}, attempt=${attempt}/${AI_ATTEMPTS}).`
      );
      try {
        const response = await this.generateAttempt(
          request,
          model,
          timeoutMs,
          outputConfig
        );
        console.info(
          `[xrblocks-devtools] AI ${request.operation} request completed ` +
            `(model=${model}, attempt=${attempt}/${AI_ATTEMPTS}, ` +
            `durationMs=${Date.now() - startedAt}).`
        );
        return response;
      } catch (error) {
        const retry =
          attempt < AI_ATTEMPTS &&
          !request.signal?.aborted &&
          isRetryableAiError(error);
        if (!retry) {
          console.warn(
            `[xrblocks-devtools] AI ${request.operation} request failed ` +
              `(model=${model}, attempt=${attempt}/${AI_ATTEMPTS}, ` +
              `durationMs=${Date.now() - startedAt}, reason=${retryReason(error)}).`
          );
          throw error;
        }
        const retryDelayMs =
          RETRY_DELAY_MIN_MS +
          Math.floor(Math.random() * (RETRY_DELAY_JITTER_MS + 1));
        console.warn(
          `[xrblocks-devtools] AI ${request.operation} request failed; retrying once ` +
            `(model=${model}, attempt=${attempt}/${AI_ATTEMPTS}, ` +
            `durationMs=${Date.now() - startedAt}, ` +
            `reason=${retryReason(error)}, delayMs=${retryDelayMs}).`
        );
        await delay(retryDelayMs, request.signal);
      }
    }
    throw new Error(`AI ${request.operation} request failed without a result.`);
  }

  private async generateAttempt(
    request: AiRequest,
    model: string,
    timeoutMs: number,
    outputConfig: Record<string, unknown>
  ) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', onAbort, {once: true});
    const timer = setTimeout(
      () => controller.abort(new AiTimeoutError(request.operation, timeoutMs)),
      timeoutMs
    );
    try {
      const response = this.client.models.generateContent({
        model,
        contents: [{role: 'user', parts: normalizeParts(request.parts)}],
        config: {
          systemInstruction: request.systemInstruction,
          ...outputConfig,
          abortSignal: controller.signal,
        },
      } as never);
      return await raceWithSignal(response, controller.signal);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }
}

export async function createAi(): Promise<Ai> {
  return createAiWithDependencies();
}

/** @internal */
export async function createAiWithDependencies(
  dependencies: AiDependencies = {}
): Promise<Ai> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiUnavailableError('missing-api-key');
  const sdk = await (dependencies.loadSdk ?? loadGoogleAiSdk)();
  if (!sdk) throw new AiUnavailableError('missing-package');
  return new Ai(new sdk.GoogleGenAI({apiKey}), sdk);
}

class AiTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`AI ${operation} request timed out after ${timeoutMs} ms.`);
    this.name = 'AiTimeoutError';
  }
}

async function loadGoogleAiSdk() {
  try {
    return await import('@google/genai');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ERR_MODULE_NOT_FOUND' ||
        error.code === 'MODULE_NOT_FOUND') &&
      error.message.includes('@google/genai')
    ) {
      return undefined;
    }
    throw error;
  }
}

function aiTimeoutMs(timeoutMs = DEFAULT_AI_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('AI timeoutMs must be a positive finite number.');
  return timeoutMs;
}

function normalizeParts(parts: AiPart[]) {
  return parts.map((part) => {
    if ('text' in part) return part;
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(part.image.data);
    const mimeType = part.image.mimeType ?? match?.[1] ?? 'image/png';
    const data = match?.[2] ?? part.image.data;
    if (!mimeType.startsWith('image/'))
      throw new TypeError('AI image MIME type must start with image/.');
    if (!data.trim()) throw new Error('AI image must not be empty.');
    return {inlineData: {mimeType, data}};
  });
}

function parseJson<T>(text: string | undefined): T {
  if (!text?.trim()) throw new Error('AI returned no JSON text.');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `AI returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error}
    );
  }
}

function toolCalls(response: unknown): AiToolCall[] {
  const candidate = response as {
    functionCalls?: Array<{name?: string; args?: JsonObject}>;
  };
  return (candidate.functionCalls ?? [])
    .filter(
      (call): call is {name: string; args?: JsonObject} =>
        typeof call.name === 'string'
    )
    .map((call) => ({name: call.name, args: call.args ?? {}}));
}

function isRetryableAiError(error: unknown) {
  if (error instanceof AiTimeoutError) return true;
  const status = aiErrorStatus(error);
  return (
    status === 429 || (status !== undefined && status >= 500 && status < 600)
  );
}

function aiErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    httpStatusCode?: unknown;
    code?: unknown;
    response?: {status?: unknown};
  };
  for (const value of [
    candidate.status,
    candidate.statusCode,
    candidate.httpStatusCode,
    candidate.code,
    candidate.response?.status,
  ]) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d{3}$/.test(value))
      return Number(value);
  }
  return undefined;
}

function retryReason(error: unknown) {
  if (error instanceof AiTimeoutError) return 'timeout';
  const status = aiErrorStatus(error);
  return status === undefined ? 'transient-error' : `http-${status}`;
}

async function delay(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await raceWithSignal(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      }),
      signal
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
