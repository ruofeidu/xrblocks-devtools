import {raceWithSignal} from '../abort.js';
import {DEFAULT_AGENT_MODEL} from '../agent.js';

const JUDGE_SYSTEM_INSTRUCTION = `You are an impartial test judge.
Evaluate only the supplied evidence against the user's evaluation request.
Do not assume hidden facts or treat stated intent as proof.
Return exactly one JSON value that matches the supplied schema.`;

export type JudgeImageInput = {
  /** A base64 data URL or raw base64-encoded image. */
  image: string;
  /** The image MIME type. Defaults to the data URL type or image/png. */
  mimeType?: string;
};

export type JudgeInput = string | JudgeImageInput;

export interface JudgeOptions {
  prompt: string;
  input: JudgeInput;
  schema: Record<string, unknown>;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export type JudgeResult<T> =
  | {status: 'completed'; output: T}
  | {
      status: 'skipped';
      reason: 'missing-api-key' | 'missing-package';
    };

type GeminiSdk = typeof import('@google/genai');

type JudgeDependencies = {
  loadSdk?: () => Promise<GeminiSdk | undefined>;
};

export async function judge<T = unknown>(
  options: JudgeOptions
): Promise<JudgeResult<T>> {
  return judgeWithDependencies<T>(options);
}

/** @internal */
export async function judgeWithDependencies<T = unknown>(
  options: JudgeOptions,
  dependencies: JudgeDependencies = {}
): Promise<JudgeResult<T>> {
  const apiKey = options.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return {status: 'skipped', reason: 'missing-api-key'};

  const sdk = await (dependencies.loadSdk ?? loadGeminiSdk)();
  if (!sdk) return {status: 'skipped', reason: 'missing-package'};

  const request = buildJudgeRequest(options);
  const client = new sdk.GoogleGenAI({apiKey});
  const response = await raceWithSignal(
    client.models.generateContent(request),
    options.signal
  );
  return {status: 'completed', output: parseJudgeOutput<T>(response.text)};
}

async function loadGeminiSdk(): Promise<GeminiSdk | undefined> {
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

function buildJudgeRequest(options: JudgeOptions) {
  if (!options.prompt.trim())
    throw new Error('Judge prompt must not be empty.');
  if (!isJsonObject(options.schema))
    throw new TypeError('Judge schema must be a JSON object.');

  const parts: Array<
    {text: string} | {inlineData: {mimeType: string; data: string}}
  > = [{text: `Evaluation request:\n${options.prompt}`}];
  if (typeof options.input === 'string') {
    if (!options.input.trim())
      throw new Error('Judge input must not be empty.');
    parts.push({text: `Evidence:\n${options.input}`});
  } else {
    parts.push(
      {text: 'Evidence image:'},
      {inlineData: imageData(options.input)}
    );
  }

  return {
    model: options.model ?? DEFAULT_AGENT_MODEL,
    contents: [{role: 'user', parts}],
    config: {
      systemInstruction: JUDGE_SYSTEM_INSTRUCTION,
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: options.schema,
    },
  };
}

function imageData(input: JudgeImageInput) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(input.image);
  const mimeType = input.mimeType ?? match?.[1] ?? 'image/png';
  const data = match?.[2] ?? input.image;
  if (!mimeType.startsWith('image/'))
    throw new TypeError('Judge image MIME type must start with image/.');
  if (!data.trim()) throw new Error('Judge image must not be empty.');
  return {mimeType, data};
}

function parseJudgeOutput<T>(text: string | undefined): T {
  if (!text?.trim()) throw new Error('Gemini judge returned no JSON text.');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Gemini judge returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error}
    );
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
