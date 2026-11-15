// Perihelion Golf — app shell: screens, story, progression, input and the game loop.
import { PHYS, World, step, restPos, launch, pulsePhase, simulate } from "./core.js";
import { CHAPTERS } from "./levels/index.js";
import { Renderer, drawIcon, shade } from "./render.js";
import { save } from "./save.js";
import * as A from "./audio.js";
import { PROLOGUE, CHAPTER_STORY, QUIPS, SPEAKER } from "./story.js";
import { dailyHole, dateKey, yesterdayKey } from "./daily.js";
import { SKINS, skinUnlocked, currentSkin } from "./skins.js";
import { shareText, share } from "./share.js";
import { log, flush } from "./playlog.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const R = new Renderer(canvas);
const TOTAL_HOLES = CHAPTERS.reduce((n, c) => n + c.holes.length, 0);
const TOTAL_STARS = TOTAL_HOLES * 3;
const DAILY_SKY = { hue: 190, accent: "#6fe0d2" };
const FREE_SKY = { hue: 250, accent: "#c9a6ff" };

// ---------------------------------------------------------------- achievements
const ACH = [
  { id: "first_cup", name: "First Cup", desc: "Sink your first ball." },
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
const achAllowed = () => screen !== "game" || overlays.includes("result");
function nextAch() {
  if (!achQueue.length) { achShowing = false; return; }
  if (!achAllowed()) { achShowing = true; setTimeout(nextAch, 500); return; }   // wait for a quiet moment
  const a = achQueue.shift();
  achShowing = true;
  $("achName").textContent = a.name;
  $("achToast").querySelector(".eyebrow").textContent = a.eyebrow || "Logbook entry";
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
  if (game) { game.aim = null; game.preview = null; }   // never fire a shot from behind a dialog
  if (!overlays.includes(id)) overlays.push(id);
  document.body.classList.add("has-ov");
  $("ov-" + id).hidden = false;
  const btn = $("ov-" + id).querySelector(".primary");
  if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 30);
}
function closeOv(id) {
  const i = overlays.indexOf(id);
  if (i >= 0) overlays.splice(i, 1);
  if (!overlays.length) document.body.classList.remove("has-ov");
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
  if (top === "story") { storyCancel ? storyCancel() : $("sNext").click(); return; }
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
let storyCancel = null;
function story(title, pages, onDone, cancellable) {
  let i = 0;
  storyCancel = cancellable ? () => { closeOv("story"); storyCancel = null; } : null;
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
    else { closeOv("story"); storyCancel = null; onDone && onDone(); }
  };
  $("sSkip").hidden = pages.length < 2;
  $("sSkip").onclick = () => { closeOv("story"); storyCancel = null; onDone && onDone(); };
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
  const mid = new Date(); mid.setHours(24, 0, 0, 0);
  const left = Math.max(0, mid - new Date()), hh = Math.floor(left / 3.6e6), mm = Math.floor((left % 3.6e6) / 6e4);
  $("tDailySub").textContent = today ? `Done in ${today} · next in ${hh}h ${mm}m` : save.data.streak && save.data.lastDaily === yesterdayKey() ? `Keep your ${save.data.streak}-day streak` : "A new hole today";
  $("tLockerDot").hidden = unlockedSkinIds().length <= 1 || save.seen("skins:" + unlockedSkinIds().join(","));
}
$("tPlay").onclick = () => {
  const nh = nextHole();
  if (!nh) { show("chapters"); return; }
  if (!save.seen("prologue")) {
    story("The Perihelion Links", PROLOGUE, () => { save.markSeen("prologue"); startHole(nh.ci, nh.hi); }, true);
    return;
  }
  startHole(nh.ci, nh.hi);
};
$("tChapters").onclick = () => show("chapters");
$("tDaily").onclick = () => startDaily();
$("tFree").onclick = () => startFree();
$("tSettings").onclick = () => openOv("settings");
$("tLog").onclick = openLog;
$("tLocker").onclick = openLocker;

