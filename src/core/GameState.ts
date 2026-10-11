/**
 * The save-scoped game state: party, inventory, gold, flags, quests and the
 * player's position. Pure data + methods, no Phaser, so it is unit-testable and
 * trivially serialisable.
 */

import { BALANCE, SAVE_VERSION } from '../config/constants';
import { EQUIP_SLOTS, ITEMS, type EquipDef, type EquipSlot, type StatKey } from '../data/Items';
import { skillsAtLevel } from '../data/Skills';
import { xpToNext } from '../battle/Damage';

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  base: Record<StatKey, number>;
  equipment: Record<EquipSlot, string | null>;
  skills: string[];
}

export type FlagValue = number | string | boolean;

export interface QuestState {
  id: string;
  stage: number;
  started: boolean;
  done: boolean;
}

export interface SavePayload {
  version: number;
  party: PartyMember[];
  partyOrder: string[];
  inventory: Record<string, number>;
  gold: number;
  flags: Record<string, FlagValue>;
  quests: Record<string, QuestState>;
  location: string;
  px: number;
  py: number;
  facing: 'up' | 'down' | 'left' | 'right';
  playtime: number;
  createdAt: number;
  savedAt: number;
}

interface Growth {
  name: string;
  base: Record<StatKey, number>;
  gain: Record<StatKey, number>;
}

export const GROWTH: Record<string, Growth> = {
  kael: {
    name: 'Kael',
    base: { str: 12, vit: 8, spd: 9, mag: 3, mdef: 6 },
    gain: { str: 3, vit: 2, spd: 2, mag: 1, mdef: 1 }
  },
  lyra: {
    name: 'Lyra',
    base: { str: 5, vit: 6, spd: 10, mag: 12, mdef: 11 },
    gain: { str: 1, vit: 1, spd: 2, mag: 3, mdef: 2 }
  },
  rowan: {
    name: 'Rowan',
    base: { str: 10, vit: 7, spd: 13, mag: 5, mdef: 7 },
    gain: { str: 2, vit: 2, spd: 3, mag: 1, mdef: 1 }
  }
};

export const MAX_LEVEL = 30;

export function maxHpFor(level: number, vit: number): number {
  return 20 + level * 8 + vit * 4;
}

export function maxMpFor(level: number, mag: number): number {
  return 6 + level * 3 + mag * 2;
}

export function statsAt(id: string, level: number): Record<StatKey, number> {
  const g = GROWTH[id];
  if (!g) throw new Error(`Unknown character id: ${id}`);
  const out = { ...g.base };
  const t = level - 1;
  (Object.keys(out) as StatKey[]).forEach((k) => {
    out[k] = g.base[k] + g.gain[k] * t;
  });
  return out;
}

export function createMember(id: string, level = 1): PartyMember {
  const g = GROWTH[id];
  if (!g) throw new Error(`Unknown character id: ${id}`);
  const base = statsAt(id, level);
  return {
    id,
    name: g.name,
    level,
    xp: 0,
    hp: maxHpFor(level, base.vit),
    mp: maxMpFor(level, base.mag),
    base,
    equipment: { weapon: null, shield: null, head: null, body: null, accessory: null },
    skills: skillsAtLevel(id, level)
  };
}

export class GameState {
  party: PartyMember[] = [];
  partyOrder: string[] = [];
  inventory: Record<string, number> = {};
  gold = 0;
  flags: Record<string, FlagValue> = {};
  quests: Record<string, QuestState> = {};
  location = 'village';
  px = 0;
  py = 0;
  facing: 'up' | 'down' | 'left' | 'right' = 'down';
  playtime = 0;
  createdAt = Date.now();
  savedAt = 0;

  /* ---------------------------------------------------------------- party */

  startNew(ids: string[] = ['kael']): void {
    this.party = ids.map((id) => createMember(id));
    this.partyOrder = ids.slice();
    this.inventory = {};
    this.gold = 0;
    this.flags = {};
    this.quests = {};
    this.location = 'village';
    this.px = 0;
    this.py = 0;
    this.playtime = 0;
    this.createdAt = Date.now();
  }

  get active(): PartyMember[] {
    return this.partyOrder
      .map((id) => this.party.find((p) => p.id === id))
      .filter((p): p is PartyMember => !!p);
  }

  member(id: string): PartyMember | undefined {
    return this.party.find((p) => p.id === id);
  }

