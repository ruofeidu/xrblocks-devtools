import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runTests} from '../dist/test/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(root, 'fixtures/xrblocks-test');
const appDir = path.join(fixtures, 'app');

test('scores ordinary tests by pass count', async (t) => {
  const {result, outputDir} = await run(t, 'scoring.test.mjs');

  assert.equal(result.status, 'valid');
  assert.equal(result.score, 50);
  assert.equal(result.passedTests, 1);
  assert.equal(result.totalTests, 2);
  assert.deepEqual(
    result.tests.map(({name, status}) => [name, status]),
    [
      ['passes', 'passed'],
      ['fails', 'failed'],
    ]
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outputDir, 'result.json'))).score,
    50
  );
});

test('imports source from the selected XR Blocks root', async (t) => {
  const xrblocksRoot = await makeSelectedRoot(t);
  const {result} = await run(t, 'source-import.test.mjs', {
    xrblocksRoot,
  });

  assert.equal(result.status, 'valid');
  assert.equal(result.passedTests, 1);
  assert.equal(result.totalTests, 1);
});

async function makeSelectedRoot(t) {
  const selectedRoot = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-root-'));
  t.after(() => rm(selectedRoot, {recursive: true, force: true}));
  await mkdir(path.join(selectedRoot, 'build'), {recursive: true});
  await mkdir(path.join(selectedRoot, 'src'), {recursive: true});
  await mkdir(path.join(selectedRoot, 'node_modules/three/build'), {
    recursive: true,
  });
  await Promise.all([
    writeFile(path.join(selectedRoot, 'build/xrblocks.js'), 'export {};\n'),
    writeFile(
      path.join(selectedRoot, 'src/selected-value.ts'),
      "import {selectedThreeValue} from 'three';\n" +
        'export const selectedValue = selectedThreeValue + 2;\n'
    ),
    writeFile(
      path.join(selectedRoot, 'node_modules/three/build/three.module.js'),
      'export const selectedThreeValue = 40;\n'
    ),
  ]);
  return selectedRoot;
}

test('gates the score when a required test fails', async (t) => {
  const {result} = await run(t, 'required.test.mjs');

  assert.equal(result.passedTests, 1);
  assert.equal(result.totalTests, 2);
  assert.equal(result.requiredGateFailed, true);
  assert.equal(result.score, 0);
});

test('counts hand variants as individual tests', async (t) => {
  const {result} = await run(t, 'variants.test.mjs');

  assert.equal(result.status, 'valid');
  assert.equal(result.passedTests, 2);
  assert.equal(result.totalTests, 2);
  assert.equal(result.score, 100);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].runs.length, 2);
});

test('provides the selected judge model to the test process', async (t) => {
  const {result} = await run(
    t,
    'judge-model.test.mjs',
    {},
    {
      judgeModel: 'gemini-from-command',
    }
  );

  assert.equal(result.status, 'valid');
  assert.equal(result.passedTests, 1);
});

test('reports unsupported scenarios as a test runner error', async (t) => {
  const {result} = await run(t, 'scenario.test.mjs');

  assert.equal(result.status, 'invalid');
  assert.equal(result.score, null);
  assert.equal(result.tests[0].runs[0].realTime, false);
  assert.match(result.errors[0].message, /Scenario manifests require/);
});

async function run(t, fixture, app = {}, options = {}) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-test-'));
  t.after(() => rm(outputDir, {recursive: true, force: true}));

  const result = await runTests({
    tests: path.join(fixtures, fixture),
    app: {appDir, ...app},
    outputDir,
    ...options,
  });
  return {result, outputDir};
}
