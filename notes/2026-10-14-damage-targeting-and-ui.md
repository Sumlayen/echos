# Battle HUD: bars advance with the event queue, damage numbers show up

| | |
| --- | --- |
| **Branch** | `fix/damage-targeting-and-ui` |
| **Base** | `develop` at `2e9b438` (the title-screen notes link) |
| **Commits** | `ca8bbc5` — Advance the battle HUD with the event queue<br>`f26243a` — Pin the battle timing down with engine and e2e checks<br>plus the commit that adds this file (`git log --oneline notes/`) |
| **Date** | 2026-10-14 |
| **PR** | not opened yet — `fix/damage-targeting-and-ui` → `develop` |

---

## Summary

Committing ATTACK resolved the entire round inside one synchronous
`choose()` call, and the HUD painted live unit state — so the party bar
dropped to its end-of-round value before a single foe had moved. It read
exactly as the player damaging themselves. The scene now keeps a `shown`
map of HP, MP and aliveness as the player has seen them, advanced one event
at a time. Damage numbers, which were white text drawn on top of the unit's
own name label and therefore invisible, now read clearly, and the combat
log carries the numbers too.

The engine's targeting was audited first and was never wrong: 150 seeded
battles, 1501 hit events, zero same-side violations. The bug lived entirely
in the view.

## Symptom

**Party bar drops before anything moves.** Press ENTER on ATTACK. The
command menu closes, and Kael's HP bar slides down immediately while the
party sprites are still standing still and no foe has lunged. Nothing
visually connects the loss to the wolf that eventually bites.

**Damage numbers are invisible.** A hit on the Ashen Wolf produced a number,
but it was drawn at `y - 42` — the wolf's name plate occupies `y - 48` and
its HP gauge sits at `y - 38` — in white, on top of the name text. At the
stage's pixel scale the two sets of glyphs overlapped and the number could
not be read.

**The log has no numbers.** A round of clean hits logged only
`KAEL ATTACKS.` / `ASHEN WOLF FALLS.`. A hit that did not kill left no
trace at all.

## Root cause

**1. The whole round resolved before a single frame was drawn.**
`BattleScene.submit()` (develop) handed the command to the engine and stored
the events, but `BattleEngine.choose()` had already mutated every unit:

```ts
private submit(action: BattleAction): void {
  ...
  this.mode = 'idle';
  this.hold = 0;
  this.pending = this.engine.choose(action);
}
```

`choose()` runs the party's queued actions and every foe's action, so by the
time it returns, `unit.hp` is the end-of-round number while `pending` still
holds the events that explain it.

**2. `refreshAll()` painted that end state.** Every bar, text label and name
colour read the live model:

```ts
private refreshAll(): void {
  for (const row of this.rows) {
    const u = row.unit;
    row.hp.set(u.maxHp > 0 ? u.hp / u.maxHp : 0, true);
    row.mp.set(u.maxMp > 0 ? u.mp / u.maxMp : 0, true);
    row.hpText.setText(`${u.hp}/${u.maxHp}`);
```

`play()` ends with `this.refreshAll()`, so the first repaint after `submit()`
— one frame later, before any event had been shifted off `pending` — painted
the whole round at once.

**3. `float()` drew over the name plate.** The label went to `v.home.y - 42`
in `C.text` (white). The foe name label is at `y - 48` and the gauge at
`y - 38`, so the number landed between them, over the name glyphs.

**4. MP had the same desync.** A skill's cost was deducted in `doSkill()`
during `choose()`, so the caster's MP bar emptied the moment the menu closed,
before the cast animated.

## Change

- **`shown` map in `BattleScene`.** `Map<uid, { hp, mp, alive }>` seeded in
  `create()` before `engine.start()`, so the first event animates from what
  the player is already looking at.
