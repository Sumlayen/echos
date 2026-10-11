/**
 * Skills and spells. Damage skills scale off the caster's ATK or MAG through
 * `power`; the actual maths lives in `src/battle/Damage.ts`.
 */

import type { Element } from './Items';

export type SkillTarget = 'enemy' | 'allEnemies' | 'ally' | 'allAllies' | 'self' | 'allSelf';
export type SkillKind = 'attack' | 'heal' | 'buff' | 'debuff' | 'revive' | 'special';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  mp: number;
  kind: SkillKind;
  target: SkillTarget;
  icon: string;
  element?: Element;
  /** Multiplier applied to the relevant offensive stat. */
  power?: number;
  /** Flat amount for heals. */
  base?: number;
  /** Number of physical hits for multi-strike skills. */
  hits?: number;
  /** Status applied on hit (or on use, for self-target skills). */
  inflict?: { id: string; chance: number; turns: number };
  /** Buff/debuff id applied (see `src/battle/Status.ts`). */
  modifier?: { id: string; chance: number; turns: number };
  /** Fraction of max HP restored for revive skills. */
  revive?: number;
}

const sk = (d: SkillDef): SkillDef => d;

export const SKILLS: Record<string, SkillDef> = {
  // --- Kael, sword of the village watch -------------------------------
  cleave: sk({
    id: 'cleave', name: 'Cleave', kind: 'attack', target: 'allEnemies', mp: 6, power: 0.9,
    icon: 'sword', desc: 'Light damage to all foes.'
  }),
  guard_break: sk({
    id: 'guard_break', name: 'Guard Break', kind: 'debuff', target: 'enemy', mp: 5, power: 0.7,
    icon: 'debuff', inflict: { id: 'sink', chance: 0.8, turns: 3 },
    desc: 'Damage; lowers foe defense.'
  }),
  rally: sk({
    id: 'rally', name: 'Rally', kind: 'buff', target: 'allSelf', mp: 8,
    icon: 'buff', modifier: { id: 'raise', chance: 1, turns: 4 },
    desc: 'Raises party attack for 4 turns.'
  }),
  starfall: sk({
    id: 'starfall', name: 'Starfall', kind: 'attack', target: 'enemy', mp: 16, power: 2.1,
    element: 'light', icon: 'star', desc: 'Heavy light damage to one foe.'
  }),

  // --- Lyra, hedge mage -----------------------------------------------
  ember: sk({
    id: 'ember', name: 'Ember', kind: 'attack', target: 'enemy', mp: 5, power: 1.35,
    element: 'fire', icon: 'fire', desc: 'Fire damage to one foe.'
  }),
  cinder: sk({
    id: 'cinder', name: 'Cinder Wall', kind: 'attack', target: 'allEnemies', mp: 12, power: 1.05,
    element: 'fire', inflict: { id: 'burn', chance: 0.3, turns: 3 },
    icon: 'fire', desc: 'Fire damage; may burn all foes.'
  }),
  frost: sk({
    id: 'frost', name: 'Frost', kind: 'attack', target: 'enemy', mp: 6, power: 1.3,
    element: 'ice', inflict: { id: 'slow', chance: 0.4, turns: 3 },
    icon: 'ice', desc: 'Ice damage; may slow one foe.'
  }),
  heal: sk({
    id: 'heal', name: 'Mend', kind: 'heal', target: 'ally', mp: 6, base: 55, power: 0.9,
    icon: 'heal', desc: 'Restores an ally HP.'
  }),
  prismatic: sk({
    id: 'prismatic', name: 'Prismatic', kind: 'heal', target: 'allAllies', mp: 14, base: 40,
    power: 0.7, icon: 'heal', desc: 'Restores all allies HP.'
  }),
  ward: sk({
    id: 'ward', name: 'Ward', kind: 'buff', target: 'allSelf', mp: 9,
    icon: 'shield', modifier: { id: 'ward', chance: 1, turns: 4 },
    desc: 'Raises party resistance for 4 turns.'
  }),
  nova: sk({
    id: 'nova', name: 'Nova', kind: 'attack', target: 'allEnemies', mp: 22, power: 1.9,
    element: 'light', icon: 'light', desc: 'Light damage to all foes.'
  }),

  // --- Rowan, forest scout --------------------------------------------
  quickslash: sk({
    id: 'quickslash', name: 'Quickslash', kind: 'attack', target: 'enemy', mp: 5, power: 0.65,
    hits: 3, icon: 'sword', desc: 'Three light strikes.'
  }),
  venom: sk({
    id: 'venom', name: 'Venom Edge', kind: 'attack', target: 'enemy', mp: 7, power: 1.0,
    inflict: { id: 'poison', chance: 0.85, turns: 4 }, icon: 'poison',
    desc: 'Damage; poisons one foe.'
  }),
  pierce: sk({
    id: 'pierce', name: 'Pierce', kind: 'attack', target: 'enemy', mp: 10, power: 1.8,
    icon: 'spear', desc: 'Heavy damage to one foe.'
  }),
  smoke: sk({
    id: 'smoke', name: 'Smoke Bomb', kind: 'debuff', target: 'allEnemies', mp: 8,
    icon: 'silence', inflict: { id: 'blind', chance: 0.75, turns: 3 },
    desc: 'Blinds all foes; they miss more.'
  }),
  revive: sk({
    id: 'revive', name: 'Ember Call', kind: 'revive', target: 'ally', mp: 12, revive: 0.6,
    icon: 'revive', desc: 'Revives a fallen ally.'
  })
};

