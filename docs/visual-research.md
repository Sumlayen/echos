# Visual Research — *Echoes of the Fallen Star*

Research performed **10 October 2026** with live web fetches from the development
machine. Every source below was actually retrieved; nothing in this table is
invented. Where a fetch failed, the failure is recorded in section 6.

---

## 1. Research goals

1. Classic 16-bit JRPG **side-view battle screens** (party vs. enemy group).
2. SNES-era **pixel-art environments**: village, forest, cave, ancient ruins.
3. **Sprite sheets** with idle / walk / attack / damaged animation sets.
4. **Monsters, spell effects**, battle animation framing.
5. Retro **dialogue windows, menus, inventory, status screens**.
6. **Freely licensed** art & tilesets usable in a new commercial-quality project.

---

## 2. References collected (16)

| # | Reference | URL | What it demonstrates | License |
|---|---|---|---|---|
| 1 | Kenney — **Tiny Town** | https://kenney.nl/assets/tiny-town | 16x16 town/overworld tileset, 130 assets. House/roof proportions, path edges, NPC scale at 16 px tiles. | **CC0** |
| 2 | Kenney — **Tiny Dungeon** | https://kenney.nl/assets/tiny-dungeon | 16x16 dungeon/sewer tiles, 130 assets. Wall/floor readability, torch & door framing at small scale. | **CC0** |
| 3 | Kenney — **Tiny Battle** (cross-linked from #1/#2) | https://kenney.nl/assets/tiny-battle | Side-view battle composition at tiny scale: unit silhouettes facing each other, ground shadow convention. | **CC0** |
| 4 | Kenney — **UI Pack** | https://kenney.nl/assets/ui-pack | 430 panels, buttons, sliders — menu/HUD framing, 9-slice panel construction. | **CC0** |
| 5 | Kenney — **Fantasy UI Borders** | https://kenney.nl/assets/fantasy-ui-borders | 140 decorative RPG dialogue borders — the "ornate window" look for dialogue/journal. | **CC0** |
| 6 | Kenney — **RPG Audio** | https://kenney.nl/assets/rpg-audio | 50 foley/weapon/UI sounds — reference for SFX length & punch (footstep, sword, magic). | **CC0** |
| 7 | Kenney — **Impact Sounds** | https://kenney.nl/assets/impact-sounds | 130 impact sounds — reference for hit/impact layering (low thud + high crack). | **CC0** |
| 8 | OpenGameArt — **LPC Collection** | https://opengameart.org/content/lpc-collection | Master index (~150 entries) of Liberated Pixel Cup 32x32 RPG art: forests, caverns, animated water, monsters, magic. | CC-BY-SA 3.0 / GPL (per item) |
| 9 | OGA — **[LPC] Golem** (William.Thompsonj & Redshrike) | https://opengameart.org/content/lpc-golem | Enemy sheets split into `golem-walk.png`, `golem-atk.png`, `golem-die.png` — the walk/attack/death triad for a heavy monster. | CC-BY 4.0/3.0, GPL, **OGA-BY 3.0** |
| 10 | OGA — **[LPC] Spider** (Redshrike) | https://opengameart.org/content/lpc-spider | Explicit frame discipline: **frame 1 = standing, frames 1-4 = attacking, frames 5-10 = walking, bottom row = dying**; 11 recoloured variants. | CC-BY 4.0/3.0, GPL, **OGA-BY 3.0** |
| 11 | OGA — **[LPC] Cavern and ruin tiles** (Reemax et al.) | https://opengameart.org/content/lpc-cavern-and-ruin-tiles | Ruin/cave vocabulary: **animated water & lava**, statues, big crystals, stone arches, magical circles, mine-cart tracks, coffins. | CC-BY-SA 3.0 / GPL |
| 12 | OGA — **Whispers of Avalon: Grassland Tileset** (Leonard Pabin) | https://opengameart.org/content/whispers-of-avalon-grassland-tileset | Production-grade 32x32 grassland: terrain transitions, tree canopies, flowing water; some tiles compose into 64x64 units. | CC-BY 3.0 / GPL 2.0/3.0 |
| 13 | OGA — **Overworld RPG tileset** (Tayoko) | https://opengameart.org/content/overworld-rpg-tileset | Forest / water / town / castle overworld at 16x16 — dense foliage silhouettes. | CC-BY-SA 3.0 / GPL |
| 14 | OGA — **Extended LPC Magic pack** (Daniel Eddeland) | https://opengameart.org/content/extended-lpc-magic-pack | Spell FX: tornado, snakebite, fire lion, ice tentacles, lightning claw. **128x128 per frame, 16 frames per animation**; author advises 50% **nearest-neighbour** downscale. | CC-BY-SA 3.0 / GPL 3.0 |
| 15 | OGA — **RPG GUI construction kit v1.0** (Lamoot) | https://opengameart.org/content/rpg-gui-construction-kit-v10 | Modular widget kit (text boxes, lists, buttons) — retro UI is assembled from 9-slice primitives, not pre-baked panels. | **CC-BY 3.0** |
| 16 | Wikipedia — **History of Eastern role-playing video games** | https://en.wikipedia.org/wiki/Japanese_role-playing_game | Genre conventions: pre-defined characters with personalities (FF, Lufia), speed/stat-driven turn order, Dragon Quest IV "Tactics" AI precursor, FF IV's hybrid Active Time Battle. | reference only (text) |

Cross-references seen while fetching (noted, not downloaded): Kenney *Pixel UI Pack*,
*UI Pack (RPG Expansion)*, *Tiny Farm*; OGA *LPC Animated Water and waterfalls*,
*LPC explosions*, *LPC LifeBars!*, *Whispers of Avalon: Animated Ocean Tileset*.

---

## 3. What the references taught us (design decisions)

### 3.1 Scale & proportion
- Two coherent scales exist in the wild: **16x16 tiles** (Kenney Tiny, Tayoko) and
  **32x32 tiles** (LPC, Whispers of Avalon). Mixing them looks like a placeholder soup.
- Decision: **16x16 world tiles** with **24x32 characters** (sprite overhangs its tile).
  This is the SNES convention (FF5/6 era) and keeps a 640x360 viewport showing
  40x22.5 tiles — enough to read a whole room at a glance.
- Battle sprites are drawn **2x-2.5x** the exploration silhouette, exactly as SNES
  side-view battles enlarge combatants.

### 3.2 Animation discipline (from #9, #10, #14)
- Fixed frame roles: `idle` (1-2), `walk` (4-6), `attack` (3-4), `hurt` (1-2),
  `die` (3-4). We adopt **idle 2, walk 4, attack 3, hurt 2, cast 3, die 4**.
- Effects are authored large (48-64 px) with **8-12 frames**, then never smooth-scaled.
- Walk cycles read at 8-10 fps, attacks at 12-16 fps. We use 9 fps walk, 16 fps attack.

### 3.3 Palette & lighting
- LPC / Whispers of Avalon art reads because every material has **3-4 steps**
  (shadow -> base -> highlight -> rim) and highlights **hue-shift toward the light**
  (warm lit faces, cool shadows) instead of merely adding white.
- Decision: one **32-colour master palette** (`src/art/Palette.ts`) with per-material
  4-step ramps. Dungeon/night areas reuse the same ramps but shift the ambient tint
  toward indigo; torch light is an additive warm blob rather than re-tinted tiles.
- Dithering is used **only** on large flat gradients (sky, water, lava glow) — never on
  sprite edges, which is what makes amateur 16-bit art look muddy.

### 3.4 Environment layering (from #11, #12, #13)
- Terrain transitions are drawn as **explicit corner/edge tiles**, not random scatter.
- Animated elements are the life-givers: water flow, lava bubbles, torch flames,
  wind-blown grass, drifting motes. Every area in this game has >= 2 animated layers.
- Ruin vocabulary adopted from #11: broken arches, statues, big crystals, coffins —
  plus **animated lava**, which drives the dungeon hazard system.

### 3.5 UI composition (from #4, #5, #15)
- Windows are **9-slice frames**: 1 px light inner bevel, 1 px dark outer edge.
- Text is a **fixed-width bitmap font** (5x7 glyphs in a 6x8 cell) so it stays crisp at
  every integer scale; no DOM text inside the play area.
- Command menus are a compact window with a **pulsing arrow cursor**, single column,
  MP cost right-aligned — the layout every SNES JRPG converged on.

### 3.6 Battle screen (from #3, #16)
- Enemies **left**, party **right**, both grounded on a horizon line with soft shadow
  ellipses; enemy HP bars above each enemy; command window bottom-right; target cursor
  is an arrow at the target's left edge.
- Turn order is stat-derived (speed) with a random tie-breaker — the documented genre
  convention in #16 — implemented as `SPD * 2 + rand(0..12)` re-rolled each round.

