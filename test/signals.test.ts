import {EventEmitter} from 'node:events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {installInterruptHandlers, type InterruptHost} from '../src/signals.js';

afterEach(() => {
  vi.useRealTimers();
});

function createHost() {
  const events = new EventEmitter();
  const writes: string[] = [];
  const exits: number[] = [];
  const host: InterruptHost = {
    stderr: {
      write(message) {
        writes.push(message);
      },
    },
    on: (signal, listener) => events.on(signal, listener),
    off: (signal, listener) => events.off(signal, listener),
    exit(code) {
      exits.push(code);
    },
  };
  return {events, exits, host, writes};
}

describe('interrupt handling', () => {
  it('aborts on the first signal and forces exit on the second', () => {
    const controller = new AbortController();
    const {events, exits, host, writes} = createHost();
    const removeHandlers = installInterruptHandlers(controller, {
      host,
      forceExitAfterMs: 1_000,
    });

    events.emit('SIGINT');

    expect(controller.signal.aborted).toBe(true);
    expect(host.exitCode).toBe(130);
    expect(exits).toEqual([]);
    expect(writes.join('')).toContain('shutting down');

    events.emit('SIGINT');
    expect(exits).toEqual([130]);
    removeHandlers();
  });

  it('forces exit when graceful shutdown exceeds the deadline', () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const {events, exits, host, writes} = createHost();
    const removeHandlers = installInterruptHandlers(controller, {
      host,
      forceExitAfterMs: 1_000,
    });

    events.emit('SIGTERM');
    vi.advanceTimersByTime(1_000);

    expect(host.exitCode).toBe(143);
    expect(exits).toEqual([143]);
    expect(writes.join('')).toContain('forcing exit');
    removeHandlers();
  });
});
