import {describe, expect, it} from 'vitest';
import {commandHelp, parseCommand} from '../src/command-config.js';

describe('command configuration interface', () => {
  it.each([
    ['visualize', ['visualize', 'ui', '-', '-o', 'out.png', '--wat']],
    ['interact', ['interact', '--url', 'http://example.test', '--wat']],
    [
      'agent',
      ['agent', '--url', 'http://example.test', '--task', 'inspect', '--wat'],
    ],
  ])('rejects unknown %s flags', (_command, argv) => {
    expect(() => parseCommand(argv)).toThrow('Unknown');
  });

  it('derives Session configuration and consumes explicit negative values', () => {
    const command = parseCommand([
      'interact',
      '--url',
      'http://example.test',
      '--timeout-ms',
      '-1',
      '--record-video',
      'run.mp4',
      '--keep-raw-video',
      '--simulator-navmesh',
    ]);
    expect(command).toEqual({
      kind: 'interact',
      session: expect.objectContaining({
        url: 'http://example.test',
        headless: true,
        timeoutMs: -1,
        simulatorNavMesh: true,
        recordVideo: expect.objectContaining({
          out: 'run.mp4',
          keepRaw: true,
          trim: true,
        }),
      }),
    });
  });

  it('parses the thin agent adapter without artifacts', () => {
    expect(
      parseCommand([
        'agent',
        '--app-dir',
        './app',
        '--entry',
        'levels/banana/index.html',
        '--task',
        'delivery',
        '--observations',
        'image,tags',
      ])
    ).toEqual({
      kind: 'agent',
      session: expect.objectContaining({
        appDir: './app',
        entry: 'levels/banana/index.html',
      }),
      task: 'delivery',
      context: ['image', 'tags'],
      quiet: false,
      model: undefined,
      maxTurns: undefined,
      apiKey: undefined,
    });
  });

  it('generates help from the same definitions used for parsing', () => {
    expect(commandHelp('agent')).toContain('--task <text>');
  });

  it('keeps UI and model preview options separate', () => {
    expect(
      parseCommand([
        'visualize',
        'ui',
        '-',
        '-o',
        'panel.png',
        '--xrblocks-root',
        '../xrblocks',
      ])
    ).toEqual({
      kind: 'visualize',
      visualizeKind: 'ui',
      target: '-',
      out: 'panel.png',
      size: undefined,
      background: undefined,
      views: undefined,
      assetsDir: undefined,
      xrblocksRoot: '../xrblocks',
    });
    expect(() =>
      parseCommand([
        'visualize',
        'ui',
        '-',
        '-o',
        'panel.png',
        '--views',
        'front',
      ])
    ).toThrow('only available for model');
    expect(() =>
      parseCommand([
        'visualize',
        'model',
        'thing.ts',
        '-o',
        'thing.png',
        '--xrblocks-root',
        '../xrblocks',
      ])
    ).toThrow('only available for UI');
  });

  it('rejects duplicate flags and conflicting app inputs', () => {
    expect(() =>
      parseCommand([
        'interact',
        '--url',
        'http://one.test',
        '--url',
        'http://two.test',
      ])
    ).toThrow('only be provided once');
    expect(() =>
      parseCommand([
        'interact',
        '--url',
        'http://example.test',
        '--app-dir',
        './app',
      ])
    ).toThrow('not both');
  });
});
