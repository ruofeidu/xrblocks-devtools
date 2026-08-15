# XR Blocks Devtools

Standalone tools for previewing, running, observing, and controlling XR
Blocks applications. Designed to support agentic coding and testing.

## Install

### Install from npm

Install Devtools in the XR Blocks application that will use it:

```bash
npm install --save-dev @xrblocks/devtools
npx playwright install chromium
```

Run the local CLI through `npx`:

```bash
npx xrblocks-devtools help
```

The package exposes the `xrblocks-devtools` CLI.

Install the XR Blocks v0.20 runtime peers in the application, or pass
`--xrblocks-root` when working against a source checkout:

```bash
npm install xrblocks three @pmndrs/uikit @preact/signals-core lit
```

The following are optional dependencies that add additional functionality to XR Blocks Devtools.

```bash
npm install --save-dev @google/genai # session.act() and the agent command
npm install --save-dev tiny-tts      # injectAudio({text})
npm install --save-dev three-pathfinding # --simulator-navmesh
```

### Optional FFmpeg installation

FFmpeg is required to make trimmed down MP4 recordings that remove any non-action pauses:

```bash
# macOS
brew install ffmpeg

# Debian or Ubuntu
sudo apt-get install ffmpeg
```

On other systems, install an FFmpeg distribution and make sure the `ffmpeg`
executable is on `PATH`. Confirm the installation with:

```bash
ffmpeg -version
```

Without FFmpeg, recording still works, but Devtools preserves the complete raw
WebM instead of producing a trimmed MP4.

### Install from source

To develop Devtools itself using its pinned XR Blocks dependency:

```bash
npm ci
npm run link:cli
npx playwright install chromium
```

`link:cli` builds the project and makes `xrblocks-devtools` available through
npm's global link mechanism.

To develop against a sibling XR Blocks source checkout instead, prepare and
link that checkout before linking the CLI:

```bash
npm run setup:local
npm run link:cli
```

### Import from code

Import `XRBlocksSession` from the package root:

```ts
import {XRBlocksSession} from '@xrblocks/devtools';

const session = await XRBlocksSession.open({
  appDir: './app',
  headless: true,
});

try {
  const camera = await session.getCamera();
  await session.pointTo('right', {tag: 'start-button'});
  await session.click('right');
  const state = await session.getDevtoolsContext({state: true});
  console.log({camera, state});
} finally {
  await session.close();
}
```

