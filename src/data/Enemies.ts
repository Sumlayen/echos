/**
 * Bestiary + encounter tables. `art` must be a key of `ENEMY_ART` in
 * `src/art/EnemyArt.ts`; `ai` is a weighted script the battle engine samples.
 */

import type { Element, StatKey } from './Items';

export interface AiAction {
  action: 'attack' | 'skill' | 'guard' | 'special';
  skill?: string;
  weight: number;
  /** Only considered while the enemy is at or below this HP fraction. */
  hpBelow?: number;
  /** Only considered from this battle round onward. */
  roundMin?: number;
  /** Number of times this action may be used for the whole fight. */
  limit?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  art: string;
  level: number;
  hp: number;
  mp: number;
  stats: Record<StatKey, number>;
  xp: number;
  gil: number;
  /** [itemId, chance, count] */
  drops: [string, number, number][];
  resist?: Partial<Record<Element, number>>;
  ai: AiAction[];
  boss?: boolean;
  /** Boss phase swap at this HP fraction (changes art tint + AI). */
  phaseAt?: number;
  scale?: number;
  fleeable?: boolean;
}

const en = (d: EnemyDef): EnemyDef => d;

export const ENEMIES: Record<string, EnemyDef> = {
  wolf: en({
    id: 'wolf', name: 'Ashen Wolf', art: 'wolf', level: 2, hp: 34, mp: 0,
    stats: { str: 11, vit: 6, spd: 14, mag: 2, mdef: 4 },
    xp: 14, gil: 12,
    drops: [['herb', 0.25, 1]],
    ai: [
      { action: 'attack', weight: 6 },
      { action: 'skill', skill: 'bite', weight: 3, roundMin: 2 }
    ]
  }),
  wisp: en({
    id: 'wisp', name: 'Fog Wisp', art: 'wisp', level: 3, hp: 26, mp: 20,
    stats: { str: 4, vit: 5, spd: 12, mag: 12, mdef: 10 },
    xp: 18, gil: 16,
    resist: { fire: 1.4, ice: 0.6 },
    drops: [['ether', 0.18, 1]],
    ai: [
      { action: 'skill', skill: 'ember', weight: 5 },
      { action: 'attack', weight: 3 },
      { action: 'skill', skill: 'frost', weight: 2, hpBelow: 0.4 }
    ]
  }),
  beetle: en({
    id: 'beetle', name: 'Bark Beetle', art: 'beetle', level: 3, hp: 48, mp: 0,
    stats: { str: 12, vit: 13, spd: 6, mag: 2, mdef: 6 },
    xp: 20, gil: 18,
    resist: { ice: 1.3, fire: 0.8 },
    drops: [['antidote', 0.2, 1]],
    ai: [
      { action: 'attack', weight: 5 },
      { action: 'guard', weight: 2, roundMin: 2 },
      { action: 'skill', skill: 'gore', weight: 2, hpBelow: 0.5 }
    ]
  }),
  bat: en({
    id: 'bat', name: 'Ruin Bat', art: 'bat', level: 4, hp: 30, mp: 8,
    stats: { str: 10, vit: 5, spd: 18, mag: 6, mdef: 7 },
    xp: 22, gil: 20,
    drops: [['potion_s', 0.15, 1]],
    ai: [
      { action: 'attack', weight: 6 },
      { action: 'skill', skill: 'screech', weight: 3, roundMin: 2 }
    ]
  }),
  wraith: en({
    id: 'wraith', name: 'Grave Wraith', art: 'wraith', level: 6, hp: 62, mp: 30,
    stats: { str: 8, vit: 8, spd: 13, mag: 16, mdef: 15 },
    xp: 44, gil: 44,
    resist: { dark: 0.5, light: 1.6, fire: 1.2 },
    drops: [['revive', 0.12, 1], ['elixir', 0.04, 1]],
    ai: [
      { action: 'skill', skill: 'chill', weight: 4 },
      { action: 'skill', skill: 'dread', weight: 3, roundMin: 2 },
      { action: 'attack', weight: 3 }
    ]
  }),
  ent: en({
    id: 'ent', name: 'Hollow Ent', art: 'ent', level: 7, hp: 96, mp: 12,
    stats: { str: 18, vit: 16, spd: 4, mag: 8, mdef: 9 },
    xp: 58, gil: 52,
    resist: { fire: 1.5, ice: 0.7 },
    drops: [['herb', 0.4, 2], ['armor_leather', 0.08, 1]],
    ai: [
      { action: 'attack', weight: 5 },
      { action: 'skill', skill: 'slam', weight: 4, roundMin: 2 },
      { action: 'guard', weight: 2, hpBelow: 0.5 }
    ]
  }),
  sentinel: en({
    id: 'sentinel', name: 'Rust Sentinel', art: 'sentinel', level: 9, hp: 120, mp: 24,
    stats: { str: 21, vit: 20, spd: 9, mag: 10, mdef: 14 },
    xp: 82, gil: 90,
    resist: { light: 1.3, dark: 0.8 },
    drops: [['gem', 0.3, 1], ['shield_iron', 0.1, 1]],
    ai: [
      { action: 'attack', weight: 5 },
      { action: 'skill', skill: 'lance', weight: 4, roundMin: 2 },
      { action: 'skill', skill: 'overcharge', weight: 2, hpBelow: 0.35, limit: 1 }
    ]
  }),
  warden: en({
    id: 'warden', name: 'Warden of the First Flame', art: 'warden', level: 14, hp: 460, mp: 99,
    stats: { str: 28, vit: 24, spd: 12, mag: 22, mdef: 20 },
    xp: 620, gil: 480,
    resist: { fire: 0.5, light: 1.25 },
    boss: true, phaseAt: 0.5, fleeable: false, scale: 1.25,
    drops: [['sword_star', 1, 1], ['amulet_star', 1, 1]],
    ai: [
      { action: 'attack', weight: 5 },
      { action: 'skill', skill: 'ember', weight: 3 },
      { action: 'skill', skill: 'cinder', weight: 3, roundMin: 2 },
      { action: 'skill', skill: 'starfall', weight: 4, hpBelow: 0.5, roundMin: 3 },
      { action: 'skill', skill: 'judgement', weight: 3, hpBelow: 0.25, limit: 2 }
    ]
  })
};

