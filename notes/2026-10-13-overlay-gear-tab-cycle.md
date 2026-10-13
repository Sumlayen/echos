# Overlay menu: tab strip stuck on GEAR

| | |
| --- | --- |
| **Branch** | `fix/overlay-gear-tab-cycle` |
| **Base** | `develop` (created from `main` at `cfac8be`) |
| **Commit** | `45a186c` — *Fix the menu tab strip getting stuck on GEAR* |
| **Date** | 2026-10-13 |
| **PR** | [#1](https://github.com/Sumlayen/echos/pull/1) — `fix/overlay-gear-tab-cycle` → `develop` |

---

## Summary

Two tabs of the overlay menu swallowed the arrow keys, so the tab strip at the top
of the menu could not be walked past them. GEAR trapped `←`/`→` in the equipment
slot cursor, and SETTINGS trapped every key, making it reachable but never
leavable except by closing the whole menu. Both are fixed, and the e2e suite now
watches the tab strip directly so this class of bug cannot come back silently.

## Symptom

Open the menu with `Esc`, then walk right with the arrow keys:

```
party -> items -> gear -> gear -> gear -> ...   (never leaves GEAR)
```

`Q`/`Shift` still jumps over GEAR, but the arrows — the keys the README tells the
player to navigate menus with — stop working. Worse, once `Q` lands on SETTINGS,
`←` `→` `↑` `↓` `Q` and `Shift` all do nothing; the only key that responds is
`Esc`/`X`, and that closes the entire menu rather than moving one tab.

## Root cause

`OverlayScene.handle()` dispatches per tab and each branch `return`s, so a branch
that claims a key prevents the tab-cycling code below it from ever running.

**1. GEAR wrapped its slot index instead of yielding the arrows.**
`moveSlot()` did `this.slot = (this.slot + dir + count) % count`, so `→` at
TRINKET wrapped to WEAPON and the strip never advanced:

```ts
const count = EQUIP_SLOTS.length;
this.slot = (this.slot + dir + count) % count;
```

**2. SETTINGS returned for every key, including the tab cycler.**

```ts
if (this.tab === 'settings') {
  if (key === 'UP' || key === 'DOWN' || key === 'LEFT' || key === 'RIGHT') this.form?.key(key);
  return;   // Q / Shift fell through this return too
}
```

## Change

- `moveSlot()` no longer wraps. Rolling off either end of `EQUIP_SLOTS` calls
  `cycleTab(dir)`, so `→` past TRINKET steps onto QUESTS and `←` at WEAPON steps
  back onto ITEMS. Slots still cycle normally inside the tab.
- The SETTINGS branch now routes `SPECIAL` (`Q`/`Shift`) to `cycleTab(1)`; the
  arrows stay with the settings form.
- Hint lines on both tabs now advertise `[Q] TABS`, matching the footer bar that
  already advertised it.
- `README.md` controls and testing sections updated.

After the fix:

```
RIGHT walk: items/0 gear/0 gear/1 gear/2 gear/3 gear/4 quests/4 save/4 settings/4
LEFT  walk: gear/4 -> gear/3 gear/2 gear/1 gear/0 items/0
```

## Verification

```
npm run typecheck   clean
npm test            6/6 pass
npm run e2e         43 checks pass (was 38), no console errors
```

Five new checks in `scripts/e2e.mjs`, reading `OverlayScene.tab` / `.slot`
straight off the live scene rather than counting keypresses:

1. `arrow right walks the whole tab strip (no dead end on GEAR)` — all six tabs visited
2. `gear slots still cycle inside the GEAR tab` — guards against over-fixing
3. `Q walks out of the SETTINGS tab`
4. `arrow left rolls off GEAR onto the previous tab`
5. `menu still closes after tab walking`

**Proof the checks have teeth:** with both fixes temporarily reverted, exactly the
four tab checks failed —

```
FAIL gear slots still cycle inside the GEAR tab — [0,1,2,3,4,0,1,2,3,4,0,...]
```

— and the suite returned to 43/43 green once the fix was restored.

## Files touched

| Path | Why |
| --- | --- |
| `src/scenes/OverlayScene.ts` | The fix: `moveSlot()` rolls off into `cycleTab()`, SETTINGS branch stops swallowing `SPECIAL`, two hint lines updated |
| `scripts/e2e.mjs` | Five regression checks + `overlayTab()` / `walkTabs()` helpers |
| `README.md` | Controls section documents the roll-off rule; testing section mentions the tab-strip check |
| `notes/` | This file, and the notes convention |

## Known limitations

- **`Shift` does not step backwards.** `src/ui/Keys.ts` maps both `Q` and `Shift`
  to the single `SPECIAL` action, so direction is indistinguishable at the call
  site. From SETTINGS, `Q` cycles forward and wraps to PARTY. Making `Shift` mean
  "previous tab" means splitting `SPECIAL` into `TAB_NEXT`/`TAB_PREV` and updating
  the four dialogue/story call sites that use it as advance/skip — deliberately
  left out of a menu-navigation bugfix.
- The roll-off only applies to GEAR, the one tab that claims `←`/`→` for its own
  cursor. PARTY, ITEMS, QUESTS and SAVE keep plain tab cycling.

## PR body

> **Fix the menu tab strip getting stuck on GEAR**
>
> GEAR is the only tab that claims `←`/`→` for its own cursor, and `moveSlot()` wrapped the slot index — so the arrows cycled the equipment slots forever and the strip never moved past GEAR. Rolling off either end of the slot list now steps onto the neighbouring tab: slots still cycle inside the tab, and the whole strip is walkable in both directions.
>
> SETTINGS had the same class of bug — its branch returned for every key, including the `Q`/`Shift` tab cycler, so the only way out was `Esc`/`X`, which closes the entire menu. `Q`/`Shift` now cycles tabs from SETTINGS too, and both tabs' hint lines say `[Q] TABS`.
>
> **Tests:** five new e2e checks (strip walks right through GEAR to SETTINGS; gear slots still cycle inside the tab; `Q` leaves SETTINGS; `←` rolls off GEAR back to ITEMS; menu still closes afterwards). 43 checks pass, typecheck and unit tests clean. The four tab checks fail on the unfixed code.
>
> **Not covered:** `Shift` still does not step to the previous tab, because `Keys.ts` maps `Q` and `Shift` to the same `SPECIAL` action. See `notes/2026-10-13-overlay-gear-tab-cycle.md`.
