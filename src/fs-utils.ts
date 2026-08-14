import {
  cp,
  mkdir,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export async function requireFile(filePath: string, label: string) {
  const stats = await stat(filePath).catch(() => undefined);
  if (!stats?.isFile()) throw new Error(`${label} not found: ${filePath}`);
  return filePath;
}

export async function requireDir(dirPath: string, label: string) {
  const stats = await stat(dirPath).catch(() => undefined);
  if (!stats?.isDirectory()) throw new Error(`${label} not found: ${dirPath}`);
  return dirPath;
}

export async function assertEmptyDir(dirPath: string) {
  await mkdir(dirPath, {recursive: true});
  const entries = await readdir(dirPath);
  if (entries.length > 0)
    throw new Error(`Directory must be empty: ${dirPath}`);
}

export async function copyDir(source: string, destination: string) {
  await cp(source, destination, {
    recursive: true,
    verbatimSymlinks: false,
    filter: (sourcePath) =>
      !sourcePath.split(path.sep).includes('node_modules'),
  });
}

/**
 * Directory symlinks need administrator rights or Developer Mode on Windows,
 * so link directories as junctions there instead.
 */
export async function symlinkDir(target: string, linkPath: string) {
  await symlink(
    path.resolve(target),
    linkPath,
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

export async function replaceWithSymlink(target: string, linkPath: string) {
  await rm(linkPath, {recursive: true, force: true});
  await mkdir(path.dirname(linkPath), {recursive: true});
  await symlinkDir(target, linkPath);
}

export async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