- **`applyShown(e)` runs at the top of `play()`.** `hit` subtracts, `heal`
  adds (clamped to `maxHp`), `death` zeroes and greys, `revive` restores,
  `use` spends MP. A miss carries `damage: 0`, so it correctly changes
  nothing.
- **`refreshAll()`, `openMenuFor()` and the target list all paint `shown`**,
  never the model. The skill menu still gates on real `actor.mp` — that is a
  legality check, not a display one.
- **`snapShown()` reconciles** at the top of `afterEvents()` (every frame the
  queue is empty) and in `onResult()`. Any state change an event does not
  describe self-heals instead of leaving a bar stuck behind the truth.
- **`use` events carry `mp`** — the caster's focus *after* the cost — on all
  five action kinds. This is the only engine-side data change.
- **Critical-hit log lines are queued ahead of the hit** in
  `BattleEngine.strike()`, so the announcement precedes the number instead
  of trailing it.
- **`float()` reworked**: foes pop at `y - 62` (clear of the name plate and
  gauge), party at `y - 44`; damage is `C.hp` red, crits `C.gold`, heals
  `C.ok`, misses `C.dim`; a `C.shadow` copy is drawn one pixel behind for
  contrast; the number pops in at 1.7× with `Back.Out`, then rises 16px and
  fades. Concurrent numbers on one unit fan out 0, -10, +10, -20, +20 so a
  multi-hit skill stays readable.
- **Numeric log lines**: `onHit` logs `Ashen Wolf takes 21.` and `onHeal`
  logs `Kael recovers 34.`. Misses keep the engine's existing
  `X slips away.` line rather than duplicating it.
- **Log height is adaptive**: `LOG_LINES = 4` became `logLines()`, clamped to
  3–6 and derived from the band height, so a tall band shows six lines
  instead of four.

## Verification

Commands, run on the branch:

```
npx tsc --noEmit      # exit 0, no output
npx vitest run        # 12 passed (10 on develop)
npx vite --port 5178
URL=http://127.0.0.1:5178/ node scripts/e2e.mjs
                        # exit 0, 112 PASS / 0 FAIL, no console errors
```

**The e2e check has teeth.** The sampler reads the *painted* party HP text
(`rows[0].hpText.readable`) every frame and compares it against the model
plus the damage still sitting in `pending`. Reverting the fix — making
`shownOf()` return live unit state, which is what develop did — turns it
from a pass into:

```
FAIL the painted party bar tracks the event queue exactly — 719 bad frames,
e.g. {"pending":6,"painted":"118/140","want":"140/140","floats":0,"numbers":false}
```

Six events still queued, and the bar already reads 118/140 when it should
still read 140/140. That is the reported symptom, caught numerically. With
the fix in place:

```
samples: 1578 | mid-queue: 1138 | mismatched: 0 | floats peak: 1
PASS the painted party bar tracks the event queue exactly — 1578 frames
PASS the queue really was mid-flight during the run — 1138 frames
PASS damage numbers float over the target — peak 1
PASS combat log carries the damage numbers
```

The first check alone would pass on a bar frozen at its old value, so the
second one asserts the queue really was mid-flight for 1138 of those frames.

**Frame-by-frame trace after the fix** (1600×1000, Rowan using Quickslash —
a three-hit skill — on the Ashen Wolf):

```
t+150  pending [hit,hit,hit,death,log]  foeShown [34,26]  foeModel [0,26]
t+300  pending [hit,hit,death,log]      foeShown [19,26]  foeModel [0,26]  floats 1
t+700  pending [hit,death,log]          foeShown [ 3,26]  foeModel [0,26]  floats 2
t+1200 pending [death,log]             foeShown [ 0,26]  foeModel [0,26]  floats 2
```

The wolf's bar walks 34 → 19 → 3 → 0 in step with the three hits, while the
engine has already put it at 0 the whole time. Party HP stayed at
140/112/136 throughout — nobody damaged themselves. Two floats coexist at
t+700, 10px apart, which is the stagger working.

**Log output after the fix**, from the victory drive:

