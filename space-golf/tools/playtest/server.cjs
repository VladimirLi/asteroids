// Playtest session server: one phone-sized browser that a tester drives like a human would:
// look at the screen, tap, drag to aim, adjust, release. Game time only advances while a command
// runs, so a slow tester sees the game the way a person watching in real time would.
//
//   node tools/playtest/server.cjs <port> [width] [height]      (serve www/ on :8765 first)
//   node tools/playtest/pt.cjs <port> <command> [args]           (see pt.cjs for commands)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const port = Number(process.argv[2] || 9101);
let W = Number(process.argv[3] || 360), H = Number(process.argv[4] || 760);
const URL_ = process.env.GAME_URL || "http://127.0.0.1:8765/";
const outDir = process.env.PT_OUT || path.join("/tmp", "playtest-" + port);
fs.mkdirSync(outDir, { recursive: true });

let page, cdp, shotN = 0, finger = null;
const errors = [];

async function boot() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.clock.install({ time: new Date("2026-11-14T10:00:00") });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__pg);
  await page.clock.pauseAt(new Date("2026-11-14T10:00:03"));
  cdp = await ctx.newCDPSession(page);
  await run(500);
}
const run = async (ms) => { for (let left = ms; left > 0; left -= 100) await page.clock.runFor(Math.min(100, left)); };
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }] });

// What a person can read on screen right now, plus where the buttons are.
async function look(extra = "") {
  const file = path.join(outDir, `shot-${String(++shotN).padStart(3, "0")}.png`);
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => {
    const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const ovs = [...document.querySelectorAll(".overlay")].filter(vis);
    const top = ovs[ovs.length - 1];
    const scr = [...document.querySelectorAll(".screen")].find(vis);
    const scope = top || scr || document.body;
    const buttons = [...scope.querySelectorAll("button, input")].filter(vis).map((b) => {
      const r = b.getBoundingClientRect();
      return `  [${b.tagName === "INPUT" ? b.type + " " + b.id : b.innerText.replace(/\s+/g, " ").trim() || b.getAttribute("aria-label")}] at ${Math.round(r.x + r.width / 2)},${Math.round(r.y + r.height / 2)}${b.disabled ? " (disabled)" : ""}`;
    });
    const toast = document.getElementById("toast");
    const ach = document.getElementById("achToast");
    return {
      screen: scr ? scr.id.replace("scr-", "") : "?",
      dialog: top ? top.id.replace("ov-", "") : null,
      text: (top ? top.innerText : scr ? scr.innerText : "").replace(/\n{2,}/g, "\n").trim(),
      buttons,
      toast: toast && toast.classList.contains("show") ? toast.textContent : "",
      ach: ach && !ach.hidden ? ach.innerText.replace(/\s+/g, " ") : "",
    };
  });
  const lines = [];
  if (extra) lines.push(extra);
  lines.push(`screenshot: ${file}   (image pixels = touch coordinates, ${W}x${H})`);
  lines.push(`screen: ${info.screen}${info.dialog ? "   dialog on top: " + info.dialog : ""}${finger ? "   FINGER DOWN at " + finger.join(",") : ""}`);
  if (info.toast) lines.push(`popup message: "${info.toast}"`);
  if (info.ach) lines.push(`banner: "${info.ach}"`);
  lines.push("visible text:", ...info.text.split("\n").map((l) => "  | " + l));
  lines.push("tappable:", ...info.buttons);
  if (errors.length) lines.push("JS ERRORS: " + errors.splice(0).join(" || "));
  return lines.join("\n");
}

const gameMode = () => page.evaluate(() => (window.__pg.game ? window.__pg.game.mode : null));

