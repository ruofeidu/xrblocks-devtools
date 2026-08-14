import type {BrowserDiagnostics, PhysicalHand} from '../session/index.js';

export interface XRBlocksTestMeta {
  schemaVersion: 1;
  logicalId: string;
  name: string;
  kind: 'test' | 'session';
  required: boolean;
  runId: string;
  primaryHand?: PhysicalHand;
  secondaryHand?: PhysicalHand;
  scenario?: string;
  realTime?: boolean;
  video?: string;
  videoTimeline?: string;
  diagnostics?: BrowserDiagnostics;
}

export interface XRBlocksTestContext {
  appDir: string;
  xrblocksRoot?: string;
  entry?: string;
  artifactDir: string;
  sessionTimeoutMs?: number;
}

export type XRBlocksTestFailureKind = 'candidate' | 'verifier';
export type XRBlocksTestFailurePhase = 'session' | 'test' | 'cleanup';

declare module '@vitest/runner' {
  interface TaskMeta {
    xrblocksTest?: XRBlocksTestMeta;
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    xrblocksTest: XRBlocksTestContext;
  }
}
