import {realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const devtoolsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const examplesRoot = path.resolve(devtoolsRoot, 'examples');
const appArgument = process.argv[2];

if (process.argv.length > 3) {
  throw new Error('Usage: npm run examples -- [app-directory]');
}

let appDirectory;
if (appArgument) {
  const exampleDirectory = path.join(examplesRoot, appArgument);
  const exampleIndex = path.join(exampleDirectory, 'index.html');
  const isExampleName =
    path.basename(appArgument) === appArgument &&
    !appArgument.startsWith('.') &&
    (await stat(exampleIndex).catch(() => undefined))?.isFile();
  const invocationRoot = process.env.INIT_CWD || process.cwd();
  const requestedDirectory = isExampleName
    ? exampleDirectory
    : path.resolve(invocationRoot, appArgument);
  const indexPath = path.join(requestedDirectory, 'index.html');
  const indexStats = await stat(indexPath).catch(() => undefined);
  if (!indexStats?.isFile()) {
    throw new Error(
      `App directory "${requestedDirectory}" does not contain an index.html file.`
    );
  }
  appDirectory = await realpath(requestedDirectory);
  process.env.XRBLOCKS_RUNNER_APP_DIR = appDirectory;
}

const openPath = appDirectory ? '/app/?formFactor=desktop' : '/';
const server = await createServer({
  configFile: path.join(examplesRoot, 'vite.config.js'),
  server: {open: openPath},
});

await server.listen();
server.printUrls();
server.bindCLIShortcuts({print: true});
