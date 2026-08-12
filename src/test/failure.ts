import type {
  XRBlocksTestFailureKind,
  XRBlocksTestFailurePhase,
} from './internal-types.js';

export class XRBlocksTestFailure extends Error {
  override readonly name = 'XRBlocksTestFailure';
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
