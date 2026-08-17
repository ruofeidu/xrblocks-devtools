/**
 * Returns Chromium launch flags based on the configured browser profile.
 * When `XRBLOCKS_DEVTOOLS_BROWSER_PROFILE=container`, additional container-friendly
 * flags (such as `--disable-dev-shm-usage` and `--no-sandbox`) are included.
 */
export function getChromiumLaunchArgs(): string[] {
  const isContainer =
    process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE === 'container';

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
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      ...baseFlags,
    ];
  }

  return baseFlags;
}
