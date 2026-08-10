# Preview Modules

## Contents

- [Module contract](#module-contract)
- [Model previews](#model-previews)
- [UI previews](#ui-previews)
- [Commands and options](#commands-and-options)
- [Visual inspection](#visual-inspection)
- [Troubleshooting](#troubleshooting)

## Module contract

Supply a complete JavaScript or TypeScript ES module with a default sync or async function. The function receives a small browser-side preview context and returns exactly one root. Do not add objects to a scene or access the renderer.

Keep application code reusable by wrapping an existing browser-safe builder:

```ts
import {createThing} from '../src/create-thing.js';

export default function preview(context) {
  return createThing(context);
}
```

Use a file input when the preview has relative imports. Stdin source is materialized in a temporary directory, so its relative imports do not resolve from the original source location.

## Model previews

Receive `THREE`; return one `THREE.Object3D`:

```ts
export default function preview({THREE}) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({color: '#44aaff'})
  );
}
```

The model visualizer adds standard lighting, computes object bounds, fits a perspective camera, and renders the requested view preset.

View presets:

- `inspection-4`: front-left, front-right, top, and bottom.
- `turntable-4`: front, right, back, and left.
- `front`: one front view.

Use `inspection-4` to catch missing faces, bad scale, or asymmetric geometry. Use `turntable-4` for orientation and material continuity. Use `front` for a canonical presentation image.

## UI previews

Receive the public XR Blocks module as `xb`; return one `UICard` or `UIOverlay`:

The visualizer stages each `UICard` front-facing and fits it to the image.
`UIOverlay` uses its normal screen-space layout.

```ts
export default function preview({xb}) {
  return new xb.UIOverlay({
    style: {
      width: 500,
      height: 300,
      padding: 24,
      backgroundColor: '#182033',
    },
    children: [new xb.UIText({text: 'Ready'})],
  });
}
```

The UI visualizer mounts the root through XR Blocks, waits for UI validation to
be ready, captures the image, and reports validation issues as warnings. It
does not expose raw `@pmndrs/uikit`.

## Commands and options

Render a module file:

```bash
npx --no-install xrblocks-devtools visualize model ./previews/thing.preview.ts \
  -o ./artifacts/thing.png \
  --views inspection-4 \
  --size 1024x1024 \
  --bg '#f4f5f7'
```

Render module text from stdin:

```bash
cat ./previews/panel.preview.ts | \
  npx --no-install xrblocks-devtools visualize ui - \
  --xrblocks-root /path/to/xrblocks \
  -o ./artifacts/panel.png \
  --assets-dir ./previews
```

Options:

| Option                  | Meaning                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `-o, --out <path>`      | Required PNG output path. Parent directories are created.                |
| `--size <WxH>`          | Viewport size. Defaults to `1024x1024` for models and `1024x768` for UI. |
| `--bg <color>`          | CSS background color. Defaults to `#f4f5f7`.                             |
| `--views <preset>`      | Model preset: `inspection-4`, `turntable-4`, or `front`.                 |
| `--assets-dir <path>`   | Directory served under `/assets/`. Defaults to the module directory.     |
| `--xrblocks-root <dir>` | UI only: XR Blocks checkout or package root to preview.                  |

Load preview assets through `/assets/...` and point `--assets-dir` at their root.

## Visual inspection

Open every generated PNG; command success only proves that rendering completed.

For models, inspect:

- framing and clipping in every rendered view;
- intended scale and proportions;
- geometry completeness and orientation;
- material color, opacity, roughness, and lighting response;
- textures and external assets.

For UI, inspect:

- content hierarchy and alignment;
- padding, gaps, wrapping, and clipping;
- text content, size, contrast, and legibility;
- image loading and aspect ratio;
- transparent and opaque background behavior.

Compare against an explicit requirement or reference. Report the artifact path and the visual evidence supporting the conclusion.

## Troubleshooting

- **Empty model:** return the renderable object. Ensure it has computable geometry bounds.
- **Missing asset:** verify the `/assets/...` URL and `--assets-dir` root.
- **Broken relative import:** pass a module file instead of stdin.
- **Unexpected framing:** return one root only; remove helper geometry from that object.
- **UI never becomes ready:** check that the default function returns a public `UICard` or `UIOverlay` and that imported code is browser-safe.
- **Render command fails:** use the reported error before changing the preview contract.
