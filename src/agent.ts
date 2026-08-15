import type {XRBlocksSession} from './session/index.js';
import type {JsonObject} from './types.js';
import {raceWithSignal} from './abort.js';
import {
  createAi,
  DEFAULT_AI_MODEL,
  type Ai,
  type AiPart,
  type AiToolDeclaration,
} from './ai.js';
import {DEFAULT_SESSION_AGENT_PROMPT} from './session-agent-prompt.js';
import {
  agentActionDeclarations,
  agentActionPrompt,
  executeAgentAction,
} from './session/actions.js';
import {
  agentObservationPrompt,
  captureAgentObservation,
  normalizeAgentObservations,
  type AgentObservationKind,
  type AgentObservationSelection,
} from './agent-observations.js';

export type ToolCall = {name: string; args: JsonObject};
export type AgentModelRequest = {
  task: string;
  model: string;
  turn: number;
  maxTurns: number;
  latestObservation: JsonObject;
  observationKinds: AgentObservationKind[];
  events: ActEvent[];
  signal?: AbortSignal;
};
export type AgentModelResponse = {toolCalls: ToolCall[]; raw?: unknown};
export type AgentModelClient = {
  generate(request: AgentModelRequest): Promise<AgentModelResponse>;
};

export type ActEvent = JsonObject & {
  timestamp_ms: number;
  turn: number;
  type: 'observation' | 'action' | 'action_error' | 'exit' | 'invalid_response';
};

export type ActOptions = {
  context?: AgentObservationSelection;
  data?: JsonObject;
  maxTurns?: number;
  model?: string;
  signal?: AbortSignal;
  onEvent?: (event: ActEvent) => void;
};

export type ActExitPayload = {
  message: string;
  data?: JsonObject;
};

type SessionActDependencies = {
  captureObservation?: typeof captureAgentObservation;
  executeAction?: typeof executeAgentAction;
  modelClient?: AgentModelClient;
  clock?: () => number;
};

export async function runSessionAct(
  session: XRBlocksSession,
  instruction: string,
  options: ActOptions = {},
  dependencies: SessionActDependencies = {}
): Promise<ActExitPayload> {
  if (!instruction.trim())
    throw new Error('Agent instruction must not be empty.');
  const signal = options.signal;
  const model = options.model ?? DEFAULT_AI_MODEL;
  const maxTurns = options.maxTurns ?? 30;
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) {
    throw new Error('maxTurns must be a positive integer.');
  }
  const observationKinds = normalizeAgentObservations(options.context ?? 'all');
  const modelClient =
    dependencies.modelClient ?? (await AgentAiModelClient.create());
  const captureObservation =
    dependencies.captureObservation ?? captureAgentObservation;
  const executeAction = dependencies.executeAction ?? executeAgentAction;
  const clock = dependencies.clock ?? (() => performance.now());
  const startedAt = clock();
  const events: ActEvent[] = [];
  const record = (event: ActEvent) => {
    events.push(event);
    options.onEvent?.(event);
  };
  let latestObservation = await captureObservation({
    session,
    timestampMs: elapsedMs(clock, startedAt),
    kinds: observationKinds,
  });
  if (options.data)
    latestObservation = {...latestObservation, data: options.data};
  record({
    timestamp_ms: Number(latestObservation.timestamp_ms ?? 0),
    turn: 0,
    type: 'observation',
    result: latestObservation,
  });

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    signal?.throwIfAborted();
    const response = await raceWithSignal(
      modelClient.generate({
        task: instruction,
        model,
        turn,
        maxTurns,
        latestObservation,
        observationKinds,
        events,
        signal,
      }),
      signal
    );
    if (response.toolCalls.length !== 1) {
      const summary = `Agent model must return exactly one tool call; received ${response.toolCalls.length}.`;
      record({
        timestamp_ms: elapsedMs(clock, startedAt),
        turn,
        type: 'invalid_response',
        result: {summary},
      });
      throw new Error(summary);
    }
    const call = response.toolCalls[0]!;
    if (call.name === 'exit') {
      const message = String(call.args.message ?? 'Agent exited.');
      const data = isJsonObject(call.args.data) ? call.args.data : undefined;
      const payload = {message, ...(data ? {data} : {})};
      record({
        timestamp_ms: elapsedMs(clock, startedAt),
        turn,
        type: 'exit',
        tool_call: call,
        result: payload,
      });
      return payload;
    }
    try {
      const toolResult = await executeAction(session, call.name, call.args);
      record({
        timestamp_ms: elapsedMs(clock, startedAt),
        turn,
        type: 'action',
        tool_call: call,
        tool_result: toJsonObject(toolResult),
      });
    } catch (error) {
      signal?.throwIfAborted();
      record({
        timestamp_ms: elapsedMs(clock, startedAt),
        turn,
        type: 'action_error',
        tool_call: call,
        result: {error: error instanceof Error ? error.message : String(error)},
      });
    }
    latestObservation = await captureObservation({
      session,
      timestampMs: elapsedMs(clock, startedAt),
      kinds: observationKinds,
    });
    if (options.data)
      latestObservation = {...latestObservation, data: options.data};
    record({
      timestamp_ms: Number(latestObservation.timestamp_ms ?? 0),
      turn,
      type: 'observation',
      result: latestObservation,
    });
  }
  throw new Error(`Stopped after ${maxTurns} turns without exit.`);
}

