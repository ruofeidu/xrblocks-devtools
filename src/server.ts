import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';

export type RunningServer = {
  url: string;
  close: () => Promise<void>;
};

export async function serveDirectory(
  directory: string,
  host = '127.0.0.1',
  port = 0
): Promise<RunningServer> {
  const root = path.resolve(directory);
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${host}`);
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(
        /^[/\\]+/,
        ''
      );
      let filePath = path.resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        throw new Error('Path escapes server root');
      }
      let stats = await stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stats = await stat(filePath);
      }
      if (!stats.isFile()) throw new Error('Not a file');
      response.writeHead(200, {'content-type': contentType(filePath)});
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, {'content-type': 'text/plain'});
      response.end('Not found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Unable to bind server.');
  let closing: Promise<void> | undefined;
  return {
    url: `http://${host}:${address.port}/`,
    close: () => {
      closing ??= new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

function contentType(filePath: string) {
  switch (path.extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}
