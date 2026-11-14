// Renders icons, adaptive icon layers, splash screens and Play Store graphics from tools/art.html.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const res = path.join(root, "android/app/src/main/res");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8766/tools/art.html");
  const out = async (kind, w, h, file) => {
    const url = await page.evaluate(([k, w, h]) => render(k, w, h), [kind, w, h]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  };
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await out("icon", 48 * k, 48 * k, `${res}/mipmap-${d}/ic_launcher.png`);
    await out("icon", 48 * k, 48 * k, `${res}/mipmap-${d}/ic_launcher_round.png`);
    await out("foreground", 108 * k, 108 * k, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
    await out("background", 108 * k, 108 * k, `${res}/mipmap-${d}/ic_launcher_background.png`);
  }
  // splash (pre-Android-12 launch theme background)
  const splashDirs = fs.readdirSync(res).filter((d) => d.startsWith("drawable") && fs.existsSync(`${res}/${d}/splash.png`));
  for (const d of splashDirs) {
    const { w, h } = await page.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight }; },
      "data:image/png;base64," + fs.readFileSync(`${res}/${d}/splash.png`).toString("base64"));
    await out("splash", w, h, `${res}/${d}/splash.png`);
  }
  await out("icon", 512, 512, `${root}/store/icon-512.png`);
  await out("feature", 1024, 500, `${root}/store/feature-graphic-1024x500.png`);
  await browser.close();
  console.log("assets written; splash dirs:", splashDirs.length);
})();
