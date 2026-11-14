# Perihelion Golf

Space mini-golf for Android. You bend shots around planets, black holes, wormholes and pulsars to relight the cups of a golf course built across a dying star system.

- 36 handcrafted holes in 4 chapters, each verified by a solver to be holeable in one
- Story told by ORRERY, the course's caretaker computer
- Daily Orbit (one generated hole per day, the same for everyone) and endless Free Orbit
- Stars, best scores, 17 logbook achievements, daily streaks, 9 unlockable balls and trails
- Slow-motion finishes, trick-shot callouts and tags, shareable emoji results and shot postcards
- Music and sound effects synthesized live with Web Audio (no audio files)
- Fully offline: no ads, no tracking, no network requests

## Project layout

```
www/                  the game (plain ES modules, no build step)
  js/core.js          deterministic physics, shared by game, daily generator and tools
  js/levels/chN.js    hole data, one file per chapter
  js/main.js          screens, story flow, progression, input, game loop
  js/render.js        canvas renderer and effects
  js/audio.js         procedural music, sound effects, haptics
  js/daily.js         Daily / Free Orbit generator with on-device validation
  js/save.js          local save data
  js/skins.js         unlockable balls and trails
  js/share.js         share text and postcard sharing (set STORE_URL once live)
  js/story.js         all story text
android/              Capacitor 8 Android project (target SDK 36)
tools/                solver, playthrough test, asset and screenshot generators
store/                Play Store listing, privacy policy, icon, feature graphic, screenshots
```

## Run it in a browser

```
cd www && python3 -m http.server 8765
```
Open http://localhost:8765. Phone-sized windows play best.

## Check the levels

```
npm install
node tools/solve.mjs            # every hole; or: c2, c3h4, --quick
```
Every hole must print `ok`: completable within par, and 3 stars (par − 1 strokes) verified possible. `tools/LEVEL_DESIGN.md` is the guide for adding holes.

Full UI playthrough of all 36 holes plus Daily and Free Orbit (needs Playwright and the server above):
```
node tools/playthrough.cjs
```

## Build for Android

You need the Android SDK (platform 36) and JDK 17 or newer, or Android Studio.

```
npm install
npx cap sync android
cd android && ./gradlew assembleDebug        # test build: android/app/build/outputs/apk/debug/app-debug.apk
```

### Release for Google Play
```
tools/build-release.sh
```
On the first run this creates your **upload key** (`android/upload-key.jks` plus `android/keystore.properties`). Back both up somewhere safe, and never commit them (they are git-ignored). The script then builds `android/app/build/outputs/bundle/release/app-release.aab`, which is the file you upload to Play Console.

Before the first upload:
1. Decide the app ID. It is `com.periheliongolf.app` in `capacitor.config.json` and `android/app/build.gradle`, and it can never change after the first upload.
2. Fill in your support email in `store/privacy-policy.html` and host that page publicly (GitHub Pages works).
3. Follow `store/listing.md` for the store text, graphics and App content answers.
4. Google requires new personal developer accounts to run a closed test with at least 12 testers for 14 days before production access. Start that early.

For each update, raise `versionCode` and `versionName` in `android/app/build.gradle`.

### Regenerating art
`tools/art.html` draws the icon, adaptive icon layers, splash screens and feature graphic. To render them: serve the project root on port 8766, then run `node tools/make-assets.cjs`. To capture new store screenshots, serve `www/` on 8765 and run `node tools/store-shots.cjs`.

## Credits
Typefaces: Syne and IBM Plex Mono (SIL Open Font License, bundled in `www/fonts`).
