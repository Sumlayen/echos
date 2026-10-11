/**
 * Title screen: generated backdrop, the main menu, a save-slot picker, settings
 * and credits. The first key press unlocks the WebAudio context.
 */

import Phaser from 'phaser';
import { playTheme, sfx, unlockAudio } from '../audio/Audio';
import { gs } from '../core/GameApp';
import { SaveManager, saves } from '../core/SaveManager';
import { GAME_TITLE, SCENES, TIMING, VIEW_H, VIEW_W } from '../config/constants';
import { KeyPad } from '../ui/Keys';
import { makeLabel } from '../ui/Text';
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
  private creditsLabels: ReturnType<typeof makeLabel>[] = [];
  private mode: Mode = 'main';
  private veil!: Phaser.GameObjects.Rectangle;

  constructor() {
    super(SCENES.title);
  }

  create(): void {
    this.add.image(0, 0, 'title').setOrigin(0, 0);
    this.addMotes();
    this.add
      .graphics()
      .fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x000000, 0x000000, 0.7, 0.5, 0.55, 0.7)
      .fillRect(0, 248, VIEW_W, VIEW_H - 248);

    makeLabel(this, GAME_TITLE, VIEW_W / 2, 54, { color: C.gold, align: 'center', scale: 3 });
    makeLabel(this, 'PART ONE OF THE ASHEN WOOD CYCLE', VIEW_W / 2, 98, {
      color: C.dim,
      align: 'center'
    });
    makeLabel(this, 'V1.0', 8, VIEW_H - 14, { color: C.dark });
    makeLabel(this, 'ARROWS MOVE   Z SELECT   X BACK', VIEW_W - 8, VIEW_H - 14, {
      color: C.dark,
      align: 'right'
    });

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

    this.settings = new SettingsForm(this, VIEW_W / 2 - 150, 118);
    this.settings.setVisible(false);

    this.creditsPanel = new Panel(this, VIEW_W / 2 - 190, 108, 380, 150);
    CREDITS.forEach((line, i) => {
      const l = makeLabel(this, line, VIEW_W / 2, 124 + i * 12, {
        color: i === 0 ? C.gold : C.text,
        align: 'center'
      });
      l.setVisible(false);
      this.creditsLabels.push(l);
    });
    this.creditsPanel.setVisible(false);

    this.veil = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000).setOrigin(0, 0).setAlpha(0);

    this.pad = new KeyPad(this);
    this.pad.onAnyKey(() => {
      unlockAudio();
      playTheme('title');
    });
  }

  private addMotes(): void {
    for (let i = 0; i < 18; i++) {
      const x = Phaser.Math.Between(20, VIEW_W - 20);
      const y = Phaser.Math.Between(40, 240);
      const mote = this.add.image(x, y, 'fx', i % 3 === 0 ? 'spark' : 'mote');
      mote.setAlpha(0).setTint(i % 4 === 0 ? 0xf0c04e : 0x9fc4ff);
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: Phaser.Math.Between(4, 9) / 10 },
        y: y - Phaser.Math.Between(10, 40),
        duration: Phaser.Math.Between(2200, 5200),
        delay: Phaser.Math.Between(0, 3000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
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
