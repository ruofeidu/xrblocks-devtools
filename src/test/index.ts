export {runTests, type AppBinding, type RunTestsOptions} from './run-tests.js';
export {VerifierError} from './failure.js';
export {
  judge,
  type JudgeImageInput,
  type JudgeInput,
  type JudgeOptions,
} from './judge.js';
export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  it_session,
  vi,
  type XRBlocksIt,
  type XRBlocksTestOptions,
  type SessionTestFunction,
  type SessionTestOptions,
  type SessionTestRun,
  type BuiltInScene,
  type SceneVariant,
} from './authoring.js';
export type {
  EvaluationError,
  EvaluationResult,
  TestResult,
  TestRunResult,
  TestStatus,
} from './result.js';
