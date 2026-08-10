import {mkdir, rm, stat, symlink} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const xrblocksRoot = path.resolve(root, '..', 'xrblocks');
const linkPath = path.join(root, 'node_modules', 'xrblocks');

const stats = await stat(xrblocksRoot).catch(() => undefined);
if (!stats?.isDirectory()) {
  throw new Error(`XR Blocks checkout not found: ${xrblocksRoot}`);
}

await mkdir(path.dirname(linkPath), {recursive: true});
await rm(linkPath, {recursive: true, force: true});
await symlink(xrblocksRoot, linkPath, 'dir');
console.log(`linked ${linkPath} -> ${xrblocksRoot}`);
