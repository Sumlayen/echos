/**
 * The ending card. The epilogue lines already played in `StoryScene`, so this
 * is just the credits, the run's numbers, and a way back to the title.
 */

import Phaser from 'phaser';
import { playTheme } from '../audio/Audio';
import { GAME_TITLE, SCENES, TIMING, VIEW_H, VIEW_W } from '../config/constants';
import { gs } from '../core/GameApp';
import { SaveManager } from '../core/SaveManager';
import { session } from '../core/Session';
import { KeyPad } from '../ui/Keys';
import { makeLabel } from '../ui/Text';
import { C, Panel } from '../ui/Window';

export class EndScene extends Phaser.Scene {
  private pad!: KeyPad;
  private veil!: Phaser.GameObjects.Rectangle;
  private leaving = false;

  constructor() {
    super(SCENES.end);
  }

  create(): void {
    const state = gs(this);
    this.add.image(0, 0, 'title').setOrigin(0, 0);
    this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x0b0f1a)
      .setOrigin(0, 0)
      .setAlpha(0.62)
      .setDepth(5);

    makeLabel(this, 'THE TALE ENDS', VIEW_W / 2, 62, { color: C.gold, align: 'center', scale: 2 });
    makeLabel(this, GAME_TITLE, VIEW_W / 2, 96, { color: C.text, align: 'center' });

    const levels = state.active.map((m) => `${m.name.toUpperCase()} LV${m.level}`).join('   ');
    const panel = new Panel(this, VIEW_W / 2 - 170, 126, 340, 96);
    panel.setDepth(6);
    const rows = [
      `PLAYTIME   ${SaveManager.formatTime(state.playtime)}`,
      `COIN       ${state.gold}`,
      `PARTY      ${levels || 'NONE'}`,
      `CHESTS     ${Object.keys(state.flags).filter((f) => f.startsWith('chest.')).length} OPENED`
    ];
    rows.forEach((line, i) => {
      makeLabel(this, line, VIEW_W / 2 - 150, 144 + i * 17, { color: i === 2 ? C.text : C.dim }).setDepth(7);
    });

    const prompt = makeLabel(this, 'PRESS ANY KEY FOR THE TITLE', VIEW_W / 2, 250, {
      color: C.dim,
      align: 'center'
    });
    prompt.setDepth(7);
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.3 }, duration: 700, yoyo: true, repeat: -1 });

    this.veil = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(1000);
    this.tweens.add({ targets: this.veil, alpha: { from: 1, to: 0 }, duration: TIMING.fade * 2 });

    playTheme('ending');
    this.pad = new KeyPad(this);
    this.events.once('shutdown', () => this.pad?.destroy());
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
