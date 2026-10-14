# Title screen: panel-framed menu, clean backdrops

| | |
| --- | --- |
| **Branch** | `feat/intro-screen-clean-backdrops` |
| **Base** | `develop` at `8e5e2e5` (the `feat/full-window-stage` merge) |
| **Commits** | `1133d07` — *Drop the dithered ink vignette from every backdrop*<br>`3501d7a` — *Frame the title menu and let the dawn backdrop stand*<br>plus the commit that adds this file (`git log --oneline notes/`) |
| **Date** | 2026-10-14 |
| **PR** | not opened — merged locally into `develop`, branch not pushed |

---

## Summary

The title screen darkened its own lower third with a gradient rectangle so a
left-pinned menu would read against the dawn ground, and its sub-panels only
re-placed when the window was resized. Both are gone: the menu is a centred
column on a panel frame, every element is placed from the live stage on every
mode switch, and the backdrop art stopped smearing ink over its own frame
edges. Twelve new e2e checks (96 → 108) now watch the title layout instead of
trusting the eye.

## Symptom

**Title menu, wide window (1920×1080, zoom 3).** The logo sat centred while the
menu was hard-pinned 44px from the left edge, over the dawn ground, under a
black band that covered the bottom 31% of the screen.

**Title sub-panels, narrow window.** Opening CONTINUE kept the main menu's
placement — the slot list is 400px wide and the main menu is 264px, so the
picker inherited geometry that did not belong to it. Same for SETTINGS and
CREDITS: they only re-centred if the window happened to be resized afterwards.

**Slot note on an empty-party save.** `LV-Infinity` printed on the title screen.

**Every backdrop.** Ink pixels scattered across the outer 55% of the frame,
~88% density in the corners. At 640×360 that reads as film grain, not 16-bit
art, and it flattened the three-layer depth the rest of the art is built from.

## Root cause

**1. The title screen fought its own backdrop with a gradient band.**
`TitleScene.relayout()` painted a `Graphics` gradient over the lower third and
pinned the menu to fixed coordinates:

```ts
const band = Math.round(h * 0.69);
this.shade.clear();
this.shade
  .fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x000000, 0x000000, 0.7, 0.5, 0.55, 0.7)
  .fillRect(0, band, w, h - band);
...
const menuY = h - 94;
this.main.relayout(44, menuY);
this.slots.relayout(44, menuY, Math.min(260, w - 130));
```

**2. `relayout()` was only wired to the resize event.** `onStageResize(this, ()
=> this.relayout())` runs on a window drag, never on a mode switch, so
`chooseMain()` could change `this.mode` — and with it the panel width the
layout assumes — without anything re-running the layout.

**3. `BackdropArt.vignette()` painted over the frame, not the subject.**

```ts
function vignette(pc: PC, strength = 0.5): void {
  const cx = pc.w / 2, cy = pc.h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  ...
  if (d < 0.45) continue;
  const t = Math.min(1, ((d - 0.45) / 0.55) * strength * 1.6);
  if (PC.hash(x, y, 99) < t) pc.p(x, y, P.ink);
}
```

Seven call sites: the title card, three battle arenas, three story
illustrations. The ending card reuses the title texture, so it inherited the
same corners.

**4. `Math.max()` of an empty array.** `SaveManager.meta()` builds
`levels: d.party.map((m) => m.level)`, and the slot note did
`Math.max(...meta.levels)` — `-Infinity` when `party` is empty.

## Change

- **`vignette()` and all seven call sites deleted.** Depth now comes from the
  three flat silhouette layers and the single light source, which is what the
  header comment in `BackdropArt.ts` and `docs/visual-research.md` now say.
- **`TitleScene.relayout()` places everything from the live stage**: the lockup
  (sigil watermark, wordmark, divider rule, subtitle) high and centred; the menu
  as a centred column on a `Panel` frame in the lower half; the backdrop's star
  glow mapped out of the 640×360 texture space through `cover()` using
  `TITLE_STAR_X/Y`; embers scattered down to the top of the panel instead of a
  fixed 66% band.
