# Object Interaction

Sort two colored cubes with a controller ray or by direct touch. The example is
adapted from XR Blocks' `02_object_interaction` template and adds matching drop
targets, snap-on-drop behavior, Devtools tags, and an explicit success state.

Run the example from this directory with:

```sh
npm install
npm run interact
```

In the Devtools REPL, one drag sequence is:

```js
reachTo('right', {tag: 'red-cube'});
startSelect('right');
reachTo('right', {tag: 'red-target'});
endSelect('right');
inspect({tag: 'sorting-challenge'});
```

Each cube reports its drag and placement state. The challenge reports
`placedCount`, `totalCount`, `lastResult`, and `success` through
`getDevtoolsContext({state: true})`. `success` becomes `true` after both cubes
are released over their matching targets.
