import path from 'node:path';
import os from 'node:os';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {
  mergeActionSegments,
  normalizeVideoRecordingOptions,
  SessionVideoRecorder,
  shiftActionWindows,
} from '../../src/session/video.js';

describe('video recording helpers', () => {
  it.each([
    {
      name: 'action-window trimming',
      input: {out: 'artifacts/run.mp4'},
      expected: {
        out: path.resolve('artifacts/run.mp4'),
        timelineOut: path.resolve('artifacts/run.timeline.json'),
        trim: true,
        fromSceneReady: false,
        keepRaw: false,
        paddingMs: 500,
      },
    },
    {
      name: 'untrimmed WebM output',
      input: {out: 'artifacts/run.mp4', trim: false},
      expected: {
        out: path.resolve('artifacts/run.webm'),
        timelineOut: path.resolve('artifacts/run.timeline.json'),
        trim: false,
      },
    },
    {
      name: 'scene-ready MP4 output',
      input: {out: 'artifacts/run.mp4', fromSceneReady: true},
      expected: {
        out: path.resolve('artifacts/run.mp4'),
        trim: false,
        fromSceneReady: true,
        paddingMs: 0,
      },
    },
  ])('normalizes $name', ({input, expected}) => {
    expect(normalizeVideoRecordingOptions(input)).toMatchObject(expected);
  });

  it('merges padded action windows and aligns them to scene readiness', () => {
    expect(
      mergeActionSegments(
        [
          {name: 'stepControl', startMs: 1000, endMs: 1400},
          {name: 'click', startMs: 1500, endMs: 1600},
          {name: 'stepControl', startMs: 3000, endMs: 3300},
        ],
        250
      )
    ).toEqual([
      {startMs: 750, endMs: 1850},
      {startMs: 2750, endMs: 3550},
    ]);
    expect(
      shiftActionWindows([{name: 'reachTo', startMs: 1750, endMs: 2250}], 1500)
    ).toEqual([{name: 'reachTo', startMs: 250, endMs: 750}]);
  });

  it('timestamps actions from the Playwright video start', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-video-'));
    try {
      const rawVideoPath = path.join(tempDir, 'playwright.webm');
      await writeFile(rawVideoPath, 'raw-video');
      let now = 1000;
      const recorder = await SessionVideoRecorder.create(
        {out: path.join(tempDir, 'recording.webm'), trim: false},
        () => now
      );
      if (!recorder) throw new Error('Expected recorder to be created.');

      now = 5000;
      recorder.markVideoStarted();
      now = 5050;
      recorder.markSceneReady();
      now = 5100;
      await recorder.recordAction('click', {}, async () => {
        now = 5300;
      });

      const timeline = await recorder.finish(rawVideoPath);

      expect(timeline?.actions).toEqual([
        {name: 'click', startMs: 100, endMs: 300, metadata: {}},
      ]);
      expect(timeline?.sceneReadyOffsetMs).toBe(50);
    } finally {
      await rm(tempDir, {recursive: true, force: true});
    }
  });

  it('fails clearly when a scene-ready MP4 cannot be created', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-video-'));
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '';
      const rawVideoPath = path.join(tempDir, 'playwright.webm');
      await writeFile(rawVideoPath, 'raw-video');
      const recorder = await SessionVideoRecorder.create({
        out: path.join(tempDir, 'recording.mp4'),
        fromSceneReady: true,
      });
      if (!recorder) throw new Error('Expected recorder to be created.');

      await expect(recorder.finish(rawVideoPath)).rejects.toThrow(
        'ffmpeg is required'
      );
      await expect(stat(recorder.rawDir)).rejects.toThrow();
    } finally {
      process.env.PATH = originalPath;
      await rm(tempDir, {recursive: true, force: true});
    }
  });

  it('keeps raw video and timeline when ffmpeg trimming fails', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-video-'));
    const originalPath = process.env.PATH;
    try {
      const binDir = path.join(tempDir, 'bin');
      await mkdir(binDir);
      const ffmpegPath = path.join(binDir, 'ffmpeg');
      await writeFile(ffmpegPath, '#!/bin/sh\nexit 42\n');
      await chmod(ffmpegPath, 0o755);
      process.env.PATH = binDir;

      const rawVideoPath = path.join(tempDir, 'playwright.webm');
      await writeFile(rawVideoPath, 'raw-video');
      let now = 1000;
      const recorder = await SessionVideoRecorder.create(
        {out: path.join(tempDir, 'trimmed.mp4'), paddingMs: 0},
        () => now
      );
      if (!recorder) throw new Error('Expected recorder to be created.');

      await recorder.recordAction('click', {}, async () => {
        now = 1200;
      });

      const timeline = await recorder.finish(rawVideoPath);

      expect(timeline).toMatchObject({
        rawVideoPath: path.join(tempDir, 'trimmed.raw.webm'),
        outputVideoPath: path.join(tempDir, 'trimmed.mp4'),
        trimmed: false,
      });
      expect(timeline?.trimSkippedReason).toContain('ffmpeg trim failed');
      await expect(
        readFile(path.join(tempDir, 'trimmed.raw.webm'), 'utf8')
      ).resolves.toBe('raw-video');
      await expect(stat(recorder.rawDir)).rejects.toThrow();
    } finally {
      process.env.PATH = originalPath;
      await rm(tempDir, {recursive: true, force: true});
    }
  });

  it('preserves raw video without trimming after interruption', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xrblocks-video-'));
    try {
      const rawVideoPath = path.join(tempDir, 'playwright.webm');
      await writeFile(rawVideoPath, 'raw-video');
      const recorder = await SessionVideoRecorder.create({
        out: path.join(tempDir, 'trimmed.mp4'),
      });
      if (!recorder) throw new Error('Expected recorder to be created.');
      const controller = new AbortController();
      controller.abort();

      const timeline = await recorder.finish(rawVideoPath, controller.signal);

      expect(timeline).toMatchObject({
        rawVideoPath: path.join(tempDir, 'trimmed.raw.webm'),
        trimmed: false,
        trimSkippedReason: 'session interrupted',
      });
      await expect(
        readFile(path.join(tempDir, 'trimmed.raw.webm'), 'utf8')
      ).resolves.toBe('raw-video');
    } finally {
      await rm(tempDir, {recursive: true, force: true});
    }
  });
});
