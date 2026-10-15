# A playthrough now opens kitted out, and the currency is called gil

| | |
| --- | --- |
| **Branch** | `feat/starting-kit-gil` |
| **Base** | `develop` at `9854f34` (the notes link) |
| **Commits** | `8ee5b6c` — Give the party a starting kit, and call the currency gil<br>`1817650` — Cover the opening kit with unit tests and e2e probes<br>plus the commit that amends this file (`git log --oneline notes/`) |
| **Date** | 2026-10-15 |
| **PR** | [#5](https://github.com/Sumlayen/echos/pull/5) — `feat/starting-kit-gil` → `develop` |

---

## Summary

A new game used to open with **0 coin, no weapon and no armour**: the party walked into
the Ashen Wood swinging fists, and the first shop visit was a chore rather than a
choice. It now opens with **400 GIL**, **five Traveler Salves** and a worn set of gear,
declared as data in `src/data/StartingKit.ts`. Kael walks in with his (sword, buckler,
cap, vest, band); Lyra and Rowan, who are recruited by dialogue rather than at the
title screen, get theirs at whatever level they join at.

Alongside it, the currency is renamed **coin/gold → gil** everywhere a player can see
it and in the state that carries it: `GameState.gil`, `BattleRewards.gil`,
`EnemyDef.gil`, `QuestDef.reward.gil`, `ChestDef.gil`, `DialogueEffect.gil`, the
`gil:changed` bus event and the HUD strings. The save payload moves to **version 4**
and still loads v3 saves, which wrote the purse as `gold`.

Two things needed deciding rather than just doing, and both are called out below: the
**balance** of starter gear against the smith's ladder, and the **heal formula** for an
item that scales with max HP.

## Request

- Give the party a starting kit: some gold, some potions, and gear.
- Call the currency *gil*.

## Decisions

**Starter gear sits a rung below the shop, and is never sold or dropped.** The forge
ladder (`bronze → iron → star`) was tuned as it was; a starter piece that doubled as a
shop line would either be bought back after being sold or quietly replace a tier. So
the ten kit pieces (`sword_worn`, `staff_chipped`, `dagger_worn`, `buckler_worn`,
`cap_padded`, `vest_padded`, `robe_linen`, `ring_bronze`, `charm_star`,
`band_leather`) exist only as the kit. They are priced 15–25 — about a third of the
smith's entry tier (bronze sword 60, wooden shield 45, leather armor 80, travel hood
35) — so the whole kit resells for 7–12 a piece at `BALANCE.sellRatio`, which is pocket
money rather than an exploit. A unit test asserts no kit piece appears in any
`SHOP_STOCK` list, so the rule cannot rot.

**The kit is applied in `createMember()`, not in `startNew()`.** Recruits created later
(`state.recruit('rowan', 4)` from a dialogue beat) go through the same factory, so a
late joiner arrives dressed instead of naked. `startNew()` only handles the purse and
the potions.

**Starting gear is worn from the first step, so it is in the opening HP/MP pools.**
`createMember()` sums the `hp`/`mp` bonuses of the kit into the starting `hp`/`mp`.
Without that, Kael's bar would read 60/72 on the world map — the gauge showing a
wound that was never taken.

**The weapon rule for Lyra had to stop naming items.** `canEquip()` used to whitelist
`staff_oak` and `staff_star` by id, which silently rejected `staff_chipped` and would
reject every staff added later. It is a prefix rule now (`itemId.startsWith('staff')`
for her, and no staff for anyone else), matching the rule that was already there for
the other direction.

**400 GIL, and it is a head start rather than a purchase.** The smith's whole entry
tier — bronze sword 60, wooden shield 45, leather armor 80, travel hood 35 — comes to
220, so the purse buys that and still leaves 180 for potions, an inn night and the
first few chests' worth of temptation. It is `BALANCE.startingGil`, so re-tuning it is
a constants edit.

**The Traveler Salve heals `10% of max HP, never less than 15`.** A flat 40 HP salve
is worth a fifth of a level-1 bar and nothing by level 20; a pure percentage item is
worth nothing at level 1. The floor is what keeps it useful on both ends: 15 HP on a
72 HP level-1 bar (10% would be 7), the percentage takes over from level 7 onward, and
it passes the 12-gil Salve's flat 40 at level 22 for Kael in the kit — sooner once
better gear lifts the bar. The formula lives in one exported helper,
`itemHealAmount(eff, maxHp)` in
`src/data/Items.ts`, and both call sites — the field menu (`OverlayScene.useItem`) and
the battle engine (`BattleEngine.doItem`) — go through it, so a potion cannot heal one
number on the map and another in battle. `ItemEffect` gained `hpPct` and `hpMin`;
flat `hp` still works and still stacks with a percentage if a future item wants both.

