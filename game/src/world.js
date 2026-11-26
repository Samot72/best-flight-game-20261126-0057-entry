// The game's rules and state, with no drawing and no browser in it: the plane,
// the procedural island terrain, the five rings, the runway, collisions, score
// and the mission clock. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing
// about screens or sound.
import { MISSION, PLANE, STEP } from './config.js';
import { fbm } from './random.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_WIN = 4;
export const EVENT_TIMEOUT = 8;
export const EVENT_LAND_WARN = 16;

const TAU = Math.PI * 2;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Island height at world (x, z), metres. One big island with a mountain ridge
 * to the north, a lagoon and beach to the south, and a flat coastal shelf
 * around the runway at (0, 900) where the city sits. Sea level is 0.
 */
export function terrainHeight(x, z) {
  const dx = x / 2400;
  const dz = (z - 300) / 2400;
  const r = Math.sqrt(dx * dx + dz * dz);
  const island = clamp(1.15 - r * r * 1.05, 0, 1);
  const hills = fbm(x / 900 + 7.3, z / 900 + 2.1);
  const ridge = Math.max(0, fbm(x / 520 - 3.7, z / 520 + 8.9)) ** 2;
  let h = island * (26 + hills * 34 + ridge * 260);
  // Flatten the coastal shelf around the runway and the city.
  const rdx = x / 420;
  const rdz = (z - 900) / 420;
  const rd = Math.sqrt(rdx * rdx + rdz * rdz);
  const flat = clamp(1 - rd, 0, 1);
  h = h * (1 - flat) + 6 * flat;
  // Beach ring: pull the shore down to the sand line.
  if (h > 0 && h < 9) h *= 0.55;
  return h;
}

/** The runway: a strip centred at (0, 900), heading north (-z). */
export const RUNWAY = { x: 0, z: 900, length: 620, width: 44, heading: 0 };

/** Five rings on a course that tours the island, then lines up with the runway. */
export function buildRings() {
  return [
    { x: 420, y: 260, z: 240, done: false },
    { x: 980, y: 300, z: -420, done: false },
    { x: 350, y: 380, z: -1250, done: false },
    { x: -720, y: 300, z: -900, done: false },
    { x: -520, y: 220, z: 260, done: false },
  ];
}

/** City blocks near the runway (deterministic, from the seed). */
export function buildCity(random) {
  const blocks = [];
  for (let i = 0; i < 46; i += 1) {
    const a = random() * TAU;
    const d = 180 + random() * 320;
    const x = RUNWAY.x + Math.cos(a) * d * 1.4 + 260;
    const z = RUNWAY.z + Math.sin(a) * d * 0.8 - 120;
    if (Math.abs(x - RUNWAY.x) < 90 && Math.abs(z - RUNWAY.z) < 420) continue;
    blocks.push({ x, z, w: 26 + random() * 42, d: 26 + random() * 42, h: 18 + random() * 68 });
  }
  return blocks;
}

