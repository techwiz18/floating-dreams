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

- `index.html` — rendering only (Three.js scene, input, main loop).
- `game.js` — pure game rules, no THREE/DOM/clock. `createWorld(rng)` builds
  state, `step(world, input, dt, time)` advances it and returns collect events.
- `tests/verify-game.mjs` — asserts the rules through `step()`: initial placement,
  a golden fixture (a seeded 2000-frame probe, repasted from the diff when you
  tune on purpose), collect events and respawn distance, a wall-clock stall that
  must not move the orb, the arena clamp, the diagonal speed cap, and that
  `game.js` stays import-free, THREE-free and DOM-free.

## Test

```sh
npm test           # node tests/verify-game.mjs, no dependencies
```

No install step is needed; `game.js` has no dependencies and the test uses only
`node:assert` and `node:fs`.
