# Perihelion Golf (prototype)

Golf in space. Each body in the course has its own kind of gravity, and you have to bend your shots through them to reach the cup.

## Play

Open `index.html` in a browser, on desktop or phone. No build step is needed.

- **Shoot:** drag anywhere, pull back like a slingshot, and release. A longer pull means more power.
- **Preview:** the dotted line shows where the first second or two of the shot will go, gravity included. A gold ring at its end means the shot goes in, teal means you land on a body, and red means you lose the ball.
- **Reset ball** (or `R`) during a shot gives up on that shot for a 1-stroke penalty.
- On a portrait phone the course rotates so the tee sits at the bottom.

### Phone support

Tested with real touch input on Android screen sizes from 320 px wide up to a Pixel 7, in portrait and landscape:

- If your finger smears a few pixels as you lift it, the shot fires from where your finger had settled, not where it slid.
- Pull-to-refresh, page scrolling and the long-press menu are blocked while you play, and the screen stays awake where the browser allows.
- On short landscape screens the hint bar is hidden so the course gets the full height. The briefing card before each hole carries the same information.

## The holes

Each hole introduces one mechanic. Its briefing card explains it, and the bodies are labelled the first time they appear.

| # | Hole | Teaches |
|---|------|---------|
| 1 | Tee Off | Aiming, power, and the cup only catching slow balls (the green slows you down) |
| 2 | Bent Path | Planets pull, so shots curve |
| 3 | Slingshot | Whipping around a planet to reach a hidden cup |
| 4 | Stepping Stones | Landing on planets and playing your next shot from there |
| 5 | Event Horizon | Black holes swallow the ball (+1 penalty), and a near miss gives a speed boost |
| 6 | Push Back | Repulsor stars push instead of pull and work as bumpers |
| 7 | Nebula | Gas clouds have no gravity but brake the ball |
| 8 | Wormhole | Linked wormholes keep your speed and heading, and are the way into a walled-off cup |
| 9 | Moon Dance | Moving bodies, so you have to time the shot |
| 10 | Pulsar | Gravity that switches on and off |
| 11 | Grand Tour | Everything combined |

## Rules

- Each launch is one stroke. Black hole, leaving the course, or orbiting for 15 s: +1 stroke, and you play again from where that shot started.
- Touching a planet or moon slowly lands you on it. Hitting it fast bounces you off.

## Tuning and the solver

All physics and level data sit between `// CORE-BEGIN` and `// CORE-END` in `index.html`. Tuning constants are in `PHYS`, and the holes are in `LEVELS`.

`node tools/solve.js [hole]` runs the same physics headlessly. It brute-forces every angle and power (and launch timings for moving holes) to confirm each hole can be completed, and reports roughly how forgiving it is.
