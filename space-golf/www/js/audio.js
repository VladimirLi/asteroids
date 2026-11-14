// Procedural music and sound effects (Web Audio). No audio files: everything is synthesized,
// so there is nothing to license and the app stays small.

let ctx = null, master, musicBus, sfxBus, reverb, delay;
let musicVol = 0.7, sfxVol = 0.9;
let theme = null, nextBar = 0, barIndex = 0, schedTimer = 0, playing = false;
let noiseBuf = null;

const THEMES = {
  // root: MIDI note; chords: scale degrees (semitones from root) for each bar; bpm; mood shapes the voices.
  title: { root: 50, bpm: 64, chords: [[0, 7, 12, 16], [-3, 4, 9, 12], [-7, 0, 7, 12], [-5, 2, 7, 14]], scale: [0, 2, 4, 7, 9], arp: 0.5, bright: 0.6 },
  c1:    { root: 53, bpm: 72, chords: [[0, 7, 12, 16], [5, 9, 12, 17], [-3, 4, 9, 12], [7, 11, 14, 19]], scale: [0, 2, 4, 7, 9], arp: 0.7, bright: 0.7 },
  c2:    { root: 45, bpm: 60, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [-2, 5, 10, 14], [-5, 2, 7, 10]], scale: [0, 3, 5, 7, 10], arp: 0.45, bright: 0.35 },
  c3:    { root: 49, bpm: 56, chords: [[0, 7, 11, 16], [5, 12, 16, 21], [2, 9, 14, 17], [-1, 6, 11, 14]], scale: [0, 2, 4, 6, 7, 11], arp: 0.55, bright: 0.5 },
  c4:    { root: 47, bpm: 78, chords: [[0, 7, 12, 15], [-4, 3, 8, 15], [-7, 0, 5, 12], [-2, 5, 10, 14]], scale: [0, 2, 3, 7, 10], arp: 0.85, bright: 0.55 },
  daily: { root: 52, bpm: 70, chords: [[0, 4, 7, 14], [-3, 4, 9, 12], [5, 9, 12, 16], [7, 11, 14, 18]], scale: [0, 2, 4, 7, 9], arp: 0.65, bright: 0.65 },
  finale:{ root: 50, bpm: 66, chords: [[0, 4, 7, 14], [5, 9, 12, 16], [-3, 4, 7, 12], [7, 11, 14, 19]], scale: [0, 2, 4, 7, 9, 11], arp: 0.9, bright: 0.85 },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: "interactive" });
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicVol * 1.1; musicBus.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(comp);
  reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3.2, 2.6);
  const revOut = ctx.createGain(); revOut.gain.value = 0.55; reverb.connect(revOut); revOut.connect(comp);
  delay = ctx.createDelay(1.5); delay.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2400;
  delay.connect(dl); dl.connect(fb); fb.connect(delay);
  const delOut = ctx.createGain(); delOut.gain.value = 0.35; dl.connect(delOut); delOut.connect(reverb); delOut.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ctx;
}

// Browsers only allow sound after a user gesture.
export function unlockAudio() {
  initAudio();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}
export function suspendAudio() { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); }
export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }

export function setVolumes(music, sfx) {
  musicVol = music; sfxVol = sfx;
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(music * 1.1, ctx.currentTime, 0.1);
  sfxBus.gain.setTargetAtTime(sfx, ctx.currentTime, 0.05);
}

function makeImpulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// ---------------- music ----------------
export function playMusic(name) {
  if (!ctx) return;
  const th = THEMES[name] || THEMES.title;
  if (theme === th && playing) return;
  theme = th; barIndex = 0;
  nextBar = Math.max(ctx.currentTime + 0.1, nextBar);
  if (!playing) { playing = true; schedTimer = setInterval(schedule, 250); schedule(); }
}
export function stopMusic() {
  playing = false; clearInterval(schedTimer); theme = null;
}

function schedule() {
  if (!ctx || !theme || ctx.state !== "running") return;
  const barLen = (60 / theme.bpm) * 4;
  while (nextBar < ctx.currentTime + 1.2) {
    playBar(theme, barIndex, nextBar, barLen);
    nextBar += barLen;
    barIndex++;
  }
}

function playBar(th, i, t, len) {
  const chord = th.chords[i % th.chords.length];
  const root = th.root;
  // Pad: soft detuned triangles through a breathing lowpass.
  for (const n of chord) pad(mtof(root + n), t, len * 1.15, th.bright);
  // Bass: a single round note per bar.
  bass(mtof(root - 12 + chord[0]), t, len);
  // Arpeggio: sparse plucks walking the scale, seeded by the bar so it feels composed, not random.
  const steps = 8, stepLen = len / steps;
  let seed = (i * 9301 + 49297) % 233280;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let s = 0; s < steps; s++) {
    if (rnd() > th.arp * (s % 2 === 0 ? 1 : 0.55)) continue;
    const deg = th.scale[Math.floor(rnd() * th.scale.length)];
    const oct = rnd() < 0.3 ? 24 : 12;
    pluck(mtof(root + chord[0] % 12 + deg + oct), t + s * stepLen, 0.08 + rnd() * 0.06);
  }
  // Every fourth bar, a high bell for sparkle.
  if (i % 4 === 3) bell(mtof(root + 24 + chord[2] % 12 + 12), t + len * 0.5, 0.05);
}