Always close the session in `finally`. This releases Chromium, the local
server, recordings, and temporary workspace files. See [Session API](#session-api)
for configuration and targeting details.

## Documentation

- [Usage examples](docs/example.md) provides complete CLI, Interact, Session,
  and Agent examples.
- [Visualize UI and Models](docs/visualize.md) defines preview modules, assets,
  views, and render verification.
- [Test Applications Interactively](docs/interactive.md) covers observation,
  movement, input, audio, and recording.
- [Use Scene Context with Embodied Actions](docs/scene-context.md) explains
  targeting, developer metadata, and state verification.

## CLI

Use `xrblocks-devtools help <command>` to read help generated from the same
definitions as the parser.

### Visualize

```text
xrblocks-devtools visualize <ui|model> <module|-> -o <out.png> [options]
```

| Flag                    | Value and behavior                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `-o`, `--out <path>`    | Required PNG output path. Parent directories are created.                                               |
| `--size <WxH>`          | Output pixels. Defaults: UI `1024x768`; model `1024x1024`.                                              |
| `--bg <color>`          | CSS background color or `transparent`. Default `#f4f5f7`.                                               |
| `--views <preset>`      | Model only: `inspection-4` (default), `turntable-4`, or `front`.                                        |
| `--assets-dir <dir>`    | Files available below `/assets/`. Defaults to the module directory, or the current directory for stdin. |
| `--xrblocks-root <dir>` | UI only: XR Blocks package or checkout used for the preview.                                            |
| `-h`, `--help`          | Show command help.                                                                                      |

Use `-` as the module to read TypeScript source from stdin. A UI module receives
`{xb}` and returns exactly one public `xb.UICard` or `xb.UIOverlay`. A model
module receives `{THREE}` and returns exactly one `THREE.Object3D`.

```js
export default function preview({xb}) {
  return new xb.UIOverlay({
    children: [new xb.UIText({text: 'Ready'})],
  });
}
```

The result is `{out, warnings}`. UI warnings also print to stderr. See
[docs/visualize.md](docs/visualize.md).

### Interact

```text
xrblocks-devtools interact (--app-dir <dir> | --url <url>) [options]
```

| Flag                                 | Value and behavior                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `--app-dir <dir>`                    | Copy and serve one browser-runnable application directory. Exactly one of `--app-dir` and `--url` is required. |
| `--url <url>`                        | Attach to an application that is already served.                                                               |
| `--xrblocks-root <dir>`              | App-directory only: XR Blocks package or checkout used by the copied workspace.                                |
| `--entry <path>`                     | App-directory only: HTML page inside the copied app. Default `index.html`.                                     |
| `--headed`                           | Show Chromium. Sessions are headless by default.                                                               |
| `--monitor-audio`                    | Play injected microphone audio through Chromium output. Default false.                                         |
| `--no-realtime`                      | Disable real-time embodied-control pacing. Real-time pacing is enabled by default.                             |
| `--simulator-reach-limit`            | Enforce the simulator hand-reach radius.                                                                       |
| `--simulator-navmesh`                | Reload the active simulator environment with its navmesh enabled, then constrain `navigateTo()`.               |
| `--embodied-control-import <module>` | Browser-loadable module specifier or URL for the embodied-control addon. Useful for URL sessions.              |
| `--timeout-ms <ms>`                  | Browser startup and operation timeout. Default `30000`.                                                        |
| `--record-video <path>`              | Record action windows. Trimming targets MP4 when ffmpeg is available.                                          |
| `--record-video-timeline <path>`     | Timeline JSON path. Default `<video-name>.timeline.json`.                                                      |
| `--record-video-padding-ms <ms>`     | Time retained before and after actions. Default `500`.                                                         |
| `--keep-raw-video`                   | Preserve Playwright's raw WebM after successful trimming.                                                      |
| `--no-trim-video`                    | Keep the complete WebM. A non-WebM output name is changed to `.webm`.                                          |
| `--env-file <path>`                  | Load variables from one optional environment file.                                                             |
| `-h`, `--help`                       | Show flags and REPL functions.                                                                                 |

The prompt is a JavaScript REPL. Call functions directly; returned promises are
awaited automatically:

```js
getSimulatorState();
getSceneContext({semanticTree: true, visibleObjects: true});
pointTo('right', 'Start Button');
click('right');
saveScreenshot('./artifacts/after.png');
```

Exit with `.exit` or Ctrl-D. Exit always closes Chromium, finalizes recording,
stops the local server, and removes the copied workspace.

### Agent

```text
xrblocks-devtools agent (--app-dir <dir> | --url <url>) --task <text> [options]
```

The agent command accepts all Interact session and recording flags plus:

| Flag                     | Value and behavior                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `--task <text>`          | Required natural-language task.                                                                                     |
| `--model <model>`        | Gemini model. Default `gemini-3.6-flash`.                                                                           |
| `--max-turns <count>`    | Positive model-turn limit. Default `30`.                                                                            |
| `--api-key <key>`        | Override `GEMINI_API_KEY`. Prefer the environment variable.                                                         |
| `--observations <kinds>` | Comma-separated `image`, `semantic-tree`, `visible`, `som`, `tags`, `state`, `spatial`, and/or `view`. Default all. |
| `--quiet`                | Suppress progress events on stderr.                                                                                 |
| `-h`, `--help`           | Show command help.                                                                                                  |

For `interact`, `agent`, and `test`, the CLI loads the first available environment file:
an explicit `--env-file`, `<app-dir>/.env`, or `./.env`. A missing file is not
an error. Existing shell variables take priority over file values, and
`--api-key` takes priority over `GEMINI_API_KEY`. Only `agent` requires the key
before opening Chromium; `interact` can start without it.

### Test

Write ordinary and session tests with the package test export:

```ts
import {expect, it, it_session} from '@xrblocks/devtools/test';

it('publishes a texture', () => {
  expect(createTexture()).toBeDefined();
});

it_session(
  'selects with either hand',
  {switchHands: true, video: 'selection'},
  async (session, {primaryHand}) => {
    await session.click(primaryHand);
  }
);
```

When `--xrblocks-root` is set, ordinary tests can import the selected source
tree through `@xrblocks/source`:

```ts
import {DepthTextures} from '@xrblocks/source/depth/DepthTextures.ts';
import {DepthOptions} from '@xrblocks/source/depth/DepthOptions.ts';
import {expect, it} from '@xrblocks/devtools/test';

it('publishes CPU depth data', () => {
  const options = new DepthOptions({usagePreference: ['cpu-optimized']});
  const textures = new DepthTextures(options);
  expect(textures.depthData).toEqual([]);
});
```

Use ordinary tests for isolated behavior. Use session tests when the behavior
must run through an application or the XR simulator. A bare `three` import uses
the selected checkout's Three.js dependency so the test and source share their
class identities.

Use `judge` for a structured AI evaluation of text or image evidence:

```ts
import {judge} from '@xrblocks/devtools/test';

const result = await judge<{passes: boolean; reason: string}>({
  prompt: 'Does the image show a clearly visible red cube?',
  input: {image: screenshotDataUrl},
  schema: {
    type: 'object',
    properties: {
      passes: {type: 'boolean'},
      reason: {type: 'string'},
    },
    required: ['passes', 'reason'],
  },
});

if (result.status === 'completed') expect(result.output.passes).toBe(true);
```

The judge uses an internal system instruction and deterministic Gemini output.
It returns `skipped` without failing the test when `GEMINI_API_KEY` or the
optional `@google/genai` package is missing. Other request and response errors
fail normally.

Run one test file against one prepared application:

```text
xrblocks-devtools test tests/evaluation.ts --app ./app [options]
```

| Flag                    | Value and behavior                                                 |
| ----------------------- | ------------------------------------------------------------------ |
| `--app <dir>`           | Required browser-runnable application directory.                   |
| `--xrblocks-root <dir>` | XR Blocks checkout used by the application and `@xrblocks/source`. |
| `--entry <path>`        | HTML page inside the application. Default `index.html`.            |
| `--output <dir>`        | Result and recordings. Default `artifacts/xrblocks-test`.          |
| `--timeout-ms <ms>`     | Browser startup timeout for session tests.                         |
| `--env-file <path>`     | Load variables from one optional environment file.                 |
| `-h`, `--help`          | Show command help.                                                 |

Each test run contributes equally to the score. Hand and scenario variants count
as separate test runs. Set `required: true` to make any failed variant set the
score to `0`. Session tests receive the complete `XRBlocksSession`. `realTime`
defaults to `false`. A session test records video only when its options include a
simple `video` name.

## Interactive function reference

Targets are an exact unique scene/context name, a world position `[x, y, z]` in
meters, or `{tag: 'name'}`. `left` and `right` select physical hands.

### Observe and save evidence

| Function                         | Result or effect                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `getCamera(options?)`            | Camera world position in meters and `[x,y,z,w]` quaternion. `{screenshot: true}` also returns a PNG data URL. |
| `getHands()`                     | Left and right hand position in meters, `[x,y,z,w]` quaternion, visibility, selection, and squeeze state.     |
| `getScreenshot(options?)`        | PNG data URL. `overlayOnCamera` defaults to true.                                                             |
| `saveScreenshot(path, options?)` | Save a PNG and return its absolute `{out}` path.                                                              |
| `getSceneContext(options)`       | Select `semanticTree`, `visibleObjects`, and/or `setOfMark`. At least one must be true.                       |
| `saveSetOfMark(path)`            | Capture Set-of-Mark, save its image, and return mark metadata plus `out`.                                     |
| `getDevtoolsContext(options)`    | Select developer `tags`, declared `state`, `spatial`, and/or `view` measurements.                             |
| `getSimulatorState()`            | Timestamp, running state, and pause state.                                                                    |
| `inspectScene()`                 | Serializable scene hierarchy, camera, simulator, and world data.                                              |
| `findByTag(tag)`                 | All identities with an exact Devtools tag.                                                                    |
| `inspect(target)`                | Identity, metadata, visibility, hierarchy, and local/world transforms.                                        |
| `diagnostics()`                  | Browser console, page, and failed-network-request entries.                                                    |

### Move and interact

| Function                            | Units, defaults, and behavior                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `navigateTo(target)`                | Use XR Blocks simulator navigation and navmesh constraints. Returns final position and `constrained`.                                     |
| `teleportTo(target, options?)`      | Embodied teleport. Options include `distance` in meters (default `1.5`), `faceTarget` (default true), and `snapToGround` (default false). |
| `move(motion)`                      | Viewer-relative meters. Speed default `1 m/s`, range `0.05–3 m/s`. Positive axes are right, up, and forward.                              |
| `rotate(rotation)`                  | Relative degrees. Speed default `90°/s`, range `5–180°/s`. Positive pitch is up, yaw left, roll counterclockwise.                         |
| `moveHand(hand, motion)`            | Viewer-relative meters. Speed default `0.5 m/s`, range `0.05–1.5 m/s`.                                                                    |
| `rotateHand(hand, rotation)`        | Relative degrees. Speed default `90°/s`, range `5–180°/s`.                                                                                |
| `gesture(hand, pose)`               | Apply `neutral`, `relaxed`, `pinching`, `fist`, `thumbs_up`, `pointing`, `rock`, `thumbs_down`, or `victory` over 500 ms.                 |
| `setHandPose(hand, rotations)`      | Apply sparse named joint `[x,y,z]` rotations in radians over 500 ms.                                                                      |
| `lookAtTarget(target, options?)`    | Camera speed in degrees/s; default `90`, range `5–180`.                                                                                   |
| `pointTo(hand?, target?, options?)` | Aim a controller ray. Right hand and `90°/s` default.                                                                                     |
| `reachTo(hand?, target?, options?)` | Move a hand to a target. Right hand and `0.5 m/s` default; range `0.05–1.5`.                                                              |
| `startSelect(hand?)`                | Begin and hold WebXR selection. Default right.                                                                                            |
| `endSelect(hand?)`                  | Release selection. Default right.                                                                                                         |
| `click(hand?, options?)`            | Select press and release. Default right and `durationMs: 200`.                                                                            |
| `wait(durationMs)`                  | Advance real and simulation time by a positive number of milliseconds.                                                                    |
| `stepFrame(frames?)`                | Advance positive frame count; default one frame at about 16.67 ms.                                                                        |
| `injectAudio({file})`               | Inject a RIFF/WAVE file, maximum 25 MB.                                                                                                   |
| `injectAudio({text})`               | Synthesize and inject up to 500 characters through optional TinyTTS.                                                                      |

Low-level `applyControl(control)` applies a compound embodied control
immediately. `stepControl({durationMs?, control?})` applies it while advancing
frames. Locomotion and hand movement tuples use meters; rotation tuples use
degrees; sparse hand-joint rotations use radians.

The compound control shape is:

```ts
{
  locomotion?: {
    move?: [rightMeters, upMeters, forwardMeters];
    rotate?: [pitchDegrees, yawDegrees, rollDegrees];
  };
  leftHand?: {
    move?: [xMeters, yMeters, zMeters];
    rotate?: [pitchDegrees, yawDegrees, rollDegrees];
    selectStart?: boolean;
    selectEnd?: boolean;
    pose?: NamedHandPose;
    rotations?: Record<JointName, [xRadians, yRadians, zRadians]>;
    visible?: boolean;
  };
  rightHand?: {/* same fields */};
}
```

`stepControl` distributes movement and rotation over `durationMs`; the default
is one 16.67 ms tick. `applyControl` applies the complete values immediately and
does not advance a frame. A hand control can use a named `pose` or custom
`rotations`, and selection is a separate control.

Valid joint names are `wrist`; `thumb-metacarpal`,
`thumb-phalanx-proximal`, `thumb-phalanx-distal`; and the `metacarpal`,
`phalanx-proximal`, `phalanx-intermediate`, and `phalanx-distal` joints for
`index-finger`, `middle-finger`, `ring-finger`, and `pinky-finger`. The thumb
has no intermediate joint.

See [docs/interactive.md](docs/interactive.md) for complete scenarios and
[docs/scene-context.md](docs/scene-context.md) for context-driven targeting.

## Session API

```ts
import {XRBlocksSession} from '@xrblocks/devtools';

const session = await XRBlocksSession.open({
  appDir: './app',
  xrblocksRoot: '../xrblocks',
  headless: true,
});

try {
  await session.navigateTo({tag: 'workbench'});
  await session.click('right');
} finally {
  await session.close();
}
```

Session accepts exactly one of `appDir` and `url`. App-directory sessions can
also set `xrblocksRoot` and `entry`. Shared options are `headless`, `timeoutMs`,
`viewport` in pixels, `realTime`, `monitorAudio`, `simulatorReachLimit`,
`simulatorNavMesh`,
`embodiedControlImport`, `recordVideo`, and `signal`.

URL sessions bypass workspace injection. Their page must expose XR Blocks debug
state through `?xrAutomation=1&debug=1` and resolve the embodied-control addon.
Set `embodiedControlImport` to a browser-loadable URL when needed.

Application objects can declare stable metadata without changing other
`userData`:

```js
object.userData.xrblocksDevtools = {
  tag: 'start-button',
  state: {enabled: true},
};
```

`session.act()` is an optional programmatic action loop. It requires
`options.apiKey` or `GEMINI_API_KEY` and the optional `@google/genai` package.
The agent ends with an `exit` tool call. The resolved result contains its final
`message` and any optional JSON object in `data`. The `agent` command prints
this same payload when it exits. It is not an assertion or benchmark score.

## Keep Your API Key Secure

In specific AI use
cases, this tool provides an interface to use cloud-hosted Gemini services, requiring an API key from
[AI Studio](https://aistudio.google.com/app/apikey). Please follow
[this doc](https://ai.google.dev/gemini-api/docs/api-key#security) for best
practices to keep your API key secure.

Treat your Gemini API key like a password. If compromised, others can use your
project's quota, incur charges (if billing is enabled), and access your private
data, such as files.

### Critical Security Rules

Never commit API keys to source control. Do not check your API key into version
control systems like Git.

Never expose API keys on the client-side. Do not use your API key directly in
web or mobile apps in production. Keys in client-side code (including our
JavaScript/TypeScript libraries and REST calls) can be extracted.

## Shipped skills

- [`visualize-xrblocks`](skills/visualize-xrblocks/SKILL.md) runs an isolated
  render-and-inspect loop.
- [`interact-with-xrblocks`](skills/interact-with-xrblocks/SKILL.md) runs an
  observe-act-verify loop through the manual REPL.

The npm package contains these skill folders. Agent hosts must expose or install
them through their normal skill-discovery mechanism.

## Terms of Service

- Please follow
  [Google's Privacy & Terms](https://policies.google.com/privacy?hl=en-US)
  when using this SDK.

- When using AI features in this SDK, please follow
  [Gemini's Privacy & Terms](https://ai.google.dev/gemini-api/terms).
