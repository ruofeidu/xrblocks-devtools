---
name: visualize-xrblocks
description: Render and visually inspect isolated XR Blocks models or public XR Blocks UI roots with the xrblocks-devtools visualizer. Use when creating or extracting a Preview Module, checking appearance, framing, scale, materials, layout, assets, backgrounds, or comparing model views in a generated PNG.
---

# Visualize XR Blocks

Use a preview as a tight visual loop for one model or UI element. Render a static PNG, inspect the image itself, adjust the source, and repeat.

Read [references/preview-modules.md](references/preview-modules.md) when creating a Preview Module, choosing model/UI options, loading assets, or diagnosing a failed render.

## Visual loop

1. Identify the smallest browser-safe builder that produces the model or UI under review. Reuse it through a thin Preview Module instead of copying its implementation.
2. Choose `visualize model` for one Three.js object or `visualize ui` for one `UICard` or `UIOverlay`. Render to a deliberate artifact path with the view, size, and background needed for the question.
3. Open the generated PNG at full size. Inspect composition, clipping, scale, geometry, materials, text, spacing, contrast, and asset loading as applicable.
4. Change the source or wrapper and render again. Keep the artifact that demonstrates the final result.

Finish only when the latest PNG has been visually inspected and the requested appearance is visible in that artifact.

## Scope boundary

Use this skill when an isolated still image can answer the question. Use `interact-with-xrblocks` when correctness depends on the full app lifecycle, XR Blocks components, controller or voice input, movement, runtime state, visibility changes, or integration between elements.

## Minimal commands

```bash
npx --no-install xrblocks-devtools visualize model ./previews/thing.preview.ts \
  -o ./artifacts/thing.png

npx --no-install xrblocks-devtools visualize ui ./previews/panel.preview.ts \
  -o ./artifacts/panel.png
```

The visualizer frames returned content automatically. Prefer `inspection-4` for shape review, `turntable-4` for side-by-side rotation, and `front` when one presentation view is the contract.
