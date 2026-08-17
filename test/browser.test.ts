import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {getChromiumLaunchArgs} from '../src/browser.js';

describe('getChromiumLaunchArgs', () => {
  const originalEnv = process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE;

  beforeEach(() => {
    delete process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE = originalEnv;
    } else {
      delete process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE;
    }
  });

  it('returns standard base flags when browser profile is unset or default', () => {
    const args = getChromiumLaunchArgs();
    expect(args).toContain('--enable-gpu');
    expect(args).toContain('--disable-gpu-vsync');
    expect(args).not.toContain('--disable-dev-shm-usage');
    expect(args).not.toContain('--no-sandbox');
    expect(args).not.toContain('--mute-audio');
  });

  it('includes container flags when XRBLOCKS_DEVTOOLS_BROWSER_PROFILE=container', () => {
    process.env.XRBLOCKS_DEVTOOLS_BROWSER_PROFILE = 'container';
    const args = getChromiumLaunchArgs();
    expect(args).toContain('--disable-dev-shm-usage');
    expect(args).toContain('--no-sandbox');
    expect(args).toContain('--disable-setuid-sandbox');
    expect(args).toContain('--ignore-gpu-blocklist');
    expect(args).not.toContain('--use-gl=angle');
    expect(args).toContain('--enable-gpu-rasterization');
    expect(args).toContain('--enable-zero-copy');
    expect(args).toContain('--enable-gpu');
    expect(args).not.toContain('--mute-audio');
  });
});
