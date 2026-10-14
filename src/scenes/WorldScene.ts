/**
 * The overworld. Maps are ASCII grids baked into a single texture at scene
 * start; props, NPCs and the player are y-sorted sprites. Handles movement,
 * collision, warps, chests, story triggers, random encounters, dialogue and
 * the HUD.
 */

import Phaser from 'phaser';
import { playTheme, sfx } from '../audio/Audio';
import { PC } from '../art/PixelCanvas';
import { TS } from '../art/TileArt';
import { rollEncounter, storyFoes } from '../battle/BattleEngine';
import { gs } from '../core/GameApp';
import { bus } from '../core/EventBus';
import type { PartyMember } from '../core/GameState';
import { session } from '../core/Session';
import { onStageResize, stage } from '../core/Stage';
import { SCENES, TIMING } from '../config/constants';
import { ITEMS } from '../data/Items';
import { activeObjectives } from '../data/Quests';
import { globalRng } from '../core/Rng';
import {
  cellAt,
  isSolid,
  mapDef,
  mapHeight,
  mapWidth,
  warpAt,
  type ChestDef,
  type Dir,
  type MapDef,
  type NpcDef,
  type TriggerDef
} from '../data/World';
import { DialogueRuntime } from '../ui/DialogueRuntime';
import { DialogBox } from '../ui/Dialog';
import { KeyPad, type KeyName } from '../ui/Keys';
import { Label, makeLabel } from '../ui/Text';
import { C, Gauge, hint } from '../ui/Window';
import { atlases, frameOf } from './BootScene';

interface NpcView {
  def: NpcDef;
  img: Phaser.GameObjects.Image;
  bobAt: number;
}

interface Toast {
  label: Label;
  life: number;
}

interface HudRow {
  member: PartyMember;
  name: Label;
  hp: Gauge;
  text: Label;
}

const FRAME_PREFIX: Record<Dir, 'd' | 'u' | 's'> = { down: 'd', up: 'u', left: 's', right: 's' };

/** The camera background; the backdrop beyond the map fades back into it. */
const VOID_RGB = 0x0b0f1a;
/** How dark the far edge of that fade gets, 0 at the map edge. */
const VOID_FADE = 0.9;

export class WorldScene extends Phaser.Scene {
  private map!: MapDef;
  private mapW = 0;
  private mapH = 0;
  private tx = 0;
  private ty = 0;
  private facing: Dir = 'down';
  private player!: Phaser.GameObjects.Image;
  private moving = false;
  private npcs: NpcView[] = [];
  private chestViews = new Map<string, Phaser.GameObjects.Image>();
  private liquids: Phaser.GameObjects.Image[] = [];
  private liquidFrame = 0;
  private pad!: KeyPad;
  private box!: DialogBox;
  private talk!: DialogueRuntime;
  private hudRows: HudRow[] = [];
  private questLabel!: Label;
  private hudHint!: Label;
  private toasts: Toast[] = [];
  private veil!: Phaser.GameObjects.Rectangle;
  private backdrop: Phaser.GameObjects.TileSprite | null = null;
  private backdropFade: Phaser.GameObjects.Graphics | null = null;
  private overlayOpen = false;
  private transitioning = false;
  private offHandlers: (() => void)[] = [];

  constructor() {
    super(SCENES.world);
  }

  /* ------------------------------------------------------------- startup */

  init(data: { map?: string; x?: number; y?: number }): void {
    const state = gs(this);
    this.map = mapDef(data.map ?? state.location);
    state.location = this.map.id;
    if (data.x !== undefined) state.px = data.x;
    if (data.y !== undefined) state.py = data.y;
    this.npcs = [];
    this.chestViews = new Map();
    this.liquids = [];
    this.hudRows = [];
    this.toasts = [];
    this.offHandlers = [];
    this.overlayOpen = false;
    this.transitioning = false;
    // Phaser drops every Key from the scene's KeyboardPlugin on shutdown and a
    // dropped Key keeps whatever `isDown` it had, so a cached key set from the
    // previous run of this scene is dead weight (see `heldDir`).
    this.keys = null;
  }

