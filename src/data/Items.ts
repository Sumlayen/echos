/**
 * Items and equipment. One flat registry keyed by id; the icon key matches a
 * frame in the generated icon atlas (`src/art/IconArt.ts`).
 */

export type EquipSlot = 'weapon' | 'shield' | 'head' | 'body' | 'accessory';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'head', 'body', 'accessory'];

export type StatKey = 'str' | 'vit' | 'spd' | 'mag' | 'mdef';
export const STAT_KEYS: StatKey[] = ['str', 'vit', 'spd', 'mag', 'mdef'];

export const STAT_LABEL: Record<StatKey, string> = {
  str: 'ATK', vit: 'DEF', spd: 'SPD', mag: 'MAG', mdef: 'RES'
};

export type Element = 'fire' | 'ice' | 'light' | 'dark' | 'none';

export type ItemKind = 'consumable' | 'equipment' | 'key' | 'material';

export interface ItemEffect {
  /** HP restored (flat) or damage dealt when `element` is set. */
  hp?: number;
  mp?: number;
  /** Deals damage of this element instead of healing. */
  element?: Element;
  /** Power multiplier applied to the user's ATK/MAG for damage items. */
  power?: number;
  /** Status ids cured from the target. */
  cure?: string[];
  /** Inflicts a status. */
  inflict?: { id: string; chance: number; turns: number };
  /** Applies a buff to the user. */
  buff?: { id: string; turns: number };
  /** Revives a fallen ally at this fraction of max HP. */
  revive?: number;
  aoe?: boolean;
}

export interface EquipDef {
  slot: EquipSlot;
  mods: Partial<Record<StatKey, number>>;
  /** Flat HP/MP granted by the piece. */
  hp?: number;
  mp?: number;
  /** Elemental multiplier granted by the piece (0.5 resists, 1.5 weak). */
  resist?: Partial<Record<Element, number>>;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  price: number;
  icon: string;
  usable?: 'field' | 'battle' | 'both' | 'none';
  effect?: ItemEffect;
  equip?: EquipDef;
  /** Cannot be sold and only one may be held. */
  unique?: boolean;
}

const def = (d: ItemDef): ItemDef => d;

