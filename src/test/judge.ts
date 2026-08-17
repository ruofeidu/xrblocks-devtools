import {
  AiUnavailableError,
  createAi,
  DEFAULT_AI_MODEL,
  type Ai,
  type AiPart,
} from '../ai.js';
import {VerifierError} from './failure.js';

const JUDGE_SYSTEM_INSTRUCTION = `You are an impartial test judge.
Evaluate only the supplied evidence against the user's evaluation request.
Do not assume hidden facts or treat stated intent as proof.
Return exactly one JSON value that matches the supplied schema.`;

/** Environment override set by the test runner's --judge-model option. */
export const JUDGE_MODEL_ENV = 'XRBLOCKS_JUDGE_MODEL';

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
  /** Maximum duration of each Google AI request. Defaults to 40 seconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

type JudgeDependencies = {
  createAi?: () => Promise<Ai>;
};

export async function judge<T = unknown>(options: JudgeOptions): Promise<T> {
  return judgeWithDependencies<T>(options);
}

/** @internal */
export async function judgeWithDependencies<T = unknown>(
  options: JudgeOptions,
  dependencies: JudgeDependencies = {}
): Promise<T> {
  try {
    const ai = await (dependencies.createAi ?? createAi)();
    return await ai.generateJson<T>({
      operation: 'judge',
      model: resolveJudgeModel(options.model),
      systemInstruction: JUDGE_SYSTEM_INSTRUCTION,
      parts: judgeParts(options),
      schema: options.schema,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof VerifierError) throw error;
    const message =
      error instanceof AiUnavailableError
        ? error.message
        : 'Judge request failed.';
    throw new VerifierError(message, {cause: error});
  }
}

/** @internal */
export function resolveJudgeModel(model?: string): string {
  return (
    model?.trim() ||
    process.env[JUDGE_MODEL_ENV]?.trim() ||
    process.env.MODEL_NAME?.trim() ||
    DEFAULT_AI_MODEL
  );
}

function judgeParts(options: JudgeOptions): AiPart[] {
  if (!options.prompt.trim())
    throw new Error('Judge prompt must not be empty.');
  if (!isJsonObject(options.schema))
    throw new TypeError('Judge schema must be a JSON object.');

  const parts: AiPart[] = [{text: `Evaluation request:\n${options.prompt}`}];
  if (typeof options.input === 'string') {
    if (!options.input.trim())
      throw new Error('Judge input must not be empty.');
    parts.push({text: `Evidence:\n${options.input}`});
  } else {
    parts.push(
      {text: 'Evidence image:'},
      {
        image: {
          data: options.input.image,
          mimeType: options.input.mimeType,
        },
      }
    );
  }
  return parts;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
