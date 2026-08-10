import path from 'node:path';
import {requireDir, requireFile} from '../fs-utils.js';
import type {RuntimeAssets} from './types.js';

export async function resolveSessionRuntimeAssets(options: {
  appDir: string;
  xrblocksRoot?: string;
}): Promise<RuntimeAssets> {
  if (options.xrblocksRoot) {
    return resolveRuntimeAssetsFromXrblocksRoot(
      path.resolve(options.xrblocksRoot)
    );
  }

  const appDir = path.resolve(options.appDir);
  const xrblocksRoot = path.join(appDir, 'node_modules', 'xrblocks');
  const threeDir = path.join(appDir, 'node_modules', 'three');
  return validateRuntimeAssets(xrblocksRoot, threeDir);
}

export async function resolveRuntimeAssetsFromXrblocksRoot(
  xrblocksRoot: string
): Promise<RuntimeAssets> {
  await requireDir(xrblocksRoot, 'XR Blocks root');
  const threeDir = path.join(xrblocksRoot, 'node_modules', 'three');
  return validateRuntimeAssets(xrblocksRoot, threeDir);
}

async function validateRuntimeAssets(xrblocksRoot: string, threeDir: string) {
  const xrblocksBuildDir = path.join(xrblocksRoot, 'build');
  await requireFile(
    path.join(xrblocksBuildDir, 'xrblocks.js'),
    'XR Blocks build module'
  );
  await requireFile(
    path.join(threeDir, 'build', 'three.module.js'),
    'Three.js module'
  );
  await requireDir(path.join(threeDir, 'examples', 'jsm'), 'Three.js addons');
  return {xrblocksRoot, xrblocksBuildDir, threeDir};
}
