# Battle presentation: bars advance with the queue, the turn order shows, attackers walk in

| | |
| --- | --- |
| **Branch** | `fix/damage-targeting-and-ui` |
| **Base** | `develop` at `2e9b438` (the title-screen notes link) |
| **Commits** | `ca8bbc5` — Advance the battle HUD with the event queue<br>`f26243a` — Pin the battle timing down with engine and e2e checks<br>`f0fb791` — Add PR notes for the battle presentation fix<br>`5ffe994` — Publish the round order and let a survived blow draw a rare answer<br>`95284fa` — Show the turn order and walk attackers into the arena<br>plus the commit that amends this file (`git log --oneline notes/`) |
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

**Second pass, same branch.** Three more things were wrong with the same
scene, and all three are covered below: the initiative order was invisible
(the player inferred whose turn it was by watching who moved next), sprites
ended their animations parked a couple of pixels off their ground line and
hung there, and attacking carried no risk at all — a foe that survived a
blow never answered it, which made winning the initiative worth a pure tempo
edge with nothing to lose.

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

---

# Second pass: the turn order, the floating sprites, and counters

## Symptom

**Whose turn is it?** The initiative order exists — `Damage.turnOrder()` sorts
the queue every round — but nothing on screen showed it. The player learned the
order by watching who moved next, which is fine for one round and useless once
speeds differ across party members.

**Sprites end up hanging in the air.** After an attack, the sprite was parked a
couple of pixels above the line it was placed on and stayed there: no shadow
gap, no bob, just a unit slightly off its mark until the next animation moved
it back. Party members that were not acting drifted the same way, which made it
look like the whole party was wading through water.

**Attacking is free.** A foe that survived a blow never answered it, so winning
the initiative was a pure tempo edge with no downside to walking into something
already awake.

## Root cause

**5. The order was never published.** `beginRound()` sorted `this.queue` and
pushed `{ t: 'round', round }`. Reading the engine live would not have fixed
it either: `choose()` resolves whole rounds at once, so by the time the scene
animates round N, `engine.queue` already belongs to round N+2.

**6. Independent tweens on one shared proxy.** `lunge()` ran several tweens
against a single `{ dx, dy }` proxy, stitched together with `delayedCall`s. A
frame landing between a `delayedCall` and the tween it was meant to follow let
two tweens write the same proxy at once; whichever lost stopped early, leaving
`dx`/`dy` a couple of pixels short of zero. Nothing re-asserted `home`, so the
offset persisted for the rest of the battle. A stage resize mid-step re-homes
the unit under a running tween and produces the same residue with a different
trigger.

**7. The sampler could not see it.** The e2e drift check watched the active
unit only, and only while it was busy, so a passive party member parked 2px off
home was indistinguishable from one standing correctly.

## Change

- **`round` events carry `order`** — `push({ t: 'round', round, order:
  this.queue.map(u => u.uid) })`. The order travels inside the event precisely
  so the scene can show a row that matches the animation being played rather
  than the engine's current state.
- **Turn bar** (`buildTurnBar()` / `paintTurnBar()` / `beginTurnSequence()`):
  a centred row of framed portraits, 26×22 cells that shrink on a narrow stage
  (`TURN_CELL_W`, `TURN_GAP = 5`, `TURN_TOP = 12`). People are cropped to
  `PARTY_PORTRAIT = { x: 5, y: 0, w: 16, h: 18 }` — the humanoid frame plan
  always draws the skull in the same rows — beasts are fitted whole, since
  their silhouettes differ too much per species to crop safely. `setCrop` only
  rewrites UVs, so the display size is set explicitly or the face stretches
  across the whole quad.
- **The caret** (`turnMark`) sits *above* the acting chip and slides sideways
  with a 170 ms `Quad.Out` tween. It used to hang below, where it merged with
  the chip's 2px gold stroke and the pair read as a portrait on a monitor
  stand. Spent portraits dim to 0.4, upcoming stay at 0.78, dead ones go red
  and fade to 0.22.
- **Counters do not move the marker.** `setTurnNow()` is skipped for `use`
  events flagged `counter`; a counter is not a turn, and letting one advance
  the row made the bar lie about whose turn it was.