- **`relayout()` now runs on every mode switch** (CONTINUE, SETTINGS, CREDITS and
  the way back), which is what re-fits the 400px slot picker in a narrow window.
- **`MenuList` gained `align: 'center'`** — `x` is the middle of the column, and
  `railX()` keeps the cursor rail clear of the widest entry — **plus
  `noteAlign: 'right'`**, so slot notes lean off the panel edge instead of past
  it.
- **`SaveManager.topLevel()`** answers 1 when a save has no members yet.
- **Backdrop art tamed:** the dawn star's glow is smaller (26px) and its ramp
  ends in the sky colour it sits in, stars sit at 0.06 alpha, the shooting
  trail is shorter, the ridge and pines are darker, the landing glow is ramped,
  and the chimney smoke is smaller. A glow whose ramp stops short of the colour
  around it shows the square it was drawn in.
- **`README.md`** presentation section records the no-vignette rationale and the
  new title composition.

## Verification

```
npm run typecheck      clean (tsc --noEmit)
node scripts/e2e.mjs   108 checks pass (was 96), no console errors
```

Twelve new checks in `scripts/e2e.mjs`, reading the live `TitleScene` rather
than counting keypresses — `mode`, `main.index`, `main.items[1].enabled`, and
the frames of `menuPanel`, `creditsPanel`, `settings.panel`, the wordmark box
and the `bg` image:

1. `title menu panel stays inside the stage at 1920x1080 / 960x600 / 640x360 / 480x420` — panel **and** lockup boxes, four viewport sizes
2. `title backdrop covers the view at …` — the `cover()` scale/offset, not just layout coordinates
3. `title slot picker opens and fits the stage at 520x430` — the 400px panel, the widest thing the title draws
4. `title menu keeps its cursor through the slot picker and a resize` — the reason `relayout()` runs on mode switch instead of rebuilding the list
5. `title settings panel fits the stage at 520x430`
6. `title credits panel fits the stage at 520x430`

The section seeds a real save through the overlay's SAVE tab first. Two harness
traps worth recording: the overlay **remembers its last tab**, so the walk must
loop until `tab === 'save'` rather than pressing right a fixed number of times;
and with no save on disk `CONTINUE` is disabled, so the menu skips it and the
first attempts landed on SETTINGS.

**Proof the checks have teeth.** With the panel creation commented out of
`TitleScene.create()` — i.e. back to the pre-branch state where the title has no
`menuPanel` at all — the probe returns `null` and exactly the six panel
dependent checks fail, 102 PASS / 6 FAIL:

```
FAIL title menu panel stays inside the stage at 1920x1080 — {"panel":null,"lockup":{"x":95,"y":43,"w":450,"h":24},"stage":{"w":640,"h":360,"cx":320,"cy":180,"zoom":3,"winW":1920,"winH":1080}}
FAIL title menu panel stays inside the stage at 960x600 — {"panel":null,"lockup":{"x":255,"y":72,"w":450,"h":24},"stage":{"w":960,"h":600,"cx":480,"cy":300,"zoom":1,"winW":960,"winH":600}}
FAIL title menu panel stays inside the stage at 640x360 — {"panel":null,"lockup":{"x":95,"y":43,"w":450,"h":24},"stage":{"w":640,"h":360,"cx":320,"cy":180,"zoom":1,"winW":640,"winH":360}}
FAIL title menu panel stays inside the stage at 480x420 — {"panel":null,"lockup":{"x":90,"y":50,"w":300,"h":16},"stage":{"w":480,"h":420,"cx":240,"cy":210,"zoom":1,"winW":480,"winH":420}}
FAIL title slot picker opens and fits the stage at 520x430 — {"mode":"slots","contLive":true,"panel":null,"stage":{"w":520,"h":430,"cx":260,"cy":215,"zoom":1,"winW":520,"winH":430}}
FAIL title menu keeps its cursor through the slot picker and a resize — {"mode":"main","cursor":1,"parkedAt":1,"panel":null}
```

The four `title backdrop covers the view` checks and the SETTINGS/CREDITS panel
checks stayed green in that run, which is the right shape: those objects still
exist when only the menu panel is removed. Restoring the panel returned the
suite to 108/108.

