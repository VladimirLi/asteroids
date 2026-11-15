# Level design guide

Holes live in `www/js/levels/chN.js`. Each chapter file default-exports `{ id, name, place, sky, holes: [...] }`.
Physics is in `www/js/core.js`. Verify with `node tools/solve.mjs cN` (full) or `--quick` while iterating.

## Coordinates and scale
- The course is **1400 × 900** world units (x right, y down). On portrait phones it is rotated so +x points up the screen.
- Ball radius 7. Cup radius 20 with a braking "green" of radius 64 around it.
- Launch speed: 0–620 units/s. A ball is lost 260 units outside the course, or after 15 s of flight.

## Hole schema
```js
{
  id: "c2h4",               // chapter + hole number, unique
  name: "Short Name",       // 1–3 words, evocative, no colons
  par: 3,                   // 2, 3 or (finale only) 4
  w: 1400, h: 900,
  preview: 1.3,             // seconds of dotted preview line (2.5 tutorial … 0.9 hard)
  intro: { text: "...", legend: ["blackhole", "..."] }, // ONLY on the hole that introduces a mechanic
  hint: "One short sentence with <b>one</b> bold phrase.",
  tee: { x, y },
  hole: { x, y },
  bodies: [ ... ],
}
```

## Body types
| type | fields | behaviour |
|---|---|---|
| planet | x, y, r (35–90), mu (≈ 600·r²), color | pulls; ball can land on it |
| moon | r (16–35), mu, color, orbit | like planet, but orbits |
| asteroid | x, y, r (12–30), color (greys/browns), mu: 0 | solid rock, no pull; you can bounce off or land |
| blackhole | x, y, r = horizon − 8, horizon (24–34), mu (3e6–7e6) | strong pull; crossing horizon = ball lost (+1) |
| repulsor | x, y, r (18–30), mu negative (−1.2e6 … −2.6e6) | pushes away; solid, bouncy, can't land |
| cloud | x, y, r (90–220), drag (0.8–2.0) | no gravity, slows the ball inside |
| wormhole | x, y, r (24–30), link (index of partner), hue | enter one, exit the partner with same velocity. Both ends must link to each other. Same hue for a pair, different hues for different pairs |
| pulsar | x, y, r (14–20), mu (3e6–8e6), pulse: { period, on, offset } | gravity on for `on` seconds out of each `period` |
| star | x, y or orbit, r (25–45), mu (1.5e6–3e6), color (warm) | sun: pulls, solid, bouncy, can't land. Use in pairs for binary stars |

Any body can move by giving it `orbit` instead of x/y:
- around another body: `orbit: { around: <index>, r, period, phase, dir? }` (the parent must also be in `bodies`)
- around a point (binary stars, roaming black holes): `orbit: { cx, cy, r, period, phase, dir? }`; `dir: -1` = counter-clockwise.
Binary pair: two stars with the same cx, cy, r, period and phases differing by π.

Optional `label: "Black hole: swallows"` draws a caption under the body. Use it **only** the first time a body type appears in the whole game.
Planet colors: `#5b8def` blue, `#e0905a` orange, `#7cc97a` green, `#c27be0` violet, `#e0c35a` sand, `#5ac8c8` teal, `#d96a7a` rose. Moons: `#c9d1e6`. Asteroids: `#8a8f9c`, `#9c8a7a`.

## Quality bar (every hole)
1. `node tools/solve.mjs <id>` prints `ok`: playable within par **and** 3 stars (par − 1 strokes) verified.
2. Ace rate 0.2–3% for par 2 holes. Par 3 holes may have a lower ace rate, but most landing spots must lead to an ace (the second-shot column).
3. Nothing overlaps: keep ≥ 40 units between body surfaces (clouds may overlap other things), tee and cup ≥ 60 from any solid surface or horizon, cup never inside a solid. Everything inside the course, ≥ 40 from the edges.
4. One clear idea per hole. Name it after that idea.
5. Difficulty rises through a chapter. Hole 9 of each chapter is the "signature hole": the most memorable layout in it.
6. Mechanic intro holes are gentle: the new body is the star of the hole and the obvious route uses it.
7. Text: plain, short, second person, no exclamation marks, no em dashes. Intros ≤ 2 sentences. Legends ≤ 2 sentences. Hints ≤ 1 sentence.

