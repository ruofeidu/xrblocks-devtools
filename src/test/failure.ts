import type {
  XRBlocksTestFailureKind,
  XRBlocksTestFailurePhase,
} from './internal-types.js';

export class XRBlocksTestFailure extends Error {
  override readonly name: string = 'XRBlocksTestFailure';
  readonly xrblocksTestFailure: XRBlocksTestFailureKind;
  readonly xrblocksTestPhase: XRBlocksTestFailurePhase;

  constructor(
    kind: XRBlocksTestFailureKind,
    phase: XRBlocksTestFailurePhase,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.xrblocksTestFailure = kind;
    this.xrblocksTestPhase = phase;
  }
}

/** Marks a test-authoring or evaluation-service failure as a verifier error. */
export class VerifierError extends XRBlocksTestFailure {
  override readonly name = 'VerifierError';

  constructor(message: string, options?: ErrorOptions) {
    super('verifier', 'test', message, options);
  }
}
