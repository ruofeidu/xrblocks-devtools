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

  it('points app imports at the unmodified XR Blocks SDK', async () => {
    const projectDir = await makeTempDir('xrblocks-workspace-');
    const xrblocksRoot = path.join(projectDir, 'xrblocks');
    const appDir = path.join(projectDir, 'app');
    await mkdir(path.join(xrblocksRoot, 'build', 'addons'), {recursive: true});
    await mkdir(path.join(xrblocksRoot, 'node_modules', 'three', 'build'), {
      recursive: true,
    });
    await mkdir(
      path.join(xrblocksRoot, 'node_modules', 'three', 'examples', 'jsm'),
      {recursive: true}
    );
    await mkdir(appDir, {recursive: true});
    await writeFile(
      path.join(xrblocksRoot, 'build', 'xrblocks.js'),
      'export {};\n'
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
<script type="importmap">{"imports":{"xrblocks":"../../xrblocks/build/xrblocks.js","xrblocks/addons/":"../../xrblocks/build/addons/"}}</script>`
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
    await expect(
      readlink(path.join(workspace.appDir, 'vendor', 'xrblocks'))
    ).resolves.toBe(xrblocksRoot);
    await expect(
      readlink(path.join(workspace.appDir, 'vendor', 'three'))
    ).resolves.toBe(path.join(xrblocksRoot, 'node_modules', 'three'));
  });
});
