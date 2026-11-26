# Floating Dreams

A small Three.js browser game: steer a glowing orb through a floating sky and
collect crystals.

## Play

ES modules cannot load from `file://`, so serve the folder over HTTP:

```sh
npm start          # python3 -m http.server 8000
# then open http://localhost:8000
```

Arrow keys or WASD to drift.

## Layout

- `index.html` — wiring only: imports THREE, mounts the renderer, maps keys and
  owns the frame loop.
- `game.js` — pure game rules, no THREE/DOM/clock. `createWorld(rng)` builds
  state, `step(world, input, dt, time)` advances it and returns collect events.
- `render.js` — drawing only. `createRenderer({ THREE, world, dom })` builds the
  scene and returns `update(dt, time, events)` and `resize(width, height,
  pixelRatio)`. THREE arrives as an argument and no global is read, so it loads
  under a stub.
- `tests/verify-game.mjs` — asserts the rules through `step()`: initial placement,
  a golden fixture (a seeded 2000-frame probe, repasted from the diff when you
  tune on purpose), collect events and respawn distance, a wall-clock stall that
  must not move the orb, the arena clamp, the diagonal speed cap, and that
  `game.js` stays import-free, THREE-free and DOM-free.
- `tests/verify-render.mjs` — drives `render.js` against a stub THREE: one mesh
  per crystal, the orb tracking the world, bursts spawning on a collect and
  reaping their buffers, the score pill, and resize.

## Test

```sh
npm test           # node tests/verify-game.mjs, no dependencies
```

No install step is needed; `game.js` has no dependencies and the test uses only
`node:assert` and `node:fs`.
