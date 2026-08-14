import {expect, it} from '@xrblocks/devtools/test';

it('earns partial credit', () => {
  expect(true).toBe(true);
});

it('gates the score', {required: true}, () => {
  expect('ready').toBe('broken');
});
