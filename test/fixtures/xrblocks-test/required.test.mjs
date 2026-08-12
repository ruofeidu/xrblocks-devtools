import {expect, it} from '@xrblocks/devtools/test';

it('earns partial credit', {points: 60}, () => {
  expect(true).toBe(true);
});

it('gates the score', {points: 40, required: true}, () => {
  expect('ready').toBe('broken');
});