- **`lunge()` is one `tweens.chain`** rather than a row of independent tweens:
  `move(15,-2,95) → move(15,0,45) → move(30,-2,95) → move(30,0,45) →`
  `move(15,-2,110) → move(15,0,45) → move(0,-2,110) → move(0,0,55)`. A chain is
  strictly sequential, so nothing can overlap it, and its `complete` is the only
  thing that ends the step: it zeroes the proxy, calls `track()` and returns the
  unit to its idle pose. `v.chain?.complete()` retires a walk-in still running
  before a new one starts.
- **`track()` writes `home + offset`** for the sprite and its shadow every
  frame, reading `v.home` rather than a captured copy, so a resize mid-step
  re-homes the walk instead of fighting it.
- **Attack poses are decoration, not motion**: `pose(140, …)` / `pose(430, …)`
  bail out once `chain.isPlaying` is false, and `hop()` / `flash()` refuse to
  shake a unit that is mid-step.
- **Counters** (`maybeCounter()`): a foe still standing after a landed
  *physical* party blow answers at 70% power, 5% of the time
  (`BALANCE.counterChance`, `counterPower`). Only the melee that reached them
  counts — spells and thrown items are not within reach — and only foes answer
  the party, so the mechanic taxes the attacker instead of opening a second
  front. It emits a normal `use` (`counter: true`) plus `hit`, so the scene
  animates it without treating it as a turn, and `strike()`'s `nested` flag
  stops an answer from provoking an answer.

The walk was measured rather than eyeballed. Forcing a battle and sampling the
attacker's offset from `home` every 90 ms:

| t | dx | dy | frame | busy |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | `s_attack0` | true |
| +90 | 15 | −1 | `s_attack0` | true |
| +180 | 30 | −2 | `s_attack1` | true |
| +270 | 15 | −2 | `s_attack1` | true |
| +360 | 2 | −2 | `s_attack2` | true |
| +450 | 0 | 0 | `s_idle0` | false |

Two distinct steps, a 2px weight shift, a follow-through frame, and a hard
landing back on the exact home pixel with the idle pose restored.

## New tests and checks

**Engine** (`tests/battle-engine.test.ts`, 6 → 10 tests):

- *publishes the round order, then takes its turns in that order* — the
  `round` event's `order` is well-formed (every uid resolves) and the turns that
  follow come out in that order.
- *answer a landed blow occasionally, never an answer, never their own side* —
  40 seeded battles; counters fire at all, never exceed 15% of landed party
  swings, always land on the unit that swung, never on the counterer's own side,
  and never chain into a second counter. Guarded by
  `expect(swings).toBeGreaterThan(100)` so the sweep cannot pass by doing
  nothing.

**E2E** (`scripts/e2e.mjs`): the sampler now reads **every visible unit every
frame** (a `drift` array per frame) instead of the active one, and each sample
carries a `moved` flag so a frame parked mid-shake is not mistaken for a frame
standing still. Nine new checks:

- *turn bar paints one framed portrait per combatant* — `bar === seq` and
  `faces === seq` across all 1756 frames that had a sequence.
- *turn bar marks the unit whose turn is animating* — 1384 of 1756 frames.
- *turn bar walks through more than one combatant* — `p0, f1, f0`.
- *party members stand dead still between turns* — 2679 parked frames, zero
  drifting.
- *nothing is left standing off its home position once its animation ends* —
  parked frames must be **exactly** zero offset, not "close".
- *the attack walks in rather than sliding in place* — peak reach ≥ 20px
  (measured 30px over 776 step frames).
- *the shadow stays under the sprite while it stands* — widest gap 0px.
- *every walk-in ends back on its home position*.
- *turn bar is rebuilt, still full and still on the stage after both resizes* —
  chips at x 385/416 on an 800px stage and 245/276 on a 520px one, portraits
  present in both.

## Verification

Commands, run on the branch:

```
npm run typecheck     # exit 0, no output
npm test              # 14 passed (10 on develop)
npx vite --port 5178
URL=http://127.0.0.1:5178/ node scripts/e2e.mjs
                        # exit 0, 121 PASS / 0 FAIL, no console errors
```

(The first pass on its own was 12 tests and 112 PASS lines; the second pass
added two engine tests and nine browser checks.)

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

**Check counts**: `check(` call sites in `scripts/e2e.mjs` go 70 → 74 with the
first pass and 70 → 83 by the end of the branch; the run prints 121 PASS lines
because several checks run once per viewport.

