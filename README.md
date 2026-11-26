[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Samot72/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Samot72/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Nusa Sky Courier

A chase-view flight game over a procedural Indonesian island. You are the
island mail courier in the prop plane **NUSA-01**: take off from the sea
approach, thread **five glowing rings** around the island — over the lagoon,
past the volcano ridge, through the city towers — then bring her home and
**land on the runway** before the courier window closes. Rings are worth
100 points each, a clean landing 250. Crash into the terrain, a tower, or
the sea, stall out, or run out of time, and the run is over.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) or open `game/index.html` in desktop Chrome. No
network requests, no libraries — plain Canvas 2D and WebAudio, all in code.

| Input | Action |
| --- | --- |
| W / S | Throttle up / down |
| Arrow keys | Pitch & roll (bank to turn) |
| Q / E | Rudder (yaw) |
| Shift / Ctrl | Throttle boost / cut |
| Mouse | Steer toward the pointer |
| Space / click | Start / restart |
| P / Esc | Pause |

## Features

- **Real 3D chase view** — a projected heightfield island with mountains,
  beaches, lagoon and sea, a coastal city of lit towers, and a marked runway
  with edge lights, all drawn from one procedural terrain function.
- **Lit instrument HUD** — altitude, speed, heading, throttle, a compass
  strip, an artificial horizon, ring counter, score and mission clock.
- **Flight model** — throttle, drag, banked turns, stall warning, terrain
  and tower collision, and a landing check (on the strip, slow, gentle).
- **Win / lose** — clear all five rings and land for the full 750 points;
  crash, ditch, stall out or time out and the flight is over.
- **Synthesised sound** — engine hum that follows throttle and speed, a
  chime per ring, a fanfare on landing (WebAudio, no audio files).
- **Deterministic screenshots** — `?shot=title|fly|ring|runway&seed=N`
  stages each scene from the real rules (see `shots.json`); the same seed
  always gives the same frame.

## Layout

- `game/index.html` — the page; `game/src/` — the game, one job per file:
  `config.js` (tuning), `random.js` (seeded RNG + noise), `world.js`
  (flight rules, terrain, rings, runway), `render.js` (3D projection,
  plane, HUD), `input.js` (keyboard + mouse), `audio.js` (WebAudio),
  `shots.js` (screenshot staging), `main.js` (boot + loop).
- `main.ts` — hands the game in (copies `game/` + `screenshots/` and
  writes `dossier.json` with the vendored make.fun library).
- `screenshots/` — four real renders of the game's own code: title, flight,
  ring approach, runway final.
- `vendor/makefun-game.ts` — copied from the competition kit, unchanged.

## License

MIT — see `LICENSE`.
