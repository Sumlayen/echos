/**
 * UI chrome shared by every scene: nine-slice windows, gauges, and the menu
 * list widget. Everything is drawn from generated textures or the master
 * palette so the HUD stays pixel-crisp at the 640x360 native resolution.
 */

import Phaser from 'phaser';
import { WINDOW_BORDER } from '../art/UIArt';
import { Label, makeLabel } from './Text';

export const C = {
  text: 0xf2f5fb,
  dim: 0x8e9ab4,
  dark: 0x5c6a86,
  gold: 0xf0c04e,
  hp: 0xee7c6c,
  hpLow: 0xbe4a4a,
  mp: 0x7ba4dc,
  xp: 0xf0c04e,
  ok: 0xa6d87c,
  bad: 0xbe4a4a,
  bg: 0x1b2338,
  shadow: 0x222a3d
} as const;

/* ------------------------------------------------------------------ panel */

export class Panel extends Phaser.GameObjects.Container {
  skin: Phaser.GameObjects.NineSlice;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    skinName = 'win_default'
  ) {
    super(scene, x, y);
    this.skin = scene.add
      .nineslice(0, 0, skinName, undefined, w, h, WINDOW_BORDER, WINDOW_BORDER, WINDOW_BORDER, WINDOW_BORDER)
      .setOrigin(0, 0);
    this.add(this.skin);
    scene.add.existing(this);
  }

  resize(w: number, h: number): this {
    this.skin.setSize(w, h);
    return this;
  }
}

/* ------------------------------------------------------------------ gauge */

export type GaugeKind = 'hp' | 'mp' | 'xp' | 'foe';

const RAMPS: Record<GaugeKind, [number, number, number]> = {
  hp: [0x7c2a2a, 0xbe4a4a, 0xee7c6c],
  mp: [0x243a63, 0x4a76b8, 0x7ba4dc],
  xp: [0x7a5a17, 0xc39a30, 0xf0c04e],
  foe: [0x4a1a1a, 0x8a3a24, 0xc65a2b]
};

/** Thin bar drawn with Graphics: ink border, three-band fill. */
export class Gauge extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private ratio = 1;
  private shown = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private gw: number,
    private gh: number,
    private kind: GaugeKind = 'hp'
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.add(this.g);
    scene.add.existing(this);
    this.draw();
  }

  /** 0..1. `animate` slides the previous value toward the new one. */
  set(ratio: number, animate = false): this {
    this.ratio = Math.max(0, Math.min(1, ratio));
    if (!animate) {
      this.shown = this.ratio;
      this.draw();
      return this;
    }
    const from = this.shown;
    const to = this.ratio;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 320,
      ease: 'Sine.Out',
      onUpdate: (t) => {
        this.shown = Phaser.Math.Linear(from, to, t.getValue(0) ?? 0);
        this.draw();
      }
    });
    return this;
  }

  get value(): number {
    return this.shown;
  }

  setKind(kind: GaugeKind): this {
    this.kind = kind;
    this.draw();
    return this;
  }

  private draw(): void {
    const g = this.g;
    const [dark, mid, light] = RAMPS[this.kind];
    g.clear();
    g.fillStyle(0x0b0f1a).fillRect(0, 0, this.gw, this.gh);
    g.fillStyle(0x222a3d).fillRect(1, 1, this.gw - 2, this.gh - 2);
    const inner = this.gw - 2;
    const fill = Math.round(inner * this.shown);
    if (fill > 0) {
      g.fillStyle(mid).fillRect(1, 1, fill, this.gh - 2);
      g.fillStyle(light).fillRect(1, 1, fill, 1);
      g.fillStyle(dark).fillRect(1, this.gh - 2, fill, 1);
      for (let x = 4; x < inner; x += 4) {
        if (x < fill) g.fillStyle(0x0b0f1a).fillRect(x, 1, 1, this.gh - 2);
      }
    }
  }
}


/* -------------------------------------------------------------- menu list */

export interface MenuEntry {
  label: string;
  note?: string;
  icon?: string;
  enabled?: boolean;
  color?: number;
}

export interface MenuOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  rowH?: number;
  scale?: number;
  icon?: boolean;
  noteX?: number;
  onChange?: (index: number, entry: MenuEntry) => void;
  onConfirm?: (index: number, entry: MenuEntry) => void;
  /**
   * Draw order. A list that sits on top of a `Panel` needs a depth above it or
   * it is hidden behind the frame it is drawn inside.
   */
  depth?: number;
}

