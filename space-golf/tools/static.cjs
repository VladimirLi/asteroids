// Tiny static file server for www/, so the test tools need no separately running web server.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "www");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".txt": "text/plain" };
function serveFile(req, res, prefix = "") {
  let p = decodeURIComponent(req.url.split("?")[0]).slice(prefix.length) || "/";
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(file).pipe(res);
}
// Start on an ephemeral port; resolves to { url, close }.
function start() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => serveFile(req, res));
    srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() }));
  });
}
module.exports = { serveFile, start };
