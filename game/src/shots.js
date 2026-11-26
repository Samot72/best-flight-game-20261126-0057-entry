// The screenshot scenes behind ?shot=title|fly|ring|runway. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (bank toward the next ring or the runway, hold
// altitude, keep the throttle up), so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_CRASH, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 6;
const FLY_SECONDS = 24;
const RING_SECONDS = 40;
const RUNWAY_SECONDS = 10;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Steer toward a target point: bank to turn, pitch to meet its altitude. */
function autopilot(world, target) {
  const s = world.state;
  const dx = target.x - s.x;
  const dz = target.z - s.z;
  const wantHeading = Math.atan2(dx, -dz);
  let dh = wantHeading - s.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const roll = clamp(dh * 1.6, -1, 1);
  const dy = target.y - s.y;
  const pitch = clamp(dy / 120, -0.7, 0.7);
  const dist = Math.hypot(dx, dz);
  return {
    pitch,
    roll,
    yaw: 0,
    throttleDelta: dist < 300 ? -0.25 : 0.35,
    mousePitch: 0,
    mouseRoll: 0,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any unknown name stages the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'fly' && name !== 'ring' && name !== 'runway') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      world.step(STEP, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, mousePitch: 0, mouseRoll: 0 });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const seconds = name === 'fly' ? FLY_SECONDS : name === 'ring' ? RING_SECONDS : RUNWAY_SECONDS;
  // The runway scene first clears the rings, then places the plane on a
  // stable final approach (the autopilot's turn-in oscillates, so the
  // approach is staged directly and flown forward a few seconds).
  if (name === 'runway') {
    for (const ring of world.rings) ring.done = true;
    world.state.rings = 5;
    world.state.score = 500;
    world.state.x = 40;
    world.state.y = 62;
    world.state.z = 1520;
    world.state.heading = 0.03;
    world.state.pitch = -0.06;
    world.state.roll = 0;
    world.state.speed = 42;
    world.state.throttle = 0.35;
    for (let i = 0; i < 2 / STEP; i += 1) {
      world.step(STEP, autopilot(world, { x: 0, y: 30, z: 900 }));
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  let events = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const target = name === 'runway'
      ? { x: 0, y: 40, z: 900 }
      : world.nextRing() || { x: 0, y: 40, z: 900 };
    events = world.step(STEP, autopilot(world, target));
    if (events & (EVENT_CRASH | EVENT_WIN)) break;
  }
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
