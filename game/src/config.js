// Tuning numbers and colours for Nusa Sky Courier. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Flight model (arcade, metres / seconds / degrees). */
export const PLANE = {
  maxSpeed: 95,
  minSpeed: 18,
  cruiseSpeed: 55,
  accel: 22,
  drag: 0.12,
  climbRate: 26,
  rollRate: 2.4,
  pitchRate: 1.1,
  yawRate: 0.5,
  turnFromRoll: 0.55,
  stallSpeed: 26,
  startAltitude: 320,
};

/** Mission: five rings, then land on the runway. */
export const MISSION = {
  timeLimit: 300,
  ringRadius: 26,
  ringScore: 100,
  landScore: 250,
  landSpeedMax: 42,
};

/** Terrain grid drawn around the plane (cells of this size, this many each way). */
export const TERRAIN = { cell: 55, half: 13, seaLevel: 0 };

export const PALETTE = {
  skyTop: '#1c4e8a',
  skyMid: '#7fb2e0',
  skyLow: '#cfe8f7',
  sun: '#fff3c4',
  seaDeep: '#0d4d7a',
  seaShallow: '#2f8fc4',
  sand: '#e8d29a',
  grass: '#4f9e4d',
  forest: '#2e7d32',
  rock: '#8a7f72',
  snow: '#f4f8fb',
  cityRoof: '#5a6b7d',
  cityWall: '#8b98a8',
  runway: '#3a3f46',
  runwayMark: '#f5f7fa',
  ring: '#ffb300',
  ringNext: '#ff5722',
  panel: 'rgba(8, 18, 28, 0.72)',
  panelEdge: '#37e0a0',
  text: '#eaf6ff',
  amber: '#ffc233',
  green: '#37e0a0',
  red: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nusa-sky-courier.best';
