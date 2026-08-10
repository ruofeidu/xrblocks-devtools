async function waitForCoreReady(timeoutMs = 10000) {
  if (!window.xbReady) {
    throw new Error(
      'XR Blocks debug readiness is unavailable. Start the session with debug=1.'
    );
  }
  await waitForReadyPromise(
    window.xbReady,
    timeoutMs,
    'Timed out waiting for the XR Blocks debug runtime to become ready.'
  );
  getCore();
  return true;
}

async function waitForReadyPromise(ready, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    await Promise.race([ready, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getSimulatorStatus() {
  const core = getCore();
  if (!core.simulatorRunning) {
    throw new Error(
      'XR Blocks debug runtime is ready, but the simulator is not running. Start the session with xrAutomation=1.'
    );
  }
  return {
    running: true,
    defaultMode: core.options?.simulator?.defaultMode,
    defaultHand: core.options?.simulator?.defaultHand,
  };
}

function getSimulatorDeviceCameraStatus() {
  const core = getCore();
  return {
    enabled: !!core.deviceCamera,
    simulatorCamera: !!core.deviceCamera?.simulatorCamera,
    loaded: !!core.deviceCamera?.loaded,
  };
}
