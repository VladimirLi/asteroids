// Canvas renderer: course, bodies, ball, effects. Draws in world units under a fitted, possibly rotated view.
import { PHYS, pulsePhase } from "./core.js";

const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = 0; this.H = 0; this.dpr = 1;
    this.view = { s: 1, rot: 0, cx: 0, cy: 0, zoom: 1, fx: 0, fy: 0 };
    this.rings = [];
    this.callouts = [];
    this.flash = 0;
    this.level = null;
    this.sky = { hue: 222 };
    this.bg = null;
    this.particles = [];
    this.shake = 0;
    this.insets = { top: 60, bottom: 60 };
  }

  resize(insets) {
    if (insets) this.insets = insets;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.cv.style.width = this.W + "px"; this.cv.style.height = this.H + "px";
    this.fit();
    this.bg = null;
  }

  // Fixed-size rendering (share postcards).
  setSize(w, h, dpr = 1) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.fit(); this.bg = null;
  }

  setLevel(level, sky) {
    this.level = level;
    if (sky) this.sky = sky;
    this.particles.length = 0; this.rings.length = 0; this.callouts.length = 0; this.flash = 0;
    this.view.zoom = 1;
    this.fit();
    this.bg = null;
  }

  fit() {
    if (!this.level) return;
    const top = this.insets.top + 6, bot = this.insets.bottom + 6;
    const availW = this.W - 20, availH = Math.max(100, this.H - top - bot);
    const portrait = availH > availW * 1.05;
    this.view.rot = portrait ? -Math.PI / 2 : 0;
    const lw = portrait ? this.level.h : this.level.w, lh = portrait ? this.level.w : this.level.h;
    this.view.s = Math.min(availW / lw, availH / lh);
    this.view.cx = this.W / 2; this.view.cy = top + availH / 2;
  }

  w2s(x, y) {
    const v = this.view, c = Math.cos(v.rot), s = Math.sin(v.rot);
    if (v.zoom !== 1) { x = v.fx + (x - v.fx) * v.zoom; y = v.fy + (y - v.fy) * v.zoom; }
    const dx = (x - this.level.w / 2) * v.s, dy = (y - this.level.h / 2) * v.s;
    return { x: v.cx + dx * c - dy * s, y: v.cy + dx * s + dy * c };
  }
  screenVecToWorld(dx, dy) {
    const c = Math.cos(-this.view.rot), s = Math.sin(-this.view.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }
  worldTransform() {
    const v = this.view, d = this.dpr;
    const c = Math.cos(v.rot) * v.s * v.zoom * d, s = Math.sin(v.rot) * v.s * v.zoom * d;
    const o = this.w2s(0, 0);
    const sx = this.shakeX || 0, sy = this.shakeY || 0;
    this.ctx.setTransform(c, s, -s, c, (o.x + sx) * d, (o.y + sy) * d);
  }
  screenTransform() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  // ---------- background ----------
  buildBg() {
    const bg = document.createElement("canvas");
    bg.width = this.cv.width; bg.height = this.cv.height;
    const g = bg.getContext("2d");
    const h = this.sky.hue;
    const grad = g.createRadialGradient(bg.width * 0.7, bg.height * 0.2, 0, bg.width * 0.5, bg.height * 0.5, Math.max(bg.width, bg.height) * 0.9);
    grad.addColorStop(0, `hsl(${h}, 45%, 13%)`);
    grad.addColorStop(0.55, `hsl(${h + 10}, 50%, 7%)`);
    grad.addColorStop(1, `hsl(${h + 20}, 55%, 4%)`);
    g.fillStyle = grad; g.fillRect(0, 0, bg.width, bg.height);
    let seed = 1234 + h;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // faint nebula wisps
    for (let i = 0; i < 6; i++) {
      const x = rnd() * bg.width, y = rnd() * bg.height, r = (0.15 + rnd() * 0.35) * Math.max(bg.width, bg.height);
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, `hsla(${h + rnd() * 60 - 30}, 70%, 50%, ${0.035 + rnd() * 0.03})`);
      ng.addColorStop(1, `hsla(${h}, 70%, 50%, 0)`);
      g.fillStyle = ng; g.fillRect(0, 0, bg.width, bg.height);
    }
    const n = Math.round((this.W * this.H) / 2200);
    for (let i = 0; i < n; i++) {
      const x = rnd() * bg.width, y = rnd() * bg.height;
      const a = 0.12 + rnd() * 0.6, r = (rnd() < 0.07 ? 1.5 : 0.7) * this.dpr;
      g.fillStyle = `hsla(${h + rnd() * 40 - 20}, 60%, 90%, ${a})`;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    this.bg = bg;
  }

  // ---------- effects ----------
  burst(x, y, opts = {}) {
    if (reduceMotion() && !opts.essential) return;
    const n = opts.n || 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 120) * (0.3 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0),
        life: (opts.life || 0.8) * (0.6 + Math.random() * 0.6), age: 0,
        size: (opts.size || 3) * (0.5 + Math.random()), color: opts.color || "255,220,140", drag: opts.drag ?? 2.2,
        spiral: opts.spiral ? { cx: x, cy: y } : null,
      });
    }
  }
  spiral(x, y) {
    if (reduceMotion()) return;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, r = 40 + Math.random() * 90;
      this.particles.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: 0, vy: 0, life: 1.0, age: 0, size: 2.5, color: "255,170,100", drag: 0, spiral: { cx: x, cy: y, a, r } });
    }
  }
  ring(x, y, opts = {}) {
    this.rings.push({ x, y, age: 0, life: opts.life || 0.7, max: opts.max || 120, color: opts.color || "255,210,110", w: opts.w || 4 });
  }
  callout(x, y, text, color = "255,214,120") {
    this.callouts.push({ x, y, text, age: 0, life: 1.4, color });
  }
  flashScreen(a = 0.5) { if (!reduceMotion()) this.flash = Math.max(this.flash, a); }
  kick(amount) { if (!reduceMotion()) this.shake = Math.min(14, this.shake + amount); }

  updateFx(dt) {
    const P = this.particles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) { P.splice(i, 1); continue; }
      if (p.spiral && p.spiral.r !== undefined) {
        p.spiral.a += dt * (3 + 6 * (p.age / p.life));
        const r = p.spiral.r * (1 - p.age / p.life);
        p.x = p.spiral.cx + Math.cos(p.spiral.a) * r; p.y = p.spiral.cy + Math.sin(p.spiral.a) * r;
      } else {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.age += dt; if (r.age >= r.life) this.rings.splice(i, 1); }
    for (let i = this.callouts.length - 1; i >= 0; i--) { const c = this.callouts[i]; c.age += dt; if (c.age >= c.life) this.callouts.splice(i, 1); }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 40);
      this.shakeX = (Math.random() - 0.5) * this.shake; this.shakeY = (Math.random() - 0.5) * this.shake;
    } else { this.shakeX = this.shakeY = 0; }
  }

  // ---------- frame ----------
  draw(st) {
    const ctx = this.ctx, L = this.level;
    if (!this.bg) this.buildBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    if (!L) return;
    this.worldTransform();
    const px = 1 / this.view.s;
    const W = st.world, t = st.t, B = L.bodies;
    W.at(t);
    this.t = t;

    ctx.strokeStyle = "rgba(160,180,240,0.09)"; ctx.lineWidth = px; ctx.setLineDash([6 * px, 8 * px]);
    ctx.strokeRect(0, 0, L.w, L.h); ctx.setLineDash([]);

    for (let i = 0; i < B.length; i++) if (B[i].type === "cloud") this.cloud(W.x[i], W.y[i], B[i]);
    // field rings
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.mu || b.type === "cloud") continue;
      const quiet = !W.on[i];
      const col = b.mu < 0 ? "255,120,110" : b.type === "pulsar" ? "150,210,255" : b.type === "blackhole" ? "255,190,140" : "170,190,255";
      let k = 0;
      for (const a of [520, 200, 80]) {
        const r = Math.sqrt(Math.abs(b.mu) / a);
        if (r > b.r + 6 && r < 520) {
          ctx.strokeStyle = `rgba(${col},${(0.3 - k * 0.085) * (quiet ? 0.35 : 1)})`; ctx.lineWidth = 1.2 * px;
          ctx.setLineDash([5 * px, 7 * px]);
          ctx.beginPath(); ctx.arc(W.x[i], W.y[i], r, 0, 6.283); ctx.stroke();
        }
        k++;
      }
      ctx.setLineDash([]);
    }
    // orbit guides
    for (let i = 0; i < B.length; i++) {
      const o = B[i].orbit; if (!o) continue;
      const cx = typeof o.around === "number" ? W.x[o.around] : o.cx, cy = typeof o.around === "number" ? W.y[o.around] : o.cy;
      ctx.strokeStyle = "rgba(200,210,235,0.1)"; ctx.lineWidth = px;
      ctx.beginPath(); ctx.arc(cx, cy, o.r, 0, 6.283); ctx.stroke();
    }
    for (let i = 0; i < B.length; i++) {
      const b = B[i], x = W.x[i], y = W.y[i];
      switch (b.type) {
        case "planet": case "moon": this.planet(x, y, b, i); break;
        case "asteroid": this.asteroid(x, y, b, i); break;
        case "blackhole": this.blackhole(x, y, b); break;
        case "repulsor": this.repulsor(x, y, b); break;
        case "pulsar": this.pulsar(x, y, b, W.on[i]); break;
        case "wormhole": this.wormhole(x, y, b); break;
        case "star": this.star(x, y, b); break;
      }
    }
    this.cup(st);
    this.teeMark(px);

    if (st.ghostGold) { ctx.setLineDash([10 * px, 7 * px]); this.trail(st.ghost, "rgba(255,201,77,0.75)", px, 2.2); ctx.setLineDash([]); }
    else this.trail(st.ghost, st.aiming ? "rgba(160,170,200,0.10)" : "rgba(160,170,200,0.22)", px, 1.5);
    if (st.nearMark) {
      const m = st.nearMark; ctx.strokeStyle = "rgba(255,120,110,0.9)"; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(m.x, m.y, 7 * px, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(this.level.hole.x, this.level.hole.y); ctx.setLineDash([3 * px, 4 * px]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (st.extraTrails) for (const tr of st.extraTrails) this.glowTrail(tr, st.skin, px, 0.55);
    this.glowTrail(st.trail, st.skin, px, st.aiming ? 0.35 : 1);

    // preview
    const pv = st.preview;
    if (pv && pv.pts.length) {
      const goesIn = pv.hit && pv.hit.ev === "holed";
      ctx.fillStyle = goesIn ? "rgba(255,210,90,1)" : "rgba(255,255,255,0.95)";
      const n = pv.pts.length / 2;
      const march = reduceMotion() ? 0 : (t * 6) % 1;
      for (let k = 0; k < n; k++) {
        const pulse = 0.75 + 0.25 * Math.cos((k / 3 - t * 3) * Math.PI);
        ctx.globalAlpha = Math.max(0.45, 1 - k / (n + 4)) * pulse;
        ctx.beginPath(); ctx.arc(pv.pts[2 * k], pv.pts[2 * k + 1], (2.2 + 0.6 * pulse) * px, 0, 6.283); ctx.fill();
      }
      void march;
      ctx.globalAlpha = 1;
      if (pv.hit) {
        const c = { holed: "#ffc94d", rest: "#6fe0d2" }[pv.hit.ev] || "#ff6b6b";
        ctx.strokeStyle = c; ctx.lineWidth = 2.5 * px;
        ctx.beginPath(); ctx.arc(pv.hit.x, pv.hit.y, 10 * px, 0, 6.283); ctx.stroke();
        if (goesIn) {
          const h = this.level.hole, pr = PHYS.greenR * (0.75 + 0.25 * Math.sin(t * 8));
          ctx.lineWidth = 4 * px; ctx.beginPath(); ctx.arc(h.x, h.y, pr, 0, 6.283); ctx.stroke();
        }
      }
    }

    // shockwave rings
    for (const r of this.rings) {
      const k = r.age / r.life, e = 1 - Math.pow(1 - k, 3);
      ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.9})`; ctx.lineWidth = r.w * (1 - k) * px + px;
      ctx.beginPath(); ctx.arc(r.x, r.y, 10 + e * r.max, 0, 6.283); ctx.stroke();
    }
    // particles
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * px * (0.5 + a * 0.5), 0, 6.283); ctx.fill();
    }

    // ball
    const bp = st.ballPos;
    if (bp) {
      const r = Math.max(PHYS.ballR, 4.5 * px);
      const sk = st.skin || { ball: ["#ffffff", "#b9c4dd"] };
      if (sk.glow) {
        const gl = ctx.createRadialGradient(bp.x, bp.y, r * 0.5, bp.x, bp.y, r * 4);
        gl.addColorStop(0, `rgba(${sk.glow},0.55)`); gl.addColorStop(1, `rgba(${sk.glow},0)`);
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bp.x, bp.y, r * 4, 0, 6.283); ctx.fill();
      }
      const g = ctx.createRadialGradient(bp.x - r * 0.3, bp.y - r * 0.3, r * 0.1, bp.x, bp.y, r);
      g.addColorStop(0, sk.ball[0]); g.addColorStop(1, sk.ball[1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bp.x, bp.y, r, 0, 6.283); ctx.fill();
      if (sk.ring) { ctx.strokeStyle = sk.ring; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(bp.x, bp.y, r * 1.1, 0, 6.283); ctx.stroke(); }
      if (st.mode === "aim" && !st.aiming) {
        const pulse = reduceMotion() ? 0.5 : 0.5 + 0.5 * Math.sin(t * 4);
        ctx.strokeStyle = `rgba(255,201,77,${0.25 + pulse * 0.45})`; ctx.lineWidth = 1.5 * px;
        ctx.beginPath(); ctx.arc(bp.x, bp.y, r + 7 * px + pulse * 3 * px, 0, 6.283); ctx.stroke();
      }
    }

    // screen-space overlays
    this.screenTransform();
    if (st.labelAlpha > 0.01) { ctx.globalAlpha = st.labelAlpha; this.labels(W); ctx.globalAlpha = 1; }
    this.pulsarTimers(W, t);
    if (pv && pv.hit && pv.hit.ev === "rest") {
      const s3 = this.w2s(pv.hit.x, pv.hit.y);
      ctx.font = "600 10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#6fe0d2"; ctx.fillText("LANDS", s3.x, s3.y - 14);
    }
    if (st.nearMark) {
      const s4 = this.w2s(st.nearMark.x, st.nearMark.y);
      ctx.font = "600 10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,140,130,0.95)"; ctx.fillText("LAST MISS", s4.x, s4.y - 12);
    }
    if (pv && pv.label && pv.hit && pv.hit.ev === "holed") {
      const s2 = this.w2s(this.level.hole.x, this.level.hole.y);
      ctx.font = "800 18px Syne, sans-serif"; ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,9,22,0.9)"; ctx.strokeText("GOES IN", s2.x, s2.y + 48);
      ctx.fillStyle = "#ffc94d"; ctx.fillText("GOES IN", s2.x, s2.y + 48);
    }
    this.flag(st);
    if (st.aim) this.gauge(st.aim, bp);
    for (const c of this.callouts) {
      const k = c.age / c.life, s2 = this.w2s(c.x, c.y);
      const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.4 : 1.1 - Math.min(0.1, (k - 0.12));
      ctx.save();
      ctx.translate(s2.x, s2.y - 26 - k * 34); ctx.scale(pop, pop);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.font = "800 20px Syne, sans-serif"; ctx.textAlign = "center";
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(6,9,22,0.85)"; ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = `rgb(${c.color})`; ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
    if (st.tutorial && bp) this.tutorialHand(bp, t);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,236,190,${this.flash})`; ctx.fillRect(0, 0, this.W, this.H); }
  }

  // Animated "drag back and release" demonstration for first-time players.
  tutorialHand(bp, t) {
    const ctx = this.ctx, b = this.w2s(bp.x, bp.y), h = this.w2s(this.level.hole.x, this.level.hole.y);
    const dx = h.x - b.x, dy = h.y - b.y, len = Math.hypot(dx, dy) || 1;
    const ux = -dx / len, uy = -dy / len;              // pull direction: away from the cup
    const cyc = (t % 2.4) / 2.4;
    const startX = this.W / 2, startY = this.H * 0.55;
    const pull = Math.min(this.W, this.H) * 0.12 * Math.min(1, cyc / 0.55);
    const fx = startX + ux * pull, fy = startY + uy * pull;
    const alpha = cyc < 0.8 ? 1 : (1 - cyc) / 0.2;
    ctx.save(); ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(startX, startY, 6, 0, 6.283); ctx.fill();
    const press = cyc < 0.62 ? 1 : 0;
    ctx.fillStyle = `rgba(255,201,77,${0.35 + 0.5 * press})`; ctx.strokeStyle = "#ffc94d"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy, 16 - 4 * press, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.font = "600 12px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#e6ebf7";
    ctx.fillText(cyc < 0.62 ? "drag back" : "release", fx, fy + 34);
    ctx.restore();
  }

  // Trail with an additive glow in the ball skin's colours.
  glowTrail(arr, skin, px, alpha) {
    if (!arr || arr.length < 6) return;
    const ctx = this.ctx, rainbow = skin && skin.trail === "rainbow";
    const col = skin ? skin.trail : "111,224,210";
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    const n = arr.length / 3;
    const seg = Math.max(1, Math.floor(n / 60));
    for (const [w, a] of [[7, 0.10], [2.4, 0.7]]) {
      ctx.lineWidth = w * px;
      for (let i = 0; i < n - 1; i += seg) {
        const j = Math.min(n - 1, i + seg);
        const fade = 0.35 + 0.65 * (i / n);
        const c = rainbow ? hslRGB((i * 6) % 360) : col;
        ctx.strokeStyle = `rgba(${c},${a * fade * alpha})`;
        ctx.beginPath(); ctx.moveTo(arr[i * 3], arr[i * 3 + 1]);
        // a flagged point is a wormhole exit: lift the pen so no line crosses the map
        for (let k = i + 1; k <= j; k++) arr[k * 3 + 2] === 1 ? ctx.moveTo(arr[k * 3], arr[k * 3 + 1]) : ctx.lineTo(arr[k * 3], arr[k * 3 + 1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  trail(arr, color, px, w) {
    if (!arr || arr.length < 6) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = w * px; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k < arr.length; k += 3) {
      if (arr[k + 2] === 1) { pen = false; }
      if (!pen) { ctx.moveTo(arr[k], arr[k + 1]); pen = true; } else ctx.lineTo(arr[k], arr[k + 1]);
    }
    ctx.stroke();
  }

  planet(x, y, b, i) {
    const ctx = this.ctx, col = b.color || "#8899cc";
    const g = ctx.createRadialGradient(x - b.r * 0.35, y - b.r * 0.4, b.r * 0.1, x, y, b.r);
    g.addColorStop(0, shade(col, 0.4)); g.addColorStop(0.65, col); g.addColorStop(1, shade(col, -0.5));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    // surface bands
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.clip();
    ctx.globalAlpha = 0.12; ctx.fillStyle = shade(col, -0.35);
    const seed = (i * 7 + 3) % 5;
    for (let k = 0; k < 3; k++) {
      const yy = y - b.r + (k + 1) * (b.r * 2) / 4 + (seed - 2) * 3;
      ctx.fillRect(x - b.r, yy, b.r * 2, b.r * 0.12 + k * 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(col, 0.25) + "55"; ctx.lineWidth = b.r * 0.08;
    ctx.beginPath(); ctx.arc(x, y, b.r * 1.04, 0, 6.283); ctx.stroke();
  }
  asteroid(x, y, b, i) {
    const ctx = this.ctx, col = b.color || "#8a8f9c";
    const n = 9; let s = i * 97 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283, r = b.r * (0.86 + rnd() * 0.22);
      k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x - b.r * 0.4, y - b.r * 0.4, 1, x, y, b.r * 1.1);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.45));
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = shade(col, -0.35);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * b.r, y + (rnd() - 0.5) * b.r, b.r * (0.1 + rnd() * 0.12), 0, 6.283); ctx.fill();
    }
  }
  blackhole(x, y, b) {
    const ctx = this.ctx, H = b.horizon, t = this.t;
    const g = ctx.createRadialGradient(x, y, H * 0.6, x, y, H * 2.8);
    g.addColorStop(0, "rgba(255,170,90,0)"); g.addColorStop(0.33, "rgba(255,160,80,0.6)");
    g.addColorStop(0.6, "rgba(200,90,160,0.2)"); g.addColorStop(1, "rgba(120,60,160,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, H * 2.8, 0, 6.283); ctx.fill();
    // swirling accretion streaks
    if (!reduceMotion()) {
      ctx.strokeStyle = "rgba(255,200,140,0.35)"; ctx.lineWidth = 1.5 / this.view.s;
      for (let k = 0; k < 3; k++) {
        const a = t * (1.6 + k * 0.5) + k * 2;
        ctx.beginPath(); ctx.arc(x, y, H * (1.35 + k * 0.35), a, a + 1.6); ctx.stroke();
      }
    }
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, H, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(255,190,120,0.95)"; ctx.lineWidth = 2 / this.view.s;
    ctx.beginPath(); ctx.arc(x, y, H, 0, 6.283); ctx.stroke();
  }
  repulsor(x, y, b) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * 2.2);
    g.addColorStop(0, "#fff1e6"); g.addColorStop(0.3, "#ff8a70"); g.addColorStop(0.55, "rgba(255,90,80,0.35)"); g.addColorStop(1, "rgba(255,80,80,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r * 2.2, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(255,140,120,0.7)"; ctx.lineWidth = 2 / this.view.s;
    const tt = reduceMotion() ? 0 : (this.t * 0.6) % 1;
    ctx.globalAlpha = 1 - tt;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.283, r0 = b.r * (1.6 + tt * 1.2), ca = Math.cos(a), sa = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x + ca * r0 - sa * 6, y + sa * r0 + ca * 6);
      ctx.lineTo(x + ca * (r0 + 8), y + sa * (r0 + 8));
      ctx.lineTo(x + ca * r0 + sa * 6, y + sa * r0 - ca * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  pulsar(x, y, b, on) {
    const ctx = this.ctx, glow = on ? 4.2 : 1.8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * glow);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.3, on ? "#9fd8ff" : "#4d6790"); g.addColorStop(1, "rgba(120,180,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r * glow, 0, 6.283); ctx.fill();
    ctx.fillStyle = on ? "#e8f6ff" : "#7d8fb0"; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    if (on && !reduceMotion()) {
      // sweeping beams
      const a = this.t * 5;
      ctx.strokeStyle = "rgba(190,230,255,0.35)"; ctx.lineWidth = 3 / this.view.s;
      for (const off of [0, Math.PI]) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + off) * b.r * 6, y + Math.sin(a + off) * b.r * 6); ctx.stroke();
      }
    }
  }
  wormhole(x, y, b) {
    const ctx = this.ctx, hue = b.hue ?? 190;
    for (let k = 0; k < 4; k++) {
      const a0 = (reduceMotion() ? 0 : this.t * (1.5 + k * 0.4)) + k;
      ctx.strokeStyle = `hsla(${hue + k * 18},90%,${65 - k * 6}%,${0.9 - k * 0.17})`; ctx.lineWidth = 3 / this.view.s;
      ctx.beginPath(); ctx.arc(x, y, b.r * (1 - k * 0.2), a0, a0 + Math.PI * 1.4); ctx.stroke();
    }
    ctx.fillStyle = `hsla(${hue},80%,10%,0.9)`; ctx.beginPath(); ctx.arc(x, y, b.r * 0.3, 0, 6.283); ctx.fill();
  }
  cloud(x, y, b) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
    g.addColorStop(0, "rgba(170,120,230,0.32)"); g.addColorStop(0.75, "rgba(140,100,220,0.18)"); g.addColorStop(1, "rgba(120,90,200,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(190,150,255,0.25)"; ctx.lineWidth = 1 / this.view.s;
    ctx.setLineDash([2 / this.view.s, 6 / this.view.s]);
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
  }
  star(x, y, b) {
    const ctx = this.ctx, col = b.color || "#ffb347";
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * 2.6);
    g.addColorStop(0, "#fffbe8"); g.addColorStop(0.35, col); g.addColorStop(0.6, hexA(col, 0.25)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r * 2.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = shade(col, 0.5); ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    if (!reduceMotion()) {
      ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 2 / this.view.s;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * 6.283 + this.t * 0.3, l = b.r * (1.25 + 0.2 * Math.sin(this.t * 3 + k));
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * b.r * 1.05, y + Math.sin(a) * b.r * 1.05); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
  }
  cup(st) {
    const ctx = this.ctx, h = this.level.hole, s = this.view.s;
    const gg = ctx.createRadialGradient(h.x, h.y, PHYS.holeR, h.x, h.y, PHYS.greenR);
    gg.addColorStop(0, "rgba(255,201,77,0.18)"); gg.addColorStop(1, "rgba(255,201,77,0.03)");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(h.x, h.y, PHYS.greenR, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(255,201,77,0.3)"; ctx.lineWidth = 1 / s;
    ctx.setLineDash([3 / s, 5 / s]); ctx.beginPath(); ctx.arc(h.x, h.y, PHYS.greenR, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = st.mode === "done" ? "#ffc94d" : "#020308";
    ctx.beginPath(); ctx.arc(h.x, h.y, PHYS.holeR, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#ffc94d"; ctx.lineWidth = 2.5 / s;
    ctx.beginPath(); ctx.arc(h.x, h.y, PHYS.holeR, 0, 6.283); ctx.stroke();
  }
  flag(st) {
    const ctx = this.ctx, h = this.level.hole, s = this.w2s(h.x, h.y);
    const pole = Math.max(26, PHYS.holeR * this.view.s * 2.4);
    ctx.strokeStyle = "#e6ebf7"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - pole); ctx.stroke();
    const wave = reduceMotion() ? 0 : Math.sin(this.t * 3) * 2;
    ctx.fillStyle = "#ffc94d";
    ctx.beginPath(); ctx.moveTo(s.x, s.y - pole); ctx.lineTo(s.x + 16, s.y - pole + 5 + wave); ctx.lineTo(s.x, s.y - pole + 11); ctx.fill();
  }
  teeMark(px) {
    const ctx = this.ctx, t = this.level.tee;
    ctx.strokeStyle = "rgba(111,224,210,0.45)"; ctx.lineWidth = 1.5 * px;
    ctx.beginPath(); ctx.arc(t.x, t.y, 14 * px + PHYS.ballR, 0, 6.283); ctx.stroke();
  }
  labels(W) {
    const ctx = this.ctx, B = this.level.bodies;
    ctx.font = "600 11px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.label) continue;
      const s = this.w2s(W.x[i], W.y[i]);
      const off = Math.max(b.r * this.view.s, 12) + 18;
      const text = b.label.toUpperCase(), wdt = ctx.measureText(text).width + 12;
      ctx.fillStyle = "rgba(8,12,28,0.75)"; ctx.fillRect(s.x - wdt / 2, s.y + off - 12, wdt, 17);
      ctx.fillStyle = "rgba(230,235,247,0.92)"; ctx.fillText(text, s.x, s.y + off);
    }
  }
  pulsarTimers(W, t) {
    const ctx = this.ctx, B = this.level.bodies;
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; if (!b.pulse) continue;
      const ph = pulsePhase(b, t), s = this.w2s(W.x[i], W.y[i]);
      const r = Math.max(b.r * this.view.s * 2.4, 16);
      ctx.strokeStyle = ph.on ? "rgba(170,220,255,0.95)" : "rgba(140,160,200,0.6)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - ph.frac)); ctx.stroke();
    }
  }
  gauge(aim, bp) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(aim.sx, aim.sy); ctx.lineTo(aim.cx, aim.cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(aim.sx, aim.sy, 4, 0, 6.283); ctx.fill();
    if (!aim.power || !bp) return;
    const s = this.w2s(bp.x, bp.y), r = 26;
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = aim.power > 0.85 ? "#ff6b6b" : "#ffc94d";
    ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * aim.power); ctx.stroke();
    ctx.fillStyle = "#e6ebf7"; ctx.font = "600 12px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
    const side = s.x > this.W - 90 ? -1 : 1;
    ctx.textAlign = side > 0 ? "left" : "right";
    ctx.fillText(Math.round(aim.power * 100) + "%", s.x + side * (r + 8), s.y + r + 4);
  }
}

