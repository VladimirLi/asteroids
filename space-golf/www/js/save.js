// Local save data. Everything stays on the device; nothing is sent anywhere.
const KEY = "perihelion.save.v1";

const DEFAULTS = () => ({
  holes: {},            // id -> { best, stars }
  daily: {},            // "YYYY-MM-DD" -> best strokes
  lastDaily: null,      // last date a daily hole was completed
  streak: 0,
  achievements: {},     // id -> timestamp
  counters: { warps: 0, swallowed: 0, aces: 0, shots: 0, holed: 0, freeplay: 0 },
  seen: {},             // story / intro cards already shown
  settings: { music: 0.7, sfx: 0.9, haptics: true, leftHanded: false },
});

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const d = JSON.parse(raw);
    const def = DEFAULTS();
    return { ...def, ...d, counters: { ...def.counters, ...d.counters }, settings: { ...def.settings, ...d.settings } };
  } catch (e) {
    return DEFAULTS();
  }
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full or blocked: play on */ }
}

export const save = {
  get data() { return data; },
  settings() { return data.settings; },
  hole(id) { return data.holes[id] || null; },
  // Record a finished hole. Returns { stars, newBest, prevStars }.
  finishHole(id, strokes, par) {
    const stars = strokes <= par - 1 ? 3 : strokes <= par ? 2 : 1;
    const prev = data.holes[id];
    const rec = { best: prev ? Math.min(prev.best, strokes) : strokes, stars: Math.max(prev ? prev.stars : 0, stars) };
    data.holes[id] = rec;
    persist();
    return { stars, newBest: !prev || strokes < prev.best, prevStars: prev ? prev.stars : 0 };
  },
  totalStars() { return Object.values(data.holes).reduce((a, h) => a + h.stars, 0); },
  holesDone() { return Object.keys(data.holes).length; },
  finishDaily(dateKey, strokes, yesterdayKey) {
    const prev = data.daily[dateKey];
    data.daily[dateKey] = prev ? Math.min(prev, strokes) : strokes;
    if (data.lastDaily !== dateKey) {
      data.streak = data.lastDaily === yesterdayKey ? data.streak + 1 : 1;
      data.lastDaily = dateKey;
    }
    persist();
    return { best: data.daily[dateKey], first: !prev, streak: data.streak };
  },
  count(name, n = 1) { data.counters[name] = (data.counters[name] || 0) + n; persist(); return data.counters[name]; },
  seen(key) { return !!data.seen[key]; },
  markSeen(key) { data.seen[key] = 1; persist(); },
  unlock(id) {
    if (data.achievements[id]) return false;
    data.achievements[id] = Date.now();
    persist();
    return true;
  },
  setSetting(k, v) { data.settings[k] = v; persist(); },
  reset() { const s = data.settings; data = DEFAULTS(); data.settings = s; persist(); },
};
