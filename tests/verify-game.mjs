import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step } from '../game.js';

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const STILL = { x: 0, z: 0 };

// 1. Architectural guards: the rules module stays pure, so it loads under node
//    and stays testable through step() alone.
const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
assert.equal(/^\s*import\b/m.test(src), false, 'game.js must have no imports');
assert.equal(src.includes('THREE.'), false, 'game.js must not use THREE.*');
assert.equal(src.includes('new THREE'), false, 'game.js must not construct THREE objects');
assert.equal(/\b(document|window)\b/.test(src), false, 'game.js must not touch the DOM');
assert.equal(/0x[0-9a-f]{6}/i.test(src), false, 'game.js must carry no colours');

// 2. Initial placement
const w = createWorld(lcg(42));
assert.equal(w.crystals.length, 20);
assert.equal(w.score, 0);
assert.deepEqual(w.orb, { x: 0, y: 1.6, z: 0 });
for (const c of w.crystals) {
  const r = Math.hypot(c.x, c.z);
  assert.ok(r >= 12 - 1e-9 && r <= 38 + 1e-9, `radius ${r}`);
  assert.ok(dist2(c, w.orb) > 9, 'first spawn must be >9 from orb');
  assert.ok(c.spin >= 0.4 && c.spin <= 0.9);
}
assert.equal(createWorld().rng, Math.random, 'default rng is Math.random');

// 3. Golden fixture: one seeded run, a few probe values, no second
//    implementation. Tuning the rules on purpose? Run the test and paste the
//    actual object out of the deepEqual diff.
const round3 = (n) => Math.round(n * 1000) / 1000;
const probe = (world) => ({
  orb: { x: round3(world.orb.x), y: round3(world.orb.y), z: round3(world.orb.z) },
  crystals: [0, 13].map((i) => {
    const c = world.crystals[i];
    return { x: round3(c.x), z: round3(c.z), baseY: round3(c.baseY), phase: round3(c.phase), spin: round3(c.spin) };
  })
});

const GOLDEN = {
  orb: { x: 29.071, y: 1.611, z: 40.043 },
  crystals: [
    { x: -3.866, z: -16.947, baseY: 2.299, phase: 2.174, spin: 0.802 },
    { x: -12.028, z: -4.2, baseY: 2.343, phase: 4.364, spin: 0.851 }
  ]
};

const golden = createWorld(lcg(1234));
let dt = 1 / 60;
for (let frame = 0; frame < 2000; frame++) {
  if (frame === 700) dt = 0.05; // a stalled tab: frame time clamped...
  const time = frame < 700 ? frame / 60 : frame / 60 + 5; // ...wall clock jumps
  if (frame === 1200) dt = 1 / 60;
  const ix = frame % 97 < 40 ? 1 : frame % 97 < 60 ? -1 : 0;
  const iz = frame % 53 < 26 ? 1 : frame % 53 < 40 ? -1 : 0;
  step(golden, { x: ix, z: iz }, dt, time);
}
assert.deepEqual(probe(golden), GOLDEN, 'rules drifted from the golden fixture');

// 4. Collecting: one event, right index and place, score up, respawn far away.
//    The orb sits off-centre, where a respawn that skips the distance check
//    actually can land on top of it.
const collector = createWorld(lcg(7));
const target = collector.crystals[3];
const park = () => {
  collector.orb.x = 35;
  collector.orb.z = 0;
  target.x = collector.orb.x;
  target.z = collector.orb.z;
  target.baseY = collector.orb.y;
  target.phase = 0;
};

park();
const spot = { x: target.x, y: target.baseY, z: target.z };
const collectEvents = step(collector, STILL, 1 / 60, 0);
assert.deepEqual(collectEvents, [{ type: 'collect', index: 3, ...spot }]);

let collects = 1;
for (let i = 0; i < 100; i++) {
  park();
  const events = step(collector, STILL, 1 / 60, 0);
  collects += events.length;
  assert.ok(events.some((event) => event.index === 3), `crystal 3 not collected at ${i}`);
  assert.ok(dist2(target, collector.orb) > 9, `respawn ${i} landed ${dist2(target, collector.orb)} from the orb`);
}
assert.equal(collector.score, collects, 'score counts every collect');

// 5. A wall-clock jump cannot fling the orb: frame time is what moves it
const stalled = createWorld(lcg(5));
const start = { x: stalled.orb.x, z: stalled.orb.z };
step(stalled, STILL, 0.05, 5);
const drift = Math.hypot(stalled.orb.x - start.x, stalled.orb.z - start.z);
assert.ok(drift <= (13 + 0.9 * Math.SQRT2) * 0.05 + 1e-9, `drift ${drift}`);

// ...and y rides the wall clock, while x rides frame time
const smooth = createWorld(lcg(6));
const coarse = createWorld(lcg(6));
step(smooth, STILL, 1 / 60, 2.5);
step(coarse, STILL, 0.05, 2.5);
assert.equal(smooth.orb.y, coarse.orb.y, 'y is a function of wall time only');
assert.notEqual(smooth.orb.x, coarse.orb.x, 'x is a function of frame time');

// 6. Arena clamp
const edge = createWorld(lcg(2));
edge.orb.x = 100;
edge.orb.z = 0;
step(edge, STILL, 1 / 60, 0);
assert.ok(Math.hypot(edge.orb.x, edge.orb.z) <= 50.001, `radius ${Math.hypot(edge.orb.x, edge.orb.z)}`);

// 7. Speed cap on diagonal
const fast = createWorld(lcg(3));
let peak = 0;
for (let i = 0; i < 60; i++) {
  step(fast, { x: 1, z: 1 }, 0.05, i * 0.05);
  peak = Math.max(peak, Math.hypot(fast.vel.x, fast.vel.z));
}
assert.ok(peak <= 13 + 1e-9 && peak > 12.9, `peak speed ${peak}`);

// 8. Orbs never escape the arena under sustained input
const runner = createWorld(lcg(4));
for (let i = 0; i < 4000; i++) {
  step(runner, { x: i % 7 < 3 ? 1 : i % 7 < 5 ? -1 : 0, z: i % 11 < 5 ? 1 : -1 }, 0.05, i * 0.05);
  assert.ok(Math.hypot(runner.orb.x, runner.orb.z) <= 50 + 1e-9);
}

console.log('all checks passed');
