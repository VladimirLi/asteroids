// Daily Orbit: a procedurally generated hole, identical for every player on a given date,
// verified on-device to be holeable in one before it is served.
import { rng, findAces, PHYS } from "./core.js";

const COLORS = ["#5b8def", "#e0905a", "#7cc97a", "#c27be0", "#e0c35a", "#5ac8c8", "#d96a7a"];
const NAMES_A = ["Quiet", "Crooked", "Amber", "Hollow", "Silver", "Drifting", "Long", "Twin", "Burning", "Sleeping", "Lucky", "Distant"];
const NAMES_B = ["Orbit", "Fairway", "Dogleg", "Reach", "Approach", "Corridor", "Gap", "Spiral", "Crossing", "Turn", "Passage", "Green"];

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function yesterdayKey(d = new Date()) {
  const y = new Date(d); y.setDate(y.getDate() - 1); return dateKey(y);
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Build one candidate hole from a seed. Pure function of the seed.
export function generate(seed, label) {
  const R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const between = (a, b) => a + R() * (b - a);
  const W = PHYS.worldW, H = PHYS.worldH;
  // Tee on one side, cup on the other, with some vertical spread.
  const flip = R() < 0.5;
  const tee = { x: Math.round(between(150, 260)), y: Math.round(between(160, H - 160)) };
  const hole = { x: Math.round(between(W - 280, W - 160)), y: Math.round(between(150, H - 150)) };
  if (flip) { tee.x = W - tee.x; hole.x = W - hole.x; }
  const bodies = [];
  const solids = [];  // {x,y,r} footprints for spacing
  const clear = (x, y, r, gap = 45) => {
    if (x - r < 60 || x + r > W - 60 || y - r < 60 || y + r > H - 60) return false;
    if (Math.hypot(x - tee.x, y - tee.y) < r + 80) return false;
    if (Math.hypot(x - hole.x, y - hole.y) < r + PHYS.greenR + 30) return false;
    return solids.every((s) => Math.hypot(x - s.x, y - s.y) > r + s.r + gap);
  };
  const place = (r, tries = 40, band = [0.2, 0.85]) => {
    for (let k = 0; k < tries; k++) {
      const x = between(W * band[0], W * band[1]), y = between(100, H - 100);
      if (clear(x, y, r)) { solids.push({ x, y, r }); return { x: Math.round(x), y: Math.round(y) }; }
    }
    return null;
  };

  // A centerpiece that blocks the straight line, plus 2–4 supporting bodies.
  const mid = { x: (tee.x + hole.x) / 2 + between(-80, 80), y: (tee.y + hole.y) / 2 + between(-90, 90) };
  const centre = pick(["planet", "planet", "blackhole", "planet", "pulsar", "binary", "repulsors"]);
  if (centre === "planet") {
    const r = Math.round(between(50, 85));
    if (clear(mid.x, mid.y, r)) { solids.push({ ...mid, r }); bodies.push({ type: "planet", x: Math.round(mid.x), y: Math.round(mid.y), r, mu: Math.round(600 * r * r), color: pick(COLORS) });
      if (R() < 0.45) bodies.push({ type: "moon", r: Math.round(between(16, 26)), mu: 5e5, color: "#c9d1e6", orbit: { around: bodies.length - 1, r: Math.round(r + between(70, 120)), period: +between(4.5, 7).toFixed(1), phase: +between(0, 6.28).toFixed(2), dir: R() < 0.5 ? 1 : -1 } }); }
  } else if (centre === "blackhole") {
    const hz = Math.round(between(24, 30));
    if (clear(mid.x, mid.y, hz * 3)) { solids.push({ ...mid, r: hz * 3 }); bodies.push({ type: "blackhole", x: Math.round(mid.x), y: Math.round(mid.y), r: hz - 8, horizon: hz, mu: Math.round(between(3.5e6, 5.5e6)) }); }
  } else if (centre === "pulsar") {
    if (clear(mid.x, mid.y, 60)) { solids.push({ ...mid, r: 60 }); const period = +between(2.6, 3.6).toFixed(1); bodies.push({ type: "pulsar", x: Math.round(mid.x), y: Math.round(mid.y), r: 17, mu: Math.round(between(4e6, 6.5e6)), pulse: { period, on: +(period * between(0.35, 0.5)).toFixed(1), offset: 0 } }); }
  } else if (centre === "binary") {
    const r = Math.round(between(80, 110));
    if (clear(mid.x, mid.y, r + 40)) {
      solids.push({ ...mid, r: r + 40 });
      const period = +between(8, 11).toFixed(1), ph = +between(0, 3.14).toFixed(2);
      for (const off of [0, Math.PI]) bodies.push({ type: "star", r: 28, mu: 1.8e6, color: off ? "#ff8a5c" : "#ffb347", orbit: { cx: Math.round(mid.x), cy: Math.round(mid.y), r, period, phase: +(ph + off).toFixed(2) } });
    }
  } else {
    for (const dy of [-150, 0, 150]) {
      const x = mid.x, y = mid.y + dy;
      if (clear(x, y, 24, 60)) { solids.push({ x, y, r: 24 }); bodies.push({ type: "repulsor", x: Math.round(x), y: Math.round(y), r: 22, mu: -1.8e6 }); }
    }
  }

  const extras = 2 + Math.floor(R() * 3);
  for (let k = 0; k < extras; k++) {
    const kind = pick(["planet", "planet", "asteroid", "asteroid", "repulsor", "cloud", "blackhole", "wormhole"]);
    if (kind === "planet") { const r = Math.round(between(35, 60)); const p = place(r); if (p) bodies.push({ type: "planet", ...p, r, mu: Math.round(600 * r * r), color: pick(COLORS) }); }
    else if (kind === "asteroid") { const r = Math.round(between(14, 26)); const p = place(r, 40, [0.1, 0.95]); if (p) bodies.push({ type: "asteroid", ...p, r, mu: 0, color: pick(["#8a8f9c", "#9c8a7a"]) }); }
    else if (kind === "repulsor") { const p = place(60); if (p) bodies.push({ type: "repulsor", ...p, r: 22, mu: -Math.round(between(1.4e6, 2.2e6)) }); }
    else if (kind === "blackhole" && !bodies.some((b) => b.type === "blackhole")) { const p = place(80); if (p) bodies.push({ type: "blackhole", ...p, r: 18, horizon: 26, mu: Math.round(between(2.5e6, 4e6)) }); }
    else if (kind === "cloud" && !bodies.some((b) => b.type === "cloud")) {
      // Clouds sit around the cup or across the approach.
      const r = Math.round(between(120, 180));
      const nearCup = R() < 0.6;
      const c = nearCup ? { x: hole.x, y: hole.y } : { x: Math.round(mid.x + between(-150, 150)), y: Math.round(mid.y + between(-150, 150)) };
      bodies.unshift({ type: "cloud", ...c, r, drag: +between(0.9, 1.6).toFixed(1) });
      // indices shift: fix orbit and wormhole references
      bodies.forEach((b) => { if (b.orbit && typeof b.orbit.around === "number") b.orbit.around++; if (typeof b.link === "number") b.link++; });
    } else if (kind === "wormhole" && !bodies.some((b) => b.type === "wormhole")) {
      const a = place(40, 40, [0.15, 0.6]), b = place(40, 40, [0.45, 0.9]);
      if (a && b) {
        const i = bodies.length;
        bodies.push({ type: "wormhole", ...a, r: 26, link: i + 1, hue: 190 }, { type: "wormhole", ...b, r: 26, link: i, hue: 190 });
      }
    }
  }
  const name = `${pick(NAMES_A)} ${pick(NAMES_B)}`;
  return { id: "daily-" + label, name, par: 3, w: W, h: H, preview: 1.3, hint: "A new hole every day. <b>Same hole for everyone.</b>", tee, hole, bodies, seed };
}

// Find the first seed variant for this label whose hole is fair: aces exist, but not too many.
export async function dailyHole(label, onProgress) {
  const base = hashStr("perihelion:" + label);
  for (let k = 0; k < 40; k++) {
    const lvl = generate((base + k * 7919) >>> 0, label);
    if (lvl.bodies.length < 2) continue;
    const yieldNow = () => new Promise((r) => setTimeout(r, 0));
    const aces = await findAces(lvl, { angStep: 2, powers: 12, onChunk: yieldNow });
    if (onProgress) onProgress(k);
    const rate = aces.length / (180 * 12);
    if (aces.length < 4 || rate > 0.05) continue;
    // Moving holes must be fair whenever you shoot, not only at one lucky moment.
    if (lvl.bodies.some((b) => b.orbit || b.pulse)) {
      const later = await findAces(lvl, { angStep: 3, powers: 10, t0: 2.7, onChunk: yieldNow });
      if (later.length < 3) continue;
    }
    lvl.aceCount = aces.length; return lvl;
  }
  // Fallback that is always fair.
  return { id: "daily-" + label, name: "Calm Orbit", par: 3, w: 1400, h: 900, preview: 1.5, hint: "A quiet day in the Links.", tee: { x: 200, y: 450 }, hole: { x: 1200, y: 450 },
    bodies: [{ type: "planet", x: 700, y: 430, r: 60, mu: 2.2e6, color: "#5b8def" }] };
}