const commands = {
  async look() { return look(); },
  async tap(x, y) {
    await touch("touchStart", +x, +y); await run(50); await touch("touchEnd"); await run(700);
    // loading screens (Daily / Free Orbit) finish on their own
    for (let i = 0; i < 100 && (await page.evaluate(() => window.__pg.overlays.includes("loading"))); i++) await run(200);
    return look(`tapped ${x},${y}`);
  },
  async aim(x1, y1, x2, y2) {
    if (finger) return look("finger is already down; use adjust, release or cancel");
    await touch("touchStart", +x1, +y1); await run(30);
    for (let k = 1; k <= 8; k++) { await touch("touchMove", +x1 + ((+x2 - +x1) * k) / 8, +y1 + ((+y2 - +y1) * k) / 8); await run(16); }
    finger = [+x2, +y2]; await run(150);
    return look(`finger down at ${x1},${y1}, dragged to ${x2},${y2}, still holding`);
  },
  async adjust(x2, y2) {
    if (!finger) return look("no finger down; use aim first");
    const [fx, fy] = finger;
    for (let k = 1; k <= 4; k++) { await touch("touchMove", fx + ((+x2 - fx) * k) / 4, fy + ((+y2 - fy) * k) / 4); await run(16); }
    finger = [+x2, +y2]; await run(150);
    return look(`finger moved to ${x2},${y2}, still holding`);
  },
  async hold(ms) {
    if (!finger) return look("no finger down");
    await run(Math.min(10000, +ms || 500));
    return look(`held for ${ms} ms`);
  },
  async release() {
    if (!finger) return look("no finger down");
    await run(100); await touch("touchEnd"); finger = null;
    await run(50);
    const seen = new Set(); let t = 0; const frames = [];
    if ((await gameMode()) === "fly") {
      for (; t < 25000; t += 100) {
        await run(100);
        const toast = await page.evaluate(() => { const e = document.getElementById("toast"); return e.classList.contains("show") ? e.textContent : ""; });
        if (toast) seen.add(toast);
        if (t === 700) { const f = path.join(outDir, `shot-${String(++shotN).padStart(3, "0")}-midflight.png`); await page.screenshot({ path: f }); frames.push(f); }
        if ((await gameMode()) !== "fly") break;
      }
      await run(1900);
      return look(`released. ball flew for about ${(t / 1000).toFixed(1)} s.${seen.size ? " messages during flight: " + [...seen].map((s) => `"${s}"`).join(", ") : ""}${frames.length ? " mid-flight frame: " + frames[0] : ""}`);
    }
    await run(300);
    return look("released, but no shot was fired (drag too short, or the game was not waiting for a shot)");
  },
  async cancel() { await touch("touchCancel"); finger = null; await run(200); return look("touch cancelled"); },
  async wait(ms) { await run(Math.min(15000, +ms || 1000)); return look(`waited ${ms} ms`); },
  async back() { await page.keyboard.press("Escape"); await run(500); return look("pressed the Android back button"); },
  async rotate() { [W, H] = [H, W]; await page.setViewportSize({ width: W, height: H }); await run(600); return look(`rotated the phone: now ${W}x${H}`); },
  async slider(id, value) {
    await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, [id, value]);
    await run(300); return look(`set ${id} to ${value}`);
  },
  // Test setup only (not something a player can do): open every hole for selection.
  async "setup-unlock-all"() {
    await page.evaluate(async () => {
      const { CHAPTERS } = await import("./js/levels/index.js");
      window.__pg.save.markSeen("prologue");
      for (const c of CHAPTERS) { window.__pg.save.markSeen("open-" + c.id); for (const h of c.holes) if (!window.__pg.save.hole(h.id)) window.__pg.save.finishHole(h.id, h.par + 1, h.par); }
    });
    await page.reload(); await page.waitForFunction(() => window.__pg); await run(600);
    return look("setup: every hole is now selectable (each marked as finished one over par)");
  },
  async "setup-reset"() {
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await page.waitForFunction(() => window.__pg); await run(600);
    return look("setup: save data wiped, fresh install state");
  },
};

http.createServer(async (req, res) => {
  const [cmd, ...args] = decodeURIComponent(req.url.slice(1)).split("/");
  try {
    if (!commands[cmd]) throw new Error("unknown command " + cmd + ". commands: " + Object.keys(commands).join(", "));
    res.end((await commands[cmd](...args)) + "\n");
  } catch (e) { res.statusCode = 500; res.end("ERROR: " + e.message + "\n"); }
}).listen(port, "127.0.0.1", async () => { await boot(); console.log("playtest session ready on", port, "screens in", outDir); });
