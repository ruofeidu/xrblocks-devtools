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

- `semanticTree` contains the complete semantic hierarchy and exact names.
- `visibleObjects` contains the current visible semantic nodes and view data.
- `setOfMark` contains an annotated image and marks tied to semantic nodes.

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

`spatial` contains world pose and renderable bounds in meters. `view` contains
effective visibility, frustum membership, normalized screen bounds and
coverage, and camera distances in meters.

## Target forms

Embodied functions accept:

```js
lookAtTarget('Start Button'); // exact unique context or scene name
navigateTo([0, 1.5, -2]); // world position in meters
pointTo('right', {tag: 'start-button'});
```

A string resolves against the newest context snapshot first, then exact scene
object names. Duplicate names or tags are rejected. A tag is usually the most
stable application contract.

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
