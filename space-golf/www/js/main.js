// Perihelion Golf — app shell: screens, story, progression, input and the game loop.
import { PHYS, World, step, restPos, launch, pulsePhase } from "./core.js";
import { CHAPTERS } from "./levels/index.js";
import { Renderer, drawIcon, shade } from "./render.js";
import { save } from "./save.js";
import * as A from "./audio.js";
import { PROLOGUE, CHAPTER_STORY, QUIPS, SPEAKER } from "./story.js";
import { dailyHole, dateKey, yesterdayKey } from "./daily.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const R = new Renderer(canvas);
const TOTAL_HOLES = CHAPTERS.reduce((n, c) => n + c.holes.length, 0);
const TOTAL_STARS = TOTAL_HOLES * 3;
const DAILY_SKY = { hue: 190, accent: "#6fe0d2" };
const FREE_SKY = { hue: 250, accent: "#c9a6ff" };

// ---------------------------------------------------------------- achievements
const ACH = [
  { id: "first_cup", name: "First Light", desc: "Sink your first ball." },
  { id: "ace", name: "Hole in One", desc: "Hole out with a single stroke." },
  { id: "ace10", name: "Sharpshooter", desc: "Make 10 holes in one." },
  { id: "c1", name: "Inner Links", desc: "Finish chapter 1." },
  { id: "c2", name: "Out of the Dark", desc: "Finish chapter 2." },
  { id: "c3", name: "Through the Veil", desc: "Finish chapter 3." },
  { id: "c4", name: "Perihel Wakes", desc: "Finish the final chapter." },
  { id: "stars", name: "Constellation", desc: `Earn all ${TOTAL_STARS} stars.` },
  { id: "moon", name: "Moonwalker", desc: "Land on a moon." },
  { id: "pinball", name: "Pinball", desc: "Bounce four times in one shot." },
  { id: "fast", name: "Escape Velocity", desc: "Reach a speed of 900 in flight." },
  { id: "warp", name: "Shortcut Artist", desc: "Travel through 25 wormholes." },
  { id: "swallowed", name: "Spaghettified", desc: "Lose a ball to a black hole." },
  { id: "comeback", name: "Never in Doubt", desc: "Make par or better after a penalty." },
  { id: "daily", name: "Daily Orbit", desc: "Finish a Daily Orbit hole." },
  { id: "streak3", name: "Regular", desc: "Finish the Daily Orbit three days in a row." },
  { id: "free10", name: "Wanderer", desc: "Finish 10 Free Orbit holes." },
];
let achQueue = [], achShowing = false;
function award(id) {
  if (!save.unlock(id)) return;
  const a = ACH.find((x) => x.id === id);
  achQueue.push(a);
  if (!achShowing) nextAch();
}
function nextAch() {
  const a = achQueue.shift();
  if (!a) { achShowing = false; return; }
  achShowing = true;
  $("achName").textContent = a.name;
  $("achToast").hidden = false;
  A.sfx("unlock"); A.haptic("success");
  setTimeout(() => { $("achToast").hidden = true; setTimeout(nextAch, 250); }, 2400);
}

// ---------------------------------------------------------------- settings
function applySettings() {
  const s = save.settings();
  A.setVolumes(s.music, s.sfx);
  A.setHaptics(s.haptics);
  $("setMusic").value = s.music; $("setSfx").value = s.sfx; $("setHaptics").checked = s.haptics;
}
$("setMusic").addEventListener("input", (e) => { save.setSetting("music", +e.target.value); applySettings(); });
$("setSfx").addEventListener("input", (e) => { save.setSetting("sfx", +e.target.value); applySettings(); });
$("setSfx").addEventListener("change", () => A.sfx("tap"));
$("setHaptics").addEventListener("change", (e) => { save.setSetting("haptics", e.target.checked); applySettings(); A.haptic("medium"); });

