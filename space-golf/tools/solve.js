// Brute-force solver: checks every hole is completable and roughly how forgiving it is.
// Usage: node space-golf/tools/solve.js [holeNumber]
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = html.slice(html.indexOf("// CORE-BEGIN"), html.indexOf("// CORE-END"));
const { PHYS, LEVELS, stepBall, launchState } = new Function(core + "\nreturn { PHYS, LEVELS, stepBall, launchState };")();

function simulate(level, rest, t0, vx, vy) {
  const s = launchState(level, rest, t0, vx, vy);
  let t = t0;
  for (;;) {
    t += PHYS.dt;
    const ev = stepBall(s, level, t, PHYS.dt);
    s.events.length = 0;
    if (ev) return { ev, rest: s.rest, t };
  }
}

function sweep(level, rest, t0, angStep, powSteps) {
  const out = { shots: 0, holed: 0, rests: [], examples: [] };
  for (let a = 0; a < 360; a += angStep) {
    for (let k = 1; k <= powSteps; k++) {
      const p = k / powSteps;
      const r = (a * Math.PI) / 180;
      const res = simulate(level, rest, t0, Math.cos(r) * p * PHYS.maxSpeed, Math.sin(r) * p * PHYS.maxSpeed);
      out.shots++;
      if (res.ev === "holed") { out.holed++; if (out.examples.length < 3) out.examples.push(`${a.toFixed(1)}deg ${(p * 100).toFixed(0)}%`); }
      if (res.ev === "rest") out.rests.push({ rest: res.rest, t: res.t });
    }
  }
  return out;
}

function isDynamic(level) { return level.bodies.some((b) => b.orbit || b.pulse); }

const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
LEVELS.forEach((level, i) => {
  if (only !== null && only !== i) return;
  const starts = isDynamic(level) ? [0, 0.8, 1.6, 2.4, 3.2, 4.0] : [0];
  let shots = 0, holed = 0, rests = [], ex = [];
  for (const t0 of starts) {
    const r = sweep(level, null, t0, 0.5, 24);
    shots += r.shots; holed += r.holed; rests.push(...r.rests); ex.push(...r.examples.map((e) => `t=${t0} ${e}`));
  }
  // two-stroke check from a sample of distinct landing spots
  const seen = new Set(), spots = [];
  for (const r of rests) {
    const key = r.rest.i + ":" + Math.round(r.rest.ang * 4);
    if (!seen.has(key)) { seen.add(key); spots.push(r); }
  }
  let two = 0, spotsWithHole = 0;
  const sample = spots.filter((_, k) => k % Math.max(1, Math.floor(spots.length / 12)) === 0).slice(0, 12);
  for (const sp of sample) {
    const r = sweep(level, sp.rest, sp.t % 6, 1, 16);
    if (r.holed) spotsWithHole++;
    two += r.holed;
  }
  const pct = ((100 * holed) / shots).toFixed(2);
  console.log(`Hole ${i + 1} ${level.name.padEnd(16)} par ${level.par} | 1-shot: ${holed}/${shots} (${pct}%) | landing spots: ${spots.length}, ${spotsWithHole}/${sample.length} sampled can hole next shot`);
  if (ex.length) console.log("   e.g. " + ex.slice(0, 3).join(" | "));
});
