import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step } from '../game.js';
import { createStore } from '../storage.js';

const KEY = 'floating-dreams';

// A stand-in for localStorage: a Map, and a version that throws like a full
// quota or a private-mode window.
const fakeStorage = (initial) => {
  const map = new Map(initial ? [[KEY, initial]] : []);
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  };
};
const brokenStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('quota'); },
  removeItem: () => { throw new Error('blocked'); }
};

// 1. It stays out of the DOM, like every other module that gets tested.
const src = readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
assert.equal(/\b(document|window|localStorage)\b/.test(src), false, 'storage.js must not reach for a global');

// 2. An empty or unreadable save opens the sky empty, it does not throw.
assert.equal(createStore(fakeStorage(), KEY).load(), null, 'no save reads as null');
assert.equal(createStore(fakeStorage('{not json'), KEY).load(), null, 'a corrupt save reads as null');
assert.equal(createStore(brokenStorage, KEY).load(), null, 'blocked storage reads as null');

// 3. Saving writes the same shape game.js serializes, and survives a blocked write.
const world = createWorld(() => 0.5);
const storage = fakeStorage();
const store = createStore(storage, KEY);
world.dreams = 4;
world.blooms.push({ x: 1, z: 2, colour: 3 });
step(world, { x: 0, z: 0, plant: true }, 1 / 60, 0);
store.save(world);
const written = JSON.parse(storage.map.get(KEY));
assert.equal(written.dreams, 4, 'dreams saved');
assert.equal(written.blooms.length, 2, 'the garden saved');
assert.equal(createStore(brokenStorage, KEY).save(world), undefined, 'a blocked write does not throw');

// 4. Reset clears the save, and the pagehide-shaped save that follows a reload
//    must not put the garden back. This is the bug the browser found.
store.reset();
assert.equal(storage.map.has(KEY), false, 'reset clears the save');
store.save(world);
assert.equal(storage.map.has(KEY), false, 'a save after reset writes nothing');
assert.equal(store.load(), null, 'the next visit opens empty');

// 5. A separate visit (a fresh store) saves and loads normally again.
const next = createStore(storage, KEY);
next.save(world);
assert.equal(next.load().dreams, 4, 'a fresh visit saves and reloads');

console.log('all storage checks passed');
