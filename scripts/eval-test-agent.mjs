#!/usr/bin/env node
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {XRBlocksSession} from '../dist/index.js';
import {loadDotEnv} from '../dist/env.js';
import {installInterruptHandlers} from '../dist/signals.js';
import {judgeTrajectory} from '../dist/test/index.js';

const usage = `Usage:
  npm run eval-test-agent -- <experiment.json> --xrblocks-root <dir> --out <result.json> [--concurrency <count>] [--verbose]`;

loadDotEnv();
const controller = new AbortController();
const removeInterruptHandlers = installInterruptHandlers(controller);

void main(process.argv.slice(2), controller.signal)
  .then((code) => {
    if (!controller.signal.aborted) process.exitCode = code;
  })
  .catch((error) => {
    if (!controller.signal.aborted) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  })
  .finally(removeInterruptHandlers);

async function main(argv, signal) {
  const cli = parseArguments(argv);
  if (cli.help) {
    console.log(usage);
    return 0;
  }

  const invocationRoot = process.env.INIT_CWD || process.cwd();
  const configPath = path.resolve(invocationRoot, cli.config);
  const xrblocksRoot = path.resolve(invocationRoot, cli.xrblocksRoot);
  const outPath = path.resolve(invocationRoot, cli.out);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateConfig(config);

  const defaultRuns = config.runs ?? 1;
  const cases = config.cases.map((testCase) => ({
    ...testCase,
    runs: testCase.runs ?? defaultRuns,
    trials: Array(testCase.runs ?? defaultRuns).fill(null),
  }));
  const runRoot = path.join(
    path.dirname(outPath),
    `${path.basename(outPath, path.extname(outPath))}.runs`,
    new Date().toISOString().replaceAll(':', '-')
  );
  const result = {
    name: config.name ?? 'agent-evaluation',
    startedAt: new Date().toISOString(),
    configPath,
    xrblocksRoot,
    session: config.session ?? {},
    agent: config.agent ?? {},
    judgeModel: config.judgeModel,
    cases,
  };
  const jobs = await Promise.all(
    cases.flatMap((testCase, caseIndex) =>
      testCase.trials.map(async (_, runIndex) => ({
        testCase,
        caseIndex,
        runIndex,
        appDir: await resolveSample(xrblocksRoot, testCase.sample),
      }))
    )
  );
  let nextJob = 0;
  let completedJobs = 0;
  let saveQueue = Promise.resolve();
  const save = () =>
    (saveQueue = saveQueue.then(() => writeResult(outPath, result)));

  await save();
  await Promise.all(
    Array.from({length: Math.min(cli.concurrency, jobs.length)}, async () => {
      while (!signal.aborted) {
        const job = jobs[nextJob++];
        if (!job) return;
        printStarted(job, completedJobs, jobs.length);
        const trial = await runTrial({
          ...job,
          session: config.session ?? {},
          agent: {...(config.agent ?? {}), ...(job.testCase.agent ?? {})},
          judgeModel: job.testCase.judgeModel ?? config.judgeModel,
          xrblocksRoot,
          runRoot,
          outPath,
          verbose: cli.verbose,
          signal,
        });
        job.testCase.trials[job.runIndex] = trial;
        completedJobs += 1;
        printFinished(job, trial, completedJobs, jobs.length);
        await save();
      }
    })
  );
  signal.throwIfAborted();
  result.completedAt = new Date().toISOString();
  await save();

  const summary = summarize(result);
  console.log('Case success:');
  for (const testCase of summary.cases) {
    console.log(
      `  ${testCase.name}: ${testCase.successfulRuns}/${testCase.requestedRuns} (${formatPercent(testCase.successRate)})`
    );
  }
  console.log(
    `Overall success: ${summary.successfulRuns}/${summary.requestedRuns} (${formatPercent(summary.successRate)})`
  );
  console.log(
    `Completion: ${summary.completedRuns}/${summary.requestedRuns} (${formatPercent(summary.completionRate)}); judged: ${summary.judgedRuns}; errors: ${summary.errors}`
  );
  console.log(`Result: ${outPath}`);
  return 0;
}