// ---------------------------------------------------------------- locker (ball skins)
function unlockedSkinIds() { return SKINS.filter((k) => skinUnlocked(k, save)).map((k) => k.id); }
function openLocker() {
  save.markSeen("skins:" + unlockedSkinIds().join(","));
  $("tLockerDot").hidden = true;
  const cur = currentSkin(save).id;
  $("lkMeta").textContent = `${unlockedSkinIds().length} of ${SKINS.length} unlocked`;
  const grid = $("lkGrid");
  grid.innerHTML = "";
  SKINS.forEach((k) => {
    const open = skinUnlocked(k, save);
    const b = document.createElement("button");
    b.className = "skin" + (open ? "" : " locked") + (k.id === cur ? " sel" : "");
    b.innerHTML = `<canvas width="108" height="108"></canvas><b>${k.name}</b><small>${open ? (k.id === cur ? "In play" : "Tap to use") : k.desc}</small>`;
    drawSkinIcon(b.querySelector("canvas"), k, open);
    b.onclick = () => {
      if (!open) { toastMsg(k.desc, "bad"); return; }
      save.setSetting("skin", k.id); A.sfx("star", { i: 1 }); A.haptic("light"); openLocker();
    };
    grid.appendChild(b);
  });
  openOv("locker");
}
function drawSkinIcon(cv, k, open) {
  const g = cv.getContext("2d"), c = 54;
  g.clearRect(0, 0, 108, 108);
  // little comet: trail arc then ball
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 0.95 + i * 0.07, r = 36;
    const col = k.trail === "rainbow" ? `hsl(${i * 20},90%,65%)` : `rgb(${k.trail})`;
    g.globalAlpha = (open ? 0.9 : 0.35) * (i / 18);
    g.fillStyle = col; g.beginPath(); g.arc(c + Math.cos(a) * r, c + 10 + Math.sin(a) * r * 0.6, 2 + i * 0.18, 0, 7); g.fill();
  }
  g.globalAlpha = open ? 1 : 0.4;
  if (k.glow) { const gl = g.createRadialGradient(c + 36, c + 4, 4, c + 36, c + 4, 26); gl.addColorStop(0, `rgba(${k.glow},0.6)`); gl.addColorStop(1, `rgba(${k.glow},0)`); g.fillStyle = gl; g.beginPath(); g.arc(c + 36, c + 4, 26, 0, 7); g.fill(); }
  const gr = g.createRadialGradient(c + 32, c, 2, c + 36, c + 4, 13);
  gr.addColorStop(0, k.ball[0]); gr.addColorStop(1, k.ball[1]);
  g.fillStyle = gr; g.beginPath(); g.arc(c + 36, c + 4, 13, 0, 7); g.fill();
  if (k.ring) { g.strokeStyle = k.ring; g.lineWidth = 2; g.beginPath(); g.arc(c + 36, c + 4, 14.5, 0, 7); g.stroke(); }
  g.globalAlpha = 1;
}
function checkNewSkins(before) {
  const now = unlockedSkinIds();
  const fresh = now.filter((id) => !before.includes(id));
  fresh.forEach((id, i) => setTimeout(() => {
    const k = SKINS.find((x) => x.id === id);
    achQueue.push({ name: k.name, eyebrow: "New ball unlocked · see Locker" });
    if (!achShowing) nextAch();
  }, 400 + i * 100));
}
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
    const done = ch.holes.filter((h) => save.hole(h.id)?.stars).length;
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
    b.innerHTML = `${rec && rec.best === 1 ? '<span class="ace">ACE</span>' : ""}<span class="n">${hi + 1}</span><span class="nm">${open ? h.name : "Locked"}<br>${rec && rec.best ? `Best ${rec.best} · par ${h.par}` : rec ? "Skipped" : `Par ${h.par}`}</span><span class="st">${stars}</span>`;
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
    story(`Chapter ${ci + 1} · ${ch.name}`, CHAPTER_STORY[ch.id].open, () => { save.markSeen("open-" + ch.id); begin(); }, true);
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
    allTrails: [], fates: [], tags: new Set(), timeScale: 1, slowTarget: 1, zoomTarget: 1,
    misses: game && game.level === L && opts.keepMisses ? game.misses : 0, demo: false, nearMark: null, ghostGold: false, guide: null,
    guided: opts.kind === "campaign" && opts.ci === 0 && opts.hi < 3,      // tutorial holes: full preview and GOES IN
    // Tutorial holes show the whole flight. Everywhere else the first look covers about half the straight
    // distance to the cup (roughly 40% of a real route), and grows with every miss.
    previewBase: L.previewLen || (opts.kind === "campaign" && opts.ci === 0 && opts.hi < 3 ? 2600
      : Math.max(300, Math.min(opts.ci === 0 && opts.kind === "campaign" ? 700 : 560, (opts.ci === 0 && opts.kind === "campaign" ? 0.7 : 0.5) * Math.hypot(L.hole.x - L.tee.x, L.hole.y - L.tee.y)))),
    skin: currentSkin(save), tutorial: !save.seen("tutorial"),
  };
  log("hole_start", { id: L.id, kind: opts.kind, par: L.par, seed: opts.kind === "campaign" ? undefined : L.seed, retry: !!opts.keepMisses, misses: game.misses });
  flush();
  show("game");
  R.setLevel(L, opts.sky);
  $("gName").textContent = L.name;
  $("gNum").textContent = opts.kind === "campaign" ? `Ch ${opts.ci + 1} · Hole ${opts.hi + 1}/${CHAPTERS[opts.ci].holes.length}`
    : opts.kind === "daily" ? `Daily · ${new Date(opts.dateKey + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}` : "Free Orbit";
  $("toast").className = "toast"; $("toast").textContent = "";
  $("gShow").hidden = true; btnReset.hidden = true;
  $("gHint").innerHTML = L.hint || "";
  $("gHint").hidden = !L.hint;
  updateStrokes();
  layoutRenderer();
  A.playMusic(opts.music);
  const rec = opts.kind === "campaign" ? save.hole(L.id) : null;
  if (opts.keepMisses || (rec && rec.stars) || (opts.kind === "daily" && save.data.daily[opts.dateKey])) { game.mode = "aim"; }
  else showBrief();
}
function updateStrokes() {
  $("gStrokes").innerHTML = `${game.strokes}<small> / par ${game.level.par}</small>`;
  $("gStrokes").classList.toggle("over", game.strokes > game.level.par);
}

