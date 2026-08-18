# Use Scene Context with Embodied Actions

Scene context describes what the application exposes semantically. Devtools
metadata describes stable application-specific targets and state. Use either as
evidence, then pass an exact target to an embodied action.

## Scene context products

```js
await getSceneContext({
  semanticTree: true,
  visibleObjects: true,
  setOfMark: true,
});
```

- `semanticTree` contains the complete semantic hierarchy, live node IDs, and exact names.
- `visibleObjects` contains the current visible semantic nodes, live IDs, and view data.
- `setOfMark` contains an annotated image and marks tied to semantic node IDs.

Calling `saveSetOfMark('./artifacts/marks.png')` writes the image and returns its
metadata. Refresh context after an action because visibility and intersections
can change.

## Developer metadata

Declare metadata on any Three.js object:

```js
startButton.userData.xrblocksDevtools = {
  tag: 'start-button',
  state: {
    enabled: true,
    pressed: false,
  },
};
```

Devtools reads only `userData.xrblocksDevtools`. `state` must be finite,
cycle-free JSON data. Getters are evaluated when context is captured.

```js
findByTag('start-button');
inspect({tag: 'start-button'});
getDevtoolsContext({tags: true, state: true, spatial: true, view: true});
```

You can also dynamically spawn objects into the simulator environment with Devtools tags and state. Objects configured with `detectObject: true` and `label` are automatically read into the XR Blocks `objects` module for object detection simulations:

```js
addSimulatorObjects([
  {
    tag: 'target-ball',
    assetPath: './assets/ball.glb',
    detectObject: true,
    label: 'Ball',
    position: [0, 1.2, -1],
    physics: 'dynamic',
  },
]);
```

`spatial` contains world pose and renderable bounds in meters. `view` contains
effective visibility, frustum membership, normalized screen bounds and
coverage, and camera distances in meters.

## Target forms

Embodied functions accept:

```js
pointTo('right', 'ctx_1'); // live ID from the current context snapshot
lookAtTarget('Start Button'); // exact unique context or scene name
navigateTo([0, 1.5, -2]); // world position in meters
pointTo('right', {tag: 'start-button'});
```

A string resolves as a live context ID first, then against names in the newest
context snapshot, then exact scene object names. Duplicate names or tags are
rejected. Refresh context before reusing an ID after an action. A tag is
usually the most stable application contract.

## Complete flow

```js
await getDevtoolsContext({state: true, view: true});
lookAtTarget({tag: 'start-button'});
pointTo('right', {tag: 'start-button'});
click('right');
stepFrame(2);
await getDevtoolsContext({state: true, view: true});
saveScreenshot('./artifacts/start-after.png');
```

Compare the declared state and visual evidence. Movement completion alone is
not an application assertion.
