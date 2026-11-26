// Optional WebAudio sounds, all synthesised in code: an engine hum whose
// pitch follows throttle and speed, a chime when a ring is cleared, and a
// thud on landing or crash. Nothing is loaded from the network, and the
// context is only created after a user gesture (or never, in screenshots).
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 52;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engine.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Sound is decoration; a failure never stops the game.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    engine(throttle, speed) {
      if (!ctx || !engine) return;
      const t = ctx.currentTime;
      engine.frequency.setTargetAtTime(46 + throttle * 58 + speed * 0.35, t, 0.1);
      engineGain.gain.setTargetAtTime(0.028 + throttle * 0.035, t, 0.15);
    },
    ring() {
      blip(880, 0.28, 'sine', 0.14);
      setTimeout(() => blip(1318, 0.34, 'sine', 0.12), 90);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.4, 'triangle', 0.12), i * 120));
    },
    crash() {
      blip(70, 0.5, 'square', 0.16);
    },
  };
}
