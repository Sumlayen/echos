# Echoes of the Fallen Star

A small, story-driven JRPG in the 16-bit side-view tradition, running in the browser.
TypeScript + [Phaser 3](https://phaser.io) + Vite — and **every asset is generated in code
at boot**: sprites, tiles, portraits, the 5×7 pixel font, spell effects, UI chrome, music
and sound effects. There are no PNGs, WAVs or tileset files in this repository; the whole
game is ~11.8k lines of source.

```
npm install
npm run dev          # http://127.0.0.1:5173/
```

---

## Table of contents

- [Quick start](#quick-start)
- [Controls](#controls)
- [What's in the game](#whats-in-the-game)
- [Testing](#testing)
- [Pull requests](#pull-requests)
- [Debug hooks](#debug-hooks)
- [Project layout](#project-layout)
- [How it's put together](#how-its-put-together)
- [Known gaps](#known-gaps)

## Quick start

Requires **Node 18 or newer**.

| Command | What it does |
| --- | --- |
| `npm install` | Installs Phaser, Vite, TypeScript, Vitest, playwright-core. |
| `npm run dev` | Vite dev server on `http://127.0.0.1:5173/` (bound to `127.0.0.1`). |
| `npm run typecheck` | `tsc --noEmit` over `src`, `tests`, `scripts`. |
| `npm test` | Vitest unit tests (`tests/`). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run e2e` | Headless browser smoke test — see [Testing](#testing). |
| `npm run build` | Typecheck, then production bundle to `dist/`. |
| `npm run preview` | Serve the built bundle on `http://127.0.0.1:4173/`. |

The stage renders at a fixed **640×360** internal resolution with nearest-neighbour
scaling (`Phaser.Scale.FIT`), so it letterboxes cleanly at any window size.


## Controls

Input is a per-frame queue of semantic actions (`src/ui/Keys.ts`), not raw key checks —
remapping, or adding a gamepad, is a change to that one file.

| Action | Keys |
| --- | --- |
| Move / navigate menus | `WASD` or arrow keys |
| Confirm, interact, advance dialogue | `Enter`, `Space`, `Z` |
| Back / cancel | `Esc` (menu), `X` or `Backspace` (cancel) |
| Fast-forward dialogue, cycle menu tabs | `Q` or `Shift` |
| Open the party menu | `Esc` in the overworld |

The overlay menu (`OverlayScene`) carries **Party · Items · Gear · Quests · Save ·
Settings**, plus **Buy / Sell** inside the shop. On most tabs `←`/`→` moves between tabs;
the Gear tab gives them to the equipment slots instead, and rolling off either end of the
slot list steps onto the neighbouring tab. `Q`/`Shift` cycles tabs from any tab, including
Settings (whose arrows belong to the form). Settings covers music level, SFX level,
dialogue speed (characters per second), shortened battle animations, and screen shake.

## What's in the game

**Overworld.** Seven hand-authored maps — `village`, `forest`, `road`, `ruins`, `inn`,
`shop`, `library` — written as ASCII grids with a terrain/prop legend, so maps stay editable
and diffable as text. Tile collision, map warps, chests with flag-tracked loot, signposts,
NPCs, an inn that rests the party, a shop, one-shot story triggers, and per-map random
encounter rates.

**Party.** Three predefined characters with their own personalities, skills and equipment
growth — **Kael**, **Lyra** and **Rowan**. A new playthrough opens kitted out: **400 GIL**,
five **Traveler Salve** potions, and each character wears a worn kit of their own — declared
in `src/data/StartingKit.ts` and applied inside `createMember()`, so a character recruited
later in a run arrives dressed rather than naked. The kit pieces sit a rung below the
smith's stock and are never sold, so the bronze → iron → star ladder keeps the balance it
was tuned on.

**Battles.** Side-view, turn order driven by speed, run by a pure engine
(`src/battle/BattleEngine.ts`) that is fully decoupled from the Phaser scene. Commands are
`ATTACK / SKILL / GUARD / ITEM / FLEE` with target selection. Content includes 8 enemy types
(`wolf`, `wisp`, `beetle`, `bat`, `wraith`, `ent`, `sentinel`, and the phased boss `warden`)
with weighted per-map encounter groups and scripted story line-ups, enemy AI with per-action
use limits, 13 status effects (poison, burn, freeze, sleep, stun, curse, blind, slow, sink,
silence, raise, ward, haste), elemental resistances, crits, guard stances, XP and level-ups,
gil, item drops, and a flee roll that scales with the party's speed advantage — locked
entirely in boss and scripted fights. Losing sends the party home, revived and lighter on
gil, rather than ending the run.

**Story.** Six data-driven beats (`arrival`, `first_wraith`, `hermit_offer`, `ruins_gate`,
`boss_warden`, `ending`) that play dialogue over a backdrop, hand off to a fixed battle,
then resume the aftermath — plus three quests (`q_wolves`, `q_lantern`, `q_warden`) tracked
in the journal.

**Persistence.** Four `localStorage` save slots (`eotfs.save.v1`, a versioned envelope with
an FNV-1a checksum so a truncated save fails closed instead of corrupting a run) and
separate settings storage. The payload is at **version 4**, which renamed the currency field
`gold` → `gil`; older saves still load because `gilFromSave()` falls back to the `gold` key.
The title screen offers New Game / Continue / Settings / Credits.

**Presentation.** All art is drawn procedurally into textures at boot (`src/art/`), and all
audio is synthesised with the Web Audio API (`src/audio/Audio.ts`) — Phaser's own audio is
disabled (`audio: { noAudio: true }`) because the game supplies its own themes and SFX.
Full-screen backdrops (`src/art/BackdropArt.ts`) get their depth from three flat silhouette
layers and a single light source, not from corner vignetting: scattering ink pixels over the
frame edges read as film grain rather than as 16-bit art. The title screen is a dawn over
the Ashen Wood with the star already down — logo lockup high, menu a centred column on a
panel frame — and every element is placed from the live stage, so it survives a window drag.

## Testing

Three layers, all runnable from the repo root.

```bash
npm run typecheck          # tsc --noEmit — must stay clean
npm test                   # vitest run — engine unit tests
npm run test:watch         # while iterating on the engine
```

The unit tests (`tests/battle-engine.test.ts`, `tests/starting-kit.test.ts`) exercise the
engine and the save state directly, with no
browser: the round queue advancing after a command, every party member being commanded
before foes act, locked fights refusing a flee, the escape roll producing a `fled` result,
`fleeChance` scaling with speed inside its cap, and boss battles zeroing the flee chance —
plus the opening purse (400 GIL, five Traveler Salves, v3 `gold` saves still loading), the
starter gear each character wears, and the Traveler Salve's `10% of max HP, never under 15`
heal formula (`itemHealAmount`) both on paper and through a real battle event.

The end-to-end test drives the **real game in a real browser with real key presses**, then
forces every battle-exit path and screenshots each one. It expects a dev server on port
5177, so use two terminals:

```bash
# terminal 1
npx vite --port 5177 --host 127.0.0.1

# terminal 2
npm run e2e
```

It boots the game, walks title → overworld, then asserts on **victory, flee, story hand-off
(resuming the aftermath), story flee, a stale `returnTo` falling back to the overworld, and
defeat (revive + send home)**, plus an empty battle request bailing out cleanly. It then
restarts the overworld with a direction key held and asserts that **walking still works in every
direction afterwards** (Phaser detaches a scene's `Key` objects on shutdown, so a stale held-key
cache leaves one direction stuck on and kills the rest), that nothing drifts with no keys held,
that **`Esc` both opens and closes the menu**, and that the menu's **tab strip is walkable end
to end** (no tab may swallow the arrow keys). Any
`console.error`, `console.warn` or page error fails the run, and so does any failed
assertion (non-zero exit). It reads the menu cursor back instead of blindly counting arrow
presses, so it fails loudly if a menu becomes unreachable or invisible.

Overrides: `URL=...` and `SHOT_DIR=...` (default `tmp_e2e/`). Start clean with
`rm -f tmp_e2e/*.png tmp_e2e_run.log`, then check the result with:

```bash
grep -c PASS tmp_e2e_run.log
grep -n "FAIL\|aim-miss\|pageerror" tmp_e2e_run.log || echo NO_FAILURES
```

The script uses `playwright-core`; if no Playwright-managed Chromium is installed it falls
back to your installed Chrome.

## Pull requests

Branches come off **`develop`** (`main` stays the released line). Every pull request
ships with a notes file in [`notes/`](notes/README.md) — written on the branch, so it
lands in the PR diff and can be read from the merge commit later:

```
notes/<YYYY-MM-DD>-<branch-slug>.md      e.g. notes/2026-10-13-overlay-gear-tab-cycle.md
```

Each file records the symptom and how to reproduce it, the root cause with the offending
code quoted, what the change does, the **actual** verification output (including the
before-fix failure that proves a regression check has teeth), files touched, and what was
deliberately left unfixed. The last section is the PR description, ready to paste.

## Debug hooks

Append **`?debug=1`** to the URL to expose `window.game` and `window.session` (see
`src/main.ts`). That is what the e2e script uses to jump straight into a fight:

```js
// browser console at http://127.0.0.1:5173/?debug=1
session.battle = { foes: ['wolf', 'wolf'], backdrop: 'arena_forest', flee: true, seed: 4 };
game.scene.stop('WorldScene');
game.scene.start('BattleScene');
```

`BattleRequest.seed` makes a fight fully reproducible — the same seed replays identically,
which is how the e2e flee assertions stay deterministic.

## Project layout

```
src/
  art/        procedural textures: tiles, props, backdrops, humanoids, enemies,
              icons, effects, UI chrome, the 5x7 font, shared palette
  audio/      Web Audio synthesis: SFX, note tables, looping themes, ducking
  battle/     BattleEngine (pure logic), Damage, Status, shared types
  config/     tuning constants: view size, tile size, animation timing, balance
  core/       GameApp, GameState, Session (scene hand-off), Rng, SaveManager,
              Settings, EventBus
  data/       all content as data: World maps, Enemies, Skills, Items, Story,
              Quests, Dialogue, StartingKit, CharacterSpecs
  scenes/     Boot, Title, Story, World, Battle, Overlay, End
  ui/         Dialog, DialogueRuntime, Window (Panel / MenuList), Text, Keys
tests/        vitest engine tests
scripts/      e2e.mjs — headless browser smoke test
notes/        one Markdown file per pull request: symptom, root cause, verification
docs/         visual-research.md — the art and animation references behind the look
```

## How it's put together

- **Content is data.** Maps are ASCII grids; story beats, enemies, skills, items and quests
  are plain typed tables. Re-timing a scene or re-balancing a fight is a data edit, not a
  code edit. Balance numbers live in `src/config/constants.ts`.
- **The battle engine has no Phaser dependency.** It returns arrays of `BattleEvent`s and
  waits on `awaitingInput()`; `BattleScene` only animates them and maps input to commands.
  That is what makes the engine unit-testable and seeded replays possible.
- **Seeded RNG everywhere** (`src/core/Rng.ts`). Battles take a seed, so a scripted fight
  replays identically — used by both the e2e script and the unit tests.
- **Scene hand-off through `session`.** `session.battle` is the request, `session.returnTo`
  names the scene to come back to, and story beats resume their aftermath. `BattleScene`
  always clears the request and falls back to the overworld when `returnTo` names a scene
  that is no longer running.
- **Menus are one component.** `MenuList` in `src/ui/Window.ts` handles wrapping, disabled
  entries, notes, icons, scrolling and draw order (`depth` / `pin`). Battle menus need a
  `depth` above their panel but must *not* be pinned, because pinning also changes scrolling.
- **Strict TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`.

## Known gaps

- The on-page hint bar in `index.html` advertises `1-5` battle quick commands; those keys
  are not wired up yet (battle commands are cursor-driven).
- The CRT scanline layer is styled in `index.html` but is not yet toggled from the settings
  menu.
- No gamepad or touch input, no localisation layer, and no CI workflow yet.
- No license has been chosen; the package is marked `private` for now.
