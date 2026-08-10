import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {serveDirectory, type RunningServer} from '../src/server.js';

const directories: string[] = [];
const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true}))
  );
});

describe('static server', () => {
  it('serves files and responds safely to malformed URL encoding', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-server-'));
    directories.push(directory);
    await writeFile(path.join(directory, 'index.html'), 'hello', 'utf8');
    const server = await serveDirectory(directory);
    servers.push(server);

    const indexResponse = await fetch(server.url);
    expect(indexResponse.status).toBe(200);
    await expect(indexResponse.text()).resolves.toBe('hello');

    const malformedResponse = await fetch(`${server.url}%E0%A4%A`);
    expect(malformedResponse.status).toBe(404);

    const firstClose = server.close();
    expect(server.close()).toBe(firstClose);
    await firstClose;
    servers.pop();
  });
});
