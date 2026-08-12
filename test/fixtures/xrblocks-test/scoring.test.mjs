import {expect, it} from '@xrblocks/devtools/test';

it('passes', {points: 60}, () => {
  expect(2 + 2).toBe(4);
});

it('fails', {points: 40}, () => {
  expect(2 + 2).toBe(5);
});