  /** Story recruitment: adds (or levels up) a character and joins them. */
  recruit(id: string, level: number): PartyMember {
    let m = this.member(id);
    if (!m) {
      m = createMember(id, level);
      this.party.push(m);
    } else if (m.level < level) {
      m.level = level;
      m.base = statsAt(id, level);
      m.skills = skillsAtLevel(id, level);
    }
    if (!this.partyOrder.includes(id)) this.partyOrder.push(id);
    m.hp = this.memberMaxHp(m);
    m.mp = this.memberMaxMp(m);
    return m;
  }

  memberMaxHp(m: PartyMember): number {
    return maxHpFor(m.level, m.base.vit) + this.equipSum(m, 'hp');
  }

  memberMaxMp(m: PartyMember): number {
    return maxMpFor(m.level, m.base.mag) + this.equipSum(m, 'mp');
  }

  private equipSum(m: PartyMember, key: 'hp' | 'mp'): number {
    let total = 0;
    for (const id of Object.values(m.equipment)) {
      if (!id) continue;
      total += ITEMS[id]?.equip?.[key] ?? 0;
    }
    return total;
  }

  partyAlive(): boolean {
    return this.active.some((m) => m.hp > 0);
  }

  restFull(): void {
    for (const m of this.active) {
      m.hp = this.memberMaxHp(m);
      m.mp = this.memberMaxMp(m);
    }
  }

  /* ------------------------------------------------------------- leveling */

  gainXp(id: string, amount: number): { levels: number; learned: string[] } {
    const m = this.member(id);
    if (!m || m.hp <= 0) return { levels: 0, learned: [] };
    m.xp += amount;
    let levels = 0;
    const learned: string[] = [];
    while (m.level < MAX_LEVEL && m.xp >= xpToNext(m.level)) {
      m.xp -= xpToNext(m.level);
      m.level += 1;
      levels += 1;
      m.base = statsAt(m.id, m.level);
      const before = new Set(m.skills);
      m.skills = skillsAtLevel(m.id, m.level);
      for (const s of m.skills) if (!before.has(s)) learned.push(s);
      m.hp = Math.min(this.memberMaxHp(m), m.hp + 12);
      m.mp = Math.min(this.memberMaxMp(m), m.mp + 6);
    }
    return { levels, learned };
  }

  /* ------------------------------------------------------------ inventory */

  itemCount(id: string): number {
    return this.inventory[id] ?? 0;
  }

  addItem(id: string, count = 1): void {
    if (!ITEMS[id]) throw new Error(`Unknown item id: ${id}`);
    this.inventory[id] = this.itemCount(id) + count;
  }

  removeItem(id: string, count = 1): boolean {
    const have = this.itemCount(id);
    if (have < count) return false;
    const left = have - count;
    if (left <= 0) delete this.inventory[id];
    else this.inventory[id] = left;
    return true;
  }

  has(id: string): boolean {
    return this.itemCount(id) > 0;
  }

  listInventory(): { id: string; count: number }[] {
    return Object.keys(this.inventory)
      .filter((id) => this.inventory[id] > 0)
      .sort((a, b) => (ITEMS[a]?.name ?? a).localeCompare(ITEMS[b]?.name ?? b))
      .map((id) => ({ id, count: this.inventory[id] }));
  }

  buy(id: string, count = 1): boolean {
    const price = ITEMS[id]?.price ?? 0;
    const cost = price * count;
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.addItem(id, count);
    return true;
  }

  sell(id: string): boolean {
    const def = ITEMS[id];
    if (!def || def.unique || !this.removeItem(id)) return false;
    this.gold += Math.floor(def.price * BALANCE.sellRatio);
    return true;
  }

  /* ------------------------------------------------------------ equipment */

  equip(memberId: string, itemId: string): { swapped: string | null } {
    const m = this.member(memberId);
    const def: EquipDef | undefined = ITEMS[itemId]?.equip;
    if (!m || !def) throw new Error(`Cannot equip ${itemId}`);
    if (!this.removeItem(itemId)) throw new Error(`Not holding ${itemId}`);
    const swapped = m.equipment[def.slot];
    m.equipment[def.slot] = itemId;
    if (swapped) this.addItem(swapped);
    m.hp = Math.min(m.hp, this.memberMaxHp(m));
    m.mp = Math.min(m.mp, this.memberMaxMp(m));
    return { swapped };
  }

  unequip(memberId: string, slot: EquipSlot): boolean {
    const m = this.member(memberId);
    if (!m) return false;
    const current = m.equipment[slot];
    if (!current) return false;
    m.equipment[slot] = null;
    this.addItem(current);
    m.hp = Math.min(m.hp, this.memberMaxHp(m));
    m.mp = Math.min(m.mp, this.memberMaxMp(m));
    return true;
  }

