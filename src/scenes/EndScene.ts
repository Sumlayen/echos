/**
 * The ending card. The epilogue lines already played in `StoryScene`, so this
 * is just the credits, the run's numbers, and a way back to the title.
 */

import Phaser from 'phaser';
import { playTheme } from '../audio/Audio';
import { GAME_TITLE, SCENES, TIMING } from '../config/constants';
import { gs } from '../core/GameApp';
import { SaveManager } from '../core/SaveManager';
import { session } from '../core/Session';
import { cover, onStageResize, stage } from '../core/Stage';
import { KeyPad } from '../ui/Keys';
import { Label, makeLabel } from '../ui/Text';
import { C, Panel } from '../ui/Window';

export class EndScene extends Phaser.Scene {
  private pad!: KeyPad;
  private veil!: Phaser.GameObjects.Rectangle;
  private bg!: Phaser.GameObjects.Image;
  private tint!: Phaser.GameObjects.Rectangle;
  private headL!: Label;
  private titleL!: Label;
  private card!: Panel;
  private rowLabels: Label[] = [];
  private promptL!: Label;
  private leaving = false;

  constructor() {
    super(SCENES.end);
  }

  create(): void {
    const state = gs(this);
    this.bg = this.add.image(0, 0, 'title').setOrigin(0, 0);
    this.tint = this.add.rectangle(0, 0, 1, 1, 0x0b0f1a).setOrigin(0, 0).setAlpha(0.62).setDepth(5);

    this.headL = makeLabel(this, 'THE TALE ENDS', 0, 0, { color: C.gold, align: 'center', scale: 2 });
    this.titleL = makeLabel(this, GAME_TITLE, 0, 0, { color: C.text, align: 'center' });

    const levels = state.active.map((m) => `${m.name.toUpperCase()} LV${m.level}`).join('   ');
    this.card = new Panel(this, 0, 0, 340, 96);
    this.card.setDepth(6);
    const rows = [
      `PLAYTIME   ${SaveManager.formatTime(state.playtime)}`,
      `GIL        ${state.gil}`,
      `PARTY      ${levels || 'NONE'}`,
      `CHESTS     ${Object.keys(state.flags).filter((f) => f.startsWith('chest.')).length} OPENED`
    ];
    rows.forEach((line, i) => {
      this.rowLabels.push(makeLabel(this, line, 0, 0, { color: i === 2 ? C.text : C.dim }).setDepth(7));
    });

    this.promptL = makeLabel(this, 'PRESS ANY KEY FOR THE TITLE', 0, 0, {
      color: C.dim,
      align: 'center'
    });
    this.promptL.setDepth(7);
    this.tweens.add({
      targets: this.promptL,
      alpha: { from: 1, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    this.veil = this.add
      .rectangle(0, 0, 1, 1, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(1000);
    this.tweens.add({ targets: this.veil, alpha: { from: 1, to: 0 }, duration: TIMING.fade * 2 });

    this.relayout();
    onStageResize(this, () => this.relayout());

    playTheme('ending');
    this.pad = new KeyPad(this);
    this.events.once('shutdown', () => this.pad?.destroy());
  }

  /** The ending card is centred, so it just re-centres on a resize. */
  private relayout(): void {
    const { w, h, cx } = stage;
    cover(this.bg, w, h);
    this.tint.setSize(w, h);
    this.veil.setSize(w, h);

    this.headL.setScaleValue(w >= 420 ? 2 : 1);
    const top = Math.max(24, Math.round(h * 0.17));
    this.headL.setPosition(cx, top);
    this.titleL.setPosition(cx, top + 34);

    const pw = Math.min(340, w - 40);
    const px = Math.round(cx - pw / 2);
    const py = top + 64;
    this.card.place(px, py, pw, 96);
    this.rowLabels.forEach((l, i) => l.setPosition(px + 20, py + 18 + i * 17));
    this.promptL.setPosition(cx, Math.min(h - 22, py + 96 + 28));
  }

  override update(): void {
    if (this.leaving) return;
    if (!this.pad.next()) return;
    this.leaving = true;
    session.ending = false;
    session.story = null;
    session.storyPhase = 'lines';
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: TIMING.fade,
      onComplete: () => this.scene.start(SCENES.title)
    });
  }
}
