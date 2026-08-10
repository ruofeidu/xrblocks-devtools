export type VisualizeKind = 'ui' | 'model';
export type ViewPreset = 'inspection-4' | 'turntable-4' | 'front';

export type PreviewInput = {path: string} | {source: string};

type VisualizeRequestBase = {
  input: PreviewInput;
  out: string;
  size?: string;
  background?: string;
  assetsDir?: string;
  signal?: AbortSignal;
};

export type UIVisualizeRequest = VisualizeRequestBase & {
  kind: 'ui';
  xrblocksRoot?: string;
};

export type ModelVisualizeRequest = VisualizeRequestBase & {
  kind: 'model';
  views?: ViewPreset;
};

export type VisualizeRequest = UIVisualizeRequest | ModelVisualizeRequest;

export type VisualizeResult = {
  out: string;
  warnings: string[];
};

export type NormalizedPreviewInput = {
  modulePath: string;
  assetsDir: string;
  cleanup?: () => Promise<void>;
};
