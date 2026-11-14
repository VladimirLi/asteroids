// Unlockable balls and trails. Each is earned by play: stars, logbook entries or the daily streak.
export const SKINS = [
  { id: "classic", name: "Classic", desc: "Where every groundskeeper starts.", ball: ["#ffffff", "#b9c4dd"], trail: "111,224,210", req: { stars: 0 } },
  { id: "ember", name: "Ember", desc: "Earn 12 stars.", ball: ["#fff3d6", "#ff8a3d"], trail: "255,140,60", sparks: "255,170,90", req: { stars: 12 } },
  { id: "comet", name: "Comet Ice", desc: "Earn 24 stars.", ball: ["#ffffff", "#8fd3ff"], trail: "150,220,255", sparks: "210,240,255", req: { stars: 24 } },
  { id: "regular", name: "Daily Regular", desc: "Play the Daily Orbit 3 days in a row.", ball: ["#e9fff9", "#3fd6b8"], trail: "63,214,184", req: { streak: 3 } },
  { id: "nebula", name: "Nebula", desc: "Earn 40 stars.", ball: ["#f6e6ff", "#b06cff"], trail: "190,130,255", sparks: "220,180,255", req: { stars: 40 } },
  { id: "horizon", name: "Event Horizon", desc: "Lose a ball to a black hole.", ball: ["#4b3460", "#05030a"], ring: "#ffb070", trail: "255,170,100", req: { ach: "swallowed" } },
  { id: "spectrum", name: "Spectrum", desc: "Earn 60 stars.", ball: ["#ffffff", "#ff7ad9"], trail: "rainbow", sparks: "rainbow", req: { stars: 60 } },
  { id: "gold", name: "Gold Standard", desc: "Earn 85 stars.", ball: ["#fffbe0", "#ffc94d"], trail: "255,201,77", sparks: "255,220,120", req: { stars: 85 } },
  { id: "perihel", name: "Perihel", desc: "Earn all 108 stars. The sun itself.", ball: ["#fff6d8", "#ff9d3a"], glow: "255,180,80", trail: "255,200,90", sparks: "255,210,120", req: { stars: 108 } },
];

export function skinUnlocked(skin, save) {
  const r = skin.req;
  if (r.stars !== undefined && save.totalStars() < r.stars) return false;
  if (r.ach && !save.data.achievements[r.ach]) return false;
  if (r.streak && (save.data.bestStreak || save.data.streak || 0) < r.streak) return false;
  return true;
}
export function currentSkin(save) {
  const s = SKINS.find((k) => k.id === save.settings().skin);
  return s && skinUnlocked(s, save) ? s : SKINS[0];
}
// Colour for a trail point; "rainbow" cycles hue along the path.
export function trailColor(skin, k) {
  if (skin.trail !== "rainbow") return skin.trail;
  const h = (k * 4) % 360;
  const c = hsl(h, 90, 65);
  return c;
}
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return `${f(0)},${f(8)},${f(4)}`;
}
