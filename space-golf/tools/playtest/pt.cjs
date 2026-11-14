// Playtest client. Usage: node tools/playtest/pt.cjs <port> <command> [args...]
//
//   look                     screenshot + the text and buttons currently on screen
//   tap X Y                  tap the screen
//   aim X1 Y1 X2 Y2          put a finger down at X1,Y1 and drag to X2,Y2, keep holding (shows the aim preview)
//   adjust X2 Y2             move the held finger somewhere else
//   hold MS                  keep holding while time passes (to wait for moving things)
//   release                  lift the finger (fires the shot) and watch until the ball stops
//   cancel                   lift without shooting
//   wait MS                  just watch for a while
//   back                     Android back button
//   rotate                   turn the phone sideways / upright
//   slider ID VALUE          move a settings slider (setMusic, setSfx: 0..1)
//   setup-unlock-all         test setup: make every hole selectable
//   setup-reset              test setup: wipe save data
const http = require("http");
const [port, ...rest] = process.argv.slice(2);
http.get({ host: "127.0.0.1", port, path: "/" + rest.map(encodeURIComponent).join("/"), timeout: 120000 }, (res) => {
  res.setEncoding("utf8"); res.pipe(process.stdout);
}).on("error", (e) => { console.error("ERROR: session not reachable on port " + port + ": " + e.message); process.exit(1); });