function showBrief() {
  const L = game.level, rec = game.kind === "campaign" ? save.hole(L.id) : null;
  game.mode = "brief";
  $("bMeta").textContent = `${$("gNum").textContent} · Par ${L.par}`;
  $("bTitle").textContent = L.name;
  const intro = L.intro;
  const newbie = !save.seen("tutorial") && !intro;      // first shot ever is in Daily / Free Orbit
  $("bText").innerHTML = intro ? intro.text : newbie ? "Drag anywhere and pull back, like a slingshot. Let go to launch. The dotted line shows where the ball will go." : (L.hint || "");
  $("bLegend").hidden = !(intro && intro.legend) && !newbie;
  if (intro && intro.legend) { drawIcon($("bIcon"), intro.legend[0]); $("bLegendText").textContent = intro.legend[1]; }
  else if (newbie) { drawIcon($("bIcon"), "cup"); $("bLegendText").textContent = "The cup only catches a slow ball, so arrive gently."; }
  if (game.kind !== "campaign") {
    const KEY = { planet: "Planets pull and can be landed on.", moon: "Moons orbit and pull.", asteroid: "Rocks bounce the ball.", blackhole: "Black holes swallow the ball: +1 penalty.",
      repulsor: "Red stars push the ball away.", cloud: "Nebulae slow the ball.", wormhole: "Wormholes link in pairs and keep your heading.", pulsar: "Pulsars switch their pull on and off.", star: "Twin suns orbit each other and pull hard." };
    const kinds = [...new Set(L.bodies.map((b) => b.type))].filter((k) => k !== "planet" || newbie);
    $("bText").innerHTML += `<br><span class="keyline">${kinds.map((k) => KEY[k]).join(" ")}</span>`;
  }
  let best = "";
  if (rec) best = `Your best: <b>${rec.best}</b> · ${"★".repeat(rec.stars)}${"☆".repeat(3 - rec.stars)}`;
  else if (game.kind === "daily" && save.data.daily[game.dateKey]) best = `Today's best: <b>${save.data.daily[game.dateKey]}</b>`;
  if (!rec || game.kind !== "campaign") best += `${best ? "<br>" : ""}★★★ ${L.par - 1 === 1 ? "hole in one" : `${L.par - 1} strokes or fewer`} · ★★ ${L.par} strokes`;
  $("bBest").innerHTML = best;
  openOv("brief");
}
$("bPlay").onclick = () => { closeOv("brief"); game.mode = "aim"; };

function pause() {
  if (!game || overlays.length) return;
  $("pTitle").textContent = game.level.name;
  $("pSkip").hidden = !(game.kind === "campaign" && !(save.hole(game.level.id)?.stars));
  openOv("pause");
}
function resume() { closeOv("pause"); }
$("gPause").onclick = pause;
$("gRetry").onclick = () => {
  if (!game || overlays.length) return;
  log("restart", { id: game.level.id, strokes: game.strokes, misses: game.misses });
  const keep = { ...game, ghost: game.trail.length ? game.trail : game.ghost, keepMisses: true };
  loadGame(keep);
  toastMsg("Fresh start", "");
};
$("pResume").onclick = resume;
$("pRestart").onclick = () => { closeOv("pause"); $("gRetry").click(); };
$("pShow").onclick = () => { closeOv("pause"); showLine(); };
$("pSkip").onclick = async () => {
  if (!(await confirmBox("Skip this hole?", "The next hole opens, but this one earns no stars until you come back and finish it.", "Skip"))) return;
  const g = game; closeOv("pause");
  log("skip", { id: g.level.id, strokes: g.strokes, misses: g.misses }); flush();
  save.skipHole(g.level.id);
  const ch = CHAPTERS[g.ci];
  if (g.hi < ch.holes.length - 1) startHole(g.ci, g.hi + 1);
  else { viewChapter = g.ci; show(g.ci + 1 < CHAPTERS.length ? "chapters" : "holes"); }
};
$("pQuit").onclick = () => { closeOv("pause"); leaveGame(); };
function leaveGame() {
  const g = game;
  if (g && g.mode !== "done") { log("leave", { id: g.level.id, strokes: g.strokes, misses: g.misses }); flush(); }
  if (g && g.kind === "campaign") { viewChapter = g.ci; show("holes"); } else show("title");
}

