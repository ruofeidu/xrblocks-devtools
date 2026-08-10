import {chmod, cp, mkdir} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'src', 'session', 'injected');
const destination = path.join(root, 'dist', 'session', 'injected');
await mkdir(destination, {recursive: true});
await cp(source, destination, {recursive: true});
await chmod(path.join(root, 'dist', 'cli.js'), 0o755);
