import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it as vitestIt,
  vi,
  type TestContext,
  type TestFunction,
  type TestOptions,
} from 'vitest';
import path from 'node:path';
import {XRBlocksSession, type PhysicalHand} from '../session/index.js';
import {XRBlocksTestFailure} from './failure.js';
import type {XRBlocksTestMeta} from './internal-types.js';

export {afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi};

type VitestOptions = Omit<
  TestOptions,
  'concurrent' | 'fails' | 'meta' | 'repeats' | 'retry' | 'sequential'
>;

export interface XRBlocksTestOptions extends VitestOptions {
  required?: boolean;
}

export interface SessionTestOptions extends XRBlocksTestOptions {
  switchHands?: boolean;
  scenarios?: string[];
  video?: string;
  realTime?: boolean;
}

export interface SessionTestRun {
  primaryHand: PhysicalHand;
  secondaryHand: PhysicalHand;
  scenario?: string;
}

export type SessionTestFunction = (
  session: XRBlocksSession,
  run: Readonly<SessionTestRun>,
  context: TestContext
) => void | Promise<void>;

interface XRBlocksItCall {
  (name: string, callback: TestFunction, timeout?: number): void;
  (name: string, options: XRBlocksTestOptions, callback: TestFunction): void;
}

export interface XRBlocksIt extends XRBlocksItCall {
  only: XRBlocksItCall;
  skip: XRBlocksItCall;
  todo(name: string, options?: XRBlocksTestOptions): void;
}

type VitestItCall = (
  name: string,
  options?: TestOptions,
  callback?: TestFunction
) => void;

let nextLogicalId = 0;
const DEFAULT_SESSION_TEST_TIMEOUT_MS = 120_000;

export const it: XRBlocksIt = Object.assign(makeIt(vitestIt), {
  only: makeIt(vitestIt.only),
  skip: makeIt(vitestIt.skip),
  todo: (name: string, options: XRBlocksTestOptions = {}) => {
    registerPlainTest(vitestIt.todo, name, options);
  },
});

export function it_session(name: string, callback: SessionTestFunction): void;
export function it_session(
  name: string,
  options: SessionTestOptions,
  callback: SessionTestFunction
): void;
export function it_session(
  name: string,
  optionsOrCallback: SessionTestOptions | SessionTestFunction,
  suppliedCallback?: SessionTestFunction
): void {
  const options =
    typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  const callback =
    typeof optionsOrCallback === 'function'
      ? optionsOrCallback
      : suppliedCallback;
  if (!callback) throw new TypeError(`Session test ${name} needs a callback.`);

  const plan = planSessionRuns(name, options);
  const {
    switchHands: _switchHands,
    scenarios: _scenarios,
    video: _video,
    realTime: _realTime,
    ...sharedOptions
  } = options;
  for (const run of plan.runs) {
    const meta: XRBlocksTestMeta = {
      schemaVersion: 1,
      logicalId: plan.logicalId,
      name,
      kind: 'session',
      required: plan.required,
      runId: run.id,
      primaryHand: run.primaryHand,
      secondaryHand: run.secondaryHand,
      scenario: run.scenario,
      realTime: options.realTime ?? false,
    };

    vitestIt(
      `${name} [${run.primaryHand}, ${run.scenario ?? 'default'}]`,
      testOptions(
        {
          ...sharedOptions,
          timeout: sharedOptions.timeout ?? DEFAULT_SESSION_TEST_TIMEOUT_MS,
        },
        meta
      ),
      async (context) => {
        await runSessionTest(
          callback,
          run,
          context,
          meta,
          options.video,
          options.realTime ?? false
        );
      }
    );
  }
}

function makeIt(base: VitestItCall): XRBlocksItCall {
  return (
    name: string,
    optionsOrCallback: XRBlocksTestOptions | TestFunction,
    callbackOrTimeout?: TestFunction | number
  ): void => {
    if (typeof optionsOrCallback === 'function') {
      const timeout =
        typeof callbackOrTimeout === 'number' ? callbackOrTimeout : undefined;
      registerPlainTest(base, name, {timeout}, optionsOrCallback);
      return;
    }
    if (typeof callbackOrTimeout !== 'function')
      throw new TypeError(`Test ${name} needs a callback.`);
    registerPlainTest(base, name, optionsOrCallback, callbackOrTimeout);
  };
}

function registerPlainTest(
  base: VitestItCall,
  name: string,
  options: XRBlocksTestOptions,
  callback?: TestFunction
): void {
  const meta: XRBlocksTestMeta = {
    schemaVersion: 1,
    logicalId: logicalId(),
    name,
    kind: 'test',
    required: options.required ?? false,
    runId: 'default',
  };
  base(name, testOptions(options, meta), callback);
}

interface PlannedSessionRun extends SessionTestRun {
  id: string;
  videoSuffix: string;
}

