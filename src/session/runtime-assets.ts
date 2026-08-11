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
  const nodeModulesDir = path.join(appDir, 'node_modules');
  const xrblocksRoot = path.join(appDir, 'node_modules', 'xrblocks');
  const threeDir = path.join(appDir, 'node_modules', 'three');
  const threePathfindingDir = options.simulatorNavMesh
    ? path.join(appDir, 'node_modules', 'three-pathfinding')
    : undefined;
  return validateRuntimeAssets(
    xrblocksRoot,
    nodeModulesDir,
    threeDir,
    threePathfindingDir
  );
}

export async function resolveRuntimeAssetsFromXrblocksRoot(
  xrblocksRoot: string,
  simulatorNavMesh = false
): Promise<RuntimeAssets> {
  await requireDir(xrblocksRoot, 'XR Blocks root');
  const packageParent = path.dirname(xrblocksRoot);
  const nodeModulesDir =
    path.basename(packageParent) === 'node_modules'
      ? packageParent
      : path.join(xrblocksRoot, 'node_modules');
  const threeDir = path.join(nodeModulesDir, 'three');
  const threePathfindingDir = simulatorNavMesh
    ? path.join(nodeModulesDir, 'three-pathfinding')
    : undefined;
  return validateRuntimeAssets(
    xrblocksRoot,
    nodeModulesDir,
    threeDir,
    threePathfindingDir
  );
}

async function validateRuntimeAssets(
  xrblocksRoot: string,
  nodeModulesDir: string,
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
  await requireFile(
    path.join(nodeModulesDir, '@pmndrs', 'uikit', 'dist', 'index.js'),
    'XR Blocks UIKit peer module'
  );
  await requireFile(
    path.join(
      nodeModulesDir,
      '@preact',
      'signals-core',
      'dist',
      'signals-core.mjs'
    ),
    'XR Blocks signals peer module'
  );
  await requireFile(
    path.join(nodeModulesDir, 'lit', 'index.js'),
    'XR Blocks Lit peer module'
  );
  if (threePathfindingDir) {
    await requireFile(
      path.join(threePathfindingDir, 'dist', 'three-pathfinding.module.js'),
      'three-pathfinding module required by simulator navmesh'
    );
  }
  return {
    xrblocksRoot,
    xrblocksBuildDir,
    nodeModulesDir,
    threeDir,
    threePathfindingDir,
  };
}