// ---------------------------------------------------------------- screens & overlays
let screen = "title";
const overlays = [];  // stack of open overlay ids
function show(scr) {
  for (const s of ["title", "chapters", "holes", "game"]) $("scr-" + s).hidden = s !== scr;
  screen = scr;
  if (scr !== "game") { game = null; menuScene.reset(); }
  if (scr === "title") renderTitle();
  if (scr === "chapters") renderChapters();
  if (scr === "holes") renderHoles();
  layoutRenderer();
  A.playMusic(scr === "game" && game ? game.music : "title");
}
function openOv(id) {
  if (!overlays.includes(id)) overlays.push(id);
  $("ov-" + id).hidden = false;
  const btn = $("ov-" + id).querySelector(".primary");
  if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 30);
}
function closeOv(id) {
  const i = overlays.indexOf(id);
  if (i >= 0) overlays.splice(i, 1);
  $("ov-" + id).hidden = true;
}
const topOv = () => overlays[overlays.length - 1];
function closeAllOverlays() { [...overlays].forEach(closeOv); }
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { A.sfx("back"); closeOv(b.closest(".overlay").id.slice(3)); }));
document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", goBack));
document.addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest("[data-close],[data-back]")) A.sfx("tap"); }, true);

function confirmBox(title, text, yesLabel) {
  return new Promise((res) => {
    $("cfTitle").textContent = title; $("cfText").textContent = text; $("cfYes").textContent = yesLabel;
    openOv("confirm");
    $("cfYes").onclick = () => { closeOv("confirm"); res(true); };
    $("cfNo").onclick = () => { closeOv("confirm"); res(false); };
  });
}

function goBack() {
  A.sfx("back");
  const top = topOv();
  if (top === "loading") return;
  if (top === "story") { $("sNext").click(); return; }
  if (top === "confirm") { $("cfNo").click(); return; }
  if (top === "brief") { closeOv("brief"); leaveGame(); return; }
  if (top === "result") { $("rMenu").click(); return; }
  if (top === "pause") { resume(); return; }
  if (top) { closeOv(top); return; }
  if (screen === "game") { pause(); return; }
  if (screen === "holes") { show("chapters"); return; }
  if (screen === "chapters") { show("title"); return; }
  if (screen === "title") { const App = window.Capacitor?.Plugins?.App; if (App) App.exitApp(); }
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") goBack();
  if ((e.key === "r" || e.key === "R") && screen === "game" && game?.mode === "fly") giveUpShot();
});
window.Capacitor?.Plugins?.App?.addListener?.("backButton", goBack);

// ---------------------------------------------------------------- story cards
function story(title, pages, onDone) {
  let i = 0;
  $("sSpeaker").textContent = SPEAKER;
  $("sTitle").textContent = title;
  const render = () => {
    $("sText").textContent = pages[i];
    $("sDots").textContent = pages.map((_, k) => (k === i ? "●" : "○")).join("");
    $("sNext").textContent = i === pages.length - 1 ? "Continue" : "Next";
  };
  $("sNext").onclick = () => {
    A.sfx("page");
    if (++i < pages.length) render();
    else { closeOv("story"); onDone && onDone(); }
  };
  render();
  openOv("story");
}

// ---------------------------------------------------------------- progression helpers
const holeDone = (id) => !!save.hole(id);
function chapterUnlocked(ci) { return ci === 0 || CHAPTERS[ci - 1].holes.every((h) => holeDone(h.id)); }
function holeUnlocked(ci, hi) { return chapterUnlocked(ci) && (hi === 0 || holeDone(CHAPTERS[ci].holes[hi - 1].id)); }
function chapterStars(ci) { return CHAPTERS[ci].holes.reduce((n, h) => n + (save.hole(h.id)?.stars || 0), 0); }
function nextHole() {
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    if (!chapterUnlocked(ci)) break;
    const hi = CHAPTERS[ci].holes.findIndex((h) => !holeDone(h.id));
    if (hi >= 0) return { ci, hi };
  }
  return null;
}

// ---------------------------------------------------------------- title
function renderTitle() {
  const done = save.holesDone();
  const nh = nextHole();
  $("tPlay").textContent = done === 0 ? "Play" : nh ? `Continue · ${CHAPTERS[nh.ci].holes[nh.hi].name}` : "Replay a chapter";
  $("tProgress").innerHTML = `<b>${save.totalStars()}</b> / ${TOTAL_STARS} stars · ${done} / ${TOTAL_HOLES} cups lit`;
  const today = save.data.daily[dateKey()];
  $("tDailySub").textContent = today ? `Today: ${today} strokes · streak ${save.data.streak}` : "A new hole today";
}
$("tPlay").onclick = () => {
  const nh = nextHole();
  if (!nh) { show("chapters"); return; }
  if (!save.seen("prologue")) {
    story("The Perihelion Links", PROLOGUE, () => { save.markSeen("prologue"); startHole(nh.ci, nh.hi); });
    return;
  }
  startHole(nh.ci, nh.hi);
};
$("tChapters").onclick = () => show("chapters");
$("tDaily").onclick = () => startDaily();
$("tFree").onclick = () => startFree();
$("tSettings").onclick = () => openOv("settings");
$("tLog").onclick = openLog;
$("pSettings").onclick = () => openOv("settings");
$("setCredits").onclick = () => openOv("credits");
$("setReset").onclick = async () => {
  if (await confirmBox("Reset progress?", "This clears every star, best score and logbook entry on this device. Settings are kept.", "Reset")) {
    save.reset(); closeOv("settings"); show("title");
  }
};