## Lessons from playtest round 1 (read before changing holes)
Human testers (touch only, no solver) struggled badly. The engine has since changed:
- The aim preview is now long (distance-based, continues through wormholes), turns gold and says GOES IN when the shot will drop. In chapter 1 holes 1-5 it reaches the whole course.
- A missed ball (off the course, or still flying after 11 s) costs only the stroke played and returns to where the shot started. Only black holes add a penalty stroke.
- The cup is more forgiving (capture speed 250, green radius 78) and wormhole mouths are a little larger. Moving wormholes no longer change the ball's velocity.
- After 3 misses the player can ask to be shown a line; the pause menu can skip a hole.

Design rules that came out of it:
1. **Hints must be true.** If the hint names a route ("no straight line", "shoot while quiet", "hit it hard"), the solver must show that route works and the contradicting one does not (or reword the hint). Say which side / which planet when it matters.
2. **Every hole needs a lay-up.** A slightly wrong shot should usually land somewhere playable (planet, moon, asteroid) rather than leave the course. Aim for the solver's `lands` figure of 6% or more, and landing spots on the cup side must not be dead ends.
3. **Aim window.** `window` in the solver output is how many degrees wide the best hole-in-one window is. Keep it at 4 degrees or more in chapters 1-2 and 3 or more later; on moving holes the `worst` window should be 2 or more.
4. **No hazard right next to the cup stealing slow balls.** Keep black holes 230+ from the cup unless a nebula or planet shields it.
5. **Intro holes are gentle**: the obvious, safe route must work; the risky route is the bonus.
6. **Par should mean something.** If a naive first shot aces a hole, it is par 2, or it needs an obstacle.
7. Labels and names must match what the player sees (nothing called "hidden" that is in plain view).

## Lessons from playtest round 2 (the round-1 fixes overshot: now too easy)
Fresh testers on the revised game: Chapter 1 in 10 strokes with 27/27 stars; Chapter 3 in 14 strokes against par 23; Chapter 4 with 8 of 9 holes in one. "The first shot I thought of won on 7 of 9 holes." "The new mechanics rarely matter." "Scenery that does nothing." The holes must make the player think, without going back to round 1's unfairness.

The engine is changing again alongside your work:
- The preview now shows only about half the route (roughly 500-700 units; full length only on c1h1-c1h3), stops about 120 units after a wormhole exit, and no longer says GOES IN except on those tutorial holes. It grows by 40% with each miss on a hole, so strugglers still get help. Misses still cost no penalty.

Rules for this pass (in addition to round 1's: truthful hints, lay-ups, no hazard stealing putts at the cup):
1. **The naive shot must not win.** The solver now prints `direct`: the widest hole-in-one window within 8 degrees of the straight tee-to-cup line. Outside c1h1/c1h2 it should be 0-1.5 degrees. Block the straight line with the hole's featured body.
2. **The featured mechanic must be required** for the best route: the pulsar has to be timed, the sun gap read, the moon waited for, the wormhole entered on a curved approach (not on a straight unobstructed line from the tee, and its exit should not point straight at the cup unless reaching the mouth is itself the puzzle), the nebula used to brake. Verify with a script (count warp events, compare aces at different launch times, etc.).
3. **Aim window 3.5-7 degrees** for the intended route (c1: 5-8). Not 10+. Ace rate roughly 0.4-1.3%. Keep `lands` at 6% or more so misses stay playable, and keep `worst` at 2.5 or more on moving holes.
4. **Par is honest.** Three stars = par - 1 strokes. A hole whose idea is one clever shot is par 2 (three stars = the ace). Par 3 is for holes that really need a landing and a second shot from most positions. Finale: par 3 or 4 only if it truly takes that.
5. **Hints name the idea, not the move.** "The ring pushes back. Where is it open?" not "shoot away from the cup with plenty of power".
6. **Every body has a job** (blocker, lay-up, backstop, bender, timing gate). Remove decoration.
7. **Vary the solutions.** Within a chapter the winning shots should not all be the same direction and power from the tee; move tees and cups around the course.
8. A planet next to the cup (within ~120 of the cup) makes tap-ins fall back onto it: avoid resting spots closer than 150 to the cup, or make sure a 30-45% shot from there drops.
9. Physics changed again for this pass: the cup now pulls slow balls in from the green (holeMu 300000, capture speed 300) and a ball still flying after 9 s is recalled (was 11). Re-verify everything; long crawling aces (8 s+) are gone.
