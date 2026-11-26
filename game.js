// Pure rules for Floating Dreams. No THREE, no DOM, no clock: step() is a
// function of (world, input, dt, time), so it runs unchanged under node.
//
// dt is frame time, clamped by the caller; time is wall-clock elapsed time.
// They stay separate on purpose: after a stalled tab the wobbles jump with
// wall time while movement must not.

const CRYSTAL_COUNT = 20;
const COLLECT_DISTANCE = 2.2;
const ACCEL = 34;
const MAX_SPEED = 13;
const FRICTION = 2.2;
const ARENA_RADIUS = 50;
const MIN_SPAWN_DISTANCE = 9;
const SPAWN_ATTEMPTS = 12;
const SAVE_VERSION = 1;

export function createWorld(rng = Math.random) {
  const world = {
    rng,
    dreams: 0,
    lastCrystal: 0,
    orb: { x: 0, y: 1.6, z: 0 },
    vel: { x: 0, z: 0 },
    crystals: [],
    blooms: []
  };

  for (let i = 0; i < CRYSTAL_COUNT; i++) {
    const crystal = { x: 0, y: 0, z: 0, baseY: 0, phase: 0, spin: 0 };
    placeCrystal(world, crystal, true);
    world.crystals.push(crystal);
  }

  return world;
}

function placeCrystal(world, crystal, firstSpawn = false) {
  let x = 0;
  let z = 0;
  // Try a few times to land far enough away from the orb.
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const angle = world.rng() * Math.PI * 2;
    const radius = 12 + world.rng() * 26;
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
    if (firstSpawn || Math.hypot(x - world.orb.x, z - world.orb.z) > MIN_SPAWN_DISTANCE) break;
  }
  crystal.x = x;
  crystal.z = z;
  crystal.baseY = 1.4 + world.rng() * 1.2;
  crystal.y = crystal.baseY;
  crystal.phase = world.rng() * Math.PI * 2;
  crystal.spin = 0.4 + world.rng() * 0.5;
}

// input is { x: -1|0|1, z: -1|0|1, plant: true } — plant is a one-frame pulse,
// so holding the key does not plant every frame. Returns [] or world events.
export function step(world, input, dt, time) {
  const events = [];

  // --- movement -----------------------------------------------------------
  let ix = input.x;
  let iz = input.z;
  if (ix !== 0 && iz !== 0) {
    ix *= Math.SQRT1_2;
    iz *= Math.SQRT1_2;
  }

  world.vel.x += ix * ACCEL * dt;
  world.vel.z += iz * ACCEL * dt;
  const damping = Math.exp(-FRICTION * dt);
  world.vel.x *= damping;
  world.vel.z *= damping;

  const speed = Math.hypot(world.vel.x, world.vel.z);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    world.vel.x *= scale;
    world.vel.z *= scale;
  }

  world.orb.x += world.vel.x * dt;
  world.orb.z += world.vel.z * dt;

  // --- gentle currents ----------------------------------------------------
  world.orb.x += Math.sin(time * 0.35 + world.orb.z * 0.05) * 0.9 * dt;
  world.orb.z += Math.cos(time * 0.27 + world.orb.x * 0.05) * 0.9 * dt;
  world.orb.y = 1.6 + Math.sin(time * 0.9) * 0.15;

  // Soft round arena edge.
  const distanceFromCenter = Math.hypot(world.orb.x, world.orb.z);
  if (distanceFromCenter > ARENA_RADIUS) {
    const pull = ARENA_RADIUS / distanceFromCenter;
    world.orb.x *= pull;
    world.orb.z *= pull;
    world.vel.x *= 0.5;
    world.vel.z *= 0.5;
  }

  // --- blooms -------------------------------------------------------------
  // A bloom costs nothing and stays where it is planted, forever.
  if (input.plant) {
    world.blooms.push({ x: world.orb.x, z: world.orb.z, colour: world.lastCrystal });
    events.push({ type: 'bloom', x: world.orb.x, z: world.orb.z });
  }

  // --- crystals -----------------------------------------------------------
  for (let i = 0; i < world.crystals.length; i++) {
    const crystal = world.crystals[i];
    crystal.y = crystal.baseY + Math.sin(time * 0.8 + crystal.phase) * 0.35;

    const dx = crystal.x - world.orb.x;
    const dy = crystal.y - world.orb.y;
    const dz = crystal.z - world.orb.z;
    if (dx * dx + dy * dy + dz * dz < COLLECT_DISTANCE * COLLECT_DISTANCE) {
      events.push({ type: 'collect', index: i, x: crystal.x, y: crystal.y, z: crystal.z });
      world.dreams += 1;
      world.lastCrystal = i;
      placeCrystal(world, crystal);
    }
  }

  return events;
}

// Saved state is the garden and the dream count. The sky rebuilds fresh, and
// the orb starts at its centre, so a visit always opens the same way.
export function serialize(world) {
  const round = (n) => Math.round(n * 100) / 100;
  return {
    version: SAVE_VERSION,
    dreams: world.dreams,
    blooms: world.blooms.map((bloom) => [round(bloom.x), round(bloom.z), bloom.colour])
  };
}

// Anything unrecognised is treated as no save at all: a broken file must not
// stop the sky from opening.
export function restore(saved, rng = Math.random) {
  const world = createWorld(rng);
  if (!saved || saved.version !== SAVE_VERSION) return world;

  if (Number.isInteger(saved.dreams) && saved.dreams > 0) world.dreams = saved.dreams;
  const blooms = Array.isArray(saved.blooms) ? saved.blooms : [];
  for (const entry of blooms) {
    if (!Array.isArray(entry)) continue;
    const [x, z, colour] = entry;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    world.blooms.push({ x, z, colour: Number.isInteger(colour) ? colour : 0 });
  }

  return world;
}