**Why a save version bump.** `SavePayload.gold` → `SavePayload.gil` is a field rename
in a versioned envelope, so v3 saves would have loaded with `undefined` for the purse.
`gilFromSave(p)` (`GameState.ts`) reads `p.gil ?? p.gold ?? 0` and is used by both
`GameState.load()` and `SaveManager.meta()`, so an old slot keeps its money and the
title-screen slot list still shows it. `SAVE_VERSION` is 4; nothing else about the
envelope changed.

## Change

**New data**

- `src/data/StartingKit.ts` — `STARTER_GEAR` (character id → slot → item id) and
  `starterGear(id)`, which returns an empty set for a character with no kit.
- `src/data/Items.ts` — the starter pieces under a "the starting kit" comment, plus
  `potion_traveler` (Traveler Salve, `hpPct: 0.1, hpMin: 15`), the `hpPct`/`hpMin`
  fields on `ItemEffect`, and the `itemHealAmount()` helper.
- `src/config/constants.ts` — `BALANCE.startingGil: 400`, `BALANCE.startingItems:
  { potion_traveler: 5 }`, `SAVE_VERSION = 4`.
- `src/art/IconArt.ts` — a `dagger` icon (the sword silhouette at half blade) wired
  into `ICONS`, so `dagger_worn` is not drawing a placeholder.

**State**

- `createMember()` builds the kit into `equipment` and folds its `hp`/`mp` bonuses into
  the opening bars; `startNew()` sets the purse and grants the potions.
- `gold` → `gil` on `GameState`, `SavePayload`, `SaveMeta`, and every method that
  touches it (`buy`, `sell`, `serialize`, `load`).
- `gilFromSave()` for the v3 fallback.

**Battle**

- `BattleRewards.gold` → `.gil`, `BattleUnit.gold` → `.gil`; `foeUnit()` and
  `victory()` follow; `doItem()` heals through `itemHealAmount()`.

**Views and content**

- HUD and menus read `GIL`: `WorldScene` (purse line, chest toast, inn refusal),
  `OverlayScene` (purse label, shop and sell prices, "NOT ENOUGH GIL"), `BattleScene`
  (victory tally), `EndScene` (run summary), `DialogueRuntime` (give/take notify).
- `EnemyDef.gil`, `QuestDef.reward.gil`, `ChestDef.gil`, `DialogueEffect.gil`, and the
  copy that used to say coin (`World.ts` chest message, two `Dialogue.ts` lines).

## New tests and checks

`tests/starting-kit.test.ts` (15 tests):

- the purse opens at 400 GIL, buys, refuses what is too rich, resells at
  `BALANCE.sellRatio`, and survives a save round trip;
- a hand-built **v3 payload with `gold` and no `gil`** loads as 123 GIL, and
  `gilFromSave()` is checked directly;
- five Traveler Salves at the start, and **no kit piece or the salve appears in any
  `SHOP_STOCK` list**;
- every kit entry is a real `ITEMS` entry whose `equip.slot` matches the slot it is
  filed under, and each character wears exactly the declared set;
- the bars start full with gear on, and the padded vest + bronze band are worth exactly
  12 max HP;
- `gearStats()` moves STR by the sword's `mods.str`, so the gear reaches combat maths;
- a level-4 `recruit('rowan', 4)` gets the kit;
- `canEquip` still bars Lyra from swords and everyone else from staves, and now allows
  her the `staff_chipped` that the old id whitelist rejected;
- `itemHealAmount` at the floor (20 or 72 HP → 15), at the crossover (154 → 15,
  155 → 16) and at 216 HP → 22; flat potions unaffected;
- a seeded battle: using the salve emits a `heal` event of exactly **15** on the actor
  — the floor, not 10% of a 72 HP bar (7) — and consumes one.

`scripts/e2e.mjs` — five new checks in the real browser, run before any battle or
`buffParty()` can move the numbers: 400 GIL, 5 salves, the **field HUD label reads
`400 GIL`**, every member has a weapon equipped, and at least four slots filled. The
probe reads `Label.readable`, not `.text`: a `Label` is a textured `Image`, so the
string is not on `text` (the first version of the probe read an empty string and the
check failed for the wrong reason).

## Verification

```
npm run typecheck     # clean
npm test              # 29 passed (3 files) — 14 existing + 15 new
npm run e2e           # 126 PASS, no FAIL, no console errors
```

