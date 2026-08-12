#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {stdin} from 'node:process';
import {fileURLToPath} from 'node:url';
import {requireGeminiApiKey, requireGeminiSdk} from './agent.js';
import {XRBlocksSession} from './session/index.js';
import {commandHelp, parseCommand} from './command-config.js';
import {loadProjectEnv} from './env.js';
import {runInteractive, interactiveHelpText} from './interactive.js';
import {installInterruptHandlers} from './signals.js';
import {runTests} from './test/run-tests.js';
import {visualize} from './visualize/index.js';

export async function main(argv = process.argv.slice(2), signal?: AbortSignal) {
  const command = parseCommand(argv, signal);
  switch (command.kind) {
    case 'help': {
      const help = commandHelp(command.command);
      console.log(
        command.command === 'interact'
          ? `${help}\n\n${interactiveHelpText()}`
          : help
      );
      return command.exitCode;
    }
    case 'visualize': {
      const input =
        command.target === '-'
          ? {source: await readStdin()}
          : {path: command.target};
      const result = await visualize({
        kind: command.visualizeKind,
        input,
        out: command.out,
        size: command.size,
        background: command.background,
        assetsDir: command.assetsDir,
        signal,
        ...(command.visualizeKind === 'ui'
          ? {xrblocksRoot: command.xrblocksRoot}
          : {views: command.views}),
      });
      for (const warning of result.warnings)
        console.error(`Warning: ${warning}`);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case 'interact':
      loadProjectEnv({
        appDir: command.session.appDir,
        envFile: command.envFile,
      });
      await runInteractive(command.session);
      return 0;
    case 'test': {
      const result = await runTests({
        tests: command.tests,
        app: {
          appDir: command.appDir,
          xrblocksRoot: command.xrblocksRoot,
          entry: command.entry,
        },
        outputDir: command.outputDir,
        sessionTimeoutMs: command.sessionTimeoutMs,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === 'valid' ? 0 : 1;
    }
    case 'agent': {
      loadProjectEnv({
        appDir: command.session.appDir,
        envFile: command.envFile,
      });
      requireGeminiApiKey(command.apiKey);
      await requireGeminiSdk();
      const session = await XRBlocksSession.open(command.session);
      const result = await session
        .act(command.task, {
          model: command.model,
          maxTurns: command.maxTurns,
          apiKey: command.apiKey,
          context: command.context,
          onEvent: command.quiet ? undefined : printAgentEvent,
        })
        .finally(() => session.close());
      console.log(
        JSON.stringify(
          {
            status: result.status,
            summary: result.summary,
          },
          null,
          2
        )
      );
      return result.status === 'succeeded' ? 0 : 1;
    }
  }
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function printAgentEvent(event: Record<string, unknown>) {
  const timestampMs = Number(event.timestamp_ms ?? 0);
  const turn = event.turn;
  const type = event.type;
  const toolCall = event.tool_call as
    {name?: string; args?: unknown} | undefined;
  let prefix = `[${(timestampMs / 1000).toFixed(2).padStart(7)}s] turn ${turn} ${type}`;
  if (toolCall?.name) prefix += ` ${toolCall.name}`;
  console.error(prefix);
  if (toolCall?.name) {
    console.error(
      `  ${toolCall.name}: ${JSON.stringify(toolCall.args ?? {}, null, 2)}`
    );
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)
) {
  const controller = new AbortController();
  const removeInterruptHandlers = installInterruptHandlers(controller);
  void main(process.argv.slice(2), controller.signal)
    .then((code) => {
      if (!controller.signal.aborted) process.exitCode = code;
    })
    .catch((error) => {
      if (!controller.signal.aborted) {
        console.error(
          error instanceof Error ? (error.stack ?? error.message) : error
        );
        process.exitCode = 1;
      }
    })
    .finally(removeInterruptHandlers);
}
