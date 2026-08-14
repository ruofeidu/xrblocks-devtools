import {expect, it_session} from '@xrblocks/devtools/test';

it_session(
  'opens the app for each primary hand',
  {
    switchHands: true,
    video: 'hand-session',
    realTime: true,
  },
  async (session, {primaryHand, secondaryHand}) => {
    expect(primaryHand).not.toBe(secondaryHand);
    expect(await session.getCamera()).toBeTypeOf('object');
    await session.stepFrame(2);
  }
);
