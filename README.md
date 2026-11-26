# Floating Dreams

A small Three.js browser game: steer a glowing orb through a floating sky,
gather crystals, and plant blooms that stay.

## Play

ES modules cannot load from `file://`, so serve the folder over HTTP:

```sh
npm start          # python3 -m http.server 8000
# then open http://localhost:8000
```

- Desktop: arrow keys or WASD to drift, space (or E) to plant, M to mute.
- Touch: hold a thumb anywhere and drag to drift, tap the plant button.

## What the game remembers

The garden and the dream count are saved to `localStorage`. Gathering a crystal
and planting a bloom both save, so the sky you come back to has your blooms in
it, with the orb at its centre. A broken or unreadable save is ignored rather
than crashing the page.

Sound waits for the first key or tap (browsers refuse to start audio sooner);
the mute choice is remembered too. `floatingDreams.reset()` in the console
clears the save. The rules never take anything away: blooms are never spent,
removed or capped.

## Layout

- `index.html` — wiring only: input (keyboard, pointer drag, plant button),
  audio unlock, and the frame loop.
- `game.js` — pure game rules, no THREE/DOM/clock. `createWorld(rng)` builds
  state, `step(world, input, dt, time)` advances it and returns events, and
  `serialize`/`restore` turn a world into save data and back.
- `storage.js` — saving and loading, with the storage object passed in so a test
  can hand it a Map. `createStore(storage, key)` returns `load`, `save(world)`
  and `reset()`.
- `render.js` — drawing only. `createRenderer({ THREE, world, dom })` builds the
  scene and returns `update(dt, time, events)` and `resize(width, height,
  pixelRatio)`. The whole garden draws as one instanced mesh. THREE arrives as
  an argument and no global is read, so it loads under a stub.
- `audio.js` — sound only, from oscillators and filtered noise: no files. It is
  silent until `unlock()` is called from a gesture.
- `GLOSSARY.md` — the domain words (orb, sky, crystal, dream, bloom).
- `tests/verify-game.mjs` — asserts the rules through `step()`: initial
  placement, a golden fixture (a seeded 2000-frame probe, repasted from the diff
  when you tune on purpose), collect events and respawn distance, planting,
  save/restore including junk data, a wall-clock stall that must not move the
  orb, the arena clamp, the diagonal speed cap, and that `game.js` stays
  import-free, THREE-free and DOM-free.
- `tests/verify-storage.mjs` — drives `storage.js` with a fake storage: absent,
  corrupt, blocked and working saves, and that `reset()` is not undone by the
  save the page fires as it unloads.
- `tests/verify-render.mjs` — drives `render.js` against a stub THREE: one mesh
  per crystal, one instanced mesh for the garden, the orb tracking the world,
  bursts spawning on a collect and a plant and reaping their buffers, the score
  pill, and resize.
- `tests/verify-audio.mjs` — drives `audio.js` against a stub AudioContext:
  silence before a gesture, one context per instance, the wind bed, both
  chimes, and mute.

## Test

```sh
npm test           # the four verify scripts, no dependencies
```

No install step is needed; `game.js` has no dependencies and the tests use only
`node:assert` and `node:fs`. GitHub Actions runs the same command on every push
and pull request.

`index.html` has no test of its own, so a change there needs a browser check.
The page exposes nothing to click or focus (a canvas, plus a plant button that
is `display: none` on desktop), so drive it with page scripts: dispatch
`KeyboardEvent` / `PointerEvent` with `evaluate`, then read
`window.floatingDreams`. Passing that check proves the wiring, not the real
input; a genuine thumb or keyboard still settles the feel.

## Deploying

Pages publishes a push in about a minute, and serves everything with
`cache-control: max-age=600` — including 404s. A page opened in that window
caches the missing file and stays broken through a plain reload; a hard reload
(`Ctrl+Shift+R`) fixes it, and waiting out the ten minutes also does. Give a
deploy a minute before opening the site.