function openLog() {
  const c = save.data.counters;
  $("lMeta").textContent = `${Object.keys(save.data.achievements).length} of ${ACH.length} entries`;
  $("lStats").innerHTML = [
    [save.totalStars(), "Stars"], [save.holesDone(), "Cups lit"], [c.aces || 0, "Holes in one"],
    [c.shots || 0, "Shots"], [c.warps || 0, "Wormholes"], [save.data.streak || 0, "Daily streak"],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("lList").innerHTML = ACH.map((a) => {
    const got = save.data.achievements[a.id];
    return `<div class="ach ${got ? "" : "off"}"><span class="ic">${got ? "★" : "☆"}</span><span><b>${a.name}</b><small>${a.desc}</small></span></div>`;
  }).join("");
  openOv("log");
}

// ---------------------------------------------------------------- chapter & hole select
let viewChapter = 0;
function renderChapters() {
  $("cStars").textContent = `★ ${save.totalStars()} / ${TOTAL_STARS}`;
  const list = $("chapterList");
  list.innerHTML = "";
  CHAPTERS.forEach((ch, ci) => {
    const open = chapterUnlocked(ci);
    const b = document.createElement("button");
    b.className = "chapter" + (open ? "" : " locked");
    const done = ch.holes.filter((h) => holeDone(h.id)).length;
    b.innerHTML = `<canvas width="128" height="128"></canvas><span><span class="c-place">Chapter ${ci + 1} · ${ch.place}</span><span class="c-name">${ch.name}</span><span class="c-place">${open ? `${done} / ${ch.holes.length} holes · <span class="c-stars">★ ${chapterStars(ci)} / ${ch.holes.length * 3}</span>` : "Locked · finish the previous chapter"}</span></span>`;
    drawChapterBadge(b.querySelector("canvas"), ch, open);
    b.onclick = () => { if (!open) { toastMsg("Locked", "bad"); return; } viewChapter = ci; show("holes"); };
    list.appendChild(b);
  });
}
function drawChapterBadge(cv, ch, open) {
  const g = cv.getContext("2d"), c = 64;
  const gr = g.createRadialGradient(c - 16, c - 18, 4, c, c, 56);
  const h = ch.sky.hue;
  gr.addColorStop(0, `hsl(${h}, 70%, ${open ? 70 : 40}%)`); gr.addColorStop(1, `hsl(${h + 20}, 60%, ${open ? 22 : 12}%)`);
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, 52, 0, 7); g.fill();
  g.strokeStyle = open ? ch.sky.accent : "#555"; g.lineWidth = 3; g.setLineDash([6, 8]);
  g.beginPath(); g.arc(c, c, 60, 0, 7); g.stroke();
}
function renderHoles() {
  const ch = CHAPTERS[viewChapter];
  $("hPlace").textContent = `Chapter ${viewChapter + 1} · ${ch.place}`;
  $("hChapter").textContent = ch.name;
  $("hStars").textContent = `★ ${chapterStars(viewChapter)} / ${ch.holes.length * 3}`;
  const grid = $("holeGrid");
  grid.innerHTML = "";
  const nh = nextHole();
  ch.holes.forEach((h, hi) => {
    const open = holeUnlocked(viewChapter, hi);
    const rec = save.hole(h.id);
    const b = document.createElement("button");
    const isNext = nh && nh.ci === viewChapter && nh.hi === hi;
    b.className = "hole-tile" + (open ? "" : " locked") + (isNext ? " next" : "");
    const stars = [0, 1, 2].map((k) => `<span class="${rec && rec.stars > k ? "" : "off"}">★</span>`).join("");
    b.innerHTML = `<span class="n">${hi + 1}</span><span class="nm">${open ? h.name : "Locked"}<br>Par ${h.par}${rec ? ` · best ${rec.best}` : ""}</span><span class="st">${stars}</span>`;
    b.onclick = () => { if (!open) { toastMsg("Finish the hole before it", "bad"); return; } startHole(viewChapter, hi); };
    grid.appendChild(b);
  });
}