function pad(f, t, dur, bright) {
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(400 + bright * 500, t);
  lp.frequency.linearRampToValueAtTime(900 + bright * 1400, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(400 + bright * 500, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  lp.connect(g); g.connect(musicBus); g.connect(reverb);
}
function bass(f, t, dur) {
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur);
}
function pluck(f, t, vol) {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2.01;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.9);
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  o.connect(g); o2.connect(g2); g2.connect(g);
  g.connect(musicBus); g.connect(delay);
  o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
}
function bell(f, t, vol, bus) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4);
  for (const [mult, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.18]]) {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * mult;
    const og = ctx.createGain(); og.gain.value = amp;
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.5);
  }
  g.connect(bus || musicBus); g.connect(reverb);
}

// ---------------- sound effects ----------------
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(type, f0, f1, t, dur, vol, dest = sfxBus) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  return g;
}
function noise(t, dur, vol, fType, f0, f1, q = 1) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = fType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.01, vol, dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  return g;
}

let lastBounce = 0;
export function sfx(name, o = {}) {
  if (!ctx || ctx.state !== "running" || sfxVol <= 0) return;
  const t = ctx.currentTime + 0.005;
  switch (name) {
    case "tap": tone("sine", 900, 700, t, 0.06, 0.12); break;
    case "back": tone("sine", 600, 420, t, 0.07, 0.1); break;
    case "launch": {
      const p = o.power ?? 0.5;
      noise(t, 0.18 + p * 0.25, 0.25 + p * 0.3, "bandpass", 300, 1800 + p * 2200, 1.4);
      tone("sine", 140, 60, t, 0.16, 0.35 + p * 0.25);
      break;
    }
    case "bounce": {
      if (t - lastBounce < 0.05) break; lastBounce = t;
      const v = Math.min(1, (o.impact ?? 100) / 400);
      tone("sine", 200 + v * 120, 55, t, 0.14, 0.15 + v * 0.45);
      noise(t, 0.05, 0.05 + v * 0.15, "lowpass", 1800, 300);
      break;
    }
    case "bump": {
      if (t - lastBounce < 0.05) break; lastBounce = t;
      tone("square", 520, 780, t, 0.09, 0.08); tone("sine", 1040, 1560, t, 0.12, 0.1);
      break;
    }
    case "land": [0, 4, 7].forEach((n, k) => tone("triangle", mtof(67 + n), mtof(67 + n), t + k * 0.03, 0.5, 0.09)); break;
    case "warp": {
      const o1 = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      o1.type = "sine"; mod.frequency.value = 37; mg.gain.value = 300;
      o1.frequency.setValueAtTime(180, t); o1.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
      mod.connect(mg); mg.connect(o1.frequency); env(g, t, 0.02, 0.18, 0.45);
      o1.connect(g); g.connect(sfxBus); g.connect(reverb);
      o1.start(t); mod.start(t); o1.stop(t + 0.55); mod.stop(t + 0.55);
      break;
    }
    case "lip": tone("triangle", 880, 880, t, 0.08, 0.12); tone("triangle", 660, 660, t + 0.09, 0.14, 0.12); break;
    case "holed": {
      const notes = [72, 76, 79, 84, 88];
      notes.forEach((n, k) => bell(mtof(n), t + k * 0.075, 0.12, sfxBus));
      noise(t, 0.6, 0.06, "highpass", 4000, 9000);
      break;
    }
    case "star": bell(mtof(79 + (o.i || 0) * 4), t, 0.14, sfxBus); break;
    case "ace": {
      // fanfare: rising arpeggio into a held major chord
      [60, 64, 67, 72, 76, 79, 84].forEach((n, k) => bell(mtof(n), t + 0.35 + k * 0.06, 0.08, sfxBus));
      [72, 76, 79].forEach((n) => { const g = tone("triangle", mtof(n), mtof(n), t + 0.85, 1.4, 0.06); g.connect(reverb); });
      break;
    }
    case "swallowed": {
      tone("sawtooth", 260, 30, t, 1.1, 0.12);
      noise(t, 1.0, 0.18, "lowpass", 1500, 80, 2);
      break;
    }
    case "lost": tone("sine", 700, 180, t, 0.7, 0.12); break;
    case "orbit": tone("sine", 500, 300, t, 0.5, 0.1); tone("sine", 375, 225, t + 0.15, 0.5, 0.08); break;
    case "pulse": tone("sine", 1800, 1600, t, 0.05, 0.03 * (o.vol ?? 1)); break;
    case "unlock": [0, 7, 12, 16, 19].forEach((n, k) => bell(mtof(64 + n), t + k * 0.09, 0.1, sfxBus)); break;
    case "page": noise(t, 0.12, 0.05, "bandpass", 2000, 900, 0.8); break;
    case "power": tone("sine", 300 + (o.p || 0) * 500, 300 + (o.p || 0) * 500, t, 0.03, 0.025); break;
  }
}

// ---------------- haptics ----------------
let hapticsOn = true;
export function setHaptics(on) { hapticsOn = on; }
export function haptic(kind) {
  if (!hapticsOn) return;
  const H = window.Capacitor?.Plugins?.Haptics;
  try {
    if (H) {
      if (kind === "success") H.notification({ type: "SUCCESS" });
      else if (kind === "error") H.notification({ type: "ERROR" });
      else H.impact({ style: kind === "heavy" ? "HEAVY" : kind === "medium" ? "MEDIUM" : "LIGHT" });
      return;
    }
    if (navigator.vibrate) {
      const p = { light: 8, medium: 18, heavy: 40, success: [12, 60, 24], error: [40, 50, 40] }[kind] || 10;
      navigator.vibrate(p);
    }
  } catch (e) { /* haptics unavailable */ }
}
