// Captures landscape screenshots for the itch.io page: title, chapters, and mid-flight aces on static holes.
//   node tools/itch-shots.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { World, simulate, PHYS } from "../www/js/core.js";
import { CHAPTERS } from "../www/js/levels/index.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { start } = require("./static.cjs");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../store/itch");
const HOLES = [[0, 2], [1, 5], [2, 5], [2, 8], [1, 1]];

function ace(level) {            // the quickest ace with room either side
  const w = new World(level); let best = null;
  for (let a = 0; a < 360; a += 1) for (let k = 4; k <= 20; k++) {
    const r = (a * Math.PI) / 180, v = (k / 20) * PHYS.maxSpeed, res = simulate(w, null, 0, Math.cos(r) * v, Math.sin(r) * v);
    if (res.ev === "holed" && res.t > 2 && (!best || res.t < best.t)) best = { vx: Math.cos(r) * v, vy: Math.sin(r) * v, t: res.t };
  }
  return best;
}
const srv = await start();
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })).newPage();
await page.goto(srv.url); await page.waitForFunction(() => window.__pg);
await page.evaluate(() => { const ids = ["c1h1","c1h2","c1h3","c1h4","c1h5","c1h6","c1h7","c1h8","c1h9","c2h1","c2h2","c2h3","c2h4"]; const st = [3,3,2,3,3,2,3,3,3,2,3,1,3];
  ids.forEach((id, i) => __pg.save.finishHole(id, st[i] === 3 ? 1 : st[i] === 2 ? 3 : 5, 3)); __pg.save.markSeen("prologue"); });
await page.reload(); await page.waitForFunction(() => window.__pg); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/1-title.png` });
let n = 2;
for (const [ci, hi] of HOLES) {
  const level = CHAPTERS[ci].holes[hi], shot = ace(level);
  await page.evaluate(([c, h]) => __pg.play(c, h), [ci, hi]); await page.waitForTimeout(700);
  await page.evaluate(() => { for (const o of document.querySelectorAll(".overlay")) if (!o.hidden) { const p = o.querySelector(".primary"); p && p.click(); } });
  await page.waitForTimeout(500);
  await page.evaluate(([vx, vy]) => __pg.shoot(vx, vy), [shot.vx, shot.vy]);
  await page.waitForTimeout(shot.t * 1000 * 0.72);
  await page.screenshot({ path: `${OUT}/${n++}-${level.name.toLowerCase().replace(/ /g, "-")}.png` });
  await page.waitForTimeout(shot.t * 1000 * 0.4 + 2500);
  if (n === 4) await page.screenshot({ path: `${OUT}/${n++}-hole-in-one.png` });
}
await b.close(); await srv.close();
