import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {injectedHarnessSource} from '../../src/session/injected-source.js';

type InjectedWindow = {
  xb?: {core: unknown};
  xbReady?: Promise<void>;
  __xrblocksDevtoolsRuntime?: {
    findObjectsByTag(tag: string): Array<{id: string; tag?: string}>;
    inspectObject(input: {target: {tag: string}}): {
      tag?: string;
      state?: Record<string, unknown>;
      spatial?: {bounds: unknown};
      view?: {inFrustum: boolean};
    };
    getDevtoolsContext(options: object): {
      tags?: Array<Record<string, unknown>>;
      state?: Array<Record<string, unknown>>;
      spatial?: Array<Record<string, unknown>>;
    };
    navigateTo(target: [number, number, number]): Promise<unknown>;
    init(options?: object): Promise<unknown>;
  };
};

async function installHarness(window: InjectedWindow) {
  runInNewContext(await injectedHarnessSource(), {
    window,
    location: {href: 'http://example.test/?debug=1&xrAutomation=1'},
    performance,
    setTimeout,
    clearTimeout,
  });
  return window.__xrblocksDevtoolsRuntime!;
}

function testWindow(
  scene: THREE.Scene,
  camera = new THREE.PerspectiveCamera()
) {
  camera.position.set(0, 0, 4);
  camera.updateMatrixWorld(true);
  return {
    xb: {
      core: {
        scene,
        camera,
        simulatorRunning: true,
        simulator: {options: {}},
      },
    },
    xbReady: Promise.resolve(),
  } satisfies InjectedWindow;
}

describe('injected Devtools runtime', () => {
  it('finds explicit tags and inspects declared state and spatial data', async () => {
    const scene = new THREE.Scene();
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    target.name = 'Delivery box';
    target.userData.xrblocksDevtools = {
      tag: 'delivery-box',
      state: {delivered: false, score: 2},
    };
    scene.add(target);
    const runtime = await installHarness(testWindow(scene));

    expect(runtime.findObjectsByTag('delivery-box')).toEqual([
      expect.objectContaining({id: target.uuid, tag: 'delivery-box'}),
    ]);
    expect(
      runtime.inspectObject({target: {tag: 'delivery-box'}})
    ).toMatchObject({
      tag: 'delivery-box',
      state: {delivered: false, score: 2},
    });
    expect(runtime.getDevtoolsContext({state: true, spatial: true})).toEqual({
      state: [
        expect.objectContaining({
          state: {delivered: false, score: 2},
        }),
      ],
      spatial: [
        expect.objectContaining({
          spatial: expect.objectContaining({hasRenderableContent: true}),
        }),
      ],
    });
    expect(runtime.getDevtoolsContext({tags: false, state: true})).toEqual({
      state: [expect.not.objectContaining({tag: expect.anything()})],
    });
  });

  it('requests all selected XR Blocks context products in one detection', async () => {
    const window = testWindow(new THREE.Scene());
    const calls: object[] = [];
    (window.xb!.core as {context?: unknown}).context = {
      scene: {
        async runContextDetection(options: object) {
          calls.push(options);
          return {semanticTree: {}, visibleObjects: {}, setOfMark: {}};
        },
      },
    };
    const runtime = await installHarness(window);

    await expect(
      runtime.observe('getSceneContext', {
        semanticTree: true,
        visibleObjects: true,
        setOfMark: true,
      })
    ).resolves.toEqual({semanticTree: {}, visibleObjects: {}, setOfMark: {}});
    expect(calls).toEqual([
      {semanticTree: true, visibleObjects: true, setOfMark: true},
    ]);
  });

  it('navigates through the XR Blocks simulator', async () => {
    const window = testWindow(new THREE.Scene());
    const core = window.xb!.core as {
      simulator: {moveUser: (position: THREE.Vector3) => void};
      stepFrame: () => void;
    };
    let destination: THREE.Vector3 | undefined;
    core.simulator.moveUser = (position) => {
      destination = position.clone();
    };
    let frames = 0;
    core.stepFrame = () => {
      frames += 1;
    };
    const runtime = await installHarness(window);

    await expect(runtime.navigateTo([2, 0, -3])).resolves.toEqual({
      completed: true,
      position: [0, 0, 4],
      constrained: false,
    });
    expect(destination?.toArray()).toEqual([2, 0, -3]);
    expect(frames).toBe(1);
  });

  it('enables the active environment navmesh before navigation', async () => {
    const window = testWindow(new THREE.Scene());
    const simulator = (window.xb!.core as {simulator: Record<string, unknown>})
      .simulator;
    const setEnvironment = vi.fn(async () => {
      simulator.userMovementConstrained = true;
    });
    simulator.options = {navMesh: {enabled: false}};
    simulator.activeEnvironment = {manifestPath: '/room.json'};
    simulator.userMovementConstrained = false;
    simulator.setEnvironment = setEnvironment;
    const runtime = await installHarness(window);

    await runtime.init({simulatorNavMesh: true});

    expect(simulator.options).toEqual({navMesh: {enabled: true}});
    expect(setEnvironment).toHaveBeenCalledWith('/room.json');
  });
});
