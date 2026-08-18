import os from 'node:os';
import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import {afterEach, describe, expect, it} from 'vitest';

import {materializeAppWorkspace} from '../../src/session/workspace.js';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

describe('materializeAppWorkspace', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((directory) => rm(directory, {recursive: true, force: true}))
    );
  });

  it('rewrites a nested XR Blocks app without rewriting vendor paths twice', async () => {
    const projectDir = await makeTempDir('xrblocks-workspace-');
    const xrblocksRoot = path.join(projectDir, 'xrblocks');
    const appDir = path.join(xrblocksRoot, 'samples', 'advanced', 'example');
    await mkdir(path.join(xrblocksRoot, 'build', 'addons'), {recursive: true});
    await mkdir(path.join(xrblocksRoot, 'node_modules', 'three', 'build'), {
      recursive: true,
    });
    await mkdir(
      path.join(xrblocksRoot, 'node_modules', 'three', 'examples', 'jsm'),
      {recursive: true}
    );
    const peerFiles = [
      ['@pmndrs', 'uikit', 'dist', 'index.js'],
      ['@preact', 'signals-core', 'dist', 'signals-core.mjs'],
      ['lit', 'index.js'],
    ];
    for (const segments of peerFiles) {
      const filePath = path.join(xrblocksRoot, 'node_modules', ...segments);
      await mkdir(path.dirname(filePath), {recursive: true});
      await writeFile(filePath, 'export {};\n');
    }
    await mkdir(appDir, {recursive: true});
    await writeFile(
      path.join(xrblocksRoot, 'build', 'xrblocks.js'),
      'export {};\n'
    );
    await writeFile(
      path.join(xrblocksRoot, 'samples', 'main.css'),
      'body {}\n'
    );
    await writeFile(
      path.join(
        xrblocksRoot,
        'node_modules',
        'three',
        'build',
        'three.module.js'
      ),
      'export {};\n'
    );
    await writeFile(
      path.join(appDir, 'index.html'),
      `<!doctype html>
<link rel="stylesheet" href="../../main.css">
<script type="importmap">{"imports":{"xrblocks":"../../../build/xrblocks.js","xrblocks/addons/":"../../../build/addons/"}}</script>`
    );

    const workspace = await materializeAppWorkspace({
      appDir,
      xrblocksRoot,
    });
    tempDirs.push(workspace.rootDir);
    const html = await readFile(
      path.join(workspace.appDir, 'index.html'),
      'utf8'
    );

    expect(html).toContain('"xrblocks": "./vendor/xrblocks/build/xrblocks.js"');
    expect(html).toContain(
      '"xrblocks/addons/": "./vendor/xrblocks/build/addons/"'
    );
    expect(html).toContain('"lit": "./vendor/node_modules/lit/index.js"');
    expect(html).toContain('href="./vendor/xrblocks/samples/main.css"');
    expect(html).not.toContain('/vendor/xrblocks/samples/advanced/example/');
    await expect(
      readlink(path.join(workspace.appDir, 'vendor', 'xrblocks'))
    ).resolves.toBe(xrblocksRoot);
    await expect(
      readlink(path.join(workspace.appDir, 'vendor', 'three'))
    ).resolves.toBe(path.join(xrblocksRoot, 'node_modules', 'three'));
    await expect(
      readlink(path.join(workspace.appDir, 'vendor', 'node_modules'))
    ).resolves.toBe(path.join(xrblocksRoot, 'node_modules'));
  });
});