The e2e check count goes **121 → 126** with the five kit probes added. The run needs a
dev server on 5177 (`npx vite --port 5177 --host 127.0.0.1`) and writes its own log;
the new lines:

```
kit: gil=400 salves=5 weapons=sword_worn slots=5 hud=400 GIL
PASS a new game opens with 400 GIL — 400
PASS a new game opens with 5 Traveler Salves — 5
PASS the field HUD reads the purse in GIL — 400 GIL
PASS every member walks in armed — sword_worn
PASS the starting kit fills the armour slots too — 5
```

**The new tests have teeth** — both were confirmed by switching the feature back off:

```
# starterEquipment() forced to return an empty kit
  × the starting kit > dresses each character the way the kit says
  × the starting kit > is worn from the first step, bars included
  × the starting kit > moves the combat stats the gear claims to
  × the starting kit > reaches late recruits too
  Tests  4 failed | 11 passed (15)

# gilFromSave() reduced to `p.gil ?? 0`
  × the starting purse > still reads a v3 save that wrote the purse as `gold`
  AssertionError: expected +0 to be 123
  Tests  1 failed | 14 passed (15)
```

The e2e HUD probe also failed for a real reason on the way in: it first read `o.text`,
which a `Label` does not have, so the collected list was empty and the check failed
even though the HUD was drawing `400 GIL`. Reading `Label.readable` fixed the probe.

`grep -rn "gold\|COIN" src --include=*.ts` now returns only palette/UI colour names
(`Palette.gold`, `Window.gold`, `UIArt.win_gold`, `P.gold` tints) and the comments that
explain the v3 fallback — i.e. no live currency is called gold any more.

## Files touched

```
src/data/StartingKit.ts             new — the kit as data
src/data/Items.ts                   starter pieces, Traveler Salve, hpPct/hpMin, itemHealAmount
src/art/IconArt.ts                  dagger icon
src/config/constants.ts             startingGil, startingItems, SAVE_VERSION 4
src/core/GameState.ts               kit into createMember, gil, gilFromSave, Lyra's staff rule
src/core/SaveManager.ts             SaveMeta.gil, meta() through gilFromSave
src/core/EventBus.ts                'gold:changed' -> 'gil:changed'
src/battle/BattleEngine.ts          rewards/units in gil, item heals via itemHealAmount
src/battle/Types.ts                 BattleUnit.gil
src/data/{Enemies,Quests,World,Dialogue}.ts   gil fields + the copy that says gil
src/scenes/{World,Overlay,Battle,End}Scene.ts HUD, shop, chest, inn, tally, summary
src/ui/DialogueRuntime.ts           gil give/take
scripts/e2e.mjs                     kit probes; the probe reads Label.readable
tests/starting-kit.test.ts          new
README.md                           party / purse / persistence / testing sections
```

## Known limitations

- **The kit is not in the shop, so it is not restockable.** Selling all of it is a
  one-way door apart from the smith's own tiers. That is deliberate, but it is a new
  way to lose gear.
- **`potion_traveler.price` is 10 but it is never sold**, so the price only matters to
  the sell counter (5 gil back). It exists so the item is a well-formed `ItemDef`.
- **No new icon for the salve** — it reuses `potion_s`. A distinct small-pouch icon
  would read better in the item list, and `IconArt` has room for one.
- **`canEquip` still matches weapon ids by prefix.** It is consistent now, but it is
  still string matching rather than a `weaponClass` field on `EquipDef`; the day a
  staff-like item is named something else, that rule needs replacing.
- **v3 saves keep their money but not a kit.** A save made before this branch loads
  with whatever it had; the rename does not retro-dress an in-progress party. That is
  the right call for a mid-run save, and worth knowing when testing old slots.

## PR body

> **A new game now opens kitted out, and the currency is gil.**
>
> 400 GIL, five Traveler Salves and a worn set of gear per character, declared in
> `src/data/StartingKit.ts` and applied in `createMember()` so late recruits get a kit
> too. Starter gear sits a rung below the smith's stock and is never sold or dropped, so
> the bronze → iron → star ladder keeps the balance it was tuned on; a test asserts no
> kit piece reaches a shop shelf.
>
> The Traveler Salve heals `10% of max HP, never less than 15` — a fifth of a level-1
> bar, and still worth something twenty levels later. One helper, `itemHealAmount()`,
> used by both the field menu and the battle engine.
>
> `gold`/`COIN` → `gil` across state, engine, data and every HUD string. The save
> payload is version 4; `gilFromSave()` falls back to the old `gold` key, so v3 slots
> keep their money (tested).
>
> `npm run typecheck` clean · `npm test` 29 passed · `npm run e2e` 126 PASS, no
> console errors.
