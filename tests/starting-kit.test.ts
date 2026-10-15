/**
 * The opening kit: 400 GIL, five Traveler Salves and a worn set of gear on
 * every member — plus the maths behind the salve and the v3 -> v4 save rename
 * that came with calling the currency `gil`.
 *
 *   npx vitest run
 */

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/constants';
import { BattleEngine, partyUnit } from '../src/battle/BattleEngine';
import { gearStats } from '../src/battle/Damage';
import { GameState, gilFromSave, type SavePayload } from '../src/core/GameState';
import { ITEMS, SHOP_STOCK, itemHealAmount } from '../src/data/Items';
import { STARTER_GEAR } from '../src/data/StartingKit';

const fresh = (ids = ['kael']): GameState => {
  const state = new GameState();
  state.startNew(ids);
  return state;
};

const all = (): GameState => fresh(['kael', 'lyra', 'rowan']);

/** Out-runs every foe, so the party acts first and the tests stay stable. */
const fastParty = (state: GameState): GameState => {
  state.party.forEach((m) => {
    m.base.spd = 99;
  });
  return state;
};

describe('the starting purse', () => {
  it('opens at 400 GIL', () => {
    expect(BALANCE.startingGil).toBe(400);
    expect(fresh().gil).toBe(400);
    expect(all().gil).toBe(400);
  });

  it('spends and earns in GIL', () => {
    const state = fresh();
    const salve = ITEMS.potion_s.price ?? 0;
    expect(state.buy('potion_s')).toBe(true);
    expect(state.gil).toBe(400 - salve);
    expect(state.buy('armor_star')).toBe(false); // far out of reach at level 1
    expect(state.gil).toBe(400 - salve);

    expect(state.buy('sword_worn')).toBe(true);
    const sword = ITEMS.sword_worn.price ?? 0;
    expect(state.gil).toBe(400 - salve - sword);
    expect(state.sell('sword_worn')).toBe(true);
    const resale = Math.floor(sword * BALANCE.sellRatio);
    expect(state.gil).toBe(400 - salve - sword + resale);
  });

  it('survives a save round trip', () => {
    const state = fresh();
    state.gil = 613;
    const copy = fresh();
    copy.load(state.serialize());
    expect(copy.gil).toBe(613);
  });

  it('still reads a v3 save that wrote the purse as `gold`', () => {
    const state = fresh();
    const legacy = { ...state.serialize(), version: 3, gold: 123 } as SavePayload & { gold?: number };
    delete (legacy as { gil?: number }).gil;
    expect(legacy.gil).toBeUndefined();

    const copy = fresh();
    copy.load(legacy);
    expect(copy.gil).toBe(123);
    expect(gilFromSave(legacy)).toBe(123);
    expect(gilFromSave(state.serialize())).toBe(400);
  });
});

describe('the opening pack', () => {
  it('starts with five Traveler Salves', () => {
    expect(BALANCE.startingItems).toEqual({ potion_traveler: 5 });
    expect(fresh().itemCount('potion_traveler')).toBe(5);
    expect(ITEMS.potion_traveler.name).toBe('Traveler Salve');
    expect(ITEMS.potion_traveler.usable).toBe('both');
  });

  it('is not on any shop shelf', () => {
    const stocked = new Set(Object.values(SHOP_STOCK).flat());
    const kitIds = Object.values(STARTER_GEAR).flatMap((kit) => Object.values(kit ?? {}) as string[]);
    expect(kitIds.length).toBeGreaterThan(0);
    for (const id of kitIds) expect(stocked.has(id), `${id} should not be sold`).toBe(false);
    expect(stocked.has('potion_traveler')).toBe(false);
  });
});