class AgentAiModelClient implements AgentModelClient {
  private constructor(private readonly ai: Ai) {}

  static async create() {
    return new AgentAiModelClient(await createAi());
  }

  async generate(request: AgentModelRequest): Promise<AgentModelResponse> {
    const parts: AiPart[] = [
      {
        text: `Task: ${request.task}\nTurn ${request.turn} of ${request.maxTurns}.\nRespond with exactly one declared tool call.`,
      },
      {text: observationText(request.latestObservation)},
      {text: recentEventsText(request.events)},
    ];
    for (const image of observationImages(request.latestObservation)) {
      parts.push({text: `${image.label}:`});
      parts.push({
        image: {mimeType: 'image/png', data: image.dataUrl},
      });
    }
    const toolCalls = await this.ai.generateTools({
      operation: 'agent',
      model: request.model,
      systemInstruction: buildAgentSystemInstruction(request.observationKinds),
      parts,
      tools: agentToolDeclarations(),
      signal: request.signal,
    });
    return {toolCalls};
  }
}

export function buildAgentSystemInstruction(
  observationKinds: readonly AgentObservationKind[]
) {
  return [
    DEFAULT_SESSION_AGENT_PROMPT,
    agentActionPrompt(),
    'Selected observations:',
    agentObservationPrompt(observationKinds),
  ]
    .filter(Boolean)
    .join('\n');
}

export function observationText(observation: JsonObject) {
  const {images: _images, ...state} = observation;
  return 'Latest state:\n' + JSON.stringify(state);
}

function observationImages(observation: JsonObject) {
  if (!Array.isArray(observation.images)) return [];
  return observation.images.filter(
    (item): item is {label: string; dataUrl: string} =>
      isJsonObject(item) &&
      typeof item.label === 'string' &&
      typeof item.dataUrl === 'string'
  );
}

function recentEventsText(events: ActEvent[], limit = 8) {
  return (
    'Recent tool history:\n' +
    JSON.stringify(
      events.slice(-limit).map(({result, ...event}) => ({
        ...event,
        ...(event.type === 'action_error' || event.type === 'invalid_response'
          ? {result}
          : {}),
      }))
    )
  );
}

function agentToolDeclarations(): AiToolDeclaration[] {
  return [
    ...agentActionDeclarations(),
    {
      name: 'exit',
      description:
        'Stop the agent and return a message with optional structured data.',
      parameters: {
        type: 'OBJECT',
        properties: {
          message: {
            type: 'STRING',
            description: 'A concise final message for the caller.',
          },
          data: {
            type: 'OBJECT',
            description: 'Structured JSON data requested by the caller.',
          },
        },
        required: ['message'],
      },
    },
  ];
}

function elapsedMs(clock: () => number, start: number) {
  return Math.max(0, Math.floor(clock() - start));
}

function toJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {value};
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
