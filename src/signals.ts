export type InterruptHost = {
  exitCode?: number;
  stderr: {write(message: string): unknown};
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
  exit(code: number): unknown;
};

export function installInterruptHandlers(
  controller: AbortController,
  options: {
    host?: InterruptHost;
    forceExitAfterMs?: number;
  } = {}
) {
  const host = options.host ?? process;
  const forceExitAfterMs = options.forceExitAfterMs ?? 10_000;
  let forceExitTimer: ReturnType<typeof setTimeout> | undefined;
  let exitCode = 130;

  const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    exitCode = signal === 'SIGINT' ? 130 : 143;
    if (controller.signal.aborted) {
      host.exit(exitCode);
      return;
    }

    host.exitCode = exitCode;
    host.stderr.write(`\nReceived ${signal}; shutting down...\n`);
    controller.abort(new Error(`Interrupted by ${signal}`));
    forceExitTimer = setTimeout(() => {
      host.stderr.write('Shutdown timed out; forcing exit.\n');
      host.exit(exitCode);
    }, forceExitAfterMs);
    forceExitTimer.unref?.();
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  host.on('SIGINT', onSigint);
  host.on('SIGTERM', onSigterm);

  return () => {
    host.off('SIGINT', onSigint);
    host.off('SIGTERM', onSigterm);
    if (forceExitTimer) clearTimeout(forceExitTimer);
  };
}