/** Keyboard-driven vertical list with an animated cursor. */
export class MenuList {
  index = 0;
  private items: MenuEntry[] = [];
  private labels: Label[] = [];
  private notes: Label[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private cursor: Phaser.GameObjects.Image;
  private rowH: number;
  private padX: number;
  private pinned = 0;

  constructor(private o: MenuOptions) {
    this.rowH = o.rowH ?? 14;
    this.padX = o.icon ? 16 : 0;
    this.cursor = o.scene.add.image(o.x - 12, o.y + 3, 'ui', 'cursor_0');
    this.cursor.setOrigin(0, 0.5);
    if (o.depth !== undefined) this.cursor.setDepth(o.depth);
    o.scene.tweens.add({
      targets: this.cursor,
      x: this.cursor.x - 3,
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  get count(): number {
    return this.items.length;
  }

  get entry(): MenuEntry | undefined {
    return this.items[this.index];
  }

  setItems(items: MenuEntry[]): this {
    this.clear();
    this.items = items;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    items.forEach((it, i) => {
      const y = this.o.y + i * this.rowH;
      if (it.icon) {
        const ic = this.o.scene.add.image(this.o.x - 6, y + 3, 'icons', it.icon);
        ic.setOrigin(0, 0.5);
        this.icons.push(ic);
      }
      const enabled = it.enabled !== false;
      this.labels.push(
        makeLabel(this.o.scene, it.label, this.o.x + this.padX, y, {
          color: it.color ?? (enabled ? C.text : C.dark),
          scale: this.o.scale ?? 1
        })
      );
      if (it.note) {
        this.notes.push(
          makeLabel(this.o.scene, it.note, this.o.noteX ?? this.o.x + 150, y, {
            color: C.dim,
            scale: this.o.scale ?? 1
          })
        );
      }
    });
    this.place();
    if (this.pinned) this.pin(this.pinned);
    else if (this.o.depth !== undefined) this.setDepth(this.o.depth);
    return this;
  }

  /** Draw order for everything the list owns (cursor, labels, notes, icons). */
  setDepth(depth: number): this {
    this.cursor.setDepth(depth);
    for (const l of this.labels) l.setDepth(depth + 1);
    for (const l of this.notes) l.setDepth(depth + 1);
    for (const ic of this.icons) ic.setDepth(depth + 1);
    return this;
  }

  /**
   * Keeps the list glued to the camera instead of the world, at `depth`.
   * Needed by overlays that sit on top of a scrolling map.
   */
  pin(depth: number): this {
    this.pinned = depth;
    this.cursor.setScrollFactor(0);
    for (const l of this.labels) l.setScrollFactor(0);
    for (const l of this.notes) l.setScrollFactor(0);
    for (const ic of this.icons) ic.setScrollFactor(0);
    return this.setDepth(depth);
  }

  refresh(items: MenuEntry[]): this {
    return this.setItems(items);
  }

  private place(): void {
    const it = this.items[this.index];
    const y = this.o.y + this.index * this.rowH + 3;
    this.cursor.setVisible(!!it).setPosition(this.o.x - 12, y);
    this.labels.forEach((l, i) => {
      const e = this.items[i];
      l.setColor(e.color ?? (e.enabled === false ? C.dark : i === this.index ? 0xffffff : C.text));
    });
    if (it) this.o.onChange?.(this.index, it);
  }

  /** Moves to the next enabled entry, wrapping. */
  move(delta: number): this {
    if (!this.items.length) return this;
    let i = this.index;
    for (let step = 0; step < this.items.length; step++) {
      i = (i + delta + this.items.length) % this.items.length;
      if (this.items[i].enabled !== false) break;
    }
    this.index = i;
    this.place();
    return this;
  }

  setIndex(i: number): this {
    this.index = Math.max(0, Math.min(this.items.length - 1, i));
    this.place();
    return this;
  }

  confirm(): void {
    const e = this.items[this.index];
    if (e && e.enabled !== false) this.o.onConfirm?.(this.index, e);
  }

  setVisible(v: boolean): this {
    this.cursor.setVisible(v);
    this.labels.forEach((l) => l.setVisible(v));
    this.notes.forEach((l) => l.setVisible(v));
    this.icons.forEach((l) => l.setVisible(v));
    return this;
  }

  private clear(): void {
    this.labels.forEach((l) => l.destroy());
    this.notes.forEach((l) => l.destroy());
    this.icons.forEach((l) => l.destroy());
    this.labels = [];
    this.notes = [];
    this.icons = [];
  }

  destroy(): void {
    this.clear();
    this.cursor.destroy();
  }
}

/* ------------------------------------------------------------------ misc */

export function icon(
  scene: Phaser.Scene,
  name: string,
  x: number,
  y: number
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'icons', name).setOrigin(0, 0);
}

/** Small dim "press" hint, e.g. `[Z] OK`. */
export function hint(
  scene: Phaser.Scene,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right' = 'right'
): Label {
  return makeLabel(scene, text, x, y, { color: C.dim, align });
}
