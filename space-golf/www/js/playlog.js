// Play log for test builds: records how a session is played so levels can be tuned from real play.
// Every shot stores its exact launch state, so it can be replayed in the solver.
//
// Where it goes:
//  - On the Claude artifact test page: the artifact's own database (collection "plays").
//  - Everywhere else (the Android app, a plain browser): nothing leaves the device; the last
//    events are only kept in local storage.
// No personal data is recorded: a random session id, the screen size, and gameplay events.
export const BUILD = "1.7";

const session = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const t0 = Date.now();
let events = [];
let part = 0, dirty = false, writing = false, dbPromise = null;
const MAX_PER_DOC = 400;

function db() {
  if (!dbPromise) dbPromise = window.claude && window.claude.use ? window.claude.use("db").catch(() => null) : Promise.resolve(null);
  return dbPromise;
}

const round = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
function compact(o) {
  const out = {};
  for (const k in o) {
    const v = o[k];
    if (v === undefined || v === null || v === false) continue;
    out[k] = Array.isArray(v) ? v.map(round) : typeof v === "object" ? compact(v) : round(v);
  }
  return out;
}

export function log(e, data = {}) {
  events.push({ t: Math.round((Date.now() - t0) / 100) / 10, e, ...compact(data) });
  dirty = true;
  try { localStorage.setItem("perihelion.playlog", JSON.stringify({ session, build: BUILD, events: events.slice(-300) })); } catch (err) { /* storage unavailable */ }
}

// Write the session document. One write at a time, only when something changed.
export async function flush() {
  if (writing || !dirty) return;
  const store = await db();
  if (!store) return;
  writing = true;
  try {
    while (dirty) {
      dirty = false;
      const doc = {
        session, part, build: BUILD, startedAt: new Date(t0).toISOString(), updatedAt: new Date().toISOString(),
        screen: `${window.innerWidth}x${window.innerHeight}`, touch: navigator.maxTouchPoints > 0,
        events,
      };
      await store.doc(`plays/${session}-p${part}`).set(doc);
      if (events.length >= MAX_PER_DOC) { part++; events = []; }   // keep documents small
    }
  } catch (err) {
    /* logging must never disturb play */
  } finally {
    writing = false;
  }
}

document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