// ---------------------------------------------------------------- game state
let game = null;

function startHole(ci, hi) {
  const ch = CHAPTERS[ci];
  const begin = () => loadGame({ kind: "campaign", level: ch.holes[hi], ci, hi, sky: ch.sky, music: ch.id });
  viewChapter = ci;
  if (CHAPTER_STORY[ch.id] && !save.seen("open-" + ch.id)) {
    show("title");
    story(`Chapter ${ci + 1} · ${ch.name}`, CHAPTER_STORY[ch.id].open, () => { save.markSeen("open-" + ch.id); begin(); });
  } else begin();
}

async function startDaily() {
  const key = dateKey();
  $("ldText").textContent = "Charting today's orbit…";
  openOv("loading");
  await new Promise((r) => setTimeout(r, 30));
  const lvl = await dailyHole(key);
  closeOv("loading");
  loadGame({ kind: "daily", level: lvl, sky: DAILY_SKY, music: "daily", dateKey: key });
}
async function startFree() {
  $("ldText").textContent = "Finding a fresh orbit…";
  openOv("loading");
  await new Promise((r) => setTimeout(r, 30));
  const lvl = await dailyHole("free-" + Date.now() + "-" + Math.random());
  lvl.hint = "Endless random holes. <b>Every one is holeable in one.</b>";
  closeOv("loading");
  loadGame({ kind: "free", level: lvl, sky: FREE_SKY, music: "daily" });
}

function loadGame(opts) {
  const L = opts.level;
  game = {
    ...opts, world: new World(L), t: 0, rest: null, ball: null, strokes: 0, mode: "brief",
    trail: [], ghost: game && game.level === L ? game.lastTrail || game.trail : [], lastTrail: null,
    aim: null, preview: null, penalized: false, shotStats: null, pulseOn: [],
  };
  show("game");
  R.setLevel(L, opts.sky);
  $("gName").textContent = L.name;
  $("gNum").textContent = opts.kind === "campaign" ? `Ch ${opts.ci + 1} · Hole ${opts.hi + 1} of ${CHAPTERS[opts.ci].holes.length}`
    : opts.kind === "daily" ? `Daily Orbit · ${opts.dateKey}` : "Free Orbit";
  $("gHint").innerHTML = L.hint || "";
  $("gHint").hidden = !L.hint;
  updateStrokes();
  layoutRenderer();
  A.playMusic(opts.music);
  showBrief();
}
function updateStrokes() {
  $("gStrokes").textContent = `${game.strokes} / ${game.level.par}`;
  $("gStrokes").classList.toggle("over", game.strokes > game.level.par);
}

function showBrief() {
  const L = game.level, rec = game.kind === "campaign" ? save.hole(L.id) : null;
  game.mode = "brief";
  $("bMeta").textContent = `${$("gNum").textContent} · Par ${L.par}`;
  $("bTitle").textContent = L.name;
  const intro = L.intro;
  $("bText").innerHTML = intro ? intro.text : (L.hint || "");
  $("bLegend").hidden = !intro || !intro.legend;
  if (intro && intro.legend) { drawIcon($("bIcon"), intro.legend[0]); $("bLegendText").textContent = intro.legend[1]; }
  let best = "";
  if (rec) best = `Your best: <b>${rec.best}</b> · ${"★".repeat(rec.stars)}${"☆".repeat(3 - rec.stars)}`;
  else if (game.kind === "daily" && save.data.daily[game.dateKey]) best = `Today's best: <b>${save.data.daily[game.dateKey]}</b>`;
  else best = `3 stars: ${L.par - 1} stroke${L.par - 1 === 1 ? "" : "s"} or fewer. 2 stars: par.`;
  $("bBest").innerHTML = best;
  openOv("brief");
}
$("bPlay").onclick = () => { closeOv("brief"); game.mode = "aim"; };

function pause() {
  if (!game || overlays.length) return;
  $("pTitle").textContent = game.level.name;
  openOv("pause");
}
function resume() { closeOv("pause"); }
$("gPause").onclick = pause;
$("pResume").onclick = resume;
$("pRestart").onclick = () => { closeOv("pause"); loadGame({ ...game, ghost: game.trail }); };
$("pQuit").onclick = () => { closeOv("pause"); leaveGame(); };
function leaveGame() {
  const g = game;
  if (g && g.kind === "campaign") { viewChapter = g.ci; show("holes"); } else show("title");
}

