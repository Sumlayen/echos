/**
 * Status effects. A status is data first: stat multipliers, damage-over-time,
 * action blocks. The battle engine asks small questions
 * (`canAct`, `statusStatMultiplier`, `tickEnd`) rather than switching on ids.
 */

import type { StatKey } from '../data/Items';
import type { BattleUnit, StatusInstance } from './Types';
import type { Rng } from '../core/Rng';

export interface StatusDef {
  id: string;
  name: string;
  icon: string;
  good: boolean;
  defaultTurns: number;
  /** Multiplicative stat modifiers: 0.65 means -35%. */
  mods?: Partial<Record<StatKey, number>>;
  /** Damage at the end of the round, as a fraction of max HP. */
  dot?: number;
  /** Cannot take any action while active. */
  blocksAct?: boolean;
  /** Cannot use skills while active. */
  blocksSkill?: boolean;
  /** Added miss chance. */
  missPenalty?: number;
  /** Wakes / breaks when the unit takes damage. */
  endsOnHit?: boolean;
  /** Tint applied to the sprite while active. */
  tint?: string;
}

const st = (d: StatusDef): StatusDef => d;

export const STATUSES: Record<string, StatusDef> = {
  poison: st({
    id: 'poison', name: 'Poison', icon: 'poison', good: false, defaultTurns: 4,
    dot: 0.06, mods: { vit: 0.85 }, tint: '#6cb25e'
  }),
  burn: st({
    id: 'burn', name: 'Burn', icon: 'burn', good: false, defaultTurns: 3,
    dot: 0.08, mods: { str: 0.85 }, tint: '#ef8a3c'
  }),
  freeze: st({
    id: 'freeze', name: 'Frozen', icon: 'freeze', good: false, defaultTurns: 2,
    mods: { spd: 0.4 }, blocksAct: true, endsOnHit: true, tint: '#a8dbf2'
  }),
  sleep: st({
    id: 'sleep', name: 'Sleep', icon: 'sleep', good: false, defaultTurns: 3,
    blocksAct: true, endsOnHit: true, tint: '#8d6abe'
  }),
  stun: st({
    id: 'stun', name: 'Stunned', icon: 'stun', good: false, defaultTurns: 1,
    blocksAct: true, tint: '#f0c04e'
  }),
  curse: st({
    id: 'curse', name: 'Cursed', icon: 'curse', good: false, defaultTurns: 5,
    mods: { str: 0.75, mag: 0.75, spd: 0.8 }, tint: '#583d84'
  }),
  blind: st({
    id: 'blind', name: 'Blinded', icon: 'silence', good: false, defaultTurns: 3,
    missPenalty: 0.35, tint: '#3a4560'
  }),
  slow: st({
    id: 'slow', name: 'Slowed', icon: 'freeze', good: false, defaultTurns: 3,
    mods: { spd: 0.6 }, tint: '#5c9ed4'
  }),
  sink: st({
    id: 'sink', name: 'Guard Broken', icon: 'debuff', good: false, defaultTurns: 3,
    mods: { vit: 0.6 }, tint: '#be4a4a'
  }),
  silence: st({
    id: 'silence', name: 'Silenced', icon: 'silence', good: false, defaultTurns: 3,
    blocksSkill: true, tint: '#583d84'
  }),
  raise: st({
    id: 'raise', name: 'Raised', icon: 'buff', good: true, defaultTurns: 4,
    mods: { str: 1.35 }, tint: '#f0c04e'
  }),
  ward: st({
    id: 'ward', name: 'Warded', icon: 'shield', good: true, defaultTurns: 4,
    mods: { mdef: 1.5, vit: 1.15 }, tint: '#a8dbf2'
  }),
  haste: st({
    id: 'haste', name: 'Hasted', icon: 'arrow', good: true, defaultTurns: 4,
    mods: { spd: 1.4 }, tint: '#a6d87c'
  })
};

export function statusDef(id: string): StatusDef {
  const s = STATUSES[id];
  if (!s) throw new Error(`Unknown status id: ${id}`);
  return s;
}

