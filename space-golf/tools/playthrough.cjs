// End-to-end playthrough: plays the whole campaign through the real UI in a phone-sized browser,
// then a Daily Orbit and a Free Orbit hole. Each shot is found by searching the game's own physics
// at the exact moment of play, so it exercises story cards, briefings, results, unlocks and saves.
//
//   node tools/playthrough.cjs
const { chromium, devices } = require("playwright");
const { start } = require("./static.cjs");

(async () => {
  const web = await start();
  const URL = process.env.URL || web.url;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__pg);
  // speed up animations of the real-time loop a little by not waiting on them: we poll state instead.
  const state = () => page.evaluate(() => ({ screen: __pg.screen, ov: __pg.overlays, g: __pg.game && { mode: __pg.game.mode, strokes: __pg.game.strokes, id: __pg.game.id, kind: __pg.game.kind } }));
  const tapIf = async (sel) => { if (await page.isVisible(sel)) { await page.tap(sel); return true; } return false; };

  // Search for the best shot right now: an ace if possible, else a landing that keeps us in play.
  const fire = () => page.evaluate(async () => {
    const core = await import("./js/core.js");
    const g = __pg.game;
    const lvl = g.level, world = new core.World(lvl), t0 = g.t;
    let landing = null;
    for (let a = 0; a < 360; a += 0.5) {
      for (let k = 1; k <= 24; k++) {
        const p = k / 24, r = (a * Math.PI) / 180, vx = Math.cos(r) * p * core.PHYS.maxSpeed, vy = Math.sin(r) * p * core.PHYS.maxSpeed;
        const res = core.simulate(world, g.rest, t0, vx, vy);
        if (res.ev === "holed") { __pg.shoot(vx, vy); return "ace"; }
        if (res.ev === "rest" && !landing) landing = [vx, vy];
      }
    }
    if (landing) { __pg.shoot(landing[0], landing[1]); return "land"; }
    __pg.shoot(100, 0); return "blind";
  });

  const results = [];
  const playCurrentHole = async (label) => {
    // dismiss story/brief cards
    for (let i = 0; i < 20; i++) {
      const s = await state();
      if (s.ov.includes("story")) { await page.tap("#sNext"); await page.waitForTimeout(80); continue; }
      if (s.ov.includes("brief")) { await page.tap("#bPlay"); await page.waitForTimeout(100); continue; }
      if (s.ov.includes("loading")) { await page.waitForTimeout(300); continue; }
      break;
    }
    const start = await state();
    const id = start.g && start.g.id;
    const kinds = [];
    for (let shot = 0; shot < 8; shot++) {
      let s = await state();
      if (s.g.mode !== "aim") break;
      kinds.push(await fire());
      // wait for the shot to resolve
      for (let w = 0; w < 400; w++) {
        await page.waitForTimeout(50);
        s = await state();
        if (s.g && s.g.mode !== "fly") break;
      }
      if (s.g.mode === "done") break;
    }
    // wait for result card
    await page.waitForFunction(() => __pg.overlays.includes("result"), null, { timeout: 8000 }).catch(() => {});
    const s = await state();
    const stars = await page.evaluate(() => document.querySelectorAll("#rStars span.on").length);
    await page.waitForTimeout(1200);
    const starsFinal = await page.evaluate(() => document.querySelectorAll("#rStars span.on").length);
    results.push({ id: id || label, strokes: s.g && s.g.strokes, shots: kinds.join(","), stars: starsFinal, done: s.ov.includes("result") });
    console.log(`${(id || label).padEnd(22)} ${s.ov.includes("result") ? "holed" : "NOT HOLED"} in ${s.g && s.g.strokes}  [${kinds.join(",")}]  stars ${starsFinal}`);
    return s.ov.includes("result");
  };

  await page.tap("#tPlay");
  let holesPlayed = 0;
  for (let n = 0; n < 60; n++) {
    const ok = await playCurrentHole("hole " + n);
    holesPlayed++;
    if (!ok) break;
    const finishing = (await page.textContent("#rNext")).includes("Finish chapter");
    await page.tap("#rNext");
    await page.waitForTimeout(300);
    if (finishing) {
      // chapter-close story, then chapters list (or title after the final chapter)
      for (let i = 0; i < 8 && (await page.isVisible("#ov-story")); i++) { await page.tap("#sNext"); await page.waitForTimeout(120); }
      await page.waitForTimeout(300);
      const s = await state();
      console.log(`  -> chapter finished, now on '${s.screen}'`);
      if (s.screen === "title") break;          // campaign complete
      // open next chapter's first hole via the UI
      await page.tap("#scr-chapters .chapter:not(.locked) >> nth=-1");
      await page.waitForTimeout(200);
      await page.tap("#holeGrid .hole-tile >> nth=0");
      await page.waitForTimeout(300);
    }
  }
  await page.screenshot({ path: process.env.SHOT || "/tmp/playthrough-title.png" });
  const summary = await page.evaluate(() => ({ stars: __pg.save.totalStars(), holes: __pg.save.holesDone(), ach: Object.keys(__pg.save.data.achievements) }));
  console.log("\ncampaign:", JSON.stringify(summary));

  // Daily and Free Orbit
  await page.tap("#tDaily");
  await page.waitForFunction(() => __pg.screen === "game", null, { timeout: 30000 });
  await playCurrentHole("daily");
  await page.tap("#rNext"); await page.waitForTimeout(300);
  await page.tap("#tFree");
  await page.waitForFunction(() => __pg.screen === "game", null, { timeout: 30000 });
  await playCurrentHole("free");
  console.log("\nerrors:", errors.length ? errors : "none");
  const failed = results.filter((r) => !r.done);
  console.log(`played ${results.length} holes, ${failed.length} failed`);
  process.exitCode = failed.length || errors.length ? 1 : 0;
  await browser.close();
  web.close();
})();
