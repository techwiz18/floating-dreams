import assert from 'node:assert/strict';
import { createAudio } from '../audio.js';

// A stub AudioContext: enough to see what the module schedules, with no sound.
class FakeParam {
  constructor(value = 0) { this.value = value; this.targets = []; }
  setValueAtTime(value) { this.value = value; return this; }
  linearRampToValueAtTime(value, at) { this.targets.push(value); this.value = value; return this; }
  exponentialRampToValueAtTime(value, at) {
    if (value <= 0) throw new Error('exponential ramps need a positive target');
    this.targets.push(value);
    this.value = value;
    return this;
  }
}

class FakeNode {
  constructor() { this.connected = []; }
  connect(node) { this.connected.push(node); return node; }
}

class FakeAudioContext {
  static all = [];

  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.buffers = [];
    this.gains = [];
    this.filters = [];
    FakeAudioContext.all.push(this);
  }

  createGain() {
    const gain = new FakeNode();
    gain.gain = new FakeParam(1);
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const osc = new FakeNode();
    osc.frequency = new FakeParam(440);
    osc.start = () => { osc.started = true; };
    osc.stop = () => { osc.stopped = true; };
    this.oscillators.push(osc);
    return osc;
  }

  createBuffer(channels, length) {
    const buffer = { getChannelData: () => new Float32Array(length) };
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new FakeNode();
    source.start = () => { source.started = true; };
    this.sources = this.sources ?? [];
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = new FakeNode();
    filter.frequency = new FakeParam(0);
    this.filters.push(filter);
    return filter;
  }

  resume() { this.state = 'running'; }
}

globalThis.AudioContext = FakeAudioContext;
const latest = () => FakeAudioContext.all[FakeAudioContext.all.length - 1];

// 1. Nothing sounds, and no context exists, before the first gesture.
const audio = createAudio();
audio.collect();
audio.plant();
assert.equal(FakeAudioContext.all.length, 0, 'no AudioContext before a gesture');

// 2. Unlocking builds one context: a master gain into the speakers, and wind.
audio.unlock();
audio.unlock();
assert.equal(FakeAudioContext.all.length, 1, 'unlocking twice builds one context');
const ctx = latest();
const master = ctx.gains[0];
assert.equal(master.gain.value, 0.5, 'sound starts at a gentle level');
assert.equal(master.connected[0], ctx.destination, 'the master reaches the speakers');
assert.equal(ctx.sources[0].loop, true, 'the wind bed loops');
assert.equal(ctx.sources[0].started, true, 'the wind bed runs');
assert.equal(ctx.filters[0].type, 'lowpass', 'the wind is filtered');

// 3. A collect is one soft chime that rises and fades.
audio.collect();
const chime = ctx.oscillators[0];
assert.equal(ctx.oscillators.length, 1, 'one oscillator per chime');
assert.equal(chime.frequency.targets[0], 990, 'the chime rises');
assert.equal(chime.started, true, 'the chime plays');
assert.equal(chime.stopped, true, 'the chime is scheduled to end');
assert.ok(ctx.gains.at(-1).gain.targets.includes(0.18), 'the chime fades out');

// 4. A plant is a soft two-note chime, not a falling pitch.
audio.plant();
const bell = ctx.oscillators[1];
assert.equal(ctx.oscillators.length, 3, 'the bell is two notes');
assert.equal(bell.type, 'sine', 'the bell is rounded, not a saw');
assert.equal(bell.frequency.targets[0], 523, 'the bell holds a steady note');
assert.equal(ctx.oscillators[2].frequency.targets[0], 784, 'the second note is a fifth above');

// 5. Muting silences the master; unmuting brings it back.
audio.setMuted(true);
assert.equal(audio.muted, true);
assert.equal(master.gain.value, 0, 'muted means silent');
audio.setMuted(false);
assert.equal(audio.muted, false);
assert.equal(master.gain.value, 0.5, 'unmuted means audible');

// 6. An audio started muted stays silent until it is unmuted.
const quiet = createAudio({ muted: true });
quiet.unlock();
assert.equal(latest().gains[0].gain.value, 0, 'a muted start is silent');
assert.equal(FakeAudioContext.all.length, 2, 'each instance owns its own context');

console.log('all audio checks passed');
