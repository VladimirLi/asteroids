// Perihelion Golf level verifier.
//
//   node tools/solve.mjs                 every chapter
//   node tools/solve.mjs c2              one chapter
//   node tools/solve.mjs c2h4            one hole
//   node tools/solve.mjs c2 --quick      coarser, ~4x faster (use while iterating)
//   node tools/solve.mjs --json out.json also write machine-readable results
//
// For each hole it checks:
//   PLAYABLE  - the hole can be completed within par (aces, or land-then-ace)
//   3-STAR    - it can be completed in par-1 strokes (3 stars need strokes <= par-1)
//   ace%      - share of all (angle, power[, timing]) shots that hole out in one
// and flags holes that are too punishing or too trivial.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { World, simulate, PHYS } from "../www/js/core.js";
import { CHAPTERS } from "../www/js/levels/index.js";

const ALL = CHAPTERS.flatMap((c) => c.holes.map((h) => ({ ...h, chapter: c.id })));

function solveHole(hole, quick) {
  const world = new World(hole);
  const angStep = quick ? 1 : 0.5, powers = quick ? 16 : 24;
  const starts = world.dynamic ? (quick ? [0, 1.1, 2.2, 3.3] : [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9]) : [0];
  let shots = 0, aces = 0;
  const landings = [];
  const fates = { holed: 0, rest: 0, swallowed: 0, lost: 0, orbit: 0 };
  const example = [];
  const windows = [];   // per launch time: widest run of neighbouring angles that all ace at one power
  for (const t0 of starts) {
    const run = new Array(powers + 1).fill(0), bestRun = new Array(powers + 1).fill(0);
    for (let a = 0; a < 360; a += angStep) {
      for (let k = 1; k <= powers; k++) {
        const p = k / powers, r = (a * Math.PI) / 180;
        const res = simulate(world, null, t0, Math.cos(r) * p * PHYS.maxSpeed, Math.sin(r) * p * PHYS.maxSpeed);
        shots++; fates[res.ev]++;
        if (res.ev === "holed") { aces++; if (example.length < 2) example.push(`t=${t0} ${a}deg ${Math.round(p * 100)}%`); }
        else if (res.ev === "rest") landings.push(res);
        run[k] = res.ev === "holed" ? run[k] + 1 : 0;
        if (run[k] > bestRun[k]) bestRun[k] = run[k];
      }
    }
    windows.push(Math.max(...bestRun) * angStep);
  }
  windows.sort((x, y) => x - y);
  const aimWindow = windows[Math.floor((windows.length - 1) / 2)];   // median over launch times
  const worstWindow = windows[0];
  const landPct = (100 * landings.length) / shots;
  // Two-stroke search from a spread of distinct landing spots.
  const seen = new Map();
  for (const l of landings) {
    const key = l.rest.i + ":" + Math.round(l.rest.ang * 3);
    if (!seen.has(key)) seen.set(key, l);
  }
  const spots = [...seen.values()];
  const sample = spots.filter((_, k) => k % Math.max(1, Math.floor(spots.length / 14)) === 0).slice(0, 14);
  let spotsWithAce = 0, twoShot = 0;
  for (const sp of sample) {
    let found = 0;
    const timings = world.dynamic ? [sp.t, sp.t + 1.3, sp.t + 2.6] : [sp.t];
    for (const t0 of timings) {
      for (let a = 0; a < 360; a += 1.5) {
        for (let k = 1; k <= 12; k++) {
          const p = k / 12, r = (a * Math.PI) / 180;
          const res = simulate(world, sp.rest, t0, Math.cos(r) * p * PHYS.maxSpeed, Math.sin(r) * p * PHYS.maxSpeed);
          if (res.ev === "holed") found++;
        }
      }
    }
    if (found) spotsWithAce++;
    twoShot += found;
  }
  const acePct = (100 * aces) / shots;
  const best = aces ? 1 : spotsWithAce ? 2 : null;  // best verified stroke count (null = >2, unverified)
  const playable = best !== null && best <= hole.par;
  const threeStar = best !== null && best <= hole.par - 1;
  const notes = [];
  if (!playable) notes.push("NOT VERIFIED PLAYABLE within par");
  if (!threeStar) notes.push("3 stars not verified");
  if (aimWindow < 2) notes.push(`aim window only ${aimWindow} deg (thumbs need 2+)`);
  if (world.dynamic && worstWindow < 1) notes.push(`at some moments the window is ${worstWindow} deg`);
  return { id: hole.id, name: hole.name, par: hole.par, shots, aces, acePct: +acePct.toFixed(2), aimWindow, worstWindow, landPct: +landPct.toFixed(1), landingSpots: spots.length,
    sampled: sample.length, spotsWithAce, fates, best, playable, threeStar, example, notes };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const quick = args.includes("--quick");
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  const filt = args.find((a) => /^c\d+(h\d+)?$/.test(a));
  const holes = ALL.filter((h) => !filt || h.id === filt || h.chapter === filt);
  if (!holes.length) { console.error("no holes match", filt); process.exit(1); }
  const nWorkers = Math.min(holes.length, Number(process.env.SOLVE_WORKERS) || os.cpus().length);
  const queue = holes.map((h) => h.id);
  const results = [];
  let live = 0;
  const t0 = Date.now();
  await new Promise((done) => {
    const spawn = () => {
      if (!queue.length) { if (!live) done(); return; }
      const id = queue.shift();
      live++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { id, quick } });
      w.on("message", (r) => {
        results.push(r);
        const flag = r.playable && r.threeStar && !r.notes.length ? "ok " : r.playable ? "!! " : "XX ";
        console.log(`${flag}${r.id.padEnd(6)} ${r.name.padEnd(20)} par ${r.par} | best ${r.best ?? ">2"} | ace ${String(r.acePct).padStart(5)}% | window ${String(r.aimWindow).padStart(4)}° (worst ${r.worstWindow}°) | lands ${String(r.landPct).padStart(4)}% | landings ${String(r.landingSpots).padStart(3)} (${r.spotsWithAce}/${r.sampled} can ace next) | lost ${r.fates.lost} swallowed ${r.fates.swallowed} orbit ${r.fates.orbit}${r.notes.length ? " | " + r.notes.join("; ") : ""}`);
      });
      w.on("error", (e) => { console.error(id, e); });
      w.on("exit", () => { live--; spawn(); });
    };
    for (let i = 0; i < nWorkers; i++) spawn();
  });
  results.sort((a, b) => ALL.findIndex((h) => h.id === a.id) - ALL.findIndex((h) => h.id === b.id));
  const bad = results.filter((r) => !r.playable || !r.threeStar || r.notes.length);
  console.log(`\n${results.length} holes in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${results.length - bad.length} fully verified, ${bad.length} need work${bad.length ? ": " + bad.map((b) => b.id).join(", ") : ""}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
  process.exitCode = bad.length ? 1 : 0;
} else {
  const hole = ALL.find((h) => h.id === workerData.id);
  parentPort.postMessage(solveHole(hole, workerData.quick));
}
