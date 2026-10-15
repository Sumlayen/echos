/**
 * What each character walks into the story wearing.
 *
 * Applied inside `GameState.createMember()`, so it lands on the opening party
 * *and* on anyone recruited later — a late recruit is not sent out in their
 * underwear. The one exception is the story reward gear
 * (`sword_star` / `amulet_star`), which is handed out by the ending and stays
 * out of here.
 *
 * Every piece is defined in `src/data/Items.ts` under "the starting kit" and is
 * deliberately a rung below the smith's stock: not sold, not a drop, so the
 * bronze -> iron -> star ladder keeps the balance it was tuned on.
 */

import type { EquipSlot } from './Items';

export const STARTER_GEAR: Record<string, Partial<Record<EquipSlot, string>>> = {
  kael: {
    weapon: 'sword_worn',
    shield: 'buckler_worn',
    head: 'cap_padded',
    body: 'vest_padded',
    accessory: 'ring_bronze'
  },
  lyra: {
    weapon: 'staff_chipped',
    head: 'cap_padded',
    body: 'robe_linen',
    accessory: 'charm_star'
  },
  rowan: {
    weapon: 'dagger_worn',
    head: 'cap_padded',
    body: 'vest_padded',
    accessory: 'band_leather'
  }
};

/** The starting kit for a character id, or an all-empty set if they have none. */
export function starterGear(id: string): Partial<Record<EquipSlot, string>> {
  return STARTER_GEAR[id] ?? {};
}