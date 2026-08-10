import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const BALL_RADIUS = 0.08;
const BALLS_PER_SECOND = 30;
const VELOCITY_SCALE = 1;
const NUM_BALLS = 100;
const BALL_LIVE_DURATION_MS = 3000;
const BALL_DEFLATE_DURATION_MS = 200;
const BALL_COLORS = [
  0xff7a8a, 0xffc857, 0x63d7ff, 0xb995ff, 0x65e38c, 0xff9f5b,
];

class BallShooter extends xb.Script {
  constructor({
    numBalls = NUM_BALLS,
    radius = BALL_RADIUS,
    liveDuration = BALL_LIVE_DURATION_MS,
    deflateDuration = BALL_DEFLATE_DURATION_MS,
  } = {}) {
    super();
    this.liveDuration = liveDuration;
    this.deflateDuration = deflateDuration;
    this.geometry = new THREE.IcosahedronGeometry(radius, 3);
    this.spheres = [];
    this.spawnTimes = [];
    this.rigidBodies = [];
    this.colliders = [];
    this.colliderHandleToIndex = new Map();
    this.nextBall = 0;
    this.spawnCount = 0;
    this.viewSpacePosition = new THREE.Vector3();
    this.clipSpacePosition = new THREE.Vector3();
    this.projectedPosition = new THREE.Vector3();

    for (let i = 0; i < numBalls; i += 1) {
      const material = new THREE.MeshLambertMaterial({
        color: BALL_COLORS[i % BALL_COLORS.length],
        transparent: true,
      });
      const sphere = new THREE.Mesh(this.geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      sphere.userData.xrblocksDevtools = {tag: 'ball'};
      sphere.userData.ballId = i + 1;
      this.spheres.push(sphere);
      this.spawnTimes.push(0);
    }
  }

  initPhysics(physics) {
    this.RAPIER = physics.RAPIER;
    this.blendedWorld = physics.blendedWorld;
    this.colliderActiveEvents =
      physics.RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;
  }

  spawnBallAt(
    position,
    velocity = new THREE.Vector3(),
    now = performance.now()
  ) {
    const index = this.nextBall;
    const sphere = this.spheres[index];

    sphere.position.copy(position);
    sphere.scale.setScalar(1);
    sphere.material.opacity = 1;
    sphere.userData.ballId = ++this.spawnCount;
    this._createRigidBody(
      index,
      position,
      velocity,
      sphere.geometry.parameters.radius
    );
    this.spawnTimes[index] = now;
    this.nextBall = (index + 1) % this.spheres.length;
    this.add(sphere);
    return sphere;
  }

  _createRigidBody(index, position, velocity, radius) {
    if (this.rigidBodies[index] != null) {
      this.blendedWorld.removeRigidBody(this.rigidBodies[index]);
    }

    const body = this.blendedWorld.createRigidBody(
      this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setCcdEnabled(false)
    );
    const collider = this.blendedWorld.createCollider(
      this.RAPIER.ColliderDesc.ball(radius).setActiveEvents(
        this.colliderActiveEvents
      ),
      body
    );
    this.colliderHandleToIndex.set(collider.handle, index);
    this.rigidBodies[index] = body;
    this.colliders[index] = collider;
  }

  physicsStep(now = performance.now()) {
    for (let i = 0; i < this.spheres.length; i += 1) {
      const sphere = this.spheres[i];
      const body = this.rigidBodies[i];
      let spawnTime = this.spawnTimes[i];

      if (!this.isBallActive(i) || body == null) continue;

      let opacity = 1;
      const position = sphere.position.copy(body.translation());
      const viewMatrix = xb.depth?.enabled
        ? xb.depth.depthViewMatrices[0]
        : xb.core.camera.matrixWorldInverse;
      const projectionMatrix = xb.depth?.enabled
        ? xb.depth.depthProjectionMatrices[0]
        : xb.core.camera.projectionMatrix;

      const viewSpacePosition = this.viewSpacePosition
        .copy(position)
        .applyMatrix4(viewMatrix);
      const clipSpacePosition = this.clipSpacePosition
        .copy(viewSpacePosition)
        .applyMatrix4(projectionMatrix);
      const ballIsInView =
        -1 <= clipSpacePosition.x &&
        clipSpacePosition.x <= 1 &&
        -1 <= clipSpacePosition.y &&
        clipSpacePosition.y <= 1;

      if (ballIsInView && xb.depth?.enabled) {
        const projectedPosition =
          xb.depth.getProjectedDepthViewPositionFromWorldPosition(
            position,
            this.projectedPosition
          );
        const distanceBehindDepth = Math.max(
          projectedPosition.z - viewSpacePosition.z,
          0
        );
        if (distanceBehindDepth > 0.25) {
          const deflateAmount = Math.max(
            (distanceBehindDepth - 0.25) / 0.25,
            1
          );
          spawnTime = Math.min(
            spawnTime,
            now - this.liveDuration - this.deflateDuration * deflateAmount
          );
        }
      }

      if (now - spawnTime > this.liveDuration) {
        const timeSinceDeflateStarted = now - spawnTime - this.liveDuration;
        opacity =
          1 - Math.min(1, timeSinceDeflateStarted / this.deflateDuration);
      }

      sphere.material.opacity = opacity;
      if (opacity < 0.001) {
        this.removeBall(i);
      } else {
        sphere.position.copy(body.translation());
        sphere.quaternion.copy(body.rotation());
      }
    }
  }

  isBallActive(index) {
    return this.spheres[index].parent === this;
  }

  removeBall(index) {
    const sphere = this.spheres[index];
    sphere.material.opacity = 0;
    sphere.scale.setScalar(0);
    const body = this.rigidBodies[index];
    if (body != null) {
      this.blendedWorld.removeRigidBody(body);
      this.rigidBodies[index] = null;
      this.colliders[index] = null;
    }
    this.remove(sphere);
  }

  get activeBallCount() {
    return this.spheres.reduce(
      (count, sphere) => count + (sphere.parent === this ? 1 : 0),
      0
    );
  }

  dispose() {
    for (let i = 0; i < this.spheres.length; i += 1) {
      if (this.isBallActive(i)) this.removeBall(i);
      this.spheres[i].material.dispose();
    }
    this.geometry.dispose();
  }
}

class WorldBallsDemo extends xb.Script {
  constructor() {
    super();
    this.name = 'World Bouncing Balls Demo';
    this.userData.xrblocksDevtools = {tag: 'bouncing-balls'};
    this.ballsSpawned = 0;
    this.ballsInWorld = 0;
    this.pinches = 0;
    this.isPinching = false;
    this.lastSpawnedBallId = 0;
    this.lastBallCreatedTimeForController = new Map();
    this.velocity = new THREE.Vector3();
    this.ballShooter = new BallShooter();
    this.add(this.ballShooter);
  }

