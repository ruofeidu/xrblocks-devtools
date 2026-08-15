import type {GoogleGenAI} from '@google/genai';
import type {XRBlocksSession} from './session/index.js';
import type {JsonObject} from './types.js';
import {raceWithSignal} from './abort.js';
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

export const DEFAULT_AGENT_MODEL = 'gemini-3.6-flash';

export type ToolCall = {name: string; args: JsonObject};
export type AgentModelRequest = {
  task: string;
  model: string;
  turn: number;
  maxTurns: number;
  latestObservation: JsonObject;
  observationKinds: AgentObservationKind[];
  events: ActEvent[];
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
  apiKey?: string;
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
  const model = options.model ?? DEFAULT_AGENT_MODEL;
  const maxTurns = options.maxTurns ?? 30;
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) {
    throw new Error('maxTurns must be a positive integer.');
  }
  const observationKinds = normalizeAgentObservations(options.context ?? 'all');
  const modelClient =
    dependencies.modelClient ??
    (await GeminiAgentModelClient.create({apiKey: options.apiKey}));
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

export class GeminiAgentModelClient implements AgentModelClient {
  private constructor(
    private readonly client: GoogleGenAI,
    private readonly sdk: typeof import('@google/genai')
  ) {}

  static async create(options: {apiKey?: string} = {}) {
    const apiKey = requireGeminiApiKey(options.apiKey);
    const sdk = await requireGeminiSdk();
    return new GeminiAgentModelClient(new sdk.GoogleGenAI({apiKey}), sdk);
  }

  async generate(request: AgentModelRequest): Promise<AgentModelResponse> {
    const parts: Array<
      {text: string} | {inlineData: {mimeType: string; data: string}}
    > = [
      {
        text: `Task: ${request.task}\nTurn ${request.turn} of ${request.maxTurns}.\nRespond with exactly one declared tool call.`,
      },
      {text: observationText(request.latestObservation)},
      {text: recentEventsText(request.events)},
    ];
    for (const image of observationImages(request.latestObservation)) {
      parts.push({text: `${image.label}:`});
      parts.push({
        inlineData: {mimeType: 'image/png', data: dataUrlData(image.dataUrl)},
      });
    }
    const functionDeclarations = geminiToolDeclarations(this.sdk.Type);
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: [{role: 'user', parts}],
      config: {
        systemInstruction: buildAgentSystemInstruction(
          request.observationKinds
        ),
        toolConfig: {
          functionCallingConfig: {
            mode: this.sdk.FunctionCallingConfigMode.ANY,
            allowedFunctionNames: functionDeclarations.map(({name}) => name),
          },
        },
        tools: [{functionDeclarations: functionDeclarations as never}],
      },
    });
    return parseGeminiResponse(response);
  }
}

/** @internal */
export function requireGeminiApiKey(apiKey?: string) {
  const resolved = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (resolved) return resolved;
  throw new Error(
    'Gemini API key is required. Pass options.apiKey or set GEMINI_API_KEY.'
  );
}

/** @internal */
export async function requireGeminiSdk(): Promise<
  typeof import('@google/genai')
> {
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
      throw new Error(
        'Natural-language actions require @google/genai. Install it with `npm install --save-dev @google/genai`.',
        {cause: error}
      );
    }
    throw error;
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

function geminiToolDeclarations(
  type: Pick<typeof import('@google/genai').Type, 'OBJECT' | 'STRING'>
) {
  return [
    ...agentActionDeclarations(),
    {
      name: 'exit',
      description:
        'Stop the agent and return a message with optional structured data.',
      parameters: {
        type: type.OBJECT,
        properties: {
          message: {
            type: type.STRING,
            description: 'A concise final message for the caller.',
          },
          data: {
            type: type.OBJECT,
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

function dataUrlData(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
}

function toJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {value};
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGeminiResponse(response: unknown): AgentModelResponse {
  const anyResponse = response as {
    functionCalls?: Array<{name?: string; args?: JsonObject}>;
  };
  return {
    toolCalls: (anyResponse.functionCalls ?? [])
      .filter(
        (call): call is {name: string; args?: JsonObject} =>
          typeof call.name === 'string'
      )
      .map((call) => ({name: call.name, args: call.args ?? {}})),
    raw: response,
  };
}