## Files touched

| Path | Why |
| --- | --- |
| `src/scenes/BattleScene.ts` | `shown` map, `seedShown`/`shownOf`/`snapShown`/`applyShown`, `refreshAll` and the menu labels read `shown`, `float()` rework, numeric log lines, adaptive log height, turn bar (`beginTurnSequence`/`buildTurnBar`/`paintTurnBar`/`turnMark`), `lunge()` as a `tweens.chain`, `UnitView.chain` |
| `src/battle/BattleEngine.ts` | `order` on the `round` event; `mp` on the `use` event (all five kinds) plus `counter`; `maybeCounter()`; `strike()`'s `nested` flag; crit log queued ahead of the hit |
| `src/config/constants.ts` | `BALANCE.counterChance = 0.05`, `BALANCE.counterPower = 0.7` |
| `tests/battle-engine.test.ts` | targeting sweep, MP-on-event, round-order and counter assertions |
| `scripts/e2e.mjs` | per-frame sampler over the victory drive, four new checks, then all-units `drift` + `moved` flag and the turn-bar and stance checks |

Diff stat against `develop`: 4 files, 312 insertions, 35 deletions at the first
pass; 5 files, 850 insertions, 53 deletions by the end of the branch.

## Known limitations

- **Status icons still appear the instant the engine applies them**, not when
  the `status` event plays. They are cosmetic and adjacent to the event that
  caused them, so they were left alone; tracking them would need a
  `shown.statuses` copy per unit.
- **`snapShown()` is the safety net, not the mechanism.** A state change with
  no event behind it — a boss phase swap that changed HP, say — would still
  paint instantly at the next queue drain. Nothing in the current data does
  this (`checkPhase` only adds statuses), but the seam is there.
- **The e2e sampler reads every visible unit every frame** since the second
  pass; before that it watched `engine.party[0]` only, which is exactly why the
  floating-sprite bug survived the first round of checks.
- **Foe MP is carried on `use` but never rendered**, so the MP timing fix is
  only observable for party members today.
- **No float for status-only effects** — a landed burn still shows just the
  icon. The `status` event carries no magnitude to print.
- **Counters are one-directional.** Only foes answer, and only against melee
  that actually reached them. A party-side counter needs a hook — guarding is
  the natural one — and would spend animation work on a mechanic that fires
  once in twenty swings.
- **A counter has no animation of its own.** It reuses the attacker's attack
  pose and walk-in; the only tells are the log line and the fact that the turn
  caret never moves.
- **Dead chips stay in the turn bar**, greyed and faded, rather than collapsing
  the row. The bar is the round's published order, not the live roster, and
  reflowing chips mid-round would make the caret jump sideways for no reason.
- **The bar fits the encounters the game has today.** Chips shrink to 18px on a
  narrow stage; a large enough fight (full party plus a big foe group) would
  crowd it before it broke.

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

**The turn order is on screen, attackers walk in, and a survived blow can come
back.**

A row of framed portraits along the top of the arena shows the round's
initiative order, with a gold caret above whoever is acting — spent portraits
dim, upcoming stay bright, dead ones go red. The order travels inside the
`round` event rather than being read off the engine, because `choose()` resolves
whole rounds before the scene animates one. Counter-attacks deliberately do not
move the caret: they are not turns.

Sprites were finishing their animations a couple of pixels above their ground
line and staying there. `lunge()` used to run several independent tweens against
one shared proxy, stitched with `delayedCall`s; a frame landing between the two
let them overlap, and whichever lost left the offset behind. It is now a single
`tweens.chain` — two steps out (15px, then 30px) with a 2px weight shift and a
follow-through, then a hard landing back on the exact home pixel, shadow
included. The e2e sampler watches every visible unit every frame now, with a
`moved` flag so a frame parked mid-shake is not mistaken for a frame standing
still, and parked frames must be *exactly* zero offset rather than "close".

Foes that survive a melee blow answer it 5% of the time at 70% power. Rare and
soft on purpose: a counter on every swing turns attacking into a trade and
flattens the whole point of winning initiative. Only the melee that reached them
counts — spells and thrown items are out of reach — only foes answer the party,
and an answer is never itself answerable.

Suite at the tip of the branch: 14 unit tests, 121 browser checks, typecheck
clean, no console errors.


