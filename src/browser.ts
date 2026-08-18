/**
 * Returns Chromium launch flags based on the configured browser profile.
 * Container profiles include flags such as `--disable-dev-shm-usage` and
 * `--no-sandbox`. The `container-software` profile also selects SwiftShader.
 */
export function getChromiumLaunchArgs(): string[] {
  const browserProfile = process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE;
  const isContainer =
    browserProfile === 'container' || browserProfile === 'container-software';
  const useSoftwareRendering = browserProfile === 'container-software';

  const baseFlags = [
    '--enable-gpu',
    '--disable-gpu-vsync',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (isContainer) {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(useSoftwareRendering
        ? [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : [
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
            '--enable-zero-copy',
          ]),
      ...baseFlags,
    ];
  }

  return baseFlags;
}