// ---------------------------------------------------------------- shooting
const btnReset = $("gReset");
btnReset.onclick = giveUpShot;
function giveUpShot() { if (game && game.mode === "fly") penalty("Shot abandoned +1", "orbit"); }

function aimVelocity(aim) {
  const dx = aim.sx - aim.cx, dy = aim.sy - aim.cy, len = Math.hypot(dx, dy);
  if (len < 12) return null;
  const full = Math.min(R.W, R.H) * 0.42;
  const power = Math.min(1, len / full);
  const v = R.screenVecToWorld(dx / len, dy / len);
  return { vx: v.x * power * PHYS.maxSpeed, vy: v.y * power * PHYS.maxSpeed, power };
}

function computePreview() {
  const lv = aimVelocity(game.aim);
  game.aim.power = lv ? lv.power : 0;
  if (!lv) { game.preview = null; return; }
  const s = launch(game.world, game.rest, game.t, lv.vx, lv.vy);
  const steps = Math.round((game.level.preview || 1.3) / PHYS.dt);
  const pts = [];
  let t = game.t, hit = null;
  for (let k = 0; k < steps; k++) {
    t += PHYS.dt;
    const ev = step(game.world, s, t);
    if (k % 4 === 0) pts.push(s.x, s.y);
    s.events.length = 0;
    if (ev) { hit = { ev, x: s.x, y: s.y }; break; }
  }
  game.world.at(game.t);
  game.preview = { pts, hit };
}

function shoot(lv) {
  game.aim = null; game.preview = null;
  if (!lv) return;
  game.ball = launch(game.world, game.rest, game.t, lv.vx, lv.vy);
  game.from = game.rest;
  game.strokes++; updateStrokes();
  game.lastTrail = game.trail.length ? game.trail : game.lastTrail;
  game.trail = [];
  game.mode = "fly";
  game.flyTime = 0;
  game.shotStats = { bounces: 0, maxSpeed: 0 };
  save.count("shots");
  A.sfx("launch", { power: lv.power }); A.haptic("light");
  const p = restPos(game.world, game.from, game.t);
  R.burst(p.x, p.y, { n: 10, speed: 90, color: "200,230,255", life: 0.5, vx: -lv.vx * 0.2, vy: -lv.vy * 0.2 });
}

function penalty(msg, kind) {
  game.strokes++; updateStrokes();
  game.penalized = true;
  toastMsg(msg, "bad");
  A.sfx(kind === "swallowed" ? "swallowed" : kind === "orbit" ? "orbit" : "lost");
  A.haptic(kind === "swallowed" ? "heavy" : "error");
  game.rest = game.from; game.ball = null; game.mode = "aim";
  btnReset.hidden = true;
}

// pointer input with release-jitter filtering
canvas.addEventListener("pointerdown", (e) => {
  A.unlockAudio();
  if (screen !== "game" || !game || game.mode !== "aim" || game.aim || overlays.length) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  game.aim = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, id: e.pointerId, hist: [], power: 0 };
});
canvas.addEventListener("pointermove", (e) => {
  const a = game && game.aim;
  if (!a || e.pointerId !== a.id) return;
  a.cx = e.clientX; a.cy = e.clientY;
  a.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  if (a.hist.length > 40) a.hist.shift();
});
function settle(a) {
  const now = performance.now();
  for (let k = a.hist.length - 1; k >= 0; k--) {
    if (now - a.hist[k].t >= 70) {
      if (Math.hypot(a.hist[k].x - a.cx, a.hist[k].y - a.cy) < 14) { a.cx = a.hist[k].x; a.cy = a.hist[k].y; }
      return;
    }
  }
}
canvas.addEventListener("pointerup", (e) => {
  const a = game && game.aim;
  if (!a || e.pointerId !== a.id) return;
  settle(a);
  shoot(aimVelocity(a));
});
canvas.addEventListener("pointercancel", () => { if (game) { game.aim = null; game.preview = null; } });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointerdown", () => A.unlockAudio(), { once: false, passive: true });

