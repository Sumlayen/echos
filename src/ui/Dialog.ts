/**
 * The dialogue box. One instance per scene that speaks: it owns the window, the
 * wrapped text (one label per line so the typewriter reveal works across line
 * breaks), the blinking continue arrow, and an optional inline choice list.
 */

import Phaser from 'phaser';
import { getSettings } from '../core/Settings';
import { Label, makeLabel, wrap } from './Text';
import { C, MenuList, Panel } from './Window';

export class DialogBox {
  readonly panel: Panel;
  private nameL: Label;
  private lines: Label[] = [];
  private starts: number[] = [];
  private prompt: Phaser.GameObjects.Image;
  private full = '';
  private shown = 0;
  private acc = 0;
  private choices: MenuList | null = null;
  private onChoice: ((index: number) => void) | null = null;
  private pinned = 0;

  constructor(
    private scene: Phaser.Scene,
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    skin = 'win_default'
  ) {
    this.panel = new Panel(scene, x, y, w, h, skin);
    this.nameL = makeLabel(scene, '', x + 14, y + 8, { color: C.gold });
    this.prompt = scene.add.image(x + w - 16, y + h - 12, 'ui', 'arrow_down');
    this.prompt.setTint(C.gold).setVisible(false);
    scene.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 420,
      yoyo: true,
      repeat: -1
    });
  }

  get text(): string {
    return this.full;
  }

  get typed(): number {
    return this.shown;
  }

  get total(): number {
    return this.full.length;
  }

  typing(): boolean {
    return this.shown < this.full.length;
  }

  open(speaker: string | undefined, text: string): this {
    this.clearLines();
    this.clearChoices();
    this.full = text;
    this.shown = 0;
    this.acc = 0;
    this.nameL.setText(speaker ?? '');
    const wrapped = wrap(text, this.w - 28);
    this.starts = [];
    let offset = 0;
    wrapped.forEach((line, i) => {
      this.starts.push(offset);
      offset += line.length + 1;
      this.lines.push(
        makeLabel(this.scene, line, this.x + 14, this.y + (speaker ? 24 : 12) + i * 11, {
          color: C.text
        })
      );
    });
    this.paint();
    this.prompt.setVisible(false);
    if (this.pinned) this.pin(this.pinned);
    return this;
  }

  /**
   * Keeps the box glued to the camera rather than the world, at `depth`.
   * Call once for scenes whose camera scrolls (the overworld).
   */
  pin(depth: number): this {
    this.pinned = depth;
    this.panel.setScrollFactor(0).setDepth(depth);
    this.nameL.setScrollFactor(0).setDepth(depth + 1);
    this.prompt.setScrollFactor(0).setDepth(depth + 1);
    for (const l of this.lines) l.setScrollFactor(0).setDepth(depth + 1);
    this.choices?.pin(depth + 1);
    return this;
  }

  /**
   * Re-flow the box for a new stage size: move the frame, re-wrap the running
   * text into the new width and keep the typewriter exactly where it was.
   */
  relayout(x: number, y: number, w: number, h: number): this {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.panel.place(x, y, w, h);
    this.nameL.setPosition(x + 14, y + 8);
    this.prompt.setPosition(x + w - 16, y + h - 12);

    const speaker = this.nameL.readable;
    for (const l of this.lines) l.destroy();
    this.lines = [];
    this.starts = [];
    let offset = 0;
    wrap(this.full, w - 28).forEach((line, i) => {
      this.starts.push(offset);
      offset += line.length + 1;
      this.lines.push(
        makeLabel(this.scene, line, x + 14, y + (speaker ? 24 : 12) + i * 11, { color: C.text })
      );
    });
    this.paint();

    if (this.choices) {
      const at = this.choices.index;
      this.choices.relayout(x + 22, y + h + 6);
      this.choices.setIndex(at);
    }
    if (this.pinned) this.pin(this.pinned);
    return this;
  }

  /** Drives the typewriter; call from the scene's update(). */
  tick(delta: number): this {
    if (!this.typing()) return this;
    const cps = Math.max(8, getSettings().textSpeed);
    this.acc += (delta / 1000) * cps;
    while (this.acc >= 1 && this.shown < this.full.length) {
      this.acc -= 1;
      this.shown++;
      this.paint();
    }
    if (!this.typing()) this.prompt.setVisible(!this.choices);
    return this;
  }

  /** Instantly reveals the rest of the line (or returns true when done). */
  skip(): boolean {
    if (this.typing()) {
      this.shown = this.full.length;
      this.paint();
      this.prompt.setVisible(!this.choices);
      return false;
    }
    return true;
  }

  private paint(): void {
    this.lines.forEach((l, i) => {
      const start = this.starts[i];
      l.setReveal(Math.max(0, this.shown - start));
    });
  }

  setChoices(labels: string[], onChoice: (index: number) => void): this {
    this.clearChoices();
    this.onChoice = onChoice;
    const top = this.y + this.h + 6;
    this.choices = new MenuList({
      scene: this.scene,
      x: this.x + 22,
      y: top,
      rowH: 15,
      icon: true,
      onConfirm: (i) => this.onChoice?.(i)
    });
    this.choices.setItems(labels.map((label) => ({ label, icon: 'arrow' })));
    if (this.pinned) this.choices.pin(this.pinned + 1);
    this.prompt.setVisible(false);
    return this;
  }

  hasChoices(): boolean {
    return !!this.choices;
  }

  choiceIndex(): number {
    return this.choices?.index ?? 0;
  }

  moveChoice(delta: number): void {
    this.choices?.move(delta);
  }

  confirmChoice(): void {
    this.choices?.confirm();
  }

  clearChoices(): this {
    if (this.choices) {
      this.choices.destroy();
      this.choices = null;
    }
    this.onChoice = null;
    return this;
  }

  setVisible(v: boolean): this {
    this.panel.setVisible(v);
    this.nameL.setVisible(v);
    this.prompt.setVisible(v && !this.typing() && !this.choices);
    this.lines.forEach((l) => l.setVisible(v));
    return this;
  }

  private clearLines(): void {
    this.lines.forEach((l) => l.destroy());
    this.lines = [];
    this.starts = [];
  }

  destroy(): void {
    this.clearLines();
    this.clearChoices();
    this.nameL.destroy();
    this.prompt.destroy();
    this.panel.destroy();
  }
}