  create(): void {
    const state = gs(this);
    this.mapW = mapWidth(this.map);
    this.mapH = mapHeight(this.map);

    this.add.image(0, 0, this.bakeTerrain()).setOrigin(0, 0).setDepth(-20);
    this.buildBackdrop();
    this.buildLiquids();
    this.buildProps();
    this.buildNpcs();

    this.tx = Phaser.Math.Clamp(state.px, 0, this.mapW - 1);
    this.ty = Phaser.Math.Clamp(state.py, 0, this.mapH - 1);
    if (isSolid(this.map, this.tx, this.ty)) this.useSpawn();
    this.facing = state.facing;

    this.player = this.add
      .image(this.tx * TS + TS / 2, (this.ty + 1) * TS, `char_${state.active[0]?.id ?? 'kael'}`, 'd_idle0')
      .setOrigin(0.5, 1)
      .setDepth(this.ty * TS + TS);
    this.player.setFlipX(this.facing === 'left');

    this.frameCamera();
    this.cameras.main.startFollow(this.player, false, 0.16, 0.16);
    this.cameras.main.setBackgroundColor(VOID_RGB);

    this.box = new DialogBox(this, 24, stage.h - 96, stage.w - 48, 78);
    this.box.pin(800);
    this.box.setVisible(false);
    this.talk = new DialogueRuntime(this.box, state, {
      onBattle: (key) => this.requestStoryBattle(key),
      onWarp: (w) => this.doWarp(w.to, w.x, w.y),
      onShop: (stock) => this.openShop(stock),
      onInn: (price) => this.restAtInn(price),
      notify: (text) => this.toast(text),
      onEnd: () => undefined
    });

    this.buildHud();
    this.veil = this.add
      .rectangle(0, 0, 1, 1, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.relayout();
    onStageResize(this, () => this.relayout());

    this.pad = new KeyPad(this);
    playTheme(this.map.theme);

    this.offHandlers.push(
      bus.on('overlay:close', () => {
        // The ESC that just closed the menu is also sitting in this scene's key
        // queue (both scenes see every keypress). Drop it, or the same press
        // reopens the menu in this very frame.
        this.pad.clear();
        this.overlayOpen = false;
        this.scene.stop(SCENES.overlay);
        this.refreshHud();
        sfx('cancel');
      })
    );
    this.events.once('shutdown', () => this.teardown());

    this.tweens.add({ targets: this.veil, alpha: { from: 1, to: 0 }, duration: TIMING.fade });
    this.toast(this.map.name.toUpperCase());
  }

  private teardown(): void {
    this.offHandlers.forEach((off) => off());
    this.offHandlers = [];
    this.pad?.destroy();
  }

  private useSpawn(): void {
    this.tx = this.map.spawn.x;
    this.ty = this.map.spawn.y;
    this.facing = this.map.spawn.dir;
  }

  /* ------------------------------------------------------------- baking */

  /** Bakes the map's terrain into one texture so the map draws as one quad. */
  private bakeTerrain(): string {
    const key = `map_${this.map.id}`;
    if (this.textures.exists(key)) return key;
    const sheet = atlases.get('terrain');
    if (!sheet) return 'terrain';

    const pc = new PC(this.mapW * TS, this.mapH * TS);
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const cell = cellAt(this.map, x, y);
        // liquids bake a still frame; the animated copies sit on top of it
        const name = cell.liquid
          ? `${cell.liquid}_0`
          : `${cell.mat ?? 'void'}_${this.neighbourMask(x, y, cell.mat ?? 'void')}`;
        const f = frameOf(sheet, name);
        pc.blitRect(sheet.pc, f.x, f.y, TS, TS, x * TS, y * TS);
      }
    }
    this.textures.addCanvas(key, pc.canvas);
    return key;
  }

  /**
   * Maps are small — 44x30 tiles at the very most — while the stage is the
   * whole window, so a wide or short window looks past the map into the camera
   * background. Rather than a hard black edge around the map, the ground the
   * border ring sits on is tiled out to the edge of the camera bounds and faded
   * back into that background, which reads as country running past the map and
   * keeps the eye on the part of it that can be walked.
   */
  private buildBackdrop(): void {
    const mat = this.map.outside;
    const sheet = atlases.get('terrain');
    if (!mat || !sheet) return;

    // One tile is enough: mask 15 is the variant where the material continues on
    // all four sides, so it carries no edge fringe and butts up against itself.
    const key = `out_${mat}`;
    if (!this.textures.exists(key)) {
      const f = frameOf(sheet, `${mat}_15`);
      const pc = new PC(TS, TS);
      pc.blitRect(sheet.pc, f.x, f.y, TS, TS, 0, 0);
      this.textures.addCanvas(key, pc.canvas);
    }

    this.backdrop = this.add.tileSprite(0, 0, 1, 1, key).setOrigin(0, 0).setDepth(-30);
    this.backdropFade = this.add.graphics().setDepth(-29);
  }

  /** 1 = north, 2 = east, 4 = south, 8 = west neighbour shares the material. */
  private neighbourMask(x: number, y: number, mat: string): number {
    const same = (nx: number, ny: number): number => {
      const c = cellAt(this.map, nx, ny);
      return (c.liquid ?? c.mat ?? 'void') === mat ? 1 : 0;
    };
    return same(x, y - 1) | (same(x + 1, y) << 1) | (same(x, y + 1) << 2) | (same(x - 1, y) << 3);
  }

  private buildLiquids(): void {
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const cell = cellAt(this.map, x, y);
        if (!cell.liquid) continue;
        this.liquids.push(
          this.add
            .image(x * TS, y * TS, 'terrain', `${cell.liquid}_0`)
            .setOrigin(0, 0)
            .setDepth(-19)
        );
      }
    }
  }

  private buildProps(): void {
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const cell = cellAt(this.map, x, y);
        if (!cell.prop) continue;
        const chest = this.map.chests.find((c) => c.x === x && c.y === y);
        const opened = chest ? gs(this).bool(chest.flag) : false;
        const frame = chest && opened ? 'chest_open' : cell.prop;
        const img = this.add
          .image(x * TS + TS / 2, (y + 1) * TS, 'props', frame)
          .setOrigin(0.5, 1)
          .setDepth((y + 1) * TS);
        if (chest) this.chestViews.set(chest.id, img);
      }
    }
  }

  private buildNpcs(): void {
    for (const def of this.map.npcs) {
      const img = this.add
        .image(def.x * TS + TS / 2, (def.y + 1) * TS, `char_${def.art}`, 'd_idle0')
        .setOrigin(0.5, 1)
        .setDepth((def.y + 1) * TS);
      img.setFlipX(def.dir === 'left');
      this.npcs.push({ def, img, bobAt: 0 });
    }
  }

  /* ------------------------------------------------------------------- hud */

  private buildHud(): void {
    const state = gs(this);
    const rows = Math.min(3, state.active.length);
    this.pin(
      this.add.rectangle(4, 2, 182, 30 + rows * 18, 0x0b0f1a).setOrigin(0, 0).setAlpha(0.55),
      700
    );
    this.pin(makeLabel(this, this.map.name.toUpperCase(), 8, 6, { color: C.gold }), 702);
    this.pin(makeLabel(this, `${state.gold} COIN`, 8, 18, { color: C.dim }), 702);

    state.active.slice(0, 3).forEach((m, i) => {
      const y = 34 + i * 18;
      this.hudRows.push({
        member: m,
        name: this.pin(makeLabel(this, m.name.toUpperCase(), 8, y, { color: C.text }), 702),
        hp: this.pin(new Gauge(this, 62, y + 1, 56, 7, 'hp'), 702),
        text: this.pin(makeLabel(this, '', 122, y, { color: C.dim }), 702)
      });
    });

    this.questLabel = this.pin(makeLabel(this, '', stage.w - 8, 6, { color: C.dim, align: 'right' }), 702);
    this.hudHint = this.pin(hint(this, '[Z] ACT   [ESC] MENU', stage.w - 8, stage.h - 22), 702);
    this.refreshHud();
  }

  /** Pins a UI object to the camera: the map scrolls, the HUD must not. */
  private pin<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Container | Phaser.GameObjects.Rectangle>(
    obj: T,
    depth: number
  ): T {
    obj.setScrollFactor(0);
    obj.setDepth(depth);
    return obj;
  }

  /**
   * The camera window is the stage; the region it may roam is the map, but never
   * smaller than the stage itself — a map smaller than the window sits centred in
   * it instead of being pinned to a corner.
   *
   * Phaser clamps the scroll against the bounds for a camera centred on its
   * origin, and `Stage` puts that origin at the top-left of the canvas, so the
   * view would reach half the difference between the canvas and the layout space
   * past the bounds. Pushing the bounds in by that much keeps the roam inside the
   * region, which is what the backdrop is sized to.
   */
  private frameCamera(): void {
    const cam = this.cameras.main;
    const { w, h, zoom } = stage;
    const rw = Math.max(this.mapW * TS, w);
    const rh = Math.max(this.mapH * TS, h);
    const rx = (this.mapW * TS - rw) / 2;
    const ry = (this.mapH * TS - rh) / 2;
    cam.setBounds(rx + (w * (zoom - 1)) / 2, ry + (h * (zoom - 1)) / 2, rw, rh);
    // Follow lands the target in the middle of the window: the scroll is the
    // world coordinate behind the canvas' top-left pixel, so the target has to be
    // pushed by half the layout space to sit at its centre.
    cam.setFollowOffset(w / 2, h / 2);
    cam.setRoundPixels(true);
    this.layoutBackdrop(rx, ry, rw, rh);
  }

  /**
   * The backdrop and its fade cover the region the camera may roam, so no part
   * of the view is ever left looking at bare background. Called from
   * `frameCamera`, so it follows every resize.
   */
  private layoutBackdrop(bx: number, by: number, bw: number, bh: number): void {
    if (!this.backdrop || !this.backdropFade) return;
    const mw = this.mapW * TS;
    const mh = this.mapH * TS;
    this.backdrop.setPosition(bx, by).setSize(bw, bh);

    const g = this.backdropFade;
    g.clear();
    // One band per side, clear against the map and darkest at the window edge;
    // the corners take two bands and fall off fastest.
    const band = (x: number, y: number, w: number, h: number, a: number[]): void => {
      if (w <= 0 || h <= 0) return;
      g.fillGradientStyle(VOID_RGB, VOID_RGB, VOID_RGB, VOID_RGB, a[0], a[1], a[2], a[3]);
      g.fillRect(x, y, w, h);
    };
    band(bx, by, bw, -by, [VOID_FADE, VOID_FADE, 0, 0]);
    band(bx, mh, bw, by + bh - mh, [0, 0, VOID_FADE, VOID_FADE]);
    band(bx, by, -bx, bh, [VOID_FADE, 0, VOID_FADE, 0]);
    band(mw, by, bx + bw - mw, bh, [0, VOID_FADE, 0, VOID_FADE]);
  }

  /**
   * HUD, dialogue box and toasts are pinned to the camera, so they follow the
   * window rather than the map. The box re-wraps in place: the line being typed
   * survives a resize.
   */
  private relayout(): void {
    const { w, h, cx } = stage;
    this.frameCamera();

    const bw = Math.min(w - 32, 900);
    const bh = Math.min(78, Math.max(52, h - 40));
    this.box.relayout(Math.round(cx - bw / 2), h - bh - 18, bw, bh);

    this.veil.setSize(w, h);
    this.questLabel.setPosition(w - 8, 6);
    this.hudHint.setPosition(w - 8, h - 22);
    this.toasts.forEach((t, i) => t.label.setPosition(cx, h - 30 - i * 12));
  }

  private refreshHud(): void {
    const state = gs(this);
    for (const row of this.hudRows) {
      const m = state.member(row.member.id) ?? row.member;
      const max = state.memberMaxHp(m);
      row.hp.set(max > 0 ? m.hp / max : 0);
      row.text.setText(`${m.hp}/${max}`);
      row.name.setColor(m.hp > 0 ? C.text : C.hpLow);
    }
    const objectives = activeObjectives(state);
    this.questLabel.setText(objectives.length ? objectives[0].text : '');
  }

  /* --------------------------------------------------------------- update */

  override update(time: number, delta: number): void {
    gs(this).playtime += delta / 1000;
    this.animateLiquids(time);
    this.animateNpcs(time);
    this.updateToasts(delta);
    if (this.transitioning) return;

    this.talk.update(delta);
    for (let key = this.pad.next(); key; key = this.pad.next()) {
      if (this.talk.active) this.talk.key(key);
      else if (!this.overlayOpen) this.handleKey(key);
    }

    const frozen = this.talk.active || this.overlayOpen;
    this.moving = !frozen && this.movePlayer(delta);
    this.animatePlayer(time);
  }

  private handleKey(name: KeyName): void {
    if (name === 'CONFIRM') this.interact();
    else if (name === 'MENU') this.openMenu();
  }

  /* ------------------------------------------------------------- movement */

  /**
   * Held-direction keys, re-armed whenever they no longer belong to this
   * scene's live KeyboardPlugin. Phaser removes every Key from the plugin when
   * the scene shuts down (`KeyboardPlugin.shutdown` -> `removeAllKeys(true)`)
   * and `Key.destroy()` never clears `isDown`, so a cache that outlives a warp,
   * encounter or story trigger stops updating entirely and leaves whatever
   * direction was held at the restart stuck on for good.
   */
  private keys: Record<string, Phaser.Input.Keyboard.Key> | null = null;

  private heldDir(): Dir | null {
    const kb = this.input.keyboard;
    if (!kb) return null;
    if (!this.keys || this.keys.RIGHT.plugin !== kb) {
      this.keys = kb.addKeys(
        'UP,DOWN,LEFT,RIGHT,W,A,S,D'
      ) as unknown as Record<string, Phaser.Input.Keyboard.Key>;
    }
    const keys = this.keys;
    const down = (a: string, b: string): boolean => keys[a].isDown || keys[b].isDown;
    if (down('UP', 'W')) return 'up';
    if (down('DOWN', 'S')) return 'down';
    if (down('LEFT', 'A')) return 'left';
    if (down('RIGHT', 'D')) return 'right';
    return null;
  }

  /** Free 4-directional movement with a small feet hitbox. */
  private movePlayer(delta: number): boolean {
    const dir = this.heldDir();
    if (!dir) return false;
    this.facing = dir;
    this.player.setFlipX(dir === 'left');

    const step = (94 * Math.min(delta, 60)) / 1000;
    const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
    const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
    let moved = false;
    if (dx !== 0 && !this.blocked(this.player.x + dx, this.player.y)) {
      this.player.x += dx;
      moved = true;
    }
    if (dy !== 0 && !this.blocked(this.player.x, this.player.y + dy)) {
      this.player.y += dy;
      moved = true;
    }
    if (moved) {
      this.player.setDepth(this.player.y);
      this.syncTile();
    }
    return moved;
  }

  private blocked(x: number, y: number): boolean {
    const probes: [number, number][] = [
      [x - 5, y - 2],
      [x + 5, y - 2],
      [x - 5, y - 10],
      [x + 5, y - 10]
    ];
    for (const [cx, cy] of probes) {
      const tx = Math.floor(cx / TS);
      const ty = Math.floor(cy / TS);
      if (isSolid(this.map, tx, ty)) return true;
      if (this.npcAt(tx, ty)) return true;
    }
    return false;
  }

  private npcAt(tx: number, ty: number): NpcDef | undefined {
    return this.map.npcs.find((n) => n.x === tx && n.y === ty);
  }

  private syncTile(): void {
    const tx = Math.floor(this.player.x / TS);
    const ty = Math.floor((this.player.y - 2) / TS);
    if (tx === this.tx && ty === this.ty) return;
    this.tx = tx;
    this.ty = ty;
    this.onTile();
  }

  /* ------------------------------------------------- tile-level reactions */

  private onTile(): void {
    const state = gs(this);
    state.px = this.tx;
    state.py = this.ty;
    state.facing = this.facing;

    const warp = warpAt(this.map, this.tx, this.ty);
    if (warp) {
      if (warp.label) this.toast(warp.label);
      this.doWarp(warp.to, warp.tx, warp.ty);
      return;
    }

    const trig = this.map.triggers.find((t) => !state.bool(t.flag) && this.onTrigger(t));
    if (trig) {
      state.setFlag(trig.flag, true);
      this.startStory(trig.story);
      return;
    }

    if (this.map.encounter && this.map.rate > 0 && globalRng.float() < this.map.rate) {
      this.startEncounter();
    }
  }

  private onTrigger(t: TriggerDef): boolean {
    const w = t.w ?? 1;
    const h = t.h ?? 1;
    return this.tx >= t.x && this.tx < t.x + w && this.ty >= t.y && this.ty < t.y + h;
  }

  private startEncounter(): void {
    const foes = rollEncounter(this.map.encounter ?? '', globalRng);
    if (!foes.length) return;
    sfx('encounter');
    session.battle = { foes, backdrop: this.map.arena, flee: true };
    session.returnTo = SCENES.world;
    this.leave(SCENES.battle);
  }

  private requestStoryBattle(key: string): void {
    session.battle = {
      foes: storyFoes(key),
      backdrop: this.map.arena,
      storyId: key,
      flee: false
    };
    session.returnTo = SCENES.world;
    this.leave(SCENES.battle);
  }

  private startStory(id: string): void {
    session.story = id;
    session.storyPhase = 'lines';
    this.leave(SCENES.story);
  }

  private doWarp(to: string, x: number, y: number): void {
    if (this.transitioning) return;
    sfx('warp');
    this.leave(SCENES.world, { map: to, x, y });
  }

  /** Fade out, then hand off to another scene. */
  private leave(next: string, data?: object): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.pad.clear();
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: TIMING.fade,
      onComplete: () => this.scene.start(next, data)
    });
  }

  /* ---------------------------------------------------------- interaction */

  private frontTile(): [number, number] {
    const dx = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
    const dy = this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0;
    return [this.tx + dx, this.ty + dy];
  }

  private interact(): void {
    const [fx, fy] = this.frontTile();

    const npc = this.npcAt(fx, fy);
    if (npc) {
      sfx('confirm');
      if (!this.talk.start(npc.talk)) this.toast('...');
      return;
    }

    const chest = this.map.chests.find((c) => c.x === fx && c.y === fy);
    if (chest) {
      this.openChest(chest);
      return;
    }

    const warp = warpAt(this.map, fx, fy);
    if (warp?.label) this.toast(warp.label);
  }

  private openChest(chest: ChestDef): void {
    const state = gs(this);
    if (state.bool(chest.flag)) {
      this.toast('ALREADY EMPTIED');
      return;
    }
    state.setFlag(chest.flag, true);
    sfx('chest');
    this.chestViews.get(chest.id)?.setFrame('chest_open');
    this.toast(chest.message);
    for (const [id, n] of chest.items) {
      state.addItem(id, n);
      this.toast(`+${n} ${ITEMS[id]?.name ?? id}`);
    }
    if (chest.gold) {
      state.gold += chest.gold;
      this.toast(`+${chest.gold} COIN`);
    }
    bus.emit('item:changed', undefined);
    this.refreshHud();
  }

  private openMenu(): void {
    session.tab = session.tab ?? 'party';
    this.openOverlay();
    sfx('pause');
  }

  private openShop(stock: string): void {
    session.shop = { stock, sell: true, label: this.map.name };
    this.openOverlay();
    sfx('confirm');
  }

  private openOverlay(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.pad.clear();
    this.scene.launch(SCENES.overlay);
    this.scene.bringToTop(SCENES.overlay);
  }

  private restAtInn(price: number): void {
    const state = gs(this);
    if (state.gold < price) {
      this.toast('NOT ENOUGH COIN');
      sfx('error');
      return;
    }
    state.gold -= price;
    state.restFull();
    sfx('save');
    this.toast('THE PARTY SLEEPS');
    this.refreshHud();
  }

  /* ----------------------------------------------------------- animation */

  private animatePlayer(time: number): void {
    const p = FRAME_PREFIX[this.facing];
    const frame = this.moving
      ? `${p}_walk${Math.floor(time / (1000 / TIMING.walkFps)) % 4}`
      : `${p}_idle${Math.floor(time / (1000 / TIMING.idleFps)) % 2}`;
    if (this.player.frame.name !== frame) this.player.setFrame(frame);
  }

  private animateNpcs(time: number): void {
    const frame = Math.floor(time / (1000 / TIMING.idleFps)) % 2;
    for (const npc of this.npcs) {
      const name = `${npc.def.dir === 'side' ? 's' : FRAME_PREFIX[npc.def.dir]}_idle${frame}`;
      if (npc.img.frame.name !== name) npc.img.setFrame(name);
    }
  }

  private animateLiquids(time: number): void {
    const frame = Math.floor(time / 220) % 4;
    if (frame === this.liquidFrame) return;
    this.liquidFrame = frame;
    for (const img of this.liquids) {
      const mat = this.map ? cellAt(this.map, Math.floor(img.x / TS), Math.floor(img.y / TS)).liquid : undefined;
      if (mat) img.setFrame(`${mat}_${frame}`);
    }
  }

  /* -------------------------------------------------------------- toasts */

  private toast(text: string): void {
    const label = makeLabel(this, text, stage.cx, stage.h - 30 - this.toasts.length * 12, {
      color: C.text,
      align: 'center'
    });
    label.setDepth(900);
    label.setScrollFactor(0);
    this.toasts.push({ label, life: 2400 });
  }

  private updateToasts(delta: number): void {
    const kept: Toast[] = [];
    for (const t of this.toasts) {
      t.life -= delta;
      if (t.life <= 0) {
        t.label.destroy();
        continue;
      }
      if (t.life < 420) t.label.setAlpha(t.life / 420);
      kept.push(t);
    }
    this.toasts = kept;
  }
}