// ---------------------------------------------------------------- events from the simulation
function handleShotEvents(ball) {
  for (const ev of ball.events) {
    if (ev === "bounce") {
      A.sfx("bounce", { impact: ball.impact }); A.haptic(ball.impact > 250 ? "medium" : "light");
      game.shotStats.bounces++;
      R.burst(ball.x, ball.y, { n: 6, speed: 60, color: "220,220,230", life: 0.4 });
      if (ball.impact > 300) R.kick(3);
    } else if (ev === "bump") {
      A.sfx("bump"); A.haptic("light"); game.shotStats.bounces++;
      R.burst(ball.x, ball.y, { n: 8, speed: 90, color: "255,140,120", life: 0.4 });
    } else if (ev === "warp") {
      A.sfx("warp"); A.haptic("medium");
      if (save.count("warps") >= 25) award("warp");
      R.burst(ball.x, ball.y, { n: 16, speed: 120, color: "120,220,255", life: 0.6 });
      game.trail.push(ball.x, ball.y, 1);
    } else if (ev === "lip") {
      A.sfx("lip"); toastMsg("Lipped out: too fast", "bad");
    }
  }
  ball.events.length = 0;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > game.shotStats.maxSpeed) game.shotStats.maxSpeed = sp;
}

function handleEnd(ev) {
  const b = game.ball;
  if (game.shotStats.bounces >= 4) award("pinball");
  if (game.shotStats.maxSpeed >= 900) award("fast");
  btnReset.hidden = true;
  if (ev === "holed") {
    game.rest = { x: game.level.hole.x, y: game.level.hole.y };
    game.ball = null; game.mode = "done";
    A.sfx("holed"); A.haptic("success");
    R.burst(game.level.hole.x, game.level.hole.y, { n: 40, speed: 220, color: "255,210,110", life: 1.1, essential: true });
    R.kick(4);
    finishHole();
  } else if (ev === "rest") {
    const body = game.level.bodies[b.rest.i];
    game.rest = b.rest; game.ball = null; game.mode = "aim";
    A.sfx("land"); A.haptic("light");
    R.burst(b.x, b.y, { n: 8, speed: 40, color: "200,220,255", life: 0.5 });
    if (body.type === "moon") award("moon");
    toastMsg("Landed", "");
  } else if (ev === "swallowed") {
    R.spiral(b.x, b.y); R.kick(6);
    save.count("swallowed"); award("swallowed");
    penalty("Swallowed +1", "swallowed");
  } else if (ev === "lost") penalty("Lost in space +1", "lost");
  else if (ev === "orbit") penalty("Stuck in orbit +1", "orbit");
}

// ---------------------------------------------------------------- results
function scoreName(n, par) {
  if (n === 1) return "Hole in one";
  const d = n - par;
  return { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Double bogey" }[d] || `${d > 0 ? "+" : ""}${d}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function finishHole() {
  const L = game.level, n = game.strokes, par = L.par;
  save.count("holed");
  if (n === 1) { if (save.count("aces") >= 10) award("ace10"); award("ace"); }
  award("first_cup");
  if (game.penalized && n <= par) award("comeback");
  let stars = n <= par - 1 ? 3 : n <= par ? 2 : 1;
  let text = `${n} stroke${n === 1 ? "" : "s"} on a par ${par}.`;
  let chapterJustDone = false;
  if (game.kind === "campaign") {
    const ch = CHAPTERS[game.ci];
    const wasDone = ch.holes.every((h) => holeDone(h.id));
    const r = save.finishHole(L.id, n, par);
    if (!r.newBest && save.hole(L.id).best < n) text += ` Your best is ${save.hole(L.id).best}.`;
    else if (r.newBest && r.prevStars) text += " New best.";
    chapterJustDone = !wasDone && ch.holes.every((h) => holeDone(h.id));
    if (chapterJustDone) award(ch.id);
    if (save.totalStars() >= TOTAL_STARS) award("stars");
  } else if (game.kind === "daily") {
    const r = save.finishDaily(game.dateKey, n, yesterdayKey());
    text += ` Today's best: ${r.best}. Daily streak: ${r.streak} day${r.streak === 1 ? "" : "s"}.`;
    award("daily"); if (r.streak >= 3) award("streak3");
  } else {
    if (save.count("freeplay") >= 10) award("free10");
  }
  game.chapterJustDone = chapterJustDone;
  $("rMeta").textContent = $("gNum").textContent;
  $("rTitle").textContent = scoreName(n, par);
  $("rText").textContent = text;
  $("rQuip").textContent = pick(n === 1 ? QUIPS.ace : n < par ? QUIPS.under : n === par ? QUIPS.par : QUIPS.over);
  const stars$ = [...$("rStars").children];
  stars$.forEach((s) => s.classList.remove("on"));
  $("rRetry").textContent = game.kind === "free" ? "Replay" : "Replay";
  const isLast = game.kind === "campaign" && game.hi === CHAPTERS[game.ci].holes.length - 1;
  $("rNext").textContent = game.kind === "campaign" ? (isLast ? "Finish chapter" : "Next hole") : game.kind === "free" ? "New hole" : "Done";
  $("rMenu").textContent = game.kind === "campaign" ? "Holes" : "Menu";
  setTimeout(() => {
    openOv("result");
    stars$.forEach((s, k) => { if (k < stars) setTimeout(() => { s.classList.add("on"); A.sfx("star", { i: k }); A.haptic("light"); }, 250 + k * 280); });
  }, 900);
}
$("rRetry").onclick = () => { closeOv("result"); loadGame({ ...game, ghost: game.trail }); };
$("rMenu").onclick = () => { closeOv("result"); leaveGame(); };
$("rNext").onclick = () => {
  closeOv("result");
  const g = game;
  if (g.kind === "free") { startFree(); return; }
  if (g.kind === "daily") { show("title"); return; }
  const ch = CHAPTERS[g.ci];
  if (g.hi < ch.holes.length - 1) { startHole(g.ci, g.hi + 1); return; }
  // end of chapter
  const afterStory = () => {
    if (g.ci + 1 < CHAPTERS.length) { show("chapters"); toastMsg(`Chapter ${g.ci + 2} unlocked`, "good"); A.sfx("unlock"); }
    else { show("title"); }
  };
  if (g.chapterJustDone && CHAPTER_STORY[ch.id]) {
    show(g.ci + 1 < CHAPTERS.length ? "chapters" : "title");
    if (g.ci + 1 === CHAPTERS.length) A.playMusic("finale");
    story(`${ch.name} complete`, CHAPTER_STORY[ch.id].close, afterStory);
  } else { viewChapter = g.ci; show("holes"); }
};

// ---------------------------------------------------------------- toast
let toastT = 0;
function toastMsg(msg, kind) {
  const el = $("toast");
  el.textContent = msg; el.className = "toast show " + (kind || "");
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.className = "toast " + (kind || "")), 1400);
}