export function enemy(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}

/* ------------------------------------------------------------- encounters */

export interface EncounterGroup {
  /** Enemy ids in this group, front-to-back. */
  ids: string[];
  weight: number;
}

export const ENCOUNTERS: Record<string, EncounterGroup[]> = {
  forest: [
    { ids: ['wolf'], weight: 4 },
    { ids: ['wolf', 'wolf'], weight: 3 },
    { ids: ['wisp', 'beetle'], weight: 3 },
    { ids: ['beetle'], weight: 2 },
    { ids: ['wolf', 'wisp'], weight: 2 },
    { ids: ['ent'], weight: 1 }
  ],
  ruins: [
    { ids: ['bat', 'bat'], weight: 4 },
    { ids: ['wraith'], weight: 3 },
    { ids: ['wraith', 'bat'], weight: 3 },
    { ids: ['sentinel'], weight: 2 },
    { ids: ['ent', 'wraith'], weight: 2 },
    { ids: ['sentinel', 'bat'], weight: 1 }
  ],
  road: [
    { ids: ['wolf'], weight: 5 },
    { ids: ['wolf', 'wolf'], weight: 3 },
    { ids: ['beetle', 'wolf'], weight: 2 }
  ]
};

/** Fixed story battles: `id` -> enemy ids. */
export const STORY_BATTLES: Record<string, string[]> = {
  intro_wolves: ['wolf', 'wolf'],
  first_wraith: ['wraith'],
  boss_warden: ['warden']
};