  init() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0, 500, -10);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    this.add(light);

    updateHud(this);
  }

  update() {
    super.update();
    let isPinching = false;
    for (const controller of xb.core.input.controllers) {
      if (controller.userData.selected) isPinching = true;
      this.controllerUpdate(controller);
    }
    this.isPinching = isPinching;
    this.ballsInWorld = this.ballShooter.activeBallCount;
    updateHud(this);
  }

  controllerUpdate(controller) {
    const now = performance.now();
    if (!this.lastBallCreatedTimeForController.has(controller)) {
      this.lastBallCreatedTimeForController.set(controller, -99);
    }

    if (
      controller.userData.selected &&
      now - this.lastBallCreatedTimeForController.get(controller) >=
        1000 / BALLS_PER_SECOND
    ) {
      // Match the SDK demo: spawn 8 cm in front of the controller and launch
      // along its local -Z direction.
      const position = new THREE.Vector3(0, 0, -0.08)
        .applyQuaternion(controller.quaternion)
        .add(controller.position);

      this.velocity.set(0, 0, -5 * VELOCITY_SCALE);
      this.velocity.applyQuaternion(controller.quaternion);

      const ball = this.ballShooter.spawnBallAt(position, this.velocity);
      this.pinches += 1;
      this.ballsSpawned += 1;
      this.lastSpawnedBallId = ball.userData.ballId;
      this.lastBallCreatedTimeForController.set(controller, now);
    }
  }

  dispose() {
    this.ballShooter.dispose();
  }
}

function updateHud(demo) {
  const count = document.querySelector('#ball-count');
  if (count) count.textContent = `${demo.ballsInWorld} balls in the world mesh`;
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.enableHands();
  options.enableReticles();

  // This is the SDK ballpit configuration: captured depth becomes a fixed
  // Rapier collider, with no rendered virtual pit or container.
  options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
  options.depth.depthMesh.colliderUpdateFps = 5;
  options.depth.matchDepthView = false;
  options.physics.RAPIER = RAPIER;
  options.controllers.performRaycastOnUpdate = false;
  options.controllers.visualizeRays = true;
  options.setAppTitle('Bouncing Balls');
  options.setAppDescription(
    'Pinch to launch balls that bounce on the world mesh.'
  );

  xb.add(new WorldBallsDemo());
  xb.init(options);
});