// ---------------------------------------------------------------- menu backdrop: Perihel and its planets
const menuScene = {
  t: 0,
  reset() {},
  draw(dt) {
    this.t += dt;
    const ctx = R.ctx, W = R.W, H = R.H, d = R.dpr, t = this.t;
    if (!R.bg) R.buildBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(R.bg, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const p = save.holesDone() / TOTAL_HOLES;            // 0 = dying ember, 1 = reborn
    if (screen !== "title") return;                     // other menus get the plain starfield
    const land = W > H;
    const base = Math.min(W, H);
    const sunR = base * (land ? 0.16 + 0.05 * p : 0.09 + 0.04 * p);
    const cx = W * 0.5, cy = land ? H + sunR * 0.35 : H * 0.2;   // landscape: a sunrise along the bottom edge
    const hue = 10 + 35 * p, light = 38 + 22 * p;
    const glow = ctx.createRadialGradient(cx, cy, sunR * 0.4, cx, cy, sunR * (3.2 + 2 * p));
    glow.addColorStop(0, `hsla(${hue}, 95%, ${light + 10}%, ${0.5 + 0.3 * p})`);
    glow.addColorStop(0.35, `hsla(${hue}, 90%, ${light}%, ${0.15 + 0.15 * p})`);
    glow.addColorStop(1, `hsla(${hue}, 90%, ${light}%, 0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, sunR * (3.2 + 2 * p), 0, 7); ctx.fill();
    const core = ctx.createRadialGradient(cx - sunR * 0.3, cy - sunR * 0.3, sunR * 0.1, cx, cy, sunR);
    core.addColorStop(0, `hsl(${hue + 15}, 100%, ${light + 35}%)`); core.addColorStop(1, `hsl(${hue}, 85%, ${light}%)`);
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, sunR * (1 + 0.015 * Math.sin(t * 2)), 0, 7); ctx.fill();
    // orbits with planets, and a golf ball looping through them
    const orbits = [[1.9, 0.33, "#5b8def", 0.18], [2.9, 0.21, "#e0905a", 0.14], [4.0, 0.14, "#7cc97a", 0.12], [5.2, 0.09, "#c27be0", 0.16]];
    orbits.forEach(([k, sp, col, sz], i) => {
      const r = sunR * k, a = t * sp + i * 1.7;
      ctx.strokeStyle = "rgba(180,195,240,0.08)"; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.42, pr = sunR * sz * 1.4;
      const g = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 1, px, py, pr);
      g.addColorStop(0, shade(col, 0.4)); g.addColorStop(1, shade(col, -0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
    });
    const ba = t * 0.55, br = sunR * (2.4 + 0.9 * Math.sin(t * 0.37));
    const bx = cx + Math.cos(ba) * br * 1.1, by = cy + Math.sin(ba) * br * 0.5;
    ctx.fillStyle = "rgba(111,224,210,0.25)";
    for (let k = 1; k < 14; k++) {
      const a2 = ba - k * 0.035, r2 = sunR * (2.4 + 0.9 * Math.sin((t - k * 0.06) * 0.37));
      ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * r2 * 1.1, cy + Math.sin(a2) * r2 * 0.5, 2.2 * (1 - k / 14), 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, 7); ctx.fill();
  },
};

// ---------------------------------------------------------------- layout
function layoutRenderer() {
  if (screen !== "game") { R.resize(); return; }
  const hud = $("hud").getBoundingClientRect();
  const hb = $("hudBottom");
  const bottom = hb.offsetParent && !$("gHint").hidden ? window.innerHeight - hb.getBoundingClientRect().top : 0;
  R.resize({ top: hud.bottom, bottom: Math.max(bottom, 8) });
}
window.addEventListener("resize", () => { layoutRenderer(); });
window.addEventListener("orientationchange", () => setTimeout(layoutRenderer, 200));

// ---------------------------------------------------------------- lifecycle
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { A.suspendAudio(); if (screen === "game" && game && game.mode !== "done" && !overlays.length) pause(); }
  else { A.resumeAudio(); keepAwake(); }
});
let wakeLock = null;
async function keepAwake() {
  try { if (!wakeLock && navigator.wakeLock && !document.hidden) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch (e) {}
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === "game" && game) {
    const running = !overlays.length && game.mode !== "brief";
    if (running) {
      acc += dt;
      while (acc >= PHYS.dt) {
        acc -= PHYS.dt;
        game.t += PHYS.dt;
        if (game.mode === "fly" && game.ball) {
          const ev = step(game.world, game.ball, game.t);
          handleShotEvents(game.ball);
          game.trail.push(game.ball.x, game.ball.y, 0);
          if (game.trail.length > 9000) game.trail.splice(0, 3);
          game.flyTime += PHYS.dt;
          if (ev) { handleEnd(ev); if (!game) break; }
        }
      }
      if (game && game.mode === "fly" && game.flyTime > 2.5) btnReset.hidden = false;
      // pulsar ticks
      if (game) game.level.bodies.forEach((b, i) => {
        if (!b.pulse) return;
        const on = pulsePhase(b, game.t).on;
        if (on && !game.pulseOn[i]) A.sfx("pulse");
        game.pulseOn[i] = on;
      });
    } else acc = 0;
    if (game) {
      if (game.aim) computePreview();
      R.updateFx(dt);
      const ballPos = game.ball ? game.ball : game.mode === "done" ? null : restPos(game.world, game.rest, game.t);
      R.draw({ world: game.world, t: game.t, mode: game.mode, aim: game.aim, aiming: !!game.aim, preview: game.preview, trail: game.trail, ghost: game.ghost, ballPos });
    }
  } else {
    menuScene.draw(dt);
  }
  requestAnimationFrame(frame);
}

// test hook used by tools/playthrough.mjs (fires an exact shot, reads state)
window.__pg = {
  get screen() { return screen; }, get overlays() { return [...overlays]; },
  get game() { return game && { mode: game.mode, strokes: game.strokes, t: game.t, rest: game.rest, id: game.level.id, kind: game.kind, level: game.level }; },
  shoot(vx, vy) { if (game && game.mode === "aim" && !overlays.length) { shoot({ vx, vy, power: Math.hypot(vx, vy) / PHYS.maxSpeed }); return true; } return false; },
  waitUntil(t) { return game && game.t >= t; },
  w2s: (x, y) => R.w2s(x, y),
  play(ci, hi) { save.markSeen("prologue"); CHAPTERS.forEach((c) => save.markSeen("open-" + c.id)); closeAllOverlays(); startHole(ci, hi); },
  save,
};

applySettings();
show("title");
document.fonts && document.fonts.ready.then(() => layoutRenderer());
requestAnimationFrame(frame);
keepAwake();
