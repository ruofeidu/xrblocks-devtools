import {expect, it} from '@xrblocks/devtools/test';

it('passes', () => {
  expect(2 + 2).toBe(4);
});

it('fails', () => {
  expect(2 + 2).toBe(5);
});
