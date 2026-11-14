// Captures 1080x1920 Play Store screenshots from the running game (serve www/ on :8765 first).
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "../store/screenshots");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForFunction(() => window.__pg);
  // some believable progress for the menus
  await page.evaluate(() => {
    const ids = ["c1h1","c1h2","c1h3","c1h4","c1h5","c1h6","c1h7","c1h8","c1h9","c2h1","c2h2","c2h3","c2h4"];
    const st = [3,3,2,3,3,2,3,3,3,2,3,1,3];
    ids.forEach((id, i) => __pg.save.finishHole(id, st[i] === 3 ? 1 : st[i] === 2 ? 3 : 5, 3));
  });
  await page.reload(); await page.waitForFunction(() => window.__pg); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/1-title.png` });

  const aimShot = async (ci, hi, file, dx, dy, wait = 0) => {
    await page.evaluate(([c, h]) => __pg.play(c, h), [ci, hi]);
    await page.waitForTimeout(200);
    await page.tap("#bPlay");
    await page.waitForTimeout(400 + wait);
    const cx = 180, cy = 400;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let k = 1; k <= 12; k++) { await page.mouse.move(cx + dx * k / 12, cy + dy * k / 12); await page.waitForTimeout(16); }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${file}` });
    await page.mouse.up();
  };
  await aimShot(1, 8, "2-dark-halo.png", -25, 85);
  await aimShot(2, 8, "3-eye-of-the-veil.png", 20, -60, 300);
  await aimShot(3, 8, "4-grand-tour.png", -30, 80);
  // result card
  await page.evaluate(() => __pg.play(0, 2)); await page.waitForTimeout(200); await page.tap("#bPlay"); await page.waitForTimeout(200);
  await page.evaluate(async () => {
    const core = await import("./js/core.js"); const g = __pg.game, w = new core.World(g.level);
    for (let a = 0; a < 360; a += 0.5) for (let k = 1; k <= 24; k++) { const p = k / 24, r = a * Math.PI / 180, vx = Math.cos(r) * p * 620, vy = Math.sin(r) * p * 620;
      if (core.simulate(w, null, g.t, vx, vy).ev === "holed") { __pg.shoot(vx, vy); return; } }
  });
  await page.waitForFunction(() => __pg.overlays.includes("result"), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/5-hole-in-one.png` });
  await page.tap("#rMenu"); await page.waitForTimeout(200);
  await page.tap("[data-back] >> nth=1"); await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/6-chapters.png` });
  await b.close();
  console.log("written to", OUT);
})();