describe('the starting kit', () => {
  it('files every piece as equipment in the slot it is listed under', () => {
    for (const [who, kit] of Object.entries(STARTER_GEAR)) {
      for (const [slot, id] of Object.entries(kit ?? {})) {
        const def = ITEMS[id];
        expect(def, `${who}: ${id} is missing from ITEMS`).toBeTruthy();
        expect(def?.equip?.slot, `${who}: ${id} does not fit ${slot}`).toBe(slot);
      }
    }
  });

  it('dresses each character the way the kit says', () => {
    const state = all();
    const worn = (id: string) => Object.fromEntries(state.equippedIn(id).map((e) => [e.slot, e.itemId]));
    expect(worn('kael')).toEqual({
      weapon: 'sword_worn',
      shield: 'buckler_worn',
      head: 'cap_padded',
      body: 'vest_padded',
      accessory: 'ring_bronze'
    });
    expect(worn('lyra')).toEqual({
      weapon: 'staff_chipped',
      head: 'cap_padded',
      body: 'robe_linen',
      accessory: 'charm_star'
    });
    expect(worn('rowan')).toEqual({
      weapon: 'dagger_worn',
      head: 'cap_padded',
      body: 'vest_padded',
      accessory: 'band_leather'
    });
  });

  it('is worn from the first step, bars included', () => {
    const state = all();
    for (const m of state.active) {
      expect(m.hp, `${m.id} should start at full with gear on`).toBe(state.memberMaxHp(m));
      expect(m.mp, `${m.id} should start at full with gear on`).toBe(state.memberMaxMp(m));
    }
    // 6 HP from the padded vest + 6 from the bronze band, on top of the pool.
    const kael = state.member('kael')!;
    const bare = fresh(['kael']);
    bare.unequip('kael', 'body');
    bare.unequip('kael', 'accessory');
    expect(state.memberMaxHp(kael) - bare.memberMaxHp(bare.member('kael')!)).toBe(12);
  });

  it('moves the combat stats the gear claims to', () => {
    const state = fresh(['kael']);
    const withGear = gearStats(partyUnit(state, state.member('kael')!, 0));
    state.unequip('kael', 'weapon');
    const without = gearStats(partyUnit(state, state.member('kael')!, 0));
    expect(withGear.str - without.str).toBe(ITEMS.sword_worn.equip?.mods?.str ?? 0);
  });

  it('reaches late recruits too', () => {
    const state = fresh(['kael']);
    const rowan = state.recruit('rowan', 4);
    expect(rowan.equipment.weapon).toBe('dagger_worn');
    expect(rowan.equipment.accessory).toBe('band_leather');
  });

  it('keeps the weapon rules intact', () => {
    const state = all();
    expect(state.canEquip('lyra', 'staff_chipped')).toBe(true);
    expect(state.canEquip('kael', 'staff_chipped')).toBe(false);
    expect(state.canEquip('rowan', 'sword_worn')).toBe(true);
    expect(state.canEquip('lyra', 'vest_padded')).toBe(true);
  });
});

describe('the Traveler Salve', () => {
  const salve = ITEMS.potion_traveler.effect!;

  it('heals 10% of max HP with a 15 HP floor', () => {
    expect(salve.hpPct).toBeCloseTo(0.1, 6);
    expect(salve.hpMin).toBe(15);
    // The floor carries it early...
    expect(itemHealAmount(salve, 20)).toBe(15);
    expect(itemHealAmount(salve, 72)).toBe(15);
    // ...and the percentage takes over just past a 150 HP bar (it rounds).
    expect(itemHealAmount(salve, 150)).toBe(15);
    expect(itemHealAmount(salve, 154)).toBe(15);
    expect(itemHealAmount(salve, 155)).toBe(16);
    expect(itemHealAmount(salve, 216)).toBe(22);
  });

  it('leaves the flat potions alone', () => {
    expect(itemHealAmount(ITEMS.potion_s.effect!, 200)).toBe(40);
    expect(itemHealAmount(ITEMS.potion_l.effect!, 200)).toBe(ITEMS.potion_l.effect?.hp ?? 0);
    expect(itemHealAmount({}, 200)).toBe(0);
  });

  it('heals exactly the floor in battle at level 1', () => {
    const state = fastParty(fresh(['kael']));
    const engine = new BattleEngine(state, null, ['wolf'], { seed: 7 });
    engine.start();

    const me = engine.party[0];
    expect(me.maxHp).toBe(state.memberMaxHp(state.member('kael')!));
    me.hp = 10;

    const events = engine.choose({ kind: 'item', itemId: 'potion_traveler' });
    const heal = events.find((e) => e.t === 'heal') as { t: string; to: string; amount: number } | undefined;
    expect(heal?.t).toBe('heal');
    expect(heal?.to).toBe('p0');
    // The floor is what lands: 10% of a 72 HP bar would only be 7.
    expect(heal?.amount).toBe(15);
    expect(state.itemCount('potion_traveler')).toBe(4);
  });
});


