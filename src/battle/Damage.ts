/**
 * Damage, healing, crits, accuracy, turn order and flee odds. Pure functions
 * over `BattleUnit` so they can be unit-tested without Phaser.
 *
 * Formula shape (classic genre convention):
 *   raw   = stat * power + flat
 *   mult  = 100 / (100 + defense * K)      -- soft, never reduces to 0
 *   dmg   = max(1, round(raw * mult * variance * crit))
 */

import { BALANCE } from '../config/constants';
import { ITEMS, STAT_KEYS, type Element, type StatKey } from '../data/Items';
import type { Rng } from '../core/Rng';
import type { BattleUnit } from './Types';
import { missPenalty, statusStatMultiplier } from './Status';

export interface EquipBonus {
  stats: Record<StatKey, number>;
  hp: number;
  mp: number;
  resist: Partial<Record<Element, number>>;
}

const zeroStats = (): Record<StatKey, number> => ({
  str: 0, vit: 0, spd: 0, mag: 0, mdef: 0
});

export function equipmentBonus(u: BattleUnit): EquipBonus {
  const out: EquipBonus = { stats: zeroStats(), hp: 0, mp: 0, resist: {} };
  if (!u.equipment) return out;
  for (const id of Object.values(u.equipment)) {
    if (!id) continue;
    const def = ITEMS[id]?.equip;
    if (!def) continue;
    for (const key of STAT_KEYS) {
      out.stats[key] += def.mods[key] ?? 0;
    }
    out.hp += def.hp ?? 0;
    out.mp += def.mp ?? 0;
    for (const [el, mult] of Object.entries(def.resist ?? {})) {
      const prev = out.resist[el as Element] ?? 1;
      // Multiplicative across pieces, clamped so stacking cannot go silly.
      out.resist[el as Element] = Math.max(0.25, prev * (mult as number));
    }
  }
  return out;
}

/** Base + equipment, before status modifiers. */
export function gearStats(u: BattleUnit): Record<StatKey, number> {
  const bonus = equipmentBonus(u);
  const out = zeroStats();
  for (const key of STAT_KEYS) out[key] = u.base[key] + bonus.stats[key];
  return out;
}

/** Base + equipment + status modifiers, floored at 1. */
export function stats(u: BattleUnit): Record<StatKey, number> {
  const g = gearStats(u);
  const out = zeroStats();
  for (const key of STAT_KEYS) {
    out[key] = Math.max(1, Math.round(g[key] * statusStatMultiplier(u, key)));
  }
  return out;
}

export function elementResist(u: BattleUnit, element: Element): number {
  if (element === 'none') return 1;
  const fromGear = equipmentBonus(u).resist[element] ?? 1;
  const fromDef = u.resist[element] ?? 1;
  return Math.max(0.25, fromGear * fromDef);
}

export interface DamageResult {
  damage: number;
  crit: boolean;
  missed: boolean;
  resist: number;
}

function accuracy(attacker: BattleUnit, rng: Rng, bonus = 0): boolean {
  const base = 0.94 + bonus;
  const penalty = missPenalty(attacker);
  return rng.chance(Math.max(0.25, base - penalty));
}

function critChance(attacker: BattleUnit): number {
  const s = stats(attacker);
  return Math.min(0.35, BALANCE.critBase + s.spd * BALANCE.critPerSpd);
}

export function physical(
  attacker: BattleUnit,
  defender: BattleUnit,
  power = 1,
  rng: Rng,
  element: Element = 'none',
  flat = 6
): DamageResult {
  const a = stats(attacker);
  const d = stats(defender);
  const resist = elementResist(defender, element);
  if (!accuracy(attacker, rng)) {
    return { damage: 0, crit: false, missed: true, resist };
  }
  const crit = rng.chance(critChance(attacker));
  const raw = a.str * power + flat;
  const defValue = d.vit * 2.5;
  let dmg = raw * (100 / (100 + defValue));
  dmg *= resist;
  if (defender.guarding) dmg *= BALANCE.defendMult;
  if (crit) dmg *= BALANCE.critMult;
  dmg *= rng.variance(BALANCE.physVariance);
  return { damage: Math.max(1, Math.round(dmg)), crit, missed: false, resist };
}

export function magical(
  caster: BattleUnit,
  target: BattleUnit,
  power = 1,
  rng: Rng,
  element: Element = 'none',
  flat = 8
): DamageResult {
  const a = stats(caster);
  const d = stats(target);
  const resist = elementResist(target, element);
  const crit = rng.chance(critChance(caster) * 0.6);
  const raw = a.mag * power + flat;
  const defValue = d.mdef * 2.2;
  let dmg = raw * (100 / (100 + defValue));
  dmg *= resist;
  if (target.guarding) dmg *= BALANCE.defendMult;
  if (crit) dmg *= BALANCE.critMult;
  dmg *= rng.variance(BALANCE.physVariance * 0.6);
  return { damage: Math.max(1, Math.round(dmg)), crit, missed: false, resist };
}

export function healAmount(caster: BattleUnit, base: number, power = 1): number {
  const a = stats(caster);
  return Math.round(base + a.mag * power * 1.4);
}

/** XP needed to reach `level + 1`. */
export function xpToNext(level: number): number {
  const t = level - 1;
  return BALANCE.xpLevelBase + t * BALANCE.xpLevelLinear + t * t * 6;
}

/** Speed-derived initiative with a random tie-breaker, re-rolled each round. */
export function initiative(u: BattleUnit, rng: Rng): number {
  return stats(u).spd * 2 + rng.int(0, 12);
}

export function turnOrder(units: BattleUnit[], rng: Rng): BattleUnit[] {
  return units
    .filter((u) => u.alive)
    .map((u) => ({ u, roll: initiative(u, rng) }))
    .sort((a, b) => b.roll - a.roll || (a.u.side === 'party' ? -1 : 1))
    .map((e) => e.u);
}

export function fleeChance(party: BattleUnit[], foes: BattleUnit[], rng: Rng): number {
  const alive = party.filter((u) => u.alive);
  if (!alive.length) return 0;
  if (foes.some((f) => f.boss && f.alive)) return 0;
  const avg = (list: BattleUnit[]) =>
    list.reduce((a, u) => a + stats(u).spd, 0) / Math.max(1, list.length);
  const delta = avg(alive) - avg(foes.filter((f) => f.alive));
  const p = BALANCE.fleeBase + delta * 0.02 + rng.float() * 0.05;
  return Math.max(0.15, Math.min(0.95, p));
}

/** True when the target should be counted as "hit" for sleep/freeze breaking. */
export function isHurt(result: DamageResult): boolean {
  return !result.missed && result.damage > 0;
}
