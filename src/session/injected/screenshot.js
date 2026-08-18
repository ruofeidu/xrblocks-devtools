async function getScreenshot(args = {}) {
  const core = getCore();
  if (core.screenshotSynthesizer?.getScreenshot) {
    const promise = core.screenshotSynthesizer.getScreenshot(
      !!args.overlayOnCamera
    );
    return awaitWithRenderFrames(promise, 'Screenshot');
  }
  const canvas = core.renderer?.domElement || document.querySelector('canvas');
  if (!canvas?.toDataURL) throw new Error('No screenshot source canvas found.');
  return canvas.toDataURL('image/png');
}
