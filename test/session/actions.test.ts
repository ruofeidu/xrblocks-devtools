import {describe, expect, it, vi} from 'vitest';
import type {XRBlocksSession} from '../../src/session/session.js';
import {
  agentActionDeclarations,
  executeAgentAction,
} from '../../src/session/actions.js';

describe('agent action interface', () => {
  it('routes text audio and tagged targets through Session', async () => {
    const injectAudio = vi.fn();
    const lookAtTarget = vi.fn();
    const session = {injectAudio, lookAtTarget} as unknown as XRBlocksSession;

    await executeAgentAction(session, 'say', {text: 'open the menu'});
    await executeAgentAction(session, 'look_at_target', {
      target: {tag: 'submit'},
    });

    expect(injectAudio).toHaveBeenCalledWith({text: 'open the menu'});
    expect(lookAtTarget).toHaveBeenCalledWith(
      {tag: 'submit'},
      {speedDegreesPerSecond: 90}
    );
  });

  it('publishes and enforces movement bounds', () => {
    const declarations = agentActionDeclarations();
    const look = declarations.find(({name}) => name === 'look_at_target');
    const reach = declarations.find(({name}) => name === 'reach_to_target');

    expect(look?.parameters.properties.speed_degrees_per_second).toMatchObject({
      minimum: 5,
      maximum: 180,
    });
    expect(reach?.parameters.properties.speed_meters_per_second).toMatchObject({
      minimum: 0.05,
      maximum: 1.5,
    });
    expect(() =>
      executeAgentAction({} as XRBlocksSession, 'look_at_target', {
        target: 'Target',
        speed_degrees_per_second: 181,
      })
    ).toThrow('between 5 and 180 degrees per second');
  });

  it('keeps low-level frame and control operations outside the model tools', () => {
    const names = agentActionDeclarations().map(({name}) => name);
    expect(names).not.toContain('step_frame');
    expect(names).not.toContain('step_control');
    expect(names).not.toContain('apply_control');
  });
});