// ---------------------------------------------------------------- shooting
const btnReset = $("gReset");
btnReset.onclick = giveUpShot;
$("gShow").onclick = showLine;
function giveUpShot() {
  if (!game || game.mode !== "fly" || game.demo) return;
  log("shot_end", { ev: "recalled", fly: game.flyTime, near: game.near ? game.near.d : undefined });
  miss("Ball recalled", "orbit");
}

function aimVelocity(aim) {
  const dx = aim.sx - aim.cx, dy = aim.sy - aim.cy, len = Math.hypot(dx, dy);
  if (len < 12) return null;
  const full = Math.min(R.W, R.H) * 0.5;
  const power = Math.min(1, len / full);
  const v = R.screenVecToWorld(dx / len, dy / len);
  return { vx: v.x * power * PHYS.maxSpeed, vy: v.y * power * PHYS.maxSpeed, power };
}

function computePreview() {
  const lv = aimVelocity(game.aim);
  game.aim.power = lv ? lv.power : 0;
  if (!lv) { game.preview = null; return; }
  const s = launch(game.world, game.rest, game.t, lv.vx, lv.vy);
  // The preview covers a fixed distance, not a fixed time, so gentle shots are not left blind.
  const pts = [];
  let t = game.t, hit = null, dist = 0, acc2 = 0, px = s.x, py = s.y;
  // Each miss on this hole lengthens the preview, so help arrives for players who need it.
  const maxLen = game.guide ? 2600 : game.previewBase * (1 + 0.6 * Math.min(game.misses, 5));   // after a demo: the whole flight
  let cap = maxLen;
  for (let k = 0; k < 720 && dist < cap; k++) {
    t += PHYS.dt;
    const ev = step(game.world, s, t);
    const warped = s.events.length && s.events.includes("warp");
    s.events.length = 0;
    if (!warped) { const d = Math.hypot(s.x - px, s.y - py); dist += d; acc2 += d; }
    px = s.x; py = s.y;
    if (warped && !game.guided && !game.guide) cap = Math.min(cap, dist + 130);      // only a glimpse past a wormhole
    if (acc2 >= 15 || warped) { pts.push(s.x, s.y); acc2 = 0; }
    if (ev) { hit = { ev, x: s.x, y: s.y }; break; }
  }
  game.world.at(game.t);
  game.preview = { pts, hit, label: game.guided || !!game.guide || game.misses >= 3 };
}

function shoot(lv, demo = false) {
  game.aim = null; game.preview = null;
  if (!lv || overlays.length) return;
  // The flight is deterministic, so its fate is known at launch: a shot that will only drift is recalled early.
  game.fate = demo ? null : simulate(game.world, game.rest, game.t, lv.vx, lv.vy).ev;
  game.world.at(game.t);
  game.ball = launch(game.world, game.rest, game.t, lv.vx, lv.vy);
  game.from = game.rest;
  game.demo = demo; game.nearMark = null; game.near = { d: Infinity, x: 0, y: 0 };
  $("gShow").hidden = true;
  if (!demo) { game.strokes++; updateStrokes(); }
  game.lastTrail = game.trail.length ? game.trail : game.lastTrail;
  game.trail = [];
  game.mode = "fly";
  game.flyTime = 0;
  game.shotStats = { bounces: 0, maxSpeed: 0, launchSpeed: Math.hypot(lv.vx, lv.vy), graze: {}, inCloud: false, cloudBrake: false, asteroid: false, bumper: false, warped: false, sparkT: 0 };
  if (game.tutorial) { game.tutorial = false; save.markSeen("tutorial"); }
  log(demo ? "demo_shot" : "shot", { id: game.level.id, n: game.strokes, vx: lv.vx, vy: lv.vy, power: lv.power, at: game.t,
    from: game.from ? (game.from.i !== undefined ? [game.from.i, game.from.ang] : [game.from.x, game.from.y]) : undefined, misses: game.misses });
  if (!demo) save.count("shots");
  A.sfx("launch", { power: lv.power }); A.haptic("light");
  const p = restPos(game.world, game.from, game.t);
  R.burst(p.x, p.y, { n: 10, speed: 90, color: "200,230,255", life: 0.5, vx: -lv.vx * 0.2, vy: -lv.vy * 0.2 });
}