export function skill(id: string): SkillDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`Unknown skill id: ${id}`);
  return s;
}

/* ------------------------------------------------------- enemy-only skills */
/* These never appear in party menus; the AI reaches them by id. `allEnemies`
   is resolved relative to the acting side, so for an enemy it means the party. */

Object.assign(SKILLS, {
  bite: sk({
    id: 'bite', name: 'Savage Bite', kind: 'attack', target: 'enemy', mp: 0, power: 1.25,
    icon: 'sword', inflict: { id: 'poison', chance: 0.2, turns: 3 }, desc: ''
  }),
  gore: sk({
    id: 'gore', name: 'Gore Horn', kind: 'attack', target: 'enemy', mp: 0, power: 1.6,
    icon: 'sword', desc: ''
  }),
  screech: sk({
    id: 'screech', name: 'Screech', kind: 'debuff', target: 'allEnemies', mp: 0,
    icon: 'silence', inflict: { id: 'blind', chance: 0.6, turns: 3 }, desc: ''
  }),
  chill: sk({
    id: 'chill', name: 'Grave Chill', kind: 'attack', target: 'enemy', mp: 0, power: 1.3,
    element: 'ice', inflict: { id: 'slow', chance: 0.45, turns: 3 }, icon: 'ice', desc: ''
  }),
  dread: sk({
    id: 'dread', name: 'Dread', kind: 'attack', target: 'enemy', mp: 0, power: 1.0,
    element: 'dark', inflict: { id: 'sleep', chance: 0.3, turns: 2 }, icon: 'dark', desc: ''
  }),
  slam: sk({
    id: 'slam', name: 'Root Slam', kind: 'attack', target: 'enemy', mp: 0, power: 1.7,
    icon: 'sword', desc: ''
  }),
  lance: sk({
    id: 'lance', name: 'Rust Lance', kind: 'attack', target: 'enemy', mp: 0, power: 1.75,
    element: 'light', icon: 'spear', desc: ''
  }),
  overcharge: sk({
    id: 'overcharge', name: 'Overcharge', kind: 'attack', target: 'allEnemies', mp: 0,
    power: 1.5, element: 'fire', icon: 'fire', desc: ''
  }),
  judgement: sk({
    id: 'judgement', name: 'Judgement', kind: 'attack', target: 'allEnemies', mp: 0,
    power: 1.6, element: 'light', inflict: { id: 'burn', chance: 0.35, turns: 3 },
    icon: 'light', desc: ''
  })
} as Record<string, SkillDef>);

/** What each character learns, and at which level. */
export const LEARNSETS: Record<string, { level: number; id: string }[]> = {
  kael: [
    { level: 1, id: 'cleave' },
    { level: 4, id: 'guard_break' },
    { level: 7, id: 'rally' },
    { level: 11, id: 'starfall' }
  ],
  lyra: [
    { level: 1, id: 'ember' },
    { level: 2, id: 'heal' },
    { level: 5, id: 'frost' },
    { level: 6, id: 'ward' },
    { level: 9, id: 'cinder' },
    { level: 10, id: 'prismatic' },
    { level: 13, id: 'nova' }
  ],
  rowan: [
    { level: 1, id: 'quickslash' },
    { level: 3, id: 'venom' },
    { level: 6, id: 'smoke' },
    { level: 9, id: 'pierce' },
    { level: 8, id: 'revive' }
  ]
};

export function skillsAtLevel(charId: string, level: number): string[] {
  return (LEARNSETS[charId] ?? [])
    .filter((e) => e.level <= level)
    .map((e) => e.id);
}
