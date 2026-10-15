# Fill the whole window at any size

| | |
| --- | --- |
| **Branch** | `feat/full-window-stage` |
| **Base** | `develop` at `6d5f278` (the menu tab-strip fix, PR #1) |
| **Commits** | `1878c72` — Fill the whole window at any size<br>plus the commit that adds this file (`git log --oneline notes/`) |
| **Date** | 2026-10-14 |
| **PR** | see the header of the PR opened from this branch |

> Written after the fact. This branch was merged into `develop` as `8e5e2e5`
> before the notes convention in `notes/README.md` existed, so the code and its
> notes arrive as separate commits. Everything below was re-measured on the
> branch tip (`1878c72`) rather than recalled.

---

## Summary

The canvas now tracks the window exactly and the game's internal resolution
follows it at a whole-number zoom, so a 1080p screen shows the 640x360 frame
the art was drawn for at 3x instead of a letterboxed, blurred approximation of
it. Two bugs came with the change of scale mode: the black void around a window
that was not the map's shape, and — the one that actually broke play — the
world HUD vanishing entirely at 2x and up.

## Symptom

**A map floating in a black box.** At 1920x1080 the outdoor map occupied its
640x360 shape in the middle of the window with black on every side. Nothing
suggested the game knew the window was bigger.

**The world HUD is simply gone at 2x and up.** At 1440x900 and 1920x1080 the
overworld's hint line, quest tracker and party gauges were not drawn anywhere
in the window. They were still in the display list — they were just off the
canvas. At 1x everything was fine, which is why it survived development.

**Soft edges.** `Scale.FIT` produces fractional scale factors, and a 5x7 bitmap
font and 16px tiles smeared when stretched by 1.5 or 2.37.

## Root cause

**1. The scale mode letterboxed by design.**

```ts
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH
}
```

FIT keeps the canvas at a fixed aspect and pads the rest of the page with the
page background — black here.

**2. Phaser centres a camera on its origin, and the HUD assumed otherwise.**
Everything pinned to the window is drawn with `setScrollFactor(0)` at a layout
position. With Phaser's default centred origin, the pixel that position lands
on is offset by half a canvas: at 1440x900 (zoom 2) the party panel asked for
layout `(16, 354)` and was drawn at canvas `(-712, -446)`. The e2e caught it
verbatim once the check was written:

```
FAIL pinned HUD is drawn on the canvas at 1440x900 — {"pinned":{"n":13,"bad":[
  {"scene":"WorldScene","type":"Rectangle2","x":-712,"y":-446,"w":364,"h":96},
  {"scene":"WorldScene","type":"Label","x":-704,"y":-438,"w":108,"h":16}, ...
```

**3. `worldView` described a camera that this is not.** Phaser derives it as the
rect centred on `scroll + size / 2`. With the origin pinned to the canvas corner
that rect is half a canvas off, and masks, tilemap layer culling and anything
else asking "what is on screen" were answering about a region the player was
not looking at.

**4. The old e2e could not see any of it.** Its viewport checks compared
*layout* coordinates against the layout size — a tautology. A layout position
is always inside the layout; the question is where the camera puts it.

## Change

- **`src/core/zoom.ts`** — the zoom rule, kept out of `Stage` so it can be
  tested without Phaser. `zoomFor()` divides the window by the largest whole
  number that still leaves a layout space at least the 640x360 baseline, capped
  at `MAX_ZOOM = 3`. 1920x1080 → 3x, 1366x768 → 2x, 500x400 → 1x.
- **`src/main.ts`** — `Phaser.Scale.RESIZE` with `NO_CENTER`: the canvas is the
  window, no bands, no fractional factors.
- **`src/core/Stage.ts`** — one `stage` singleton measuring the canvas, holding
  `{ w, h, cx, cy, zoom, winW, winH }`, and emitting `stage:resize` only when
  the layout space actually changed. `zoomScene()` sets integer zoom,
  `setRoundPixels(true)`, `setOrigin(0, 0)` and scroll `(0, 0)` on every camera
  — which is what makes a layout position and the pixel it lands on differ by
  exactly `zoom`. Scenes started between resizes are re-zoomed on their own
  `create` (the menu overlay is started long after the last window resize), and
  `onStageResize(scene, fn)` detaches itself on `shutdown`.
- **`trackView()`** — rewrites `worldView` from the scroll in `preRender`, so
  masks, tilemaps and culling see the truth. Patched once per camera, tracked in
  a `WeakSet`.
- **Follow cameras** get a half-layout follow offset, and their bounds are
  pulled in by the slack that clamping leaves, so the camera never roams past
  what the backdrop covers.
- **`WorldScene`** tiles each outdoor map's border material out past the map
  edges and fades it into the camera background colour, so country runs on past
  the border. Interiors deliberately leave it out and stay a lit room in the
  dark.
- **Every scene re-lays-out in place** on `stage:resize` — title, story,
  overlay, battle, end, dialogue, window chrome, settings — so a window drag
  mid-battle keeps menus, dialogue and battle state alive instead of restarting
  the scene.
- **`cover()`** scales a baseline-painted backdrop to fill the stage, centred,
  cropping the overflow.

## Verification

Run on the branch tip `1878c72`, against a dev server on `127.0.0.1:5178`:

```
npm run typecheck     # clean
npm test              # Test Files 2 passed (2)  |  Tests 10 passed (10)
node scripts/e2e.mjs  # 96 PASS / 0 FAIL, exit 0
```

`tests/stage.test.ts` is new (4 cases, 6 → 10 unit tests): whole-multiple zoom
only, capped at 3x, and a sweep of twelve window sizes asserting the layout
space never drops under the frame the art was drawn for and that
`layout * zoom` never exceeds the window.

The e2e grew from **43 check call sites to 64**, and the new ones run over five
viewports — 1440x900, 1920x1080, 960x600, 640x360, 480x420 — eight checks each:
canvas fills the window, camera view equals the layout space at that zoom,
camera bounds never smaller than the view, every running scene at the stage
zoom, cameras framing the layout space, world HUD inside the stage, **pinned HUD
drawn on the canvas** (every `scrollFactor(0)` object transformed through the
live camera matrix), and backdrop covering the view.

**Proof the new check has teeth.** With one word put back — `setOrigin(0, 0)`
reverted to Phaser's default `setOrigin(0.5, 0.5)` in `Stage.zoomScene()` — the
same run gives:

```
87 PASS / 10 FAIL, exit 1

FAIL cameras frame the layout space at 1440x900 — {"frames":[{"scene":"WorldScene",
  "follow":true,"tl":{"x":320,"y":208},"br":{"x":1040,"y":658},"view":{"x":-40,"y":-17,...
FAIL pinned HUD is drawn on the canvas at 1440x900 — {"pinned":{"n":13,"bad":[
  {"type":"Rectangle2","x":-712,"y":-446,...
FAIL backdrop covers the view at 1440x900 — {"backdrop":{"covers":false},...
```

Ten failures across the two large viewports, and the pinned-HUD one is the
player-visible bug: thirteen world-HUD objects drawn at negative canvas
coordinates.

## Files touched

| Path | Why |
| --- | --- |
| `src/main.ts` | `Scale.RESIZE` + `NO_CENTER` instead of `FIT`/`CENTER_BOTH`; attaches the stage |
| `src/core/Stage.ts` | new — measures the canvas, owns zoom, pins camera origin/scroll, patches `worldView`, `cover()`/`fit()`/`onStageResize()` |
| `src/core/zoom.ts` | new — the zoom rule, testable without Phaser |
| `src/core/EventBus.ts` | `stage:resize` event |
| `src/data/World.ts` | border material per outdoor map |
| `src/scenes/WorldScene.ts` | border tiled past the map edges and faded into the background; follow offset and bounds slack |
| `src/scenes/{Title,Story,Overlay,Battle,End,Boot}Scene.ts` | read `stage.w/h`, re-lay-out on resize instead of assuming 640x360 |
| `src/ui/{Dialog,Window,Settings}.ts` | same — layout from the stage |
| `src/scenes/BattleScene.ts` | battle panels and sprite homes re-placed on resize |
| `index.html` | page background and container sizing for a canvas that is the window |
| `scripts/e2e.mjs` | five viewports, camera-matrix checks, battle-survives-resize checks |
| `tests/stage.test.ts` | new — the zoom contract |
| `package.json` | script wiring for the e2e run |

## Known limitations

- **Zoom is capped at 3x** (`MAX_ZOOM`). A 4k screen gets the 640x360 frame at
  3x and the rest is background; raising the cap means re-checking UI that was
  drawn for that frame.
- **Interiors keep the black surround on purpose** — a lit room in the dark
  reads correctly. Only outdoor maps grow their border.
- **`trackView()` patches `camera.preRender` per camera.** It is idempotent and
  tracked in a `WeakSet`, but it is a seam: Phaser's own `worldView` derivation
  is deliberately wrong for these cameras, so anything new that trusts
  `camera.worldView` depends on that patch staying.
- **Read the window from `stage.winW/winH`, never `cam.width`.** On Phaser's
  `RESIZE` event the camera still holds the previous size; that is why the
  window size rides on the stage.
- The e2e resizes the *page viewport* through Playwright. It covers window
  shapes, not OS display-scaling or browser-chrome quirks.
- On a map only slightly larger than the layout space, the follow camera's
  bounds are pulled in by the clamp slack, so it holds still rather than
  centring the player.

## PR body

**Fill the whole window at any size**

The canvas now tracks the window exactly and the internal resolution follows it
at a whole-number zoom, so the 5x7 font and the 16px tiles stay crisp instead of
smearing at a fractional FIT scale. 1920x1080 shows the 640x360 frame at 3x;
1366x768 shows a little more around it at 2x; a 500x400 window stays at 1x.

Two bugs came with that:

- A window that was not the map's shape showed the map floating in a black box.
  Outdoor maps now tile their border material past the map edges and fade it
  into the camera background, so country runs on. Interiors stay a lit room in
  the dark.
- The world HUD disappeared at 2x and up. Phaser centres a camera on its
  origin, so anything drawn with `setScrollFactor(0)` landed half a canvas
  outside the window — thirteen world-HUD objects at negative canvas
  coordinates. `Stage` now pins every camera's origin to the canvas' top-left
  corner and its scroll to the world coordinate behind that corner, so a layout
  position and the pixel it lands on differ by exactly `zoom`, and `worldView`
  is restated from the scroll so masks, tilemaps and culling still see the
  truth.

Every scene re-lays-out in place on `stage:resize`, so dragging the window
mid-battle keeps menus, dialogue and battle state alive.

**Tested**

```
npm run typecheck     # clean
npm test              # 10 passed (6 before)
node scripts/e2e.mjs  # 96 PASS / 0 FAIL
```

The e2e went from 43 check call sites to 64, running eight checks across five
viewports and transforming every `scrollFactor(0)` object through the live
camera matrix — the old check compared layout coordinates, which is how the HUD
bug survived it. Reverting `setOrigin(0, 0)` to Phaser's default reproduces the
bug: 87 PASS / 10 FAIL, exit 1.

**Not in this PR:** interiors deliberately keep the dark surround; zoom is
capped at 3x; `trackView()`'s `preRender` patch is a seam worth revisiting if
Phaser changes `worldView` again.