Screenshots the composition was judged from: `tmp_e2e/29-title-1920x1080.png`,
`29-title-480x420.png`, `29-title-slots-520x430.png`,
`29-title-settings-520x430.png`, `29-title-credits-520x430.png`.

## Files touched

| Path | Why |
| --- | --- |
| `src/art/BackdropArt.ts` | `vignette()` and its seven call sites deleted; star glow, shooting trail, ridge/pine values, landing glow and chimney smoke tamed |
| `src/scenes/TitleScene.ts` | `relayout()` rebuilt around the live stage: lockup, menu panel, star glow through `cover()`, mote scatter; `relayout()` called on every mode switch; `TITLE_STAR_X/Y` and `MENU_ROW_H` constants; slot note uses `topLevel()` |
| `src/ui/Window.ts` | `MenuList` gains `align: 'center'`, `noteAlign` and `railX()` |
| `src/core/SaveManager.ts` | `topLevel()` guard for saves with no members |
| `scripts/e2e.mjs` | Twelve title checks, `titleProbe()` / `coversStage()` helpers, save seeding through the overlay SAVE tab |
| `README.md` | Presentation section: no-vignette rationale and the new title composition |
| `docs/visual-research.md` | Backdrop rules now state depth comes from layers, not corner vignetting |
| `notes/` | This file |

## Known limitations

- **No PR exists.** The branch was merged locally into `develop` and
  neither branch has been pushed; `origin/develop` trails behind. The
  PR link in the header stays empty until the merge is published.
- **The `-Infinity` guard is defensive, not reproduced.** `levels` is empty only
  when a save blob's `party` array is empty, which New Game never produces — it
  takes a hand-edited or truncated `localStorage` entry. No test covers it.
- **Layout is checked geometrically, not pixel-diffed.** The checks assert the
  panel and lockup boxes sit inside the stage and that the backdrop covers the
  view; whether the art *looks* right is still a human call, made from the
  screenshots listed above.
- **The slot picker is the tightest fit on the title**: a 400px panel, which is
  only reached at a 432px stage width or wider — below that the panel shrinks
  with the window. Nothing on the title is designed for a narrower stage.
- `feat/full-window-stage` (merged at `8e5e2e5`) has no notes file: the
  convention in `notes/README.md` started with PR #1 and that branch skipped it.

## PR body

> **Frame the title menu and let the dawn backdrop stand**
>
> The title screen darkened its own lower third with a gradient rectangle so a left-aligned menu would read against the dawn ground. The shade is gone: the menu is a centred column on a panel frame, and the backdrop does the rest.
>
> `TitleScene.relayout()` now places everything from the live stage — lockup (sigil, wordmark, rule, subtitle) high and centred, menu panel in the lower half, star glow mapped out of the 640×360 texture space through `cover()` — and it runs on every mode switch, so the 400px slot picker re-fits a narrow window instead of keeping the main menu's geometry. `MenuList` gained `align: 'center'` (`x` is the middle of the column, the cursor rail clears the widest entry) and `noteAlign: 'right'`, so slot notes lean off the panel edge instead of past it.
>
> The ink vignette is deleted along with all seven call sites: scattering pixels over the outer 55% of a 640×360 frame reads as film grain, not 16-bit art. Depth comes from the three flat silhouette layers and the single light source. The dawn art is tamed to match — smaller sky-ramped star glow, dimmer stars, darker ridge and pines, shorter chimney smoke.
>
> `SaveManager.topLevel()` answers 1 when a save has no members yet; `Math.max()` of nothing printed `-Infinity` in the slot note.
>
> **Tests:** twelve new e2e checks (96 → 108) — menu panel and lockup inside the stage at four viewport sizes, backdrop covering the view, slot picker / settings / credits fitting a 520×430 stage, and the menu cursor surviving the detour. Typecheck clean, 108/108 green. Six of the new checks fail when the panel is removed from the scene. See `notes/2026-10-14-intro-screen-clean-backdrops.md`.

