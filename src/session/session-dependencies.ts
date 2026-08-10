import type {JsonObject} from '../types.js';
import {serveDirectory} from '../server.js';
import {materializeAudioInjection, type AudioInjectionResult} from './audio.js';
import {
  DEFAULT_EMBODIED_CONTROL_IMPORT,
  PlaywrightSessionAdapter,
  type PlaywrightSessionOptions,
} from './playwright-session-adapter.js';
import type {BrowserDiagnostics} from './types.js';
import {
  SessionVideoRecorder,
  type SessionVideoRecordingOptions,
  type VideoTimeline,
} from './video.js';
import {materializeAppWorkspace} from './workspace.js';

export type SessionRuntimeAdapter = {
  readonly diagnostics: BrowserDiagnostics;
  open(): Promise<unknown>;
  close(): Promise<string | undefined>;
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  injectAudio(args: JsonObject): Promise<AudioInjectionResult>;
};

export type SessionVideoAdapter = {
  readonly rawDir: string;
  markVideoStarted(): void;
  markSceneReady(): void;
  recordAction<T>(
    name: string,
    metadata: JsonObject | undefined,
    action: () => Promise<T>
  ): Promise<T>;
  finish(
    rawVideoPath: string | undefined,
    signal?: AbortSignal
  ): Promise<VideoTimeline | undefined>;
};

export type SessionDependencies = {
  materializeWorkspace: typeof materializeAppWorkspace;
  serveWorkspace: typeof serveDirectory;
  createRuntime(options: PlaywrightSessionOptions): SessionRuntimeAdapter;
  createVideoRecorder(
    options?: SessionVideoRecordingOptions
  ): Promise<SessionVideoAdapter | undefined>;
  materializeAudio: typeof materializeAudioInjection;
};

export const productionSessionDependencies: SessionDependencies = {
  materializeWorkspace: materializeAppWorkspace,
  serveWorkspace: serveDirectory,
  createRuntime: (options) => new PlaywrightSessionAdapter(options),
  createVideoRecorder: (options) => SessionVideoRecorder.create(options),
  materializeAudio: materializeAudioInjection,
};

export {DEFAULT_EMBODIED_CONTROL_IMPORT};