function planSessionRuns(
  name: string,
  options: SessionTestOptions
): {
  logicalId: string;
  required: boolean;
  runs: PlannedSessionRun[];
} {
  const switchHands = options.switchHands;
  if (switchHands !== undefined && typeof switchHands !== 'boolean')
    throw new TypeError(`Session test ${name} switchHands must be a Boolean.`);
  const hands: PhysicalHand[] = switchHands ? ['right', 'left'] : ['right'];

  const scenarios = normalizeScenarios(name, options.scenarios);
  validateVideoName(name, options.video);
  if (options.realTime !== undefined && typeof options.realTime !== 'boolean')
    throw new TypeError(`Session test ${name} realTime must be a Boolean.`);
  const required = options.required ?? false;
  const runs: PlannedSessionRun[] = [];

  for (const primaryHand of hands) {
    for (const [scenarioIndex, scenario] of scenarios.entries()) {
      const suffixes = [];
      if (hands.length > 1) suffixes.push(primaryHand);
      if (scenarios.length > 1) suffixes.push(`scenario-${scenarioIndex + 1}`);
      runs.push({
        id: `${primaryHand}:${scenario ?? 'default'}`,
        primaryHand,
        secondaryHand: primaryHand === 'right' ? 'left' : 'right',
        scenario,
        videoSuffix: suffixes.length > 0 ? `-${suffixes.join('-')}` : '',
      });
    }
  }

  return {logicalId: logicalId(), required, runs};
}

function normalizeScenarios(
  name: string,
  scenarios: string[] | undefined
): (string | undefined)[] {
  if (scenarios === undefined || scenarios.length === 0) return [undefined];
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (typeof scenario !== 'string' || scenario.trim().length === 0)
      throw new TypeError(
        `Session test ${name} scenarios must be non-empty paths.`
      );
    if (seen.has(scenario))
      throw new TypeError(`Session test ${name} repeats scenario ${scenario}.`);
    seen.add(scenario);
  }
  return scenarios;
}

async function runSessionTest(
  callback: SessionTestFunction,
  run: PlannedSessionRun,
  context: TestContext,
  meta: XRBlocksTestMeta,
  videoName: string | undefined,
  realTime: boolean
): Promise<void> {
  if (run.scenario) {
    throw new XRBlocksTestFailure(
      'verifier',
      'session',
      'Scenario manifests require XR Blocks Devtools environment-loading support, which is not available yet.'
    );
  }

  const provided = inject('xrblocksTest');
  const videoStem = videoName ? `${videoName}${run.videoSuffix}` : undefined;
  const videoOut = videoStem
    ? path.join(provided.artifactDir, `${videoStem}.mp4`)
    : undefined;
  const timelineOut = videoStem
    ? path.join(provided.artifactDir, `${videoStem}.timeline.json`)
    : undefined;
  let session: XRBlocksSession;
  try {
    session = await XRBlocksSession.open({
      appDir: provided.appDir,
      xrblocksRoot: provided.xrblocksRoot,
      entry: provided.entry,
      realTime,
      recordVideo:
        videoOut && timelineOut
          ? {
              out: videoOut,
              timelineOut,
              fromSceneReady: true,
            }
          : undefined,
      timeoutMs: provided.sessionTimeoutMs,
      signal: context.signal,
    });
  } catch (error) {
    throw new XRBlocksTestFailure(
      'candidate',
      'session',
      `App session did not start: ${errorMessage(error)}`,
      {cause: error}
    );
  }

  let callbackError: unknown;
  try {
    await callback(
      session,
      {
        primaryHand: run.primaryHand,
        secondaryHand: run.secondaryHand,
        scenario: run.scenario,
      },
      context
    );
  } catch (error) {
    callbackError = error;
  }

  try {
    await session.close();
    meta.diagnostics = session.diagnostics;
    if (session.videoTimeline) {
      meta.video = relativeArtifactPath(
        provided.artifactDir,
        session.videoTimeline.outputVideoPath
      );
      meta.videoTimeline = relativeArtifactPath(
        provided.artifactDir,
        timelineOut!
      );
    }
  } catch (error) {
    throw new XRBlocksTestFailure(
      'verifier',
      'cleanup',
      `Session cleanup failed: ${errorMessage(error)}`,
      {
        cause: callbackError
          ? new AggregateError([callbackError, error])
          : error,
      }
    );
  }

  if (callbackError !== undefined) throw callbackError;
}

function testOptions(
  options: XRBlocksTestOptions,
  meta: XRBlocksTestMeta
): TestOptions {
  const {required: _required, ...vitestOptions} = options;
  return {
    ...vitestOptions,
    concurrent: false,
    repeats: 0,
    retry: 0,
    meta: {xrblocksTest: meta},
  };
}

const VIDEO_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function validateVideoName(name: string, video: string | undefined): void {
  if (video !== undefined && !VIDEO_NAME.test(video))
    throw new TypeError(
      `Session test ${name} video must be a simple name matching ${VIDEO_NAME.source}.`
    );
}

function relativeArtifactPath(root: string, file: string): string {
  return path.posix.join(
    'artifacts',
    path.relative(root, file).split(path.sep).join('/')
  );
}

function logicalId(): string {
  nextLogicalId += 1;
  return `test-${nextLogicalId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