```
Ashen Wolf takes 31. | Ashen Wolf uses Savage Bite. | Kael takes 13. |
ROUND 4 | Kael attacks. | Ashen Wolf takes 32. | Ashen Wolf falls. | VICTORY
```

**New engine tests** (`tests/battle-engine.test.ts`, 6 → 8):

- *never aims a hit at the side that dealt it* — 40 seeded battles, three
  party members against three foes, every `hit` event checked so `from.side`
  differs from `to.side` (`from: 'status'`, i.e. burn or poison, is exempt).
  Guarded by `expect(hits).toBeGreaterThan(200)` so the sweep cannot pass by
  doing nothing.
- *carries the MP cost on the use event* — casts Cleave and asserts
  `use.mp === before - SKILLS.cleave.mp`, and that the model agrees.

**Check counts**: `check(` call sites in `scripts/e2e.mjs` go 70 → 74; the
run prints 112 PASS lines because several checks run once per viewport.

## Files touched

| Path | Why |
| --- | --- |
| `src/scenes/BattleScene.ts` | `shown` map, `seedShown`/`shownOf`/`snapShown`/`applyShown`, `refreshAll` and the menu labels read `shown`, `float()` rework, numeric log lines, adaptive log height |
| `src/battle/BattleEngine.ts` | `mp` on the `use` event (all five kinds); crit log queued ahead of the hit |
| `tests/battle-engine.test.ts` | targeting sweep and MP-on-event assertions |
| `scripts/e2e.mjs` | per-frame sampler over the victory drive, four new checks |

Diff stat against `develop`: 4 files, 312 insertions, 35 deletions.

## Known limitations

- **Status icons still appear the instant the engine applies them**, not when
  the `status` event plays. They are cosmetic and adjacent to the event that
  caused them, so they were left alone; tracking them would need a
  `shown.statuses` copy per unit.
- **`snapShown()` is the safety net, not the mechanism.** A state change with
  no event behind it — a boss phase swap that changed HP, say — would still
  paint instantly at the next queue drain. Nothing in the current data does
  this (`checkPhase` only adds statuses), but the seam is there.
- **The e2e sampler watches `engine.party[0]` only.** Extending it to every
  unit is a one-line loop; it was left narrow to keep failure output readable.
- **Foe MP is carried on `use` but never rendered**, so the MP timing fix is
  only observable for party members today.
- **No float for status-only effects** — a landed burn still shows just the
  icon. The `status` event carries no magnitude to print.

## PR body

**Battle bars no longer jump ahead of the animation**

Committing ATTACK used to resolve the whole round in one synchronous
`choose()` call, and the HUD painted live unit state — so the party bar
dropped to its end-of-round value before any foe had moved. It looked like
the player was damaging themselves. The engine's targeting was audited first
and was never at fault: 150 seeded battles, 1501 hit events, zero same-side
violations. The bug was entirely in the view.

The scene now keeps a `shown` map of HP, MP and aliveness as the player has
seen them, advanced one event at a time by `applyShown()`, with `snapShown()`
reconciling at every queue drain. `use` events carry the caster's post-cost
MP, so a spell spends its focus when it animates rather than when the menu
closes.

Also in here, because the same pass made it obvious:

- Damage numbers are now actually visible. They were white text drawn on top
  of the unit's own name label. They clear the name plate, are colour-coded,
  carry a shadow, pop in and rise, and fan out sideways on multi-hit skills.
- The combat log carries the numbers — `ASHEN WOLF TAKES 21.` — and shows up
  to six lines instead of four, depending on band height.
- Critical-hit announcements are queued ahead of the hit, so the number
  follows the announcement instead of trailing it.

Regression cover: a 40-battle targeting sweep, an MP-on-event assertion, and
an e2e sampler that compares the painted party HP text against the model plus
the damage still sitting in the queue. Reverting the fix turns that last
check into 719 bad frames.


