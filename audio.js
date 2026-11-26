// Sound only, made from oscillators: no files, no dependency. Browsers refuse
// to start an AudioContext before a gesture, so the page calls unlock() from its
// first key or tap; until then every sound is a no-op.

export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let master = null;
  const state = { muted };

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startWind();
  }

  // A loop of filtered noise: the quiet air the sky floats in.
  function startWind() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < samples.length; i++) {
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
      samples[i] = last * 8;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function tone(from, to, duration, type, peak) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    unlock,
    collect() { tone(660, 990, 0.35, 'sine', 0.18); },
    // A two-note chime that swells and fades: a bloom, not a blaster.
    plant() { tone(523, 523, 0.8, 'sine', 0.10); tone(784, 784, 0.5, 'sine', 0.05); },
    get muted() { return state.muted; },
    setMuted(value) {
      state.muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    }
  };
}
