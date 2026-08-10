import {createRequire} from 'node:module';
import path from 'node:path';
import {requireDir, requireFile} from '../fs-utils.js';

const require = createRequire(import.meta.url);

export async function resolvePreviewRuntime(xrblocksRoot?: string) {
  const xrblocksEntry = xrblocksRoot
    ? path.resolve(xrblocksRoot, 'build', 'xrblocks.js')
    : require.resolve('xrblocks');
  await requireFile(xrblocksEntry, 'XR Blocks browser build');
  const xrblocksDir = path.dirname(path.dirname(xrblocksEntry));
  const threeEntry = require.resolve('three', {paths: [xrblocksDir]});
  const threeDir =
    path.basename(path.dirname(threeEntry)) === 'build'
      ? path.dirname(path.dirname(threeEntry))
      : path.dirname(threeEntry);
  await requireFile(
    path.join(threeDir, 'build', 'three.module.js'),
    'Three.js module'
  );
  await requireDir(path.join(threeDir, 'examples', 'jsm'), 'Three.js addons');
  return {
    threeDir,
    xrblocksEntry,
  };
}
