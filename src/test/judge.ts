import {
  Output,
  generateText,
  jsonSchema,
  type LanguageModel,
  type UserContent,
} from 'ai';
import {
  AiUnavailableError,
  aiImagePart,
  aiTimeoutMs,
  createAiModel,
  DEFAULT_AI_MAX_RETRIES,
  DEFAULT_AI_MODEL,
} from '../ai.js';
import {JUDGE_SYSTEM_INSTRUCTION} from '../agent-prompts.js';
import type {JsonObject} from '../types.js';
import {VerifierError} from './failure.js';

/** Environment override set by the test runner's --judge-model option. */
export const JUDGE_MODEL_ENV = 'XRBLOCKS_JUDGE_MODEL';

export type JudgeEvidence =
  | {type: 'text'; label: string; text: string}
  | {type: 'data'; label: string; value: JsonObject}
  | {
      type: 'image';
      label: string;
      /** A base64 data URL or raw base64-encoded image. */
      image: string;
      /** The image MIME type. Defaults to the data URL type or image/png. */
      mimeType?: string;
    };

export interface JudgeOptions {
  prompt: string;
  evidence: readonly JudgeEvidence[];
  schema: Record<string, unknown>;
  model?: string;
  /** Retry limit for transient model errors. Defaults to 3. */
  maxRetries?: number;
  /** Maximum duration of each Google AI request. Defaults to 40 seconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

type JudgeDependencies = {
  createModel?: (model?: string) => LanguageModel;
  generateText?: typeof generateText;
};

export async function judge<T = unknown>(options: JudgeOptions): Promise<T> {
  return judgeWithSystemInstruction<T>(options, JUDGE_SYSTEM_INSTRUCTION);
}

/** @internal */
export async function judgeWithSystemInstruction<T = unknown>(
  options: JudgeOptions,
  systemInstruction: string,
  dependencies: JudgeDependencies = {}
): Promise<T> {
  try {
    const content = judgeContent(options);
    const runGenerateText = dependencies.generateText ?? generateText;
    const result = await runGenerateText({
      model: (dependencies.createModel ?? createAiModel)(
        resolveJudgeModel(options.model)
      ),
      instructions: systemInstruction,
      messages: [{role: 'user', content}],
      output: Output.object<T>({schema: jsonSchema<T>(options.schema)}),
      temperature: 0,
      maxRetries: options.maxRetries ?? DEFAULT_AI_MAX_RETRIES,
      timeout: aiTimeoutMs(options.timeoutMs),
      abortSignal: options.signal,
    });
    return result.output;
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
    model?.trim() || process.env[JUDGE_MODEL_ENV]?.trim() || DEFAULT_AI_MODEL
  );
}

function judgeContent(options: JudgeOptions): UserContent {
  if (!options.prompt.trim())
    throw new Error('Judge prompt must not be empty.');
  if (!isJsonObject(options.schema))
    throw new TypeError('Judge schema must be a JSON object.');
  if (!Array.isArray(options.evidence) || options.evidence.length === 0)
    throw new Error('Judge evidence must not be empty.');

  const parts: UserContent = [
    {type: 'text', text: `Evaluation request:\n${options.prompt}`},
  ];
  for (const item of options.evidence) {
    if (!item.label.trim())
      throw new Error('Judge evidence labels must not be empty.');
    if (item.type === 'text') {
      if (!item.text.trim())
        throw new Error(
          `Judge text evidence "${item.label}" must not be empty.`
        );
      parts.push({
        type: 'text',
        text: `Text evidence (${item.label}):\n${item.text}`,
      });
      continue;
    }
    if (item.type === 'data') {
      if (!isJsonObject(item.value))
        throw new TypeError(
          `Judge data evidence "${item.label}" must be a JSON object.`
        );
      parts.push({
        type: 'text',
        text: `Data evidence (${item.label}):\n${JSON.stringify(item.value)}`,
      });
      continue;
    }
    if (item.type === 'image') {
      parts.push(
        {type: 'text', text: `Image evidence (${item.label}):`},
        aiImagePart(item.image, item.mimeType)
      );
      continue;
    }
    throw new TypeError('Unknown judge evidence type.');
  }
  return parts;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
