import assert from 'node:assert/strict';
import { createWorld } from '../game.js';
import { createRenderer } from '../render.js';

// A stub THREE: enough scene graph to watch what the renderer builds and
// updates, without a browser or a GPU.
const vec = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
  copy(v) { return this.set(v.x, v.y, v.z); },
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); },
  lerp(v, t) {
    return this.set(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t
    );
  },
  normalize() {
    const len = Math.hypot(this.x, this.y, this.z) || 1;
    return this.set(this.x / len, this.y / len, this.z / len);
  },
  multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
});

class Object3D {
  constructor() {
    this.position = vec();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { value: 1, setScalar(v) { this.value = v; } };
    this.children = [];
  }
  add(child) { this.children.push(child); return this; }
  remove(child) { this.children = this.children.filter((c) => c !== child); }
  lookAt() { this.looking = true; }
}

const material = () => class {
  constructor(options) { Object.assign(this, options); }
  dispose() { this.disposed = true; }
};

let scene = null;
let camera = null;
let renderer = null;
let draws = 0;

const THREE = {
  Vector3: function (x, y, z) { return vec(x, y, z); },
  Color: class { constructor(hex) { this.hex = hex; } },
  Fog: class { constructor(...args) { this.args = args; } },
  Scene: class extends Object3D { constructor() { super(); this.isScene = true; scene = this; } },
  PerspectiveCamera: class extends Object3D {
    constructor(...args) { super(); this.args = args; camera = this; }
    updateProjectionMatrix() { this.projected = true; }
  },
  WebGLRenderer: class {
    constructor() { this.domElement = { tag: 'canvas' }; renderer = this; }
    setPixelRatio(ratio) { this.pixelRatio = ratio; }
    setSize(width, height) { this.size = [width, height]; }
    render(s, c) { scene = s; camera = c; draws++; }
  },
  Group: class extends Object3D { constructor() { super(); this.isGroup = true; } },
  Mesh: class extends Object3D {
    constructor(geometry, mat) { super(); this.geometry = geometry; this.material = mat; this.isMesh = true; }
  },
  Points: class extends Object3D {
    constructor(geometry, mat) { super(); this.geometry = geometry; this.material = mat; this.isPoints = true; }
  },
  HemisphereLight: class extends Object3D {},
  DirectionalLight: class extends Object3D {},
  SphereGeometry: class {},
  OctahedronGeometry: class {},
  BufferGeometry: class {
    constructor() { this.attributes = {}; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    dispose() { this.disposed = true; }
  },
  BufferAttribute: class {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
  },
  MeshStandardMaterial: material(),
  MeshBasicMaterial: material(),
  PointsMaterial: material(),
  AdditiveBlending: 2
};

const score = {
  textContent: '0',
  classList: { pop: false, add() { this.pop = true; }, remove() { this.pop = false; } },
  get offsetWidth() { return 1; }
};
const count = { textContent: '0' };
const parent = { appended: [], appendChild(child) { this.appended.push(child); } };

const world = createWorld(() => 0.5);
const view = createRenderer({ THREE, world, dom: { parent, score, count } });

// 1. the canvas is mounted and the scene is built once
assert.equal(parent.appended.length, 1, 'one canvas appended');
assert.equal(scene.children.filter((c) => c.isMesh).length, 20, 'one mesh per crystal');
assert.equal(scene.children.filter((c) => c.isPoints).length, 1, 'one dust cloud');
const orbGroup = scene.children.find((c) => c.isGroup);
assert.ok(orbGroup, 'the orb group is in the scene');

// 2. a frame tracks the world
world.orb.x = 5;
world.orb.z = -2;
view.update(0.1, 0.5, []);
assert.equal(orbGroup.position.x, 5, 'orb follows world.orb.x');
assert.equal(orbGroup.position.z, -2, 'orb follows world.orb.z');
assert.equal(draws, 1, 'one draw call per update');
const firstCrystalMesh = scene.children.filter((c) => c.isMesh)[0];
assert.equal(firstCrystalMesh.rotation.y, world.crystals[0].spin * 0.1, 'crystals spin with dt');
assert.equal(camera.looking, true, 'camera looks at the orb');

// 3. a collect event bursts and updates the pill
world.score = 1;
const before = scene.children.length;
const dust = scene.children.find((c) => c.isPoints);
view.update(0.01, 0.5, [{ type: 'collect', index: 0, x: 1, y: 2, z: 3 }]);
const burst = scene.children.find((c) => c.isPoints && c !== dust);
assert.ok(burst, 'burst added to the scene');
assert.equal(scene.children.length, before + 1, 'exactly one burst');
assert.deepEqual([burst.position.x, burst.position.y, burst.position.z], [1, 2, 3], 'burst at the collect point');
assert.equal(count.textContent, 1, 'score pill shows world.score');
assert.equal(score.classList.pop, true, 'score pill pops');

// 4. the burst is reaped and its buffers released
view.update(1, 0.5, []);
assert.equal(scene.children.length, before, 'burst removed after 0.9s');
assert.equal(burst.geometry.disposed, true, 'burst geometry disposed');
assert.equal(burst.material.disposed, true, 'burst material disposed');

// 5. resize is the page's to drive
view.resize(800, 600, 2);
assert.equal(camera.aspect, 800 / 600);
assert.equal(camera.projected, true);
assert.deepEqual(renderer.size, [800, 600], 'renderer resized');
assert.equal(renderer.pixelRatio, 2, 'pixel ratio passed through');

console.log('all render checks passed');
