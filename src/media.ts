import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function writeDataUrl(filePath: string, dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const payload = match ? match[2] : dataUrl;
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, Buffer.from(payload, 'base64'));
}
