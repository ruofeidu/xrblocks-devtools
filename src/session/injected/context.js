function getSceneContextDetector() {
  const detector = getCore().context?.scene;
  if (!detector || typeof detector.runContextDetection !== 'function') {
    throw new Error(
      'XR Blocks scene context is unavailable. Run with automation mode or enable context before xb.init().'
    );
  }
  return detector;
}

async function runOneShotContextDetection(options) {
  const detection = getSceneContextDetector().runContextDetection(options);
  let frameTimer;
  if (options.setOfMark) {
    frameTimer = setTimeout(() => getCore().stepFrame?.(0), 0);
  }

  let result;
  try {
    result = await detection;
  } finally {
    clearTimeout(frameTimer);
  }
  return result;
}

async function getContextProduct(options, resultKey) {
  const result = await runOneShotContextDetection(options);
  const output = result?.[resultKey];
  if (output === undefined || output === null) {
    throw new Error(
      'XR Blocks context detection did not return ' + resultKey + '.'
    );
  }
  return output;
}

function getContextTree() {
  return getContextProduct(
    {
      semanticTree: true,
      visibleObjects: false,
      setOfMark: false,
    },
    'semanticTree'
  );
}

function getContextVisibleObjects() {
  return getContextProduct(
    {
      semanticTree: false,
      visibleObjects: true,
      setOfMark: false,
    },
    'visibleObjects'
  );
}

function getContextSetOfMark() {
  return getContextProduct(
    {
      semanticTree: false,
      visibleObjects: true,
      setOfMark: true,
    },
    'setOfMark'
  );
}

function getSceneContext(options = {}) {
  const request = {
    semanticTree: options.semanticTree === true,
    visibleObjects: options.visibleObjects === true,
    setOfMark: options.setOfMark === true,
  };
  if (!request.semanticTree && !request.visibleObjects && !request.setOfMark) {
    throw new Error('Scene context requires at least one selected product.');
  }
  return runOneShotContextDetection(request);
}
