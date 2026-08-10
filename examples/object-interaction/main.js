import * as THREE from 'three';
import * as xb from 'xrblocks';

const DROP_DISTANCE = 0.28;
const CUBE_SIZE = 0.2;

class DraggableCube extends xb.MeshScript {
  constructor({name, tag, color, position, targetTag}) {
    super(
      new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.08,
      })
    );
    this.name = name;
    this.position.copy(position);
    this.castShadow = true;
    this.targetTag = targetTag;
    this.dropPending = false;
    this.xb = {manipulation: true};
    this.interactionState = {
      dragCount: 0,
      isDragging: false,
      lastAction: 'none',
      lastDrop: 'none',
      placed: false,
    };
    this.userData.xrblocksDevtools = {
      tag,
      state: this.interactionState,
    };
  }

  onObjectSelectStart(event) {
    this.material.emissiveIntensity = 0.55;
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    if (!this.interactionState.placed) this.material.emissiveIntensity = 0.08;
    event.stopPropagation();
  }

  onObjectTouchStart(event) {
    // Keep the default selection active. A pinch uses its direct-touch
    // capture to start automatic manipulation.
    this.material.emissiveIntensity = 0.55;
    event.stopPropagation();
  }

  onObjectTouchEnd(event) {
    if (!this.interactionState.placed) this.material.emissiveIntensity = 0.08;
    event.stopPropagation();
  }

  onObjectManipulate(event) {
    this.interactionState.lastAction = event.action;
    if (event.phase === 'start') {
      this.interactionState.dragCount += 1;
      this.interactionState.isDragging = true;
      this.interactionState.lastDrop = 'none';
      this.dropPending = false;
    } else if (event.phase === 'end') {
      this.interactionState.isDragging = false;
      this.dropPending = true;
    } else if (event.phase === 'cancel') {
      this.interactionState.isDragging = false;
      this.dropPending = false;
    }
    this.onStateChange?.();
    event.stopPropagation();
  }

  markPlaced(position) {
    this.position.copy(position);
    this.interactionState.placed = true;
    this.interactionState.lastDrop = 'correct';
    this.material.emissiveIntensity = 0.7;
    this.xb.manipulation = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

class DropTarget extends THREE.Mesh {
  constructor({name, tag, color, position}) {
    super(
      new THREE.RingGeometry(0.15, 0.24, 48),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    );
    this.name = name;
    this.position.copy(position);
    this.tag = tag;
    this.userData.xrblocksDevtools = {tag};
    this.xb = {pointerEvents: 'none'};
  }

  markComplete() {
    this.material.color.setHex(0x34d399);
    this.material.emissive.setHex(0x10b981);
    this.material.emissiveIntensity = 0.75;
  }
}

class ObjectInteractionDemo extends xb.Script {
  constructor() {
    super();
    this.name = 'Color sorting challenge';
    this.state = {
      success: false,
      placedCount: 0,
      totalCount: 2,
      lastResult: 'Move each cube to its matching target.',
    };
    this.userData.xrblocksDevtools = {
      tag: 'sorting-challenge',
      state: this.state,
    };

    this.targets = [
      new DropTarget({
        name: 'Red drop target',
        tag: 'red-target',
        color: 0xef4444,
        position: new THREE.Vector3(0.22, 1.55, -0.8),
      }),
      new DropTarget({
        name: 'Blue drop target',
        tag: 'blue-target',
        color: 0x3b82f6,
        position: new THREE.Vector3(0.22, 1.18, -0.8),
      }),
    ];
    this.cubes = [
      new DraggableCube({
        name: 'Red draggable cube',
        tag: 'red-cube',
        color: 0xef4444,
        position: new THREE.Vector3(-0.38, 1.55, -0.75),
        targetTag: 'red-target',
      }),
      new DraggableCube({
        name: 'Blue draggable cube',
        tag: 'blue-cube',
        color: 0x3b82f6,
        position: new THREE.Vector3(-0.38, 1.18, -0.75),
        targetTag: 'blue-target',
      }),
    ];
    for (const cube of this.cubes) {
      cube.onStateChange = () => updateHud(this);
    }
  }

  init() {
    const fill = new THREE.HemisphereLight(0xffffff, 0x3c4043, 3);
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(-1, 2, 1);
    this.add(...this.cubes, ...this.targets, fill, key);
    updateHud(this);
  }

  update() {
    for (const cube of this.cubes) {
      if (!cube.dropPending || cube.interactionState.placed) continue;
      cube.dropPending = false;

      const target = this.targets.find(
        (candidate) =>
          cube.position.distanceTo(candidate.position) <= DROP_DISTANCE
      );
      if (!target) {
        cube.interactionState.lastDrop = 'missed';
        this.state.lastResult = `${cube.name} missed a target.`;
      } else if (target.tag !== cube.targetTag) {
        cube.interactionState.lastDrop = 'wrong-target';
        this.state.lastResult = `${cube.name} does not match ${target.name}.`;
      } else {
        const snappedPosition = target.position.clone();
        snappedPosition.z += 0.05;
        cube.markPlaced(snappedPosition);
        target.markComplete();
        this.state.placedCount += 1;
        this.state.lastResult = `${cube.name} placed correctly.`;
      }

      this.state.success = this.state.placedCount === this.state.totalCount;
      if (this.state.success) {
        this.state.lastResult = 'Success: both cubes are correctly placed.';
      }
      updateHud(this);
    }
  }
}

function updateHud(demo) {
  const status = document.querySelector('#status');
  if (!status) return;
  status.textContent = demo.state.success
    ? `Success! ${demo.state.placedCount}/${demo.state.totalCount} cubes placed.`
    : `${demo.state.placedCount}/${demo.state.totalCount} placed · ${demo.state.lastResult}`;
}

const options = new xb.Options();
options.enableHands();
options.enableReticles();
options.hands.visualization = true;
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
options.setAppTitle('Color Sorting Challenge');
options.setAppDescription('Drag each colored cube to its matching target.');

xb.add(new ObjectInteractionDemo());
await xb.init(options);
