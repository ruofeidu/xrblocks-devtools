import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  observationText,
  runSessionAct,
  type AgentModelClient,
} from '../src/agent.js';
import {
  agentObservationPrompt,
  captureAgentObservation,
  parseAgentObservations,
} from '../src/agent-observations.js';
import type {XRBlocksSession} from '../src/session/index.js';

afterEach(() => vi.unstubAllEnvs());

describe('Session act', () => {
  it('requires an API key before observing the app', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const captureObservation = vi.fn();

    await expect(
      runSessionAct(
        {} as XRBlocksSession,
        'Move the box',
        {},
        {captureObservation}
      )
    ).rejects.toThrow('Pass options.apiKey or set GEMINI_API_KEY');
    expect(captureObservation).not.toHaveBeenCalled();
  });

  it('selects observation guidance and rejects unknown kinds', () => {
    expect(parseAgentObservations('som,image,visible,image')).toEqual([
      'image',
      'visible',
      'som',
    ]);
    expect(agentObservationPrompt(['tags', 'state']))
      .toContain('developer-assigned')
      .toContain('app-declared');
    expect(() => parseAgentObservations('image,depth')).toThrow(
      'Unknown agent observation: depth'
    );
  });

  it('captures selected scene, developer, and image context in batches', async () => {
    const getSceneContext = vi.fn().mockResolvedValue({
      semanticTree: {snapshotId: 'snapshot-1'},
      setOfMark: {image: 'data:image/png;base64,c29t', marks: []},
    });
    const getDevtoolsContext = vi.fn().mockResolvedValue({
      tags: [{tag: 'target'}],
      view: [{inFrustum: true}],
    });
    const session = {
      getCamera: vi.fn().mockResolvedValue({
        position: [0, 1.5, 0],
        screenshot: 'data:image/png;base64,cmF3',
      }),
      getHands: vi.fn().mockResolvedValue({}),
      getSimulatorState: vi.fn().mockResolvedValue({paused: true}),
      getSceneContext,
      getDevtoolsContext,
    } as unknown as XRBlocksSession;

    const observation = await captureAgentObservation({
      session,
      timestampMs: 123,
      kinds: ['image', 'semantic-tree', 'som', 'tags', 'view'],
    });

    expect(getSceneContext).toHaveBeenCalledWith({
      semanticTree: true,
      visibleObjects: undefined,
      setOfMark: true,
    });
    expect(getDevtoolsContext).toHaveBeenCalledWith({
      tags: true,
      state: undefined,
      spatial: undefined,
      view: true,
    });
    expect(observation).toMatchObject({
      semantic_tree: {snapshotId: 'snapshot-1'},
      tags: [{tag: 'target'}],
      images: [
        {kind: 'image', dataUrl: 'data:image/png;base64,cmF3'},
        {kind: 'som', dataUrl: 'data:image/png;base64,c29t'},
      ],
    });
  });

  it('keeps image data out of structured model state', () => {
    const text = observationText({
      timestamp_ms: 10,
      visible_objects: {nodes: {ctx_1: {name: 'Target'}}},
      images: [{label: 'Raw image', dataUrl: 'data:image/png;base64,aW1hZ2U='}],
    });

    expect(text).toContain('visible_objects');
    expect(text).not.toContain('data:image');
  });

  it('uses one action per turn, observes after it, and leaves Session ownership with the caller', async () => {
    const modelClient: AgentModelClient = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [{name: 'step_frame', args: {frames: 2}}],
        })
        .mockResolvedValueOnce({
          toolCalls: [{name: 'succeed', args: {summary: 'done'}}],
        }),
    };
    const session = {} as XRBlocksSession;
    const captureObservation = vi
      .fn()
      .mockImplementation(async ({timestampMs}) => ({
        timestamp_ms: timestampMs,
      }));
    const executeAction = vi.fn().mockResolvedValue({completed: true});

    const result = await runSessionAct(
      session,
      'Move the box',
      {context: ['visible'], data: {goal: 'box'}},
      {modelClient, captureObservation, executeAction, clock: () => 1}
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      summary: 'done',
      turns: 2,
    });
    expect(executeAction).toHaveBeenCalledOnce();
    expect(captureObservation).toHaveBeenCalledTimes(2);
    expect(result.events.map((event) => event.type)).toEqual([
      'observation',
      'action',
      'observation',
      'succeed',
    ]);
  });

  it('feeds action errors into the next turn and fails at the turn limit', async () => {
    const modelClient: AgentModelClient = {
      generate: vi
        .fn()
        .mockResolvedValue({toolCalls: [{name: 'move', args: {}}]}),
    };
    const result = await runSessionAct(
      {} as XRBlocksSession,
      'Try it',
      {maxTurns: 1},
      {
        modelClient,
        captureObservation: vi.fn().mockResolvedValue({timestamp_ms: 0}),
        executeAction: vi.fn().mockRejectedValue(new Error('blocked')),
      }
    );

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('without succeed');
    expect(result.events.map((event) => event.type)).toEqual([
      'observation',
      'action_error',
      'observation',
    ]);
  });

  it('fails an invalid multi-action model response', async () => {
    const result = await runSessionAct(
      {} as XRBlocksSession,
      'Try it',
      {},
      {
        modelClient: {
          generate: vi.fn().mockResolvedValue({
            toolCalls: [
              {name: 'wait', args: {}},
              {name: 'succeed', args: {}},
            ],
          }),
        },
        captureObservation: vi.fn().mockResolvedValue({timestamp_ms: 0}),
        executeAction: vi.fn(),
      }
    );

    expect(result).toMatchObject({status: 'failed', turns: 1});
    expect(result.events.at(-1)?.type).toBe('invalid_response');
  });
});
