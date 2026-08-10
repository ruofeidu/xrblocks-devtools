import path from 'node:path';
import {requireDir, requireFile} from '../fs-utils.js';
import type {RuntimeAssets} from './types.js';

export async function resolveSessionRuntimeAssets(options: {
  appDir: string;
  xrblocksRoot?: string;
  simulatorNavMesh?: boolean;
}): Promise<RuntimeAssets> {
  if (options.xrblocksRoot) {
    return resolveRuntimeAssetsFromXrblocksRoot(
      path.resolve(options.xrblocksRoot),
      options.simulatorNavMesh
    );
  }

  const appDir = path.resolve(options.appDir);
  const xrblocksRoot = path.join(appDir, 'node_modules', 'xrblocks');
  const threeDir = path.join(appDir, 'node_modules', 'three');
  const threePathfindingDir = options.simulatorNavMesh
    ? path.join(appDir, 'node_modules', 'three-pathfinding')
    : undefined;
  return validateRuntimeAssets(xrblocksRoot, threeDir, threePathfindingDir);
}

export async function resolveRuntimeAssetsFromXrblocksRoot(
  xrblocksRoot: string,
  simulatorNavMesh = false
): Promise<RuntimeAssets> {
  await requireDir(xrblocksRoot, 'XR Blocks root');
  const threeDir = path.join(xrblocksRoot, 'node_modules', 'three');
  const threePathfindingDir = simulatorNavMesh
    ? path.join(xrblocksRoot, 'node_modules', 'three-pathfinding')
    : undefined;
  return validateRuntimeAssets(xrblocksRoot, threeDir, threePathfindingDir);
}

async function validateRuntimeAssets(
  xrblocksRoot: string,
  threeDir: string,
  threePathfindingDir?: string
) {
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
  if (threePathfindingDir) {
    await requireFile(
      path.join(threePathfindingDir, 'dist', 'three-pathfinding.module.js'),
      'three-pathfinding module required by simulator navmesh'
    );
  }
  return {xrblocksRoot, xrblocksBuildDir, threeDir, threePathfindingDir};
}
