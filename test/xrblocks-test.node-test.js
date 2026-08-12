import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runTests} from '../dist/test/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(root, 'fixtures/xrblocks-test');
const appDir = path.join(fixtures, 'app');

test('adds points from ordinary tests', async (t) => {
  const {result, outputDir} = await run(t, 'scoring.test.mjs');

  assert.equal(result.status, 'valid');
  assert.equal(result.score, 60);
  assert.deepEqual(
    result.tests.map(({name, status}) => [name, status]),
    [
      ['passes', 'passed'],
      ['fails', 'failed'],
    ]
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outputDir, 'result.json'))).score,
    60
  );
});

test('gates earned points when a required test fails', async (t) => {
  const {result} = await run(t, 'required.test.mjs');

  assert.equal(result.earnedPoints, 60);
  assert.equal(result.requiredGateFailed, true);
  assert.equal(result.score, 0);
});

test('reports unsupported scenarios as a test runner error', async (t) => {
  const {result} = await run(t, 'scenario.test.mjs');

  assert.equal(result.status, 'invalid');
  assert.equal(result.score, null);
  assert.equal(result.tests[0].runs[0].realTime, false);
  assert.match(result.errors[0].message, /Scenario manifests require/);
});

async function run(t, fixture) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-test-'));
  t.after(() => rm(outputDir, {recursive: true, force: true}));

  const result = await runTests({
    tests: path.join(fixtures, fixture),
    app: {appDir},
    outputDir,
  });
  return {result, outputDir};
}