// A miss costs only the stroke already played; the ball comes back to where the shot started.
// Only black holes add a penalty stroke.
function miss(msg, kind) { penalty(msg, kind, false); }
function offerHelp() { if (game.misses >= 2 || game.strokes >= game.level.par + 2) $("gShow").hidden = false; }
function penalty(msg, kind, extra = true) {
  if (extra) { game.strokes++; updateStrokes(); game.penalized = true; }
  game.misses++;
  if (game.near && game.near.d < 400 && kind !== "swallowed") game.nearMark = { x: game.near.x, y: game.near.y };
  offerHelp();
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
      if (ball.impact > 140) game.shotStats.bounces++;
      R.burst(ball.x, ball.y, { n: 6, speed: 60, color: "220,220,230", life: 0.4 });
      game.shotStats.asteroid = true;
      if (ball.impact > 300) R.kick(3);
    } else if (ev === "bump") {
      A.sfx("bump"); A.haptic("light"); game.shotStats.bounces++; game.shotStats.bumper = true;
      R.burst(ball.x, ball.y, { n: 8, speed: 90, color: "255,140,120", life: 0.4 });
    } else if (ev === "warp") {
      A.sfx("warp"); A.haptic("medium");
      if (save.count("warps") >= 25) award("warp");
      R.burst(ball.x, ball.y, { n: 16, speed: 120, color: "120,220,255", life: 0.6 });
      game.trail.push(ball.x, ball.y, 1);
      if (!game.shotStats.warped) R.callout(ball.x, ball.y, "Wormhole!", "140,225,255");
      game.shotStats.warped = true;
      R.ring(ball.x, ball.y, { color: "120,220,255", max: 70, life: 0.5 });
    } else if (ev === "lip") {
      A.sfx("lip"); game.shotStats.lipped = true;
    }
  }
  ball.events.length = 0;
  const st = game.shotStats, sp = Math.hypot(ball.vx, ball.vy);
  if (sp > st.maxSpeed) st.maxSpeed = sp;
  // trick detection: black-hole grazes, slingshots, nebula braking
  const W = game.world, B = game.level.bodies;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (b.type === "blackhole") {
      const d = Math.hypot(ball.x - W.x[i], ball.y - W.y[i]);
      if (d < b.horizon + 22 && !st.graze[i] && !doomed(ball)) {
        st.graze[i] = 1;
        R.callout(ball.x, ball.y, "Close call!", "255,170,110"); A.haptic("medium");
        game.slowPulse = 0.35;
      }
    } else if (b.type === "cloud") {
      const inside = Math.hypot(ball.x - W.x[i], ball.y - W.y[i]) < b.r;
      if (inside && !st.inCloud) st.cloudEnter = sp;
      if (!inside && st.inCloud && st.cloudEnter - sp > 120) st.cloudBrake = true;
      st.inCloud = inside;
    }
  }
  if (!st.sling && sp > st.launchSpeed + 260 && sp > 520 && !doomed(ball)) {
    st.sling = true; R.callout(ball.x, ball.y, "Slingshot!", "255,214,120"); A.haptic("light");
  }
  // skin sparks
  const sk = game.skin;
  if (sk.sparks && (st.sparkT += PHYS.dt) > 0.05) {
    st.sparkT = 0;
    const col = sk.sparks === "rainbow" ? `${120 + Math.floor(Math.random() * 135)},${120 + Math.floor(Math.random() * 135)},255` : sk.sparks;
    R.burst(ball.x, ball.y, { n: 1, speed: 25, color: col, life: 0.5, size: 2 });
  }
}

// Will this ball be swallowed in the next second? (No cheering for a ball that is about to die.)
function doomed(ball) {
  const probe = { ...ball, events: [] };
  let t2 = game.t, out = false;
  for (let k = 0; k < 130; k++) { t2 += PHYS.dt; const ev = step(game.world, probe, t2); if (ev) { out = ev === "swallowed"; break; } }
  game.world.at(game.t);
  return out;
}

