const RENDER_PUMP_INTERVAL_MS = 16;
const RENDER_PUMP_TIMEOUT_MS = 10_000;

async function awaitWithRenderFrames(
  promise,
  label,
  timeoutMs = RENDER_PUMP_TIMEOUT_MS
) {
  let outcome;
  void Promise.resolve(promise).then(
    (value) => {
      outcome = {ok: true, value};
    },
    (error) => {
      outcome = {ok: false, error};
    }
  );
  await Promise.resolve();

  const deadline = performance.now() + timeoutMs;
  while (!outcome) {
    if (performance.now() >= deadline) {
      throw new Error(label + ' rendering timed out.');
    }
    getCore().stepFrame?.(0);
    await new Promise((resolve) =>
      setTimeout(resolve, RENDER_PUMP_INTERVAL_MS)
    );
  }

  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
