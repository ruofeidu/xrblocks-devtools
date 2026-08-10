import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {NormalizedPreviewInput, PreviewInput} from './types.js';

export async function normalizePreviewInput(
  input: PreviewInput,
  assetsDir?: string
): Promise<NormalizedPreviewInput> {
  if ('path' in input) {
    const modulePath = path.resolve(input.path);
    return {
      modulePath,
      assetsDir: path.resolve(assetsDir ?? path.dirname(modulePath)),
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-preview-'));
  const modulePath = path.join(tempDir, 'stdin.preview.ts');
  await writeFile(modulePath, input.source, 'utf8');
  return {
    modulePath,
    assetsDir: path.resolve(assetsDir ?? process.cwd()),
    cleanup: () => rm(tempDir, {recursive: true, force: true}),
  };
}