// "Show me a line": the game plays one hole-in-one from here as a demonstration. It is not counted.
function showLine() {
  if (!game || game.mode !== "aim" || overlays.length) return;
  const search = (rest) => {
    const hits = new Map();
    for (let ai = 0; ai < 240; ai++) for (let k = 2; k <= 14; k++) {
      const p = k / 14, r = (ai * 1.5 * Math.PI) / 180, vx = Math.cos(r) * p * PHYS.maxSpeed, vy = Math.sin(r) * p * PHYS.maxSpeed;
      const res = simulate(game.world, rest, game.t, vx, vy);
      if (res.ev === "holed") hits.set(ai * 100 + k, { vx, vy, t: res.t, power: p, ai, k });
    }
    let pick = null;
    for (const h of hits.values()) {     // widest neighbourhood first, then the quickest
      h.room = [-2, -1, 1, 2].filter((d) => hits.has(((h.ai + d + 240) % 240) * 100 + h.k)).length;
      if (!pick || h.room > pick.room || (h.room === pick.room && h.t < pick.t)) pick = h;
    }
    return pick;
  };
  // On a hole designed around a landing, show the landing from the tee instead of a thin one-shot line.
  const landing = () => {
    const hits = new Map(), cup = game.level.hole;
    for (let ai = 0; ai < 240; ai++) for (let k = 2; k <= 14; k++) {
      const p = k / 14, r = (ai * 1.5 * Math.PI) / 180, vx = Math.cos(r) * p * PHYS.maxSpeed, vy = Math.sin(r) * p * PHYS.maxSpeed;
      const res = simulate(game.world, null, game.t, vx, vy);
      if (res.ev === "rest" && res.t - game.t < 6) hits.set(ai * 100 + k, { vx, vy, power: p, ai, k, i: res.rest.i, d: Math.hypot(res.x - cup.x, res.y - cup.y) });
    }
    const tee = game.level.tee, far = Math.hypot(tee.x - cup.x, tee.y - cup.y);
    let pick = null;
    for (const h of hits.values()) {
      if (h.d > far * 0.8) continue;                      // must make real progress toward the cup
      h.room = [-3, -2, -1, 1, 2, 3].filter((d) => { const n = hits.get(((h.ai + d + 240) % 240) * 100 + h.k); return n && n.i === h.i; }).length;
      if (!pick || h.room > pick.room || (h.room === pick.room && h.d < pick.d)) pick = h;
    }
    return pick;
  };
  let best = game.level.route && game.level.route.land && !game.rest ? landing() : null;
  if (!best) best = search(game.rest);
  if (!best && game.rest) { best = search(null); if (best) { game.rest = null; toastMsg("No line from there. Back to the tee", ""); } }
  game.world.at(game.t);
  if (!best) { toastMsg("No single-shot line right now. Try again in a moment", ""); return; }
  log("help", { id: game.level.id, strokes: game.strokes, misses: game.misses });
  toastMsg("Watch this line", "good");
  game.guide = { vx: best.vx, vy: best.vy, power: best.power };
  shoot(best, true);
}

function collectTags(holed) {
  const st = game.shotStats, T = game.tags;
  if (st.warped) T.add("Wormhole");
  if (Object.keys(st.graze).length) T.add("Close call");
  if (st.sling) T.add("Slingshot");
  if (st.asteroid && holed) T.add("Bank shot");
  if (st.bumper) T.add("Bumper");
  if (st.cloudBrake || (st.inCloud && holed)) T.add("Nebula brake");
  if (game.flyTime > 9) T.add("Long haul");
}

function handleEnd(ev) {
  const b = game.ball;
  setTimeout(flush, 0);
  if (game.shotStats.bounces >= 4) award("pinball");
  if (game.shotStats.maxSpeed >= 900) award("fast");
  btnReset.hidden = true;
  log("shot_end", { ev, fly: game.flyTime, near: game.near ? game.near.d : undefined, lip: game.shotStats.lipped, demo: game.demo, x: b.x, y: b.y });
  if (game.demo) {
    game.demo = false; game.ghost = game.trail; game.trail = []; game.ghostGold = true;
    game.rest = game.from; game.ball = null; game.mode = "aim";
    const pc = Math.round(game.guide.power * 100);
    toastMsg(ev === "rest" ? `Land there first. Match the gold arrow: ${pc}%`
      : game.world.dynamic ? `Match the gold arrow at ${pc}%, then let go when the cup lights up` : `Your turn. Match the gold arrow: ${pc}%`, "good");
    return;
  }
  game.fates.push(ev);
  collectTags(ev === "holed");
  if (game.trail.length) game.allTrails.push(game.trail);
  if (ev === "holed") {
    const h = game.level.hole;
    game.rest = { x: h.x, y: h.y };
    game.ball = null; game.mode = "done";
    const ace = game.strokes === 1;
    A.sfx("holed"); if (ace) A.sfx("ace"); A.haptic("success");
    R.burst(h.x, h.y, { n: ace ? 70 : 40, speed: ace ? 300 : 220, color: "255,210,110", life: 1.2, essential: true });
    R.ring(h.x, h.y, { max: ace ? 260 : 160, life: 0.9, w: 6 });
    R.ring(h.x, h.y, { max: ace ? 160 : 90, life: 0.6, color: "255,255,255", w: 3 });
    if (ace) { R.flashScreen(0.55); R.callout(h.x, h.y, "HOLE IN ONE", "255,214,120"); }
    R.kick(ace ? 7 : 4);
    if (game.penalized && game.strokes <= game.level.par) game.tags.add("Comeback");
    if (ace) game.tags.add("Ace");
    finishHole();
  } else if (ev === "rest") {
    const body = game.level.bodies[b.rest.i];
    game.rest = b.rest; game.ball = null; game.mode = "aim"; game.guide = null;
    A.sfx("land"); A.haptic("light");
    R.burst(b.x, b.y, { n: 8, speed: 40, color: "200,220,255", life: 0.5 });
    if (body.type === "moon") award("moon");
    const fellBack = game.from && game.from.i === b.rest.i && game.flyTime < 2.2;
    if (fellBack && game.flyTime < 0.5 && game.strokes > 0) { game.strokes--; updateStrokes(); }   // never left the ground: no stroke
    toastMsg(game.shotStats.lipped ? "Too fast for the cup. Landed" : fellBack ? "Gravity pulled it back. Pull harder to leave" : "Landed", game.shotStats.lipped || fellBack ? "bad" : "");
    if (game.kind === "campaign" || game.strokes >= 2) offerHelp();
  } else if (ev === "swallowed") {
    R.spiral(b.x, b.y); R.kick(6);
    save.count("swallowed"); award("swallowed");
    penalty("Swallowed: +1 penalty", "swallowed");
  } else if (ev === "lost") miss(game.shotStats.lipped ? "Too fast for the cup. Pull back less" : game.near.d < 70 ? "So close. Ball recalled" : game.shotStats.launchSpeed > 0.8 * PHYS.maxSpeed ? "Too hard: it left the course. Pull back less" : "Lost in space. Ball recalled", "lost");
  else if (ev === "orbit") miss(game.shotStats.lipped ? "Too fast for the cup. Ball recalled" : game.near.d < 70 ? "So close. Ball recalled" : game.shotStats.launchSpeed < 0.4 * PHYS.maxSpeed ? "Too soft: it ran out of speed. Ball recalled" : "Drifting with nowhere to land. Ball recalled", "orbit");
}

