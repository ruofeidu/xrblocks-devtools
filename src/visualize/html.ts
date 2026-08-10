import type {ViewPreset} from './types.js';

export function previewHtml(options: {
  width: number;
  height: number;
  background: string;
  views: ViewPreset;
}) {
  const bodyBackground =
    options.background === 'transparent' ? 'transparent' : options.background;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${bodyBackground}; }
      canvas { display: block; }
    </style>
    <script type="importmap">
      {
        "imports": {
          "three": "./runtime/three/build/three.module.js",
          "three/addons/": "./runtime/three/examples/jsm/",
          "three/examples/jsm/": "./runtime/three/examples/jsm/",
          "three/src/": "./runtime/three/src/"
        }
      }
    </script>
  </head>
  <body>
    <script>
      window.__xrblocksVisualizerConfig = ${JSON.stringify(options)};
    </script>
    <script type="module" src="./entry.js"></script>
  </body>
</html>`;
}