  /** Rough genre rule: Lyra is a mage in cloth, the others wear steel. */
  canEquip(memberId: string, itemId: string): boolean {
    const m = this.member(memberId);
    const def = ITEMS[itemId]?.equip;
    if (!m || !def) return false;
    const heavy = ['armor_chain', 'armor_star', 'helm_iron', 'shield_iron', 'shield_star'];
    if (m.id === 'lyra') {
      if (heavy.includes(itemId)) return false;
      if (def.slot === 'weapon' && itemId !== 'staff_oak' && itemId !== 'staff_star') return false;
    }
    if (m.id !== 'lyra' && def.slot === 'weapon' && itemId.startsWith('staff')) return false;
    return true;
  }

  equippedIn(memberId: string): { slot: EquipSlot; itemId: string }[] {
    const m = this.member(memberId);
    if (!m) return [];
    const out: { slot: EquipSlot; itemId: string }[] = [];
    for (const slot of EQUIP_SLOTS) {
      const id = m.equipment[slot];
      if (id) out.push({ slot, itemId: id });
    }
    return out;
  }

  /* ---------------------------------------------------------------- flags */

  flag(key: string): FlagValue | undefined {
    return this.flags[key];
  }

  bool(key: string): boolean {
    return this.flags[key] === true;
  }

  num(key: string): number {
    const v = this.flags[key];
    return typeof v === 'number' ? v : 0;
  }

  str(key: string): string {
    const v = this.flags[key];
    return typeof v === 'string' ? v : '';
  }

  setFlag(key: string, value: FlagValue): void {
    this.flags[key] = value;
  }

  addFlagNum(key: string, delta: number): number {
    const next = this.num(key) + delta;
    this.flags[key] = next;
    return next;
  }

  /* --------------------------------------------------------------- quests */

  quest(id: string): QuestState | undefined {
    return this.quests[id];
  }

  startQuest(id: string): QuestState {
    const q = this.quests[id] ?? { id, stage: 0, started: true, done: false };
    q.started = true;
    this.quests[id] = q;
    return q;
  }

  setQuestStage(id: string, stage: number): void {
    const q = this.startQuest(id);
    q.stage = Math.max(q.stage, stage);
  }

  completeQuest(id: string, stage?: number): void {
    const q = this.startQuest(id);
    if (stage !== undefined) q.stage = stage;
    q.done = true;
  }

  questDone(id: string): boolean {
    return !!this.quests[id]?.done;
  }

  questStage(id: string): number {
    return this.quests[id]?.stage ?? -1;
  }

  activeQuests(): QuestState[] {
    return Object.values(this.quests).filter((q) => q.started && !q.done);
  }

  /* ---------------------------------------------------------- serialising */

  serialize(): SavePayload {
    return {
      version: SAVE_VERSION,
      party: JSON.parse(JSON.stringify(this.party)),
      partyOrder: this.partyOrder.slice(),
      inventory: { ...this.inventory },
      gold: this.gold,
      flags: JSON.parse(JSON.stringify(this.flags)),
      quests: JSON.parse(JSON.stringify(this.quests)),
      location: this.location,
      px: this.px,
      py: this.py,
      facing: this.facing,
      playtime: Math.round(this.playtime),
      createdAt: this.createdAt,
      savedAt: Date.now()
    };
  }

  load(p: SavePayload): void {
    this.party = p.party;
    this.partyOrder = p.partyOrder.length ? p.partyOrder.slice() : p.party.map((m) => m.id);
    this.inventory = { ...p.inventory };
    this.gold = p.gold;
    this.flags = { ...(p.flags ?? {}) };
    this.quests = { ...(p.quests ?? {}) };
    this.location = p.location;
    this.px = p.px;
    this.py = p.py;
    this.facing = p.facing ?? 'down';
    this.playtime = p.playtime ?? 0;
    this.createdAt = p.createdAt ?? Date.now();
    this.savedAt = p.savedAt ?? 0;
    // Re-sync derived data in case a save predates a balance change.
    for (const m of this.party) {
      m.skills = skillsAtLevel(m.id, m.level);
      for (const slot of EQUIP_SLOTS) {
        if (!(slot in m.equipment)) m.equipment[slot] = null;
      }
      m.hp = Math.min(m.hp, this.memberMaxHp(m));
      m.mp = Math.min(m.mp, this.memberMaxMp(m));
    }
  }
}

// (the running game owns its state through `GameApp.state`)