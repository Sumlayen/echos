/**
 * The single 32-colour master palette for the whole game. Every generated
 * texture samples from these values, which is what makes the village, forest,
 * ruins and battle screens feel like one art package.
 *
 * Convention (learned from the LPC / Whispers of Avalon reference sets):
 * each material gets a 4-step ramp — shadow, base, light, rim — and highlights
 * hue-shift warm while shadows hue-shift cool, rather than just adding white.
 */

export const P = {
  // --- ink / UI chrome -------------------------------------------------
  ink: '#0b0f1a',
  ink2: '#151c2c',
  shadow: '#222a3d',
  slate: '#3a4560',
  steel: '#5c6a86',
  light: '#8e9ab4',
  bone: '#cdd5e6',
  paper: '#f2f5fb',

  // --- warm / fire / gold ---------------------------------------------
  rust: '#8a3a24',
  ember: '#c65a2b',
  flame: '#ef8a3c',
  gold: '#f0c04e',
  cream: '#fbe6b4',

  // --- greens / vegetation --------------------------------------------
  moss: '#2c5738',
  grass: '#478a4c',
  leaf: '#6cb25e',
  sprout: '#a6d87c',

  // --- blues / water / ice --------------------------------------------
  deep: '#132340',
  azure: '#2e5e9c',
  sky: '#5c9ed4',
  ice: '#a8dbf2',

  // --- violet / magic / night -----------------------------------------
  void: '#221a38',
  arcane: '#583d84',
  mystic: '#8d6abe',
  star: '#c8b2ef',

  // --- reds / damage ---------------------------------------------------
  blood: '#7c2a2a',
  rose: '#be4a4a',
  coral: '#ee7c6c',

  // --- earth / wood / stone -------------------------------------------
  soil: '#4a3527',
  wood: '#7a5230',
  woodLt: '#a5733f',
  stone: '#6b6f80',
  stoneLt: '#9aa0b0',

  // --- skin / hair -----------------------------------------------------
  skin: '#e2ab7c',
  skinD: '#b47c52',
  hairDk: '#2c2119',
  hairRd: '#9c4a2c'
} as const;

export type PalKey = keyof typeof P;

/** Material ramps: index 0 = deepest shadow, 3 = rim light. */
export const RAMPS = {
  grass: ['#1f4429', P.moss, P.grass, P.leaf],
  grassLit: ['#2c5738', P.grass, P.leaf, P.sprout],
  dirt: ['#2f2116', P.soil, '#6b4c33', P.woodLt],
  stone: ['#3b4050', '#585d6e', P.stone, P.stoneLt],
  stoneWarm: ['#4a3f45', '#6b5a5c', '#8d7a74', '#b3a091'],
  water: ['#0d1b33', P.deep, P.azure, P.sky],
  ice: ['#3f6d8c', P.azure, P.sky, P.ice],
  lava: ['#5c1a10', P.rust, P.ember, P.flame],
  wood: ['#3a2617', P.wood, P.woodLt, '#c99a5e'],
  metal: ['#2a3140', P.slate, P.steel, P.light],
  gold: ['#7a5a17', '#c39a30', P.gold, P.cream],
  blood: ['#4a1a1a', P.blood, P.rose, P.coral],
  magic: ['#1c1430', P.void, P.arcane, P.mystic],
  star: ['#4a3a78', P.arcane, P.mystic, P.star],
  skin: ['#7e5334', P.skinD, P.skin, '#f6d3a8'],
  cloth: ['#243a63', '#33548c', '#4a76b8', '#7ba4dc'],
  leather: ['#3a2a1c', '#5c4229', '#7d5c39', '#a37f52']
} as const;

/** Per-area ambient tint applied to backdrops (never to UI). */
export const AMBIENT = {
  village: { tint: '#ffe9c0', amount: 0.06 },
  forest: { tint: '#2f5a4a', amount: 0.14 },
  ruins: { tint: '#2a2450', amount: 0.2 },
  battle: { tint: '#101a2e', amount: 0.05 }
} as const;