async function runTrial(options) {
  const run = options.runIndex + 1;
  const outDir = path.join(
    options.runRoot,
    `${String(options.caseIndex + 1).padStart(3, '0')}-${safeName(options.testCase.name)}`,
    `run-${String(run).padStart(3, '0')}`
  );
  const startedAt = Date.now();
  const label = `${options.testCase.name} run ${run}`;
  let session;
  try {
    if (options.verbose) printPhase(label, 'opening session');
    session = await XRBlocksSession.open({
      ...options.session,
      appDir: options.appDir,
      xrblocksRoot: options.xrblocksRoot,
      recordAgent: {outDir},
      signal: options.signal,
    });
    if (options.verbose) printPhase(label, 'running agent');
    const act = await session.act(options.testCase.action, {
      ...options.agent,
      signal: options.signal,
      onEvent: (event) => {
        if (options.verbose) printAgentEvent(label, event);
        else if (event.type === 'model_error') printModelError(label, event);
      },
    });
    await session.close();
    session = undefined;
    if (options.verbose) printPhase(label, 'judging trajectory');
    const judgment = await judgeTrajectory({
      requirement: options.testCase.judge,
      trajectory: act.trajectory,
      model: options.judgeModel,
      signal: options.signal,
    });
    return {
      run,
      durationMs: Date.now() - startedAt,
      act: {
        status: act.status,
        exit: act.exit,
        usage: act.usage,
        artifacts: relativeArtifacts(act.artifacts, options.outPath),
      },
      judgment,
      success: judgment.verdict === options.testCase.expectedVerdict,
    };
  } catch (error) {
    if (options.signal.aborted) throw error;
    return {
      run,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await session?.close();
  }
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return {help: true};
  const [config, ...args] = argv;
  if (!config || config.startsWith('-')) throw new Error(usage);
  const values = {config, concurrency: 1, verbose: false};
  for (let index = 0; index < args.length;) {
    const flag = args[index];
    if (flag === '--verbose') {
      values.verbose = true;
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} requires a value.\n${usage}`);
    if (flag === '--xrblocks-root') values.xrblocksRoot = value;
    else if (flag === '--out') values.out = value;
    else if (flag === '--concurrency')
      values.concurrency = positiveInteger(value, flag);
    else throw new Error(`Unknown option: ${flag}\n${usage}`);
    index += 2;
  }
  if (!values.xrblocksRoot || !values.out) throw new Error(usage);
  return values;
}

function validateConfig(config) {
  if (!isObject(config) || !Array.isArray(config.cases) || !config.cases.length)
    throw new Error('Experiment requires a non-empty cases array.');
  positiveInteger(config.runs ?? 1, 'runs');
  for (const [index, testCase] of config.cases.entries()) {
    if (!isObject(testCase))
      throw new Error(`Case ${index + 1} must be an object.`);
    for (const field of ['name', 'sample', 'action', 'judge']) {
      if (typeof testCase[field] !== 'string' || !testCase[field].trim())
        throw new Error(
          `Case ${index + 1} ${field} must be a non-empty string.`
        );
    }
    if (typeof testCase.expectedVerdict !== 'boolean')
      throw new Error(
        `Case ${index + 1} expectedVerdict must be true or false.`
      );
    if (testCase.runs !== undefined)
      positiveInteger(testCase.runs, `${testCase.name} runs`);
    if (testCase.agent !== undefined && !isObject(testCase.agent))
      throw new Error(`${testCase.name} agent must be an object.`);
  }
  if (config.agent !== undefined && !isObject(config.agent))
    throw new Error('agent must be an object.');
  if (config.session !== undefined && !isObject(config.session))
    throw new Error('session must be an object.');
}

async function resolveSample(root, sample) {
  const candidates = [sample, `samples/${sample}`, `templates/${sample}`].map(
    (candidate) => path.resolve(root, candidate)
  );
  const matches = [];
  for (const candidate of new Set(candidates)) {
    if (
      (
        await stat(path.join(candidate, 'index.html')).catch(() => null)
      )?.isFile()
    )
      matches.push(candidate);
  }
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`Sample not found: ${sample}`);
  throw new Error(
    `Sample is ambiguous: ${sample}. Include samples/ or templates/.`
  );
}

async function writeResult(outPath, result) {
  const output = {...result, summary: summarize(result)};
  const temporaryPath = `${outPath}.tmp`;
  await mkdir(path.dirname(outPath), {recursive: true});
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`);
  await rename(temporaryPath, outPath);
}

function summarize(result) {
  const cases = result.cases.map((testCase) => ({
    name: testCase.name,
    ...summarizeTrials(testCase.trials),
  }));
  const totals = cases.reduce(
    (summary, testCase) => ({
      requestedRuns: summary.requestedRuns + testCase.requestedRuns,
      completedRuns: summary.completedRuns + testCase.completedRuns,
      judgedRuns: summary.judgedRuns + testCase.judgedRuns,
      successfulRuns: summary.successfulRuns + testCase.successfulRuns,
      errors: summary.errors + testCase.errors,
    }),
    {
      requestedRuns: 0,
      completedRuns: 0,
      judgedRuns: 0,
      successfulRuns: 0,
      errors: 0,
    }
  );
  return {
    cases,
    ...totals,
    completionRate: totals.completedRuns / totals.requestedRuns,
    successRate: totals.successfulRuns / totals.requestedRuns,
  };
}

function summarizeTrials(trials) {
  const finished = trials.filter(Boolean);
  const successfulRuns = finished.filter((trial) => trial.success).length;
  return {
    requestedRuns: trials.length,
    completedRuns: finished.length,
    judgedRuns: finished.filter((trial) => trial.judgment).length,
    successfulRuns,
    successRate: successfulRuns / trials.length,
    errors: finished.filter((trial) => trial.error).length,
  };
}

function relativeArtifacts(artifacts, outPath) {
  if (!artifacts) return undefined;
  const root = path.dirname(outPath);
  return {
    trajectoryPath: path.relative(root, artifacts.trajectoryPath),
    imagePaths: artifacts.imagePaths.map((value) => path.relative(root, value)),
  };
}

function printStarted(job, completed, total) {
  console.log(
    `${progressBar(completed, total)} START ${job.testCase.name} (run ${job.runIndex + 1})`
  );
}

function printFinished(job, trial, completed, total) {
  const name = `${job.testCase.name} (run ${job.runIndex + 1})`;
  if (trial.error) {
    console.log(
      `${progressBar(completed, total)} ERROR ${name}: ${trial.error}`
    );
    return;
  }
  const status = trial.success ? 'MATCH' : 'MISMATCH';
  console.log(
    `${progressBar(completed, total)} ${status} ${name}: verdict=${trial.judgment.verdict}, expected=${job.testCase.expectedVerdict}`
  );
  console.log(`  Reason: ${trial.judgment.reason.replace(/\s+/g, ' ').trim()}`);
}

function printPhase(label, phase) {
  console.log(`  [${label}] ${phase}`);
}

function printAgentEvent(label, event) {
  const seconds = (Number(event.timestamp_ms ?? 0) / 1000).toFixed(1);
  const call = event.tool_call;
  const activity =
    event.type === 'observation'
      ? 'observation; waiting for model action'
      : event.type;
  const action = call?.name
    ? ` ${call.name} ${compactJson(call.args ?? {})}`
    : '';
  console.log(
    `  [${label}] ${seconds}s turn ${event.turn} ${activity}${action}`
  );
  if (event.type === 'model_error') printModelError(label, event);
}

function printModelError(label, event) {
  const error = event.result?.error ?? event.result;
  console.error(`  [${label}] model error:\n${String(error)}`);
}

function compactJson(value) {
  const json = JSON.stringify(value) ?? String(value);
  return json.length <= 240 ? json : `${json.slice(0, 237)}...`;
}

function progressBar(completed, total) {
  const width = 20;
  const filled = Math.round((completed / total) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${completed}/${total}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error(`${label} must be a positive integer.`);
  return number;
}

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