function hslRGB(h) {
  const f = (n) => { const k = (n + h / 30) % 12, a = 0.9 * Math.min(0.65, 0.35); return Math.round(255 * (0.65 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return `${f(0)},${f(8)},${f(4)}`;
}
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Small icons for briefing cards.
export function drawIcon(cv, kind) {
  const g = cv.getContext("2d"), c = cv.width / 2;
  g.clearRect(0, 0, cv.width, cv.height);
  const rg = (x0, y0, r0, r1, stops) => { const gr = g.createRadialGradient(x0, y0, r0, c, c, r1); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
  const disc = (r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); };
  switch (kind) {
    case "cup":
      g.fillStyle = "#020308"; g.beginPath(); g.arc(c, c + 8, 10, 0, 7); g.fill();
      g.strokeStyle = "#ffc94d"; g.lineWidth = 2; g.beginPath(); g.arc(c, c + 8, 10, 0, 7); g.stroke();
      g.strokeStyle = "#e6ebf7"; g.beginPath(); g.moveTo(c, c + 8); g.lineTo(c, 6); g.stroke();
      g.fillStyle = "#ffc94d"; g.beginPath(); g.moveTo(c, 6); g.lineTo(c + 14, 11); g.lineTo(c, 16); g.fill();
      break;
    case "planet": case "moon":
      g.setLineDash([3, 4]); g.strokeStyle = "rgba(170,190,255,0.5)"; g.beginPath(); g.arc(c, c, 25, 0, 7); g.stroke(); g.setLineDash([]);
      disc(15, rg(c - 5, c - 6, 2, 15, kind === "moon" ? [[0, "#f2f5fb"], [1, "#7d869c"]] : [[0, "#a9c3f7"], [1, "#2d4f99"]]));
      break;
    case "asteroid":
      g.fillStyle = rg(c - 6, c - 6, 1, 18, [[0, "#c5c9d3"], [1, "#4b4f5a"]]);
      g.beginPath(); [[0, 16], [1, 13], [2, 17], [3, 14], [4, 16], [5, 12], [6, 15]].forEach(([k, r], j) => { const a = k / 7 * 6.283; j ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }); g.closePath(); g.fill();
      break;
    case "blackhole":
      disc(26, rg(c, c, 6, 26, [[0, "rgba(255,160,80,0)"], [0.4, "rgba(255,160,80,0.7)"], [1, "rgba(150,60,160,0)"]]));
      disc(10, "#000"); g.strokeStyle = "#ffbe78"; g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, 10, 0, 7); g.stroke();
      break;
    case "repulsor": disc(22, rg(c, c, 0, 22, [[0, "#fff1e6"], [0.4, "#ff8a70"], [1, "rgba(255,80,80,0)"]])); break;
    case "cloud": disc(26, rg(c, c, 0, 26, [[0, "rgba(170,120,230,0.75)"], [1, "rgba(120,90,200,0)"]])); break;
    case "wormhole":
      for (let k = 0; k < 4; k++) { g.strokeStyle = `hsla(${190 + k * 18},90%,${65 - k * 6}%,${0.9 - k * 0.17})`; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, 20 - k * 4, k, k + 4.4); g.stroke(); }
      break;
    case "pulsar":
      disc(24, rg(c, c, 0, 24, [[0, "#fff"], [0.35, "#9fd8ff"], [1, "rgba(120,180,255,0)"]]));
      g.strokeStyle = "rgba(170,220,255,0.9)"; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 14, -1.57, 2.5); g.stroke();
      break;
    case "binary": case "star":
      g.strokeStyle = "rgba(255,200,140,0.35)"; g.setLineDash([2, 3]); g.beginPath(); g.arc(c, c, 13, 0, 7); g.stroke(); g.setLineDash([]);
      for (const sgn of [-1, 1]) {
        const x = c + sgn * 13, gr = g.createRadialGradient(x, c, 0, x, c, 11);
        gr.addColorStop(0, "#fffbe8"); gr.addColorStop(0.5, sgn < 0 ? "#ffb347" : "#ff8a5c"); gr.addColorStop(1, "rgba(255,140,80,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(x, c, 11, 0, 7); g.fill();
      }
      break;
  }
}
