import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step } from '../game.js';

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 1. import-free (node:test can load it with zero setup)
const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
assert.equal(/^\s*import\b/m.test(src), false, 'game.js must have no imports');
assert.equal(src.includes('THREE.'), false, 'game.js must not use THREE.*');
assert.equal(src.includes('new THREE'), false, 'game.js must not construct THREE objects');

// 2. initial placement
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

// 3. frame-for-frame parity with the pre-refactor loop
function reference(seed) {
  const rng = lcg(seed);
  const orb = { x: 0, y: 1.6, z: 0 };
  const vel = { x: 0, z: 0 };
  const crystals = [];
  const events = [];

  function place(c, firstSpawn = false) {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng() * Math.PI * 2;
      const radius = 12 + rng() * 26;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      if (firstSpawn || Math.hypot(x - orb.x, z - orb.z) > 9) break;
    }
    c.x = x;
    c.z = z;
    c.baseY = 1.4 + rng() * 1.2;
    c.y = c.baseY;
    c.phase = rng() * Math.PI * 2;
    c.spin = 0.4 + rng() * 0.5;
  }

  for (let i = 0; i < 20; i++) {
    const c = {};
    place(c, true);
    crystals.push(c);
  }

  function tick(ix, iz, dt, time) {
    if (ix !== 0 && iz !== 0) {
      ix *= Math.SQRT1_2;
      iz *= Math.SQRT1_2;
    }
    vel.x += ix * 34 * dt;
    vel.z += iz * 34 * dt;
    const damping = Math.exp(-2.2 * dt);
    vel.x *= damping;
    vel.z *= damping;
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 13) {
      const scale = 13 / speed;
      vel.x *= scale;
      vel.z *= scale;
    }
    orb.x += vel.x * dt;
    orb.z += vel.z * dt;
    orb.x += Math.sin(time * 0.35 + orb.z * 0.05) * 0.9 * dt;
    orb.z += Math.cos(time * 0.27 + orb.x * 0.05) * 0.9 * dt;
    orb.y = 1.6 + Math.sin(time * 0.9) * 0.15;
    const fromCenter = Math.hypot(orb.x, orb.z);
    if (fromCenter > 50) {
      const pull = 50 / fromCenter;
      orb.x *= pull;
      orb.z *= pull;
      vel.x *= 0.5;
      vel.z *= 0.5;
    }
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      c.y = c.baseY + Math.sin(time * 0.8 + c.phase) * 0.35;
      const dx = c.x - orb.x;
      const dy = c.y - orb.y;
      const dz = c.z - orb.z;
      if (dx * dx + dy * dy + dz * dz < 2.2 * 2.2) {
        events.push({ type: 'collect', index: i, x: c.x, y: c.y, z: c.z });
        place(c);
      }
    }
    return events.splice(0);
  }

  return { orb, vel, crystals, tick };
}

const sameCrystals = (got, want, label) => {
  assert.equal(got.length, want.length, label);
  for (let i = 0; i < got.length; i++) {
    for (const key of ['x', 'y', 'z', 'baseY', 'phase', 'spin']) {
      assert.equal(got[i][key], want[i][key], `${label}[${i}].${key}`);
    }
  }
};

const mine = createWorld(lcg(1234));
const ref = reference(1234);
assert.deepEqual(mine.orb, ref.orb);
sameCrystals(mine.crystals, ref.crystals, 'initial');

let dt = 1 / 60;
let collected = 0;
for (let frame = 0; frame < 2000; frame++) {
  // Stall at frame 700: wall time jumps 5s, frame time stays clamped.
  if (frame === 700) dt = 0.05;
  const time = frame < 700 ? frame / 60 : frame / 60 + 5;
  if (frame === 1200) dt = 1 / 60;
  const ix = frame % 97 < 40 ? 1 : frame % 97 < 60 ? -1 : 0;
  const iz = frame % 53 < 26 ? 1 : frame % 53 < 40 ? -1 : 0;
  // Force some collections by teleporting a crystal onto the orb periodically.
  if (frame % 211 === 0) {
    const c = mine.crystals[frame % 20];
    c.x = mine.orb.x;
    c.z = mine.orb.z;
    c.baseY = mine.orb.y;
    c.phase = 0;
    const r = ref.crystals[frame % 20];
    r.x = ref.orb.x;
    r.z = ref.orb.z;
    r.baseY = ref.orb.y;
    r.phase = 0;
  }
  const gotEvents = step(mine, { x: ix, z: iz }, dt, time);
  const wantEvents = ref.tick(ix, iz, dt, time);
  assert.deepEqual(gotEvents, wantEvents, `events at frame ${frame}`);
  collected += gotEvents.length;
  for (const key of ['x', 'y', 'z']) {
    assert.equal(mine.orb[key], ref.orb[key], `orb.${key} at frame ${frame}`);
  }
  assert.equal(mine.vel.x, ref.vel.x);
  assert.equal(mine.vel.z, ref.vel.z);
  sameCrystals(mine.crystals, ref.crystals, `crystals at frame ${frame}`);
}
assert.ok(collected > 0, 'the parity run actually collected crystals');
assert.equal(mine.score, collected);

// 4. arena clamp
const edge = createWorld(lcg(2));
edge.orb.x = 100;
edge.orb.z = 0;
step(edge, { x: 0, z: 0 }, 1 / 60, 0);
assert.ok(Math.hypot(edge.orb.x, edge.orb.z) <= 50.001, `radius ${Math.hypot(edge.orb.x, edge.orb.z)}`);

// 5. speed cap on diagonal
const fast = createWorld(lcg(3));
let peak = 0;
for (let i = 0; i < 60; i++) {
  step(fast, { x: 1, z: 1 }, 0.05, i * 0.05);
  peak = Math.max(peak, Math.hypot(fast.vel.x, fast.vel.z));
}
assert.ok(peak <= 13 + 1e-9 && peak > 12.9, `peak speed ${peak}`);

// 6. orbs never escape the arena under sustained input
const runner = createWorld(lcg(4));
for (let i = 0; i < 4000; i++) {
  step(runner, { x: i % 7 < 3 ? 1 : i % 7 < 5 ? -1 : 0, z: i % 11 < 5 ? 1 : -1 }, 0.05, i * 0.05);
  assert.ok(Math.hypot(runner.orb.x, runner.orb.z) <= 50 + 1e-9);
}

console.log('all checks passed');
