// Sharing: a Wordle-style text result plus an image "postcard" of the shot.
// Native app: Capacitor Share (+ Filesystem for the image). Browser: Web Share, then clipboard.

// Set this to the Play Store link once the app is live; it is appended to every share.
export const STORE_URL = "";

const EMOJI = { holed: "🟡", rest: "⚪", swallowed: "🕳️", lost: "🔴", orbit: "🔴" };
const TAG_EMOJI = { Ace: "⛳", Slingshot: "🪐", Wormhole: "🌀", "Close call": "😮", "Bank shot": "🎱", Bumper: "💥", "Nebula brake": "🌫️", "Long haul": "🛰️", Comeback: "💪" };

export function shareText({ kind, levelName, holeLabel, strokes, par, stars, shots, tags, dateKey, streak }) {
  const lines = [];
  if (kind === "daily") lines.push(`Perihelion Golf · Daily Orbit ${dateKey}`);
  else if (kind === "free") lines.push("Perihelion Golf · Free Orbit");
  else lines.push(`Perihelion Golf · ${holeLabel}`);
  lines.push(`“${levelName}” ${strokes === 1 ? "hole in one" : `${strokes} strokes`} (par ${par}) ${"★".repeat(stars)}${"☆".repeat(3 - stars)}`);
  lines.push(shots.map((s) => EMOJI[s] || "⚪").join("") + (tags.length ? "  " + tags.map((t) => TAG_EMOJI[t] || "").join("") : ""));
  if (kind === "daily" && streak > 1) lines.push(`Streak ${streak} 🔥`);
  if (STORE_URL) lines.push(STORE_URL);
  return lines.join("\n");
}

export async function share(text, canvas) {
  const Cap = window.Capacitor, P = Cap?.Plugins;
  try {
    if (Cap?.isNativePlatform?.() && P?.Share) {
      let files;
      if (canvas && P.Filesystem) {
        const data = canvas.toDataURL("image/png").split(",")[1];
        const r = await P.Filesystem.writeFile({ path: "perihelion-shot.png", data, directory: "CACHE" });
        files = [r.uri];
      }
      await P.Share.share({ title: "Perihelion Golf", text, files, dialogTitle: "Share your shot" });
      return "shared";
    }
    if (navigator.share) {
      if (canvas && navigator.canShare) {
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
        const file = new File([blob], "perihelion-shot.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ text, files: [file] }); return "shared"; }
      }
      await navigator.share({ text });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled";
  }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch (e) { return "failed"; }
}