export function hasStatus(u: BattleUnit, id: string): boolean {
  return u.statuses.some((s) => s.id === id);
}

export function getStatus(u: BattleUnit, id: string): StatusInstance | undefined {
  return u.statuses.find((s) => s.id === id);
}

/** Apply or refresh a status. Returns true when newly applied. */
export function addStatus(u: BattleUnit, id: string, turns?: number): boolean {
  const def = statusDef(id);
  const existing = getStatus(u, id);
  const next = turns ?? def.defaultTurns;
  if (existing) {
    // Refresh to the longer of the two so buffs are never shortened by accident.
    existing.turns = Math.max(existing.turns, next);
    return false;
  }
  u.statuses.push({ id, turns: next });
  return true;
}

export function removeStatus(u: BattleUnit, id: string): boolean {
  const i = u.statuses.findIndex((s) => s.id === id);
  if (i < 0) return false;
  u.statuses.splice(i, 1);
  return true;
}

export function cureStatuses(u: BattleUnit, ids: string[]): string[] {
  const cured: string[] = [];
  for (const id of ids) if (removeStatus(u, id)) cured.push(id);
  return cured;
}

/** Combined multiplicative modifier for a stat from all active statuses. */
export function statusStatMultiplier(u: BattleUnit, key: StatKey): number {
  let m = 1;
  for (const s of u.statuses) {
    const mod = STATUSES[s.id]?.mods?.[key];
    if (mod !== undefined) m *= mod;
  }
  return m;
}

export function missPenalty(u: BattleUnit): number {
  let p = 0;
  for (const s of u.statuses) p += STATUSES[s.id]?.missPenalty ?? 0;
  return p;
}

export interface ActCheck {
  ok: boolean;
  /** Reason shown in the battle log, e.g. `ASLEEP`. */
  reason?: string;
  /** Status that ended as a side effect of trying to act. */
  ended?: string;
}

/** Can this unit take its turn? May consume sleep/freeze turns. */
export function canAct(u: BattleUnit, rng: Rng): ActCheck {
  for (const s of u.statuses) {
    const def = STATUSES[s.id];
    if (!def?.blocksAct) continue;
    if (def.id === 'sleep') {
      if (rng.chance(0.25)) {
        removeStatus(u, 'sleep');
        return { ok: true, ended: 'sleep' };
      }
      return { ok: false, reason: 'ASLEEP' };
    }
    if (def.id === 'freeze') {
      if (rng.chance(0.3)) {
        removeStatus(u, 'freeze');
        return { ok: true, ended: 'freeze' };
      }
      return { ok: false, reason: 'FROZEN' };
    }
    return { ok: false, reason: 'STUNNED' };
  }
  return { ok: true };
}

export interface TickResult {
  damage: number;
  expired: string[];
}

/** End of round: damage over time, then decrement every status. */
export function tickEnd(u: BattleUnit): TickResult {
  const out: TickResult = { damage: 0, expired: [] };
  if (!u.alive) return out;
  for (const s of u.statuses) {
    const dot = STATUSES[s.id]?.dot;
    if (dot) out.damage += Math.max(1, Math.round(u.maxHp * dot));
  }
  if (out.damage > 0) u.hp = Math.max(0, u.hp - out.damage);
  for (let i = u.statuses.length - 1; i >= 0; i--) {
    u.statuses[i].turns -= 1;
    if (u.statuses[i].turns <= 0) {
      out.expired.push(u.statuses[i].id);
      u.statuses.splice(i, 1);
    }
  }
  if (u.hp <= 0) {
    u.alive = false;
    u.died = true;
  }
  return out;
}

/** Called when a unit takes damage: sleep and freeze break. */
export function breakOnHit(u: BattleUnit): string[] {
  const ended: string[] = [];
  for (const s of u.statuses.slice()) {
    if (STATUSES[s.id]?.endsOnHit) {
      removeStatus(u, s.id);
      ended.push(s.id);
    }
  }
  return ended;
}