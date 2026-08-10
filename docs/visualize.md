# Visualize UI and Models

The visualizer renders one isolated browser module to a PNG. It does not start
a Session or application entry point.

## Preview contracts

A model preview receives `{THREE}` and returns one `THREE.Object3D`:

```js
export default ({THREE}) =>
  new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({color: '#44aaff'})
  );
```

A UI preview receives the public XR Blocks module as `{xb}` and returns one
`xb.UICard` or `xb.UIOverlay`:

```js
export default ({xb}) =>
  new xb.UICard({
    size: {width: 0.6, height: 0.35},
    children: [new xb.UIText({text: 'Ready'})],
  });
```

UICards are staged front-facing and fitted to 90% of the image. UIOverlays use
their normal screen-space layout. UI text and validation use the selected
public XR Blocks runtime without content rewriting or private UIKit imports.

Model previews default to `inspection-4`: front-left, front-right, rear-left,
and rear-right views at 45° elevation. Use `--views turntable-4` for four level
cardinal views or `--views front` for one image.

## Input and assets

Use a module file for relative imports. Use stdin for a self-contained preview:

```bash
cat ./panel.preview.ts | xrblocks-devtools visualize ui - \
  --xrblocks-root ../xrblocks \
  --assets-dir ./assets \
  -o ./artifacts/panel.png
```

Preview code loads assets through `/assets/...`. The `--assets-dir` directory is
the root of that route. Path traversal outside it is rejected.

## Evidence loop

1. Render the smallest root that answers the visual question.
2. Open the output PNG at full size.
3. Check framing, clipping, scale, geometry, materials, text, spacing, contrast,
   and assets that apply.
4. Read every UI validation warning.
5. Change the source and repeat until the latest inspected artifact shows the
   requested result.

Command success proves only that rendering completed. It does not prove that
the output is visually correct.

The complete option table is in the package [README](../README.md#visualize).
