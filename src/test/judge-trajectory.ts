import type {ActEvent, ActTrajectory} from '../agent.js';
import {
  buildTrajectoryJudgePrompt,
  TRAJECTORY_JUDGE_SYSTEM_INSTRUCTION,
} from '../agent-prompts.js';
import {VerifierError} from './failure.js';
import {
  judgeWithSystemInstruction,
  type JudgeEvidence,
  type JudgeOptions,
} from './judge.js';

const MAX_TRAJECTORY_IMAGES = 6;
const MAX_TIMELINE_EVENTS = 120;
const MAX_VALUE_DEPTH = 4;
const MAX_COLLECTION_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

const TRAJECTORY_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {type: 'boolean'},
    reason: {type: 'string'},
  },
  required: ['verdict', 'reason'],
  additionalProperties: false,
} as const;

export interface JudgeTrajectoryOptions {
  requirement: string;
  trajectory: ActTrajectory;
  evidence?: readonly JudgeEvidence[];
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TrajectoryVerdict {
  verdict: boolean;
  reason: string;
}

type JudgeFunction = <T = unknown>(options: JudgeOptions) => Promise<T>;

type JudgeTrajectoryDependencies = {
  judge?: JudgeFunction;
};

export function judgeTrajectory(
  options: JudgeTrajectoryOptions
): Promise<TrajectoryVerdict> {
  return judgeTrajectoryWithDependencies(options);
}

/** @internal */
export async function judgeTrajectoryWithDependencies(
  options: JudgeTrajectoryOptions,
  dependencies: JudgeTrajectoryDependencies = {}
): Promise<TrajectoryVerdict> {
  if (!options.requirement.trim())
    throw new VerifierError('Trajectory requirement must not be empty.');
  if (!Array.isArray(options.trajectory.events))
    throw new VerifierError('Trajectory events must be an array.');

  const evidence: JudgeEvidence[] = [
    {
      type: 'text',
      label: 'Agent trajectory',
      text: summarizeTrajectory(options.trajectory.events),
    },
    ...trajectoryImageEvidence(options.trajectory.events),
    ...(options.evidence ?? []),
  ];

  try {
    const request: JudgeOptions = {
      prompt: buildTrajectoryJudgePrompt(
        options.requirement,
        options.trajectory.instruction
      ),
      evidence,
      schema: TRAJECTORY_VERDICT_SCHEMA,
      model: options.model,
      maxRetries: options.maxRetries,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    };
    const result = dependencies.judge
      ? await dependencies.judge<unknown>(request)
      : await judgeWithSystemInstruction<unknown>(
          request,
          TRAJECTORY_JUDGE_SYSTEM_INSTRUCTION
        );
    if (!isTrajectoryVerdict(result))
      throw new VerifierError('Trajectory judge returned an invalid verdict.');
    return {verdict: result.verdict, reason: result.reason};
  } catch (error) {
    if (error instanceof VerifierError) throw error;
    throw new VerifierError('Trajectory judge request failed.', {cause: error});
  }
}

function summarizeTrajectory(events: readonly ActEvent[]) {
  const lines = events
    .filter((event) => event.type !== 'observation')
    .map(summarizeEvent);
  const bounded = boundTimeline(lines);
  return bounded.length === 0
    ? 'No action, error, invalid-response, or exit events were recorded.'
    : bounded.join('\n');
}

function summarizeEvent(event: ActEvent) {
  const prefix = `Turn ${event.turn} at ${event.timestamp_ms} ms`;
  const call = asObject(event.tool_call);
  const name = typeof call?.name === 'string' ? call.name : 'unknown';
  const args = call?.args;
  if (event.type === 'action')
    return `${prefix}: action ${name} ${boundedJson(args)}`;
  if (event.type === 'action_error')
    return `${prefix}: action_error ${name} ${boundedJson(args)}; ${errorSummary(event)}`;
  if (event.type === 'invalid_response')
    return `${prefix}: invalid_response; ${errorSummary(event)}`;
  if (event.type === 'model_error')
    return `${prefix}: model_error; ${errorSummary(event)}`;
  if (event.type === 'exit')
    return `${prefix}: exit ${boundedJson(event.result)}`;
  return `${prefix}: ${event.type}`;
}

function errorSummary(event: ActEvent) {
  const result = asObject(event.result);
  if (typeof result?.error === 'string') return result.error;
  if (typeof result?.summary === 'string') return result.summary;
  return boundedJson(event.result);
}

function boundTimeline(lines: readonly string[]) {
  if (lines.length <= MAX_TIMELINE_EVENTS) return [...lines];
  const startCount = Math.ceil(MAX_TIMELINE_EVENTS / 2);
  const endCount = Math.floor(MAX_TIMELINE_EVENTS / 2);
  return [
    ...lines.slice(0, startCount),
    `[${lines.length - MAX_TIMELINE_EVENTS} timeline events omitted]`,
    ...lines.slice(-endCount),
  ];
}

function trajectoryImageEvidence(events: readonly ActEvent[]): JudgeEvidence[] {
  const candidates: Array<{
    turn: number;
    label: string;
    image: string;
    mimeType?: string;
  }> = [];
  for (const event of events) {
    if (event.type !== 'observation') continue;
    const result = asObject(event.result);
    if (!Array.isArray(result?.images)) continue;
    for (const value of result.images) {
      const image = asObject(value);
      if (
        typeof image?.dataUrl !== 'string' ||
        image.dataUrl.trim().length === 0
      )
        continue;
      candidates.push({
        turn: event.turn,
        label:
          typeof image.label === 'string' && image.label.trim()
            ? image.label
            : 'observation',
        image: image.dataUrl,
        ...(typeof image.mimeType === 'string'
          ? {mimeType: image.mimeType}
          : {}),
      });
    }
  }

  return sampleEvenly(candidates, MAX_TRAJECTORY_IMAGES).map((image) => ({
    type: 'image',
    label: `Trajectory turn ${image.turn}: ${image.label}`,
    image: image.image,
    ...(image.mimeType ? {mimeType: image.mimeType} : {}),
  }));
}

function sampleEvenly<T>(values: readonly T[], limit: number): T[] {
  if (values.length <= limit) return [...values];
  return Array.from({length: limit}, (_, index) => {
    const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
    return values[sourceIndex]!;
  });
}

function boundedJson(value: unknown) {
  return JSON.stringify(boundValue(value, 0));
}

function boundValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    if (/^data:image\//i.test(value)) return '[image data omitted]';
    return value.length <= MAX_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (depth >= MAX_VALUE_DEPTH) return '[nested value omitted]';
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => boundValue(item, depth + 1));
    if (value.length > MAX_COLLECTION_ITEMS)
      items.push(`[${value.length - MAX_COLLECTION_ITEMS} items omitted]`);
    return items;
  }
  const object = asObject(value);
  if (!object) return String(value);
  const entries = Object.entries(object).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const result: Record<string, unknown> = {};
  for (const [key, item] of entries.slice(0, MAX_COLLECTION_ITEMS))
    result[key] = boundValue(item, depth + 1);
  if (entries.length > MAX_COLLECTION_ITEMS)
    result['...'] =
      `${entries.length - MAX_COLLECTION_ITEMS} properties omitted`;
  return result;
}

function isTrajectoryVerdict(value: unknown): value is TrajectoryVerdict {
  const object = asObject(value);
  return (
    typeof object?.verdict === 'boolean' &&
    typeof object.reason === 'string' &&
    object.reason.trim().length > 0
  );
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
