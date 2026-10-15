/** Shared battle unit shape. Both party members and foes use it. */

import type { Element, EquipSlot, StatKey } from '../data/Items';
import type { AiAction } from '../data/Enemies';

export type Side = 'party' | 'foe';

export interface StatusInstance {
  id: string;
  turns: number;
}

export interface BattleUnit {
  /** Unique per battle, e.g. `p0`, `f2`. */
  uid: string;
  side: Side;
  kind: 'char' | 'enemy';
  /** Character id or enemy id. */
  refId: string;
  name: string;
  level: number;
  art: string;
  scale: number;
  boss: boolean;
  phaseAt?: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  base: Record<StatKey, number>;
  skills: string[];
  equipment?: Partial<Record<EquipSlot, string | null>>;
  resist: Partial<Record<Element, number>>;
  statuses: StatusInstance[];
  guarding: boolean;
  alive: boolean;
  ai?: AiAction[];
  aiUses: Record<string, number>;
  xp?: number;
  gil?: number;
  drops?: [string, number, number][];
  /** Set when the unit is slain during this battle (for death animations). */
  died?: boolean;
}

export type BattleActionKind = 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'pass';

export interface BattleAction {
  kind: BattleActionKind;
  skillId?: string;
  itemId?: string;
  /** Index into the acting unit's target list. */
  targetUid?: string;
}

export interface QueuedAction {
  unit: BattleUnit;
  action: BattleAction;
}

export interface BattleUnitSnapshot {
  uid: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  alive: boolean;
  statuses: StatusInstance[];
}
