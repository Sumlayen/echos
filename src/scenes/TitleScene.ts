/**
 * Title screen: generated backdrop, the main menu, a save-slot picker, settings
 * and credits. The first key press unlocks the WebAudio context.
 */

import Phaser from 'phaser';
import { playTheme, sfx, unlockAudio } from '../audio/Audio';
import { gs } from '../core/GameApp';
import { SaveManager, saves } from '../core/SaveManager';
import { GAME_TITLE, SCENES, TIMING } from '../config/constants';
import { cover, onStageResize, stage } from '../core/Stage';
import { KeyPad } from '../ui/Keys';
import { Label, makeLabel } from '../ui/Text';
import { SettingsForm } from '../ui/Settings';
import { C, MenuList, Panel } from '../ui/Window';

type Mode = 'main' | 'slots' | 'settings' | 'credits';

const CREDITS = [
  'ECHOES OF THE FALLEN STAR',
  '',
  'DESIGN, CODE, ART, SOUND - YOU',
  'ENGINE - PHASER 3 + TYPESCRIPT',
  'EVERY PIXEL GENERATED AT RUNTIME',
  '',
  'FOR THE WOOD THAT STILL BURNS.'
];

export class TitleScene extends Phaser.Scene {
  private pad!: KeyPad;
  private main!: MenuList;
  private slots!: MenuList;
  private settings!: SettingsForm;
  private creditsPanel!: Panel;
  private creditsLabels: Label[] = [];
  private mode: Mode = 'main';
  private veil!: Phaser.GameObjects.Rectangle;
  private bg!: Phaser.GameObjects.Image;
  private shade!: Phaser.GameObjects.Graphics;
  private titleL!: Label;
  private subL!: Label;
  private versionL!: Label;
  private keysL!: Label;
  private motes: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SCENES.title);
  }

  create(): void {
    this.bg = this.add.image(0, 0, 'title').setOrigin(0, 0);
    this.shade = this.add.graphics();
    this.titleL = makeLabel(this, GAME_TITLE, 0, 0, { color: C.gold, align: 'center', scale: 3 });
    this.subL = makeLabel(this, 'PART ONE OF THE ASHEN WOOD CYCLE', 0, 0, {
      color: C.dim,
      align: 'center'
    });
    this.versionL = makeLabel(this, 'V1.0', 0, 0, { color: C.dark });
    this.keysL = makeLabel(this, 'ARROWS MOVE   Z SELECT   X BACK', 0, 0, {
      color: C.dark,
      align: 'right'
    });
    this.addMotes();

    this.main = new MenuList({
      scene: this,
      x: 44,
      y: 266,
      rowH: 20,
      onConfirm: (_i, e) => this.chooseMain(e.label)
    });
    this.refreshMain();

    this.slots = new MenuList({
      scene: this,
      x: 44,
      y: 266,
      rowH: 20,
      noteX: 260,
      onConfirm: (_i, e) => this.chooseSlot(e.label)
    });
    this.slots.setVisible(false);

    this.settings = new SettingsForm(this, 0, 0);
    this.settings.setVisible(false);

    this.creditsPanel = new Panel(this, 0, 0, 380, 150);
    CREDITS.forEach((line, i) => {
      const l = makeLabel(this, line, 0, 0, { color: i === 0 ? C.gold : C.text, align: 'center' });
      l.setVisible(false);
      this.creditsLabels.push(l);
    });
    this.creditsPanel.setVisible(false);

    this.veil = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setAlpha(0);

    this.relayout();
    onStageResize(this, () => this.relayout());

    this.pad = new KeyPad(this);
    this.pad.onAnyKey(() => {
      unlockAudio();
      playTheme('title');
    });
  }

  /**
   * Everything on this screen is placed from the stage, so a window drag just
   * re-runs it: the backdrop is scaled to cover, the menu stays pinned to the
   * lower band, and the panels re-centre.
   */
  private relayout(): void {
    const { w, h, cx } = stage;
    cover(this.bg, w, h);

    const band = Math.round(h * 0.69);
    this.shade.clear();
    this.shade
      .fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x000000, 0x000000, 0.7, 0.5, 0.55, 0.7)
      .fillRect(0, band, w, h - band);

    this.titleL.setScaleValue(w >= 520 ? 3 : 2);
    const top = Math.max(28, Math.round(h * 0.15));
    this.titleL.setPosition(cx, top);
    this.subL.setPosition(cx, top + 44);
    this.versionL.setPosition(8, h - 22);
    this.keysL.setPosition(w - 8, h - 22);

    const menuY = h - 94;
    this.main.relayout(44, menuY);
    this.slots.relayout(44, menuY, Math.min(260, w - 130));

    this.settings.relayout(Math.max(8, cx - 150), Math.max(30, Math.round(h / 2 - 66)));

    const cw = Math.min(380, w - 40);
    const ch = 150;
    const px = Math.round(cx - cw / 2);
    const py = Math.round(h / 2 - ch / 2);
    this.creditsPanel.place(px, py, cw, ch);
    this.creditsLabels.forEach((l, i) => l.setPosition(cx, py + 16 + i * 12));

    this.veil.setSize(w, h);
    this.scatterMotes();
  }

  private addMotes(): void {
    for (let i = 0; i < 18; i++) {
      const mote = this.add.image(0, 0, 'fx', i % 3 === 0 ? 'spark' : 'mote');
      mote.setAlpha(0).setTint(i % 4 === 0 ? 0xf0c04e : 0x9fc4ff);
      mote.setData('drift', Phaser.Math.Between(10, 40));
      mote.setData('glow', Phaser.Math.Between(4, 9) / 10);
      mote.setData('dur', Phaser.Math.Between(2200, 5200));
      mote.setData('delay', Phaser.Math.Between(0, 3000));
      this.motes.push(mote);
    }
    this.scatterMotes();
  }

  /** Embers drift over the upper band; a resize re-scatters and re-tweens them. */
  private scatterMotes(): void {
    const bottom = Math.max(70, Math.round(stage.h * 0.66));
    for (const m of this.motes) {
      const x = Phaser.Math.Between(20, Math.max(40, stage.w - 20));
      const y = Phaser.Math.Between(40, bottom);
      m.setPosition(x, y);
      (m.getData('tween') as Phaser.Tweens.Tween | undefined)?.stop();
      m.setData(
        'tween',
        this.tweens.add({
          targets: m,
          alpha: { from: 0, to: m.getData('glow') as number },
          y: y - (m.getData('drift') as number),
          duration: m.getData('dur') as number,
          delay: m.getData('delay') as number,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut'
        })
      );
    }
  }

  private refreshMain(): void {
    const anySave = saves.list().some((m) => m !== null);
    this.main.setItems([
      { label: 'NEW GAME' },
      { label: 'CONTINUE', enabled: anySave, note: anySave ? '' : 'NO SAVED TALE' },
      { label: 'SETTINGS' },
      { label: 'CREDITS' }
    ]);
  }

  private refreshSlots(): void {
    this.slots.setItems(
      saves.list().map((meta, i) => ({
        label: `SLOT ${i}`,
        enabled: !!meta,
        note: meta
          ? `${meta.location.toUpperCase()} LV${Math.max(...meta.levels)} ${SaveManager.formatTime(meta.playtime)}`
          : 'EMPTY'
      }))
    );
  }

  private chooseMain(label: string): void {
    sfx('confirm');
    if (label === 'NEW GAME') {
      gs(this).startNew(['kael']);
      this.leave(SCENES.world);
      return;
    }
    if (label === 'CONTINUE') {
      this.mode = 'slots';
      this.refreshSlots();
      this.main.setVisible(false);
      this.slots.setVisible(true);
      return;
    }
    if (label === 'SETTINGS') {
      this.mode = 'settings';
      this.main.setVisible(false);
      this.settings.setVisible(true);
      return;
    }
    if (label === 'CREDITS') {
      this.mode = 'credits';
      this.main.setVisible(false);
      this.creditsPanel.setVisible(true);
      this.creditsLabels.forEach((l) => l.setVisible(true));
    }
  }

  private chooseSlot(label: string): void {
    const slot = Number(label.split(' ')[1]);
    const payload = saves.load(slot);
    if (!payload) {
      sfx('cancel');
      return;
    }
    gs(this).load(payload);
    sfx('blip');
    this.leave(SCENES.world);
  }

  private back(): void {
    sfx('cancel');
    if (this.mode === 'settings') this.settings.setVisible(false);
    if (this.mode === 'credits') {
      this.creditsPanel.setVisible(false);
      this.creditsLabels.forEach((l) => l.setVisible(false));
    }
    if (this.mode === 'slots') this.slots.setVisible(false);
    this.mode = 'main';
    this.refreshMain();
    this.main.setVisible(true);
  }

  private leave(to: string): void {
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: TIMING.fade,
      onComplete: () => this.scene.start(to)
    });
  }

  override update(): void {
    let key = this.pad.next();
    while (key) {
      this.handle(key);
      key = this.pad.next();
    }
  }

  private handle(key: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'CONFIRM' | 'CANCEL' | 'MENU' | 'SPECIAL'): void {
    if (this.mode === 'settings') {
      if (key === 'CANCEL' || key === 'MENU') this.back();
      else if (key === 'UP' || key === 'DOWN' || key === 'LEFT' || key === 'RIGHT') this.settings.key(key);
      return;
    }
    if (this.mode === 'credits') {
      if (key === 'CANCEL' || key === 'CONFIRM' || key === 'MENU') this.back();
      return;
    }
    const list = this.mode === 'slots' ? this.slots : this.main;
    if (key === 'UP') list.move(-1);
    else if (key === 'DOWN') list.move(1);
    else if (key === 'CONFIRM') list.confirm();
    else if (key === 'CANCEL' || key === 'MENU') {
      if (this.mode !== 'main') this.back();
    }
  }
}