export function createWorld(random) {
  const rings = buildRings();
  const city = buildCity(random);
  const state = {
    x: 0, y: PLANE.startAltitude, z: 1650,
    heading: 0, // facing north (-z), toward the runway
    pitch: 0, roll: 0,
    speed: PLANE.cruiseSpeed,
    throttle: 0.62,
    score: 0, rings: 0, elapsed: 0,
    over: false, won: false, reason: '',
    landed: false, warnGiven: false,
    ringsState: rings, city,
  };

  function reset() {
    state.x = 0;
    state.y = PLANE.startAltitude;
    state.z = 1650;
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.speed = PLANE.cruiseSpeed;
    state.throttle = 0.62;
    state.score = 0;
    state.rings = 0;
    state.elapsed = 0;
    state.over = false;
    state.won = false;
    state.reason = '';
    state.landed = false;
    state.warnGiven = false;
    for (const ring of rings) ring.done = false;
  }

  function nextRing() {
    for (const ring of rings) if (!ring.done) return ring;
    return null;
  }

  function groundAt(x, z) {
    return terrainHeight(x, z);
  }

  /**
   * One fixed step. Controls: pitch -1..1 (nose up positive), roll -1..1,
   * yaw -1..1, throttleDelta per second, mouseSteer {pitch, roll} in -1..1.
   */
  function step(dt, ctrl) {
    if (state.over) return 0;
    let events = 0;
    state.elapsed += dt;
    if (state.elapsed >= MISSION.timeLimit) {
      state.over = true;
      state.reason = 'Time up — the courier window closed.';
      return EVENT_TIMEOUT;
    }

    const pitchIn = clamp((ctrl.pitch || 0) + (ctrl.mousePitch || 0), -1, 1);
    const rollIn = clamp((ctrl.roll || 0) + (ctrl.mouseRoll || 0), -1, 1);
    state.throttle = clamp(state.throttle + (ctrl.throttleDelta || 0) * dt, 0, 1);

    // Roll and pitch ease toward the commanded values.
    state.roll += (rollIn * 0.9 - state.roll) * Math.min(1, dt * 5);
    state.pitch += (pitchIn * 0.42 - state.pitch) * Math.min(1, dt * 4);

    // Speed chases the throttle; drag grows with the square of speed.
    const target = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    state.speed += (target - state.speed) * Math.min(1, dt * 0.55);
    state.speed -= PLANE.drag * (state.speed / PLANE.maxSpeed) ** 2 * dt * 8;

    // Banked turns: heading follows the roll; rudder adds a little yaw.
    state.heading += (state.roll * PLANE.turnFromRoll + (ctrl.yaw || 0) * PLANE.yawRate * 0.4) * dt;

    // Climb from pitch and speed; below stall speed the nose drops.
    const stalled = state.speed < PLANE.stallSpeed;
    const climb = stalled
      ? -14
      : Math.sin(state.pitch) * PLANE.climbRate * (state.speed / PLANE.maxSpeed + 0.35);
    const fx = Math.sin(state.heading);
    const fz = -Math.cos(state.heading);
    state.x += fx * state.speed * dt;
    state.z += fz * state.speed * dt;
    state.y += climb * dt;
    if (state.y < 4) state.y = 4;

    // Rings: fly within the ring's radius of its centre.
    const ring = nextRing();
    if (ring) {
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dz = state.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < MISSION.ringRadius * MISSION.ringRadius) {
        ring.done = true;
        state.rings += 1;
        state.score += MISSION.ringScore;
        events |= EVENT_RING;
        if (state.rings === rings.length && !state.warnGiven) {
          state.warnGiven = true;
          events |= EVENT_LAND_WARN;
        }
      }
    }

    // Landing: on the runway strip, slow, gentle, after all rings.
    const onStrip = Math.abs(state.x - RUNWAY.x) < RUNWAY.width / 2 + 6
      && Math.abs(state.z - RUNWAY.z) < RUNWAY.length / 2;
    const ground = groundAt(state.x, state.z);
    if (state.rings === rings.length && onStrip && state.y <= ground + 7 && state.speed <= MISSION.landSpeedMax) {
      state.over = true;
      state.won = true;
      state.landed = true;
      state.score += MISSION.landScore;
      state.reason = 'Delivered — landed on the runway.';
      return events | EVENT_WIN;
    }

    // Terrain and building collisions.
    if (state.y <= ground + 2) {
      state.over = true;
      state.reason = state.y <= 3 ? 'Ditched in the sea.' : 'Crashed into the terrain.';
      return events | EVENT_CRASH;
    }
    for (const b of city) {
      if (Math.abs(state.x - b.x) < b.w / 2 + 2 && Math.abs(state.z - b.z) < b.d / 2 + 2 && state.y < b.h + 2) {
        state.over = true;
        state.reason = 'Clipped a city tower.';
        return events | EVENT_CRASH;
      }
    }
    return events;
  }

  return { state, reset, step, nextRing, groundAt, terrainHeight, rings, city, STEP };
}