// ---------------------------------------------------------------- results
function scoreName(n, par) {
  if (n === 1) return "Hole in one";
  const d = n - par;
  return { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par" }[d] || (d > 0 ? `${d} over par` : `${-d} under par`);
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function finishHole() {
  const skinsBefore = unlockedSkinIds();
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
  if (stars < 3) text += ` For three stars: ${par - 1 === 1 ? "a hole in one" : `${par - 1} strokes or fewer`}.`;
  game.chapterJustDone = chapterJustDone;
  game.stars = stars;
  log("hole_end", { id: L.id, kind: game.kind, strokes: n, par, stars, misses: game.misses, tags: [...game.tags].join(",") });
  flush();
  checkNewSkins(skinsBefore);
  const order = ["Ace", "Slingshot", "Wormhole", "Close call", "Bank shot", "Bumper", "Nebula brake", "Long haul", "Comeback"];
  const tags = order.filter((t) => game.tags.has(t));
  $("rTags").innerHTML = tags.map((t, i) => `<span class="tag" style="animation-delay:${0.9 + i * 0.12}s">${t}</span>`).join("");
  $("rShare").textContent = game.kind === "daily" ? "Share today's result" : n === 1 ? "Share this hole in one" : "Share this shot";
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
$("rRetry").onclick = () => { closeOv("result"); loadGame({ ...game, keepMisses: true, misses: 0, ghost: game.allTrails.length ? game.allTrails[game.allTrails.length - 1] : game.ghost }); game.misses = 0; };
$("rShare").onclick = async () => {
  const g = game;
  const order = ["Ace", "Slingshot", "Wormhole", "Close call", "Bank shot", "Bumper", "Nebula brake", "Long haul", "Comeback"];
  const text = shareText({
    kind: g.kind, levelName: g.level.name, holeLabel: g.kind === "campaign" ? `Chapter ${g.ci + 1}, hole ${g.hi + 1}` : "",
    strokes: g.strokes, par: g.level.par, stars: g.stars, shots: g.fates, tags: order.filter((t) => g.tags.has(t)),
    dateKey: g.dateKey, streak: save.data.streak,
  });
  const card = postcard(g);
  const r = await share(text, card);
  if (r === "copied") toastMsg("Result copied. Paste it anywhere", "good");
  else if (r === "failed") toastMsg("Sharing isn't available here", "bad");
};

// A shareable image of the hole with every shot drawn on it.
function postcard(g) {
  const cv = document.createElement("canvas");
  const P = new Renderer(cv);
  P.insets = { top: 230, bottom: 250 };
  P.setSize(1080, 1350, 1);
  P.setLevel(g.level, g.sky);
  P.setSize(1080, 1350, 1);
  P.draw({ world: g.world, t: g.t, mode: "done", trail: [], extraTrails: g.allTrails, skin: g.skin, ballPos: null });
  const c = P.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const top = c.createLinearGradient(0, 0, 0, 260); top.addColorStop(0, "rgba(7,11,26,0.95)"); top.addColorStop(1, "rgba(7,11,26,0)");
  c.fillStyle = top; c.fillRect(0, 0, 1080, 260);
  const bot = c.createLinearGradient(0, 1080, 0, 1350); bot.addColorStop(0, "rgba(7,11,26,0)"); bot.addColorStop(1, "rgba(7,11,26,0.97)");
  c.fillStyle = bot; c.fillRect(0, 1080, 1080, 270);
  c.fillStyle = "#ffc94d"; c.font = "600 30px 'IBM Plex Mono', monospace"; c.textAlign = "left";
  c.fillText(g.kind === "daily" ? `DAILY ORBIT · ${g.dateKey}` : g.kind === "free" ? "FREE ORBIT" : `CHAPTER ${g.ci + 1} · HOLE ${g.hi + 1}`, 64, 92);
  c.fillStyle = "#ffffff"; c.font = "800 76px Syne, sans-serif"; c.fillText(g.level.name, 60, 172);
  c.font = "800 92px Syne, sans-serif"; c.fillStyle = "#ffd98a";
  c.fillText(g.strokes === 1 ? "Hole in one" : `${g.strokes} strokes`, 60, 1220);
  c.font = "600 54px 'IBM Plex Mono', monospace"; c.fillStyle = "#ffc94d"; c.textAlign = "right";
  c.fillText("★".repeat(g.stars) + "☆".repeat(3 - g.stars), 1020, 1216);
  c.textAlign = "left"; c.fillStyle = "#aab4d4"; c.font = "400 30px 'IBM Plex Mono', monospace";
  c.fillText(`Par ${g.level.par} · Perihelion Golf`, 64, 1282);
  return cv;
}
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
window.addEventListener("resize", () => { if (game) { game.aim = null; game.preview = null; } layoutRenderer(); });
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

const reduceMotionPref = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === "game" && game) {
    const running = !overlays.length && game.mode !== "brief";
    if (running) {
      // cinematic slow motion: predict whether the flying ball is about to drop
      let slow = 1, zoom = 1;
      if (game.mode === "fly" && game.ball) {
        const probe = { ...game.ball, events: [] };
        let t2 = game.t;
        for (let k = 0; k < 66; k++) {
          t2 += PHYS.dt;
          const ev = step(game.world, probe, t2);
          if (ev === "holed") { slow = 0.28; zoom = 1.55; break; }
          if (ev) break;
        }
        game.world.at(game.t);
      }
      if (game.slowPulse > 0) { game.slowPulse -= dt; slow = Math.min(slow, 0.45); }
      if (game.mode === "done") { zoom = 1.55; slow = 1; }
      if (reduceMotionPref()) { slow = 1; zoom = 1; }
      game.timeScale += (slow - game.timeScale) * Math.min(1, dt * 10);
      R.view.zoom += (zoom - R.view.zoom) * Math.min(1, dt * (zoom > R.view.zoom ? 4 : 2));
      R.view.fx = game.level.hole.x; R.view.fy = game.level.hole.y;
      acc += dt * game.timeScale;
      while (acc >= PHYS.dt) {
        acc -= PHYS.dt;
        game.t += PHYS.dt;
        if (game.mode === "fly" && game.ball) {
          const ev = step(game.world, game.ball, game.t);
          handleShotEvents(game.ball);
          game.trail.push(game.ball.x, game.ball.y, 0);
          { const h = game.level.hole, d = Math.hypot(game.ball.x - h.x, game.ball.y - h.y); if (d < game.near.d) game.near = { d, x: game.ball.x, y: game.ball.y }; }
          if (game.trail.length > 9000) game.trail.splice(0, 3);
          game.flyTime += PHYS.dt;
          if (ev) { handleEnd(ev); if (!game) break; }
          else if (game.fate === "orbit" && game.flyTime > 4.5) { handleEnd("orbit"); if (!game) break; }
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
      if (game.mode !== "done" && game.mode !== "fly" && R.view.zoom > 1.001) R.view.zoom += (1 - R.view.zoom) * Math.min(1, dt * 3);
      R.draw({ world: game.world, t: game.t, mode: game.mode, aim: game.aim, aiming: !!game.aim, preview: game.preview, trail: game.trail, ghost: game.ghost, ballPos,
        nearMark: game.mode === "aim" ? game.nearMark : null, ghostGold: game.ghostGold, guide: game.guide,
        labelAlpha: game.aim || game.mode === "fly" ? 0 : Math.max(0, Math.min(1, (9 - game.t) / 1.5)),
        skin: game.skin, tutorial: game.tutorial && game.mode === "aim" && !game.aim && !overlays.length });
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
  postcard() { return game ? postcard(game).toDataURL("image/png") : null; },
  save,
};

log("app_start", { stars: save.totalStars(), holes: save.holesDone() });
applySettings();
show("title");
document.fonts && document.fonts.ready.then(() => layoutRenderer());
requestAnimationFrame(frame);
keepAwake();
