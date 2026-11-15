// Perihelion Golf — simulation core.
// Pure, deterministic, DOM-free. Shared by the game, the daily-hole generator and tools/solve.mjs.

export const PHYS = {
  dt: 1 / 120,
  ballR: 7,
  restSpeed: 42,      // slower than this when touching a landable body = landed
  restitution: 0.42,
  friction: 0.7,
  maxSpeed: 620,      // launch speed at full power
  captureSpeed: 300,  // the cup only catches balls slower than this
  holeR: 22,
  holeMu: 300000,     // the cup tugs slow balls in from the green
  greenR: 78,         // soft braking zone around every cup
  greenDrag: 2.6,
  maxFlight: 9,      // seconds before a ball is declared lost in orbit
  margin: 260,        // how far outside the course before the ball is lost
  soft: 10,
  worldW: 1400,
  worldH: 900,
};

// What each body type does. Gravity strength is mu (G*M): acceleration = mu / r^2; negative pushes.
export const KINDS = {
  planet:   { solid: true, land: true },
  moon:     { solid: true, land: true },
  asteroid: { solid: true, land: true },
  repulsor: { solid: true, land: false, bounce: 0.85 },
  pulsar:   { solid: true, land: false, bounce: 0.85 },
  star:     { solid: true, land: false, bounce: 0.6 },
  blackhole:{ solid: false },
  cloud:    { solid: false },
  wormhole: { solid: false },
};

// A World caches per-level data so stepping is allocation-free.
export class World {
  constructor(level) {
    this.level = level;
    this.n = level.bodies.length;
    this.x = new Float64Array(this.n);
    this.y = new Float64Array(this.n);
    this.vx = new Float64Array(this.n);
    this.vy = new Float64Array(this.n);
    this.on = new Uint8Array(this.n);
    this.t = NaN;
    this.dynamic = level.bodies.some((b) => b.orbit || b.pulse);
    this.order = orbitOrder(level.bodies);
    this.at(0);
  }
  // Position every body at time t (cheap no-op for static levels after the first call).
  at(t) {
    if (t === this.t) return this;
    if (!this.dynamic && this.t === this.t) return this;  // static: computed once
    this.t = t;
    const B = this.level.bodies;
    for (const i of this.order) {
      const b = B[i];
      if (b.orbit) {
        const o = b.orbit;
        let cx, cy, cvx = 0, cvy = 0;
        if (typeof o.around === "number") { cx = this.x[o.around]; cy = this.y[o.around]; cvx = this.vx[o.around]; cvy = this.vy[o.around]; }
        else { cx = o.cx; cy = o.cy; }
        const w = (2 * Math.PI) / o.period * (o.dir || 1);
        const a = o.phase + w * t;
        this.x[i] = cx + o.r * Math.cos(a);
        this.y[i] = cy + o.r * Math.sin(a);
        this.vx[i] = cvx - o.r * w * Math.sin(a);
        this.vy[i] = cvy + o.r * w * Math.cos(a);
      } else {
        this.x[i] = b.x; this.y[i] = b.y; this.vx[i] = 0; this.vy[i] = 0;
      }
      this.on[i] = b.pulse ? (pulsePhase(b, t).on ? 1 : 0) : 1;
    }
    return this;
  }
}

function orbitOrder(bodies) {
  const done = new Set(), order = [];
  const visit = (i, depth = 0) => {
    if (done.has(i) || depth > 10) return;
    const o = bodies[i].orbit;
    if (o && typeof o.around === "number") visit(o.around, depth + 1);
    done.add(i); order.push(i);
  };
  bodies.forEach((_, i) => visit(i));
  return order;
}

export function pulsePhase(b, t) {
  const p = b.pulse;
  const ph = (((t + (p.offset || 0)) % p.period) + p.period) % p.period;
  const on = ph < p.on;
  return { on, remaining: on ? p.on - ph : p.period - ph, frac: on ? ph / p.on : (ph - p.on) / (p.period - p.on) };
}

export function newBall(x, y, vx, vy) {
  return { x, y, vx, vy, time: 0, cool: 0, lip: false, rest: null, events: [], impact: 0 };
}

