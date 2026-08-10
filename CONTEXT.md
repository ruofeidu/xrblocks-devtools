# XR Blocks Devtools

This context defines the language for the XR Blocks developer tooling suite. It exists to keep preview, runner, injection, interactive control, and agent workflows described consistently.

## Language

**Devtools**:
A Node-installed suite of XR Blocks developer tools for previewing, running, injecting, interacting with, and agent-driving XR Blocks apps.
_Avoid_: Separate runner package, benchmark package, loose scripts

**XR Blocks App**:
A complete browser-runnable XR Blocks scene that initializes XR Blocks and can be loaded into a controlled browser session from either an app directory or an already-running URL.
_Avoid_: Scenario template, generated workspace, loose entry file

**Injected Workspace**:
A Devtools-owned runnable copy or wrapper around an XR Blocks App Source, with import maps, vendor links, harness prerequisites, and serving metadata added outside the user's source project.
_Avoid_: Mutated project, generated app

**Runtime Assets**:
The XR Blocks and Three.js browser modules used by an Injected Workspace or Session. They normally come from the XR Blocks App's installed dependencies, with an explicit source-checkout override for local runtime development.
_Avoid_: Vendor files, build files

**Session**:
A live controlled browser instance attached to an XR Blocks App, with the harness injected and ready to observe or act.
_Avoid_: Run, test, browser

**Interactive Mode**:
A promise-aware JavaScript REPL attached to a Session. It binds named Session
functions directly, so manual control does not need a Session variable or
explicit `await`.
_Avoid_: Word-command parser, JSONL protocol, raw Session console

**Agent Action**:
A natural-language action performed inside an existing Session. The model observes the app, performs one embodied action at a time, and stops with success or failure.
_Avoid_: Scenario run, benchmark generation

**Preview**:
A lightweight render path that produces still images from public XR Blocks UI roots or plain Three.js model modules. UI Preview starts only the XR Blocks runtime needed to mount and validate its returned root; it does not open a Session.
_Avoid_: Session screenshot, simulator capture

**Visualizer**:
The one-shot Devtools command that renders a Preview Module to an image.
_Avoid_: Watch mode, live preview server

**Preview Module**:
A standalone module with a default export that builds and returns one UI root or one Three.js object using the small runtime context injected by Preview.
_Avoid_: App entrypoint, config file

**UI Preview**:
A Preview mode for still-rendering one public XR Blocks `UICard` or `UIOverlay`. The module receives `{xb}` and validation comes from `xb.ui.validate(root)`.
_Avoid_: Raw UIKit Preview, Session screenshot, app UI capture

**Model Preview**:
A Preview mode for still-rendering one plain Three.js object or model asset, usually as a multi-view image for inspecting the model from several angles. The module receives `{THREE}`.
_Avoid_: ModelViewer session, interactive model app, XR Blocks Script lifecycle

**Inspection Sheet**:
A multi-view Model Preview image, defaulting to a 2x2 sheet with two 45-degree front views plus top and bottom views.
_Avoid_: Single render, turntable video
