/** Global tuning constants for *Echoes of the Fallen Star*. */

export const VIEW_W = 640;
export const VIEW_H = 360;
export const TILE = 16;

export const GAME_TITLE = 'ECHOES OF THE FALLEN STAR';

export const SCENES = {
  boot: 'BootScene',
  title: 'TitleScene',
  story: 'StoryScene',
  world: 'WorldScene',
  battle: 'BattleScene',
  overlay: 'OverlayScene',
  end: 'EndScene'
} as const;

export const SAVE_KEY = 'eotfs.save.v1';
export const SETTINGS_KEY = 'eotfs.settings.v1';
export const SAVE_VERSION = 3;

export const TEXT = {
  /** pixels per glyph column (5x7 glyph inside a 6x8 cell) */
  advance: 6,
  glyphW: 5,
  glyphH: 7,
  lineH: 10
} as const;

export const TIMING = {
  walkFps: 9,
  idleFps: 2,
  attackFps: 16,
  hurtFps: 10,
  castFps: 12,
  dieFps: 8,
  effectFps: 14,
  /** ms to pause after a battle unit is struck */
  hitPause: 120,
  fade: 320
} as const;

export const BALANCE = {
  critBase: 0.04,
  critPerSpd: 0.006,
  critMult: 1.8,
  physVariance: 0.12,
  defScale: 0.55,
  mdefScale: 0.45,
  defendMult: 0.45,
  guardDefMult: 1.8,
  fleeBase: 0.42,
  xpLevelBase: 24,
  xpLevelLinear: 40,
  sellRatio: 0.5,
  innPrice: 12
} as const;

/** Debug hooks are only enabled with `?debug=1` in the URL. */
export const DEBUG_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