// Advance the ball one step. Returns a terminal event or null:
// "holed" | "rest" | "swallowed" | "lost" | "orbit".  Non-terminal events go to s.events.
export function step(world, s, t, dt = PHYS.dt) {
  const L = world.level, B = L.bodies;
  world.at(t);
  const X = world.x, Y = world.y;
  let ax = 0, ay = 0, drag = 0;
  const soft2 = PHYS.soft * PHYS.soft;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const dx = X[i] - s.x, dy = Y[i] - s.y;
    if (b.type === "cloud") { if (dx * dx + dy * dy < b.r * b.r) drag += b.drag; continue; }
    const mu = b.mu;
    if (!mu || !world.on[i]) continue;
    const r2 = dx * dx + dy * dy + soft2;
    const f = mu / (r2 * Math.sqrt(r2));
    ax += dx * f; ay += dy * f;
  }
  const h = L.hole;
  {
    const dx = h.x - s.x, dy = h.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < PHYS.greenR * PHYS.greenR) drag += PHYS.greenDrag;
    const r2 = d2 + soft2;
    const f = PHYS.holeMu / (r2 * Math.sqrt(r2));
    ax += dx * f; ay += dy * f;
  }
  s.vx += ax * dt; s.vy += ay * dt;
  if (drag) { const k = Math.exp(-drag * dt); s.vx *= k; s.vy *= k; }
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.time += dt;
  if (s.cool > 0) s.cool -= dt;

  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const dx = s.x - X[i], dy = s.y - Y[i];
    if (b.type === "blackhole") {
      if (dx * dx + dy * dy < b.horizon * b.horizon) return "swallowed";
      continue;
    }
    if (b.type === "wormhole") {
      if (s.cool <= 0 && dx * dx + dy * dy < (b.r + 5) * (b.r + 5)) {
        const j = b.link;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        s.x = X[j] + (s.vx / sp) * (B[j].r + 4);
        s.y = Y[j] + (s.vy / sp) * (B[j].r + 4);
        s.cool = 0.4;
        s.events.push("warp");
      }
      continue;
    }
    const k = KINDS[b.type];
    if (!k || !k.solid) continue;
    const minD = b.r + PHYS.ballR;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d, ny = dy / d;
    s.x = X[i] + nx * minD; s.y = Y[i] + ny * minD;
    let rvx = s.vx - world.vx[i], rvy = s.vy - world.vy[i];
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = k.land ? PHYS.restitution : k.bounce;
      const fr = k.land ? PHYS.friction : 1;
      const tx = rvx - vn * nx, ty = rvy - vn * ny;
      rvx = -e * vn * nx + tx * fr;
      rvy = -e * vn * ny + ty * fr;
      s.vx = rvx + world.vx[i]; s.vy = rvy + world.vy[i];
      s.impact = -vn;
      s.events.push(k.land ? "bounce" : "bump");
    }
    if (k.land && Math.hypot(rvx, rvy) < PHYS.restSpeed) {
      s.rest = { i, ang: Math.atan2(ny, nx) };
      return "rest";
    }
  }

  const hd2 = (s.x - h.x) ** 2 + (s.y - h.y) ** 2;
  if (hd2 < PHYS.holeR * PHYS.holeR) {
    if (s.vx * s.vx + s.vy * s.vy < PHYS.captureSpeed * PHYS.captureSpeed) return "holed";
    if (!s.lip) { s.lip = true; s.events.push("lip"); }
  } else if (hd2 > 4 * PHYS.holeR * PHYS.holeR) s.lip = false;

  const m = PHYS.margin;
  if (s.x < -m || s.y < -m || s.x > L.w + m || s.y > L.h + m) return "lost";
  if (s.time > PHYS.maxFlight) return "orbit";
  return null;
}

// Where the ball sits when resting: null = tee, {x,y} = fixed point, {i, ang} = on a body.
export function restPos(world, rest, t) {
  const L = world.level;
  if (!rest) return { x: L.tee.x, y: L.tee.y, vx: 0, vy: 0 };
  if (rest.i === undefined) return { x: rest.x, y: rest.y, vx: 0, vy: 0 };
  world.at(t);
  const R = L.bodies[rest.i].r + PHYS.ballR + 0.5;
  return { x: world.x[rest.i] + R * Math.cos(rest.ang), y: world.y[rest.i] + R * Math.sin(rest.ang), vx: world.vx[rest.i], vy: world.vy[rest.i] };
}

export function launch(world, rest, t, vx, vy) {
  const p = restPos(world, rest, t);
  return newBall(p.x, p.y, vx + p.vx, vy + p.vy);
}

// Run one whole shot. Returns { ev, rest, t, path? }.
export function simulate(world, rest, t0, vx, vy, keepPath = false) {
  const s = launch(world, rest, t0, vx, vy);
  let t = t0;
  const path = keepPath ? [] : null;
  let k = 0;
  for (;;) {
    t += PHYS.dt;
    const ev = step(world, s, t);
    if (path && (k++ % 3 === 0 || s.events.includes("warp"))) path.push(s.x, s.y, s.events.includes("warp") ? 1 : 0);
    s.events.length = 0;
    if (ev) return { ev, rest: s.rest, t, x: s.x, y: s.y, path };
  }
}

// Coarse search for hole-in-one shots. Used to validate generated daily holes on-device.
// Yields between chunks via the optional `yieldEvery` callback.
export async function findAces(level, { angStep = 2, powers = 12, t0 = 0, limit = Infinity, onChunk } = {}) {
  const world = new World(level);
  const found = [];
  let n = 0;
  for (let a = 0; a < 360; a += angStep) {
    for (let k = 1; k <= powers; k++) {
      const p = k / powers, r = (a * Math.PI) / 180;
      const res = simulate(world, null, t0, Math.cos(r) * p * PHYS.maxSpeed, Math.sin(r) * p * PHYS.maxSpeed);
      if (res.ev === "holed") { found.push({ a, p }); if (found.length >= limit) return found; }
    }
    if (onChunk && ++n % 15 === 0) await onChunk(a / 360);
  }
  return found;
}

// Seeded PRNG (mulberry32) for the daily hole.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