export const ITEMS: Record<string, ItemDef> = {
  potion_s: def({
    id: 'potion_s', name: 'Salve', kind: 'consumable', price: 12, icon: 'potion_s',
    usable: 'both', effect: { hp: 40 }, desc: 'Restores 40 HP to one ally.'
  }),
  potion_l: def({
    id: 'potion_l', name: 'Strong Salve', kind: 'consumable', price: 45, icon: 'potion_l',
    usable: 'both', effect: { hp: 120 }, desc: 'Restores 120 HP to one ally.'
  }),
  elixir: def({
    id: 'elixir', name: 'Star Elixir', kind: 'consumable', price: 220, icon: 'elixir',
    usable: 'both', effect: { hp: 9999 }, desc: 'Fully restores one ally.'
  }),
  ether: def({
    id: 'ether', name: 'Ether', kind: 'consumable', price: 60, icon: 'ether',
    usable: 'both', effect: { mp: 30 }, desc: 'Restores 30 MP to one ally.'
  }),
  ether_l: def({
    id: 'ether_l', name: 'Full Ether', kind: 'consumable', price: 150, icon: 'ether',
    usable: 'both', effect: { mp: 999 }, desc: 'Fully restores one ally MP.'
  }),
  antidote: def({
    id: 'antidote', name: 'Bark Tonic', kind: 'consumable', price: 18, icon: 'antidote',
    usable: 'both', effect: { cure: ['poison', 'burn'] }, desc: 'Cures poison and burn.'
  }),
  revive: def({
    id: 'revive', name: 'Ember Bloom', kind: 'consumable', price: 90, icon: 'revive',
    usable: 'both',
    effect: { revive: 0.5, cure: ['poison', 'burn', 'freeze', 'sleep', 'stun', 'curse'] },
    desc: 'Revives a fallen ally at half HP.'
  }),
  hero_bread: def({
    id: 'hero_bread', name: 'Traveler Bread', kind: 'consumable', price: 30, icon: 'bread',
    usable: 'battle', effect: { buff: { id: 'raise', turns: 4 } },
    desc: 'Raises one ally attack for 4 turns.'
  }),
  bomb: def({
    id: 'bomb', name: 'Fire Flask', kind: 'consumable', price: 40, icon: 'bomb',
    usable: 'battle', effect: { element: 'fire', power: 1.4 }, desc: 'Fire damage to one foe.'
  }),
  ball: def({
    id: 'ball', name: 'Ice Vial', kind: 'consumable', price: 40, icon: 'ball',
    usable: 'battle', effect: { element: 'ice', power: 1.4 }, desc: 'Ice damage to one foe.'
  }),
  torch: def({
    id: 'torch', name: 'Pitch Torch', kind: 'key', price: 0, icon: 'torch',
    usable: 'none', unique: true, desc: 'Lights the deep halls of the ruins.'
  }),
  star_key: def({
    id: 'star_key', name: 'Shard Key', kind: 'key', price: 0, icon: 'key',
    usable: 'none', unique: true, desc: 'Opens the sealed gate of the First Flame.'
  }),
  gem: def({
    id: 'gem', name: 'Star Shard', kind: 'material', price: 120, icon: 'gem',
    usable: 'none', desc: 'A fragment of the fallen star. The smith pays well.'
  }),
  herb: def({
    id: 'herb', name: 'Ashen Herb', kind: 'material', price: 14, icon: 'sparkles',
    usable: 'none', desc: 'Bitter herb used in salves.'
  }),

  /* ------------------------------------------------------------ equipment */

  sword_bronze: def({
    id: 'sword_bronze', name: 'Bronze Sword', kind: 'equipment', price: 60, icon: 'sword',
    equip: { slot: 'weapon', mods: { str: 4 } }, desc: 'ATK +4'
  }),
  sword_iron: def({
    id: 'sword_iron', name: 'Iron Sword', kind: 'equipment', price: 180, icon: 'sword',
    equip: { slot: 'weapon', mods: { str: 9 } }, desc: 'ATK +9'
  }),
  sword_star: def({
    id: 'sword_star', name: 'Starfall Blade', kind: 'equipment', price: 640, icon: 'sword',
    equip: { slot: 'weapon', mods: { str: 16, spd: 3 }, resist: { dark: 0.75 } },
    desc: 'ATK +16, SPD +3. Forged from a fallen shard.'
  }),
  axe_bone: def({
    id: 'axe_bone', name: 'Bone Axe', kind: 'equipment', price: 150, icon: 'axe',
    equip: { slot: 'weapon', mods: { str: 12, spd: -2 } }, desc: 'ATK +12, SPD -2'
  }),
  spear_ashen: def({
    id: 'spear_ashen', name: 'Ashen Spear', kind: 'equipment', price: 210, icon: 'spear',
    equip: { slot: 'weapon', mods: { str: 11, vit: 2 } }, desc: 'ATK +11, DEF +2'
  }),
  staff_oak: def({
    id: 'staff_oak', name: 'Oak Staff', kind: 'equipment', price: 90, icon: 'staff',
    equip: { slot: 'weapon', mods: { mag: 7 } }, desc: 'MAG +7'
  }),
  staff_star: def({
    id: 'staff_star', name: 'Warding Staff', kind: 'equipment', price: 420, icon: 'staff',
    equip: { slot: 'weapon', mods: { mag: 15, mdef: 4 } }, desc: 'MAG +15, RES +4'
  }),
  shield_wood: def({
    id: 'shield_wood', name: 'Wooden Shield', kind: 'equipment', price: 45, icon: 'shield',
    equip: { slot: 'shield', mods: { vit: 3 } }, desc: 'DEF +3'
  }),
  shield_iron: def({
    id: 'shield_iron', name: 'Iron Shield', kind: 'equipment', price: 200, icon: 'shield',
    equip: { slot: 'shield', mods: { vit: 8, spd: -1 } }, desc: 'DEF +8, SPD -1'
  }),
  shield_star: def({
    id: 'shield_star', name: 'Star Guard', kind: 'equipment', price: 520, icon: 'shield',
    equip: { slot: 'shield', mods: { vit: 12, mdef: 5 }, resist: { fire: 0.6 } },
    desc: 'DEF +12, RES +5, halves fire.'
  }),
  helm_cloth: def({
    id: 'helm_cloth', name: 'Travel Hood', kind: 'equipment', price: 35, icon: 'helm',
    equip: { slot: 'head', mods: { mdef: 2 } }, desc: 'RES +2'
  }),
  helm_iron: def({
    id: 'helm_iron', name: 'Iron Helm', kind: 'equipment', price: 170, icon: 'helm',
    equip: { slot: 'head', mods: { vit: 5, spd: -1 } }, desc: 'DEF +5, SPD -1'
  }),
  armor_leather: def({
    id: 'armor_leather', name: 'Leather Armor', kind: 'equipment', price: 80, icon: 'armor',
    equip: { slot: 'body', mods: { vit: 5 } }, desc: 'DEF +5'
  }),
  armor_chain: def({
    id: 'armor_chain', name: 'Chainmail', kind: 'equipment', price: 300, icon: 'armor',
    equip: { slot: 'body', mods: { vit: 11, spd: -2 } }, desc: 'DEF +11, SPD -2'
  }),
  armor_star: def({
    id: 'armor_star', name: 'Warden Plate', kind: 'equipment', price: 700, icon: 'armor',
    equip: { slot: 'body', mods: { vit: 16, mdef: 6 }, hp: 30 },
    desc: 'DEF +16, RES +6, HP +30'
  }),
  robe_sage: def({
    id: 'robe_sage', name: 'Sage Robe', kind: 'equipment', price: 260, icon: 'robe',
    equip: { slot: 'body', mods: { mag: 6, mdef: 7 }, mp: 20 }, desc: 'MAG +6, RES +7, MP +20'
  }),
  ring_speed: def({
    id: 'ring_speed', name: 'Fleet Ring', kind: 'equipment', price: 240, icon: 'ring',
    equip: { slot: 'accessory', mods: { spd: 6 } }, desc: 'SPD +6'
  }),
  ring_vigor: def({
    id: 'ring_vigor', name: 'Vigor Ring', kind: 'equipment', price: 240, icon: 'ring',
    equip: { slot: 'accessory', mods: { vit: 4, str: 2 } }, desc: 'DEF +4, ATK +2'
  }),
  amulet_star: def({
    id: 'amulet_star', name: 'Star Amulet', kind: 'equipment', price: 480, icon: 'amulet',
    equip: { slot: 'accessory', mods: { mdef: 8 }, mp: 25, resist: { dark: 0.5 } },
    desc: 'RES +8, MP +25, halves dark.'
  })
};

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item id: ${id}`);
  return d;
}

export function sellPrice(id: string, ratio = 0.5): number {
  return Math.floor(item(id).price * ratio);
}

/** Ids each shop counter sells, in display order. */
const GENERAL = ['potion_s', 'potion_l', 'antidote', 'ether', 'hero_bread', 'herb'];
const SMITH = [
  'sword_bronze', 'sword_iron', 'axe_bone', 'spear_ashen', 'shield_wood',
  'shield_iron', 'helm_cloth', 'helm_iron', 'armor_leather', 'armor_chain'
];
const LATE = [
  'elixir', 'ether_l', 'revive', 'bomb', 'ball', 'sword_star', 'staff_star',
  'shield_star', 'robe_sage', 'armor_star', 'ring_speed', 'ring_vigor', 'amulet_star'
];

export const SHOP_STOCK: Record<string, string[]> = {
  general: GENERAL,
  smith: SMITH,
  late: LATE,
  village: [...GENERAL, ...SMITH],
  road: ['potion_s', 'antidote', 'herb', 'hero_bread', 'torch', 'axe_bone', 'shield_wood'],
  ruins: [...GENERAL.slice(0, 4), ...LATE],
  /** Sell-only counter. */
  sell: []
};