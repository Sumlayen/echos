/**
 * Title screen: the dawn backdrop, the logo lockup, the main menu, a save-slot
 * picker, settings and credits. The first key press unlocks the WebAudio context.
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

/** Where the backdrop paints its star, in the 640x360 texture space. */
const TITLE_STAR_X = 468;
const TITLE_STAR_Y = 212;

/** Line height shared by the main menu and the slot picker. */
const MENU_ROW_H = 20;

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
  private menuPanel!: Panel;
  private sigil!: Phaser.GameObjects.Image;
  private starGlow!: Phaser.GameObjects.Image;
  private rule!: Phaser.GameObjects.Image;
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

    // The backdrop's own star, twinkling where the art put it, and the sigil
    // watermark the logo sits on. Both belong behind the menu panel.
    this.starGlow = this.add
      .image(0, 0, 'fx', 'spark')
      .setTint(0xf0c04e)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.4);
    this.tweens.add({
      targets: this.starGlow,
      alpha: 0.9,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
    this.sigil = this.add.image(0, 0, 'ui', 'sigil').setAlpha(0.14);
    this.tweens.add({
      targets: this.sigil,
      alpha: 0.26,
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
    this.addMotes();

    // The menu sits on a panel frame so it keeps reading against the dawn ground.
    this.menuPanel = new Panel(this, 0, 0, 216, 104);

    this.main = new MenuList({
      scene: this,
      x: 0,
      y: 0,
      rowH: MENU_ROW_H,
      align: 'center',
      noteAlign: 'right',
      onConfirm: (_i, e) => this.chooseMain(e.label)
    });
    this.refreshMain();

    this.slots = new MenuList({
      scene: this,
      x: 0,
      y: 0,
      rowH: MENU_ROW_H,
      noteAlign: 'right',
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

    // The lockup draws over the panel, so it is built last but for the fade.
    this.rule = this.add.image(0, 0, 'ui', 'divider');
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
   * re-runs it: the backdrop is scaled to cover, the lockup stays high and
   * centred, and the menu panel keeps its place in the lower half.
   */
  private relayout(): void {
    const { w, h, cx } = stage;
    cover(this.bg, w, h);

    /* the lockup: sigil watermark, wordmark, rule, subtitle — high on the sky */
    const scale = w >= 560 ? 3 : 2;
    this.titleL.setScaleValue(scale);
    const top = Math.max(14, Math.round(h * 0.12));
    this.titleL.setPosition(cx, top);
    const titleH = this.titleL.metrics.h * scale;
    this.sigil.setPosition(cx, top + Math.round(titleH / 2));
    this.rule.setScale(w >= 520 ? 2 : 1);
    this.rule.setPosition(cx, top + titleH + 14);
    this.subL.setPosition(cx, top + titleH + 24);

    /* the backdrop's star, mapped out of texture space through `cover` */
    const s = this.bg.scaleX;
    this.starGlow
      .setPosition(this.bg.x + TITLE_STAR_X * s, this.bg.y + TITLE_STAR_Y * s)
      .setScale(Math.max(2, Math.round(s * 3)));

    /* the menu: a centred column on a panel frame in the lower half */
    const slots = this.mode === 'slots';
    const pw = Math.min(slots ? 400 : 264, w - 32);
    const ph = Math.max(1, (slots ? this.slots : this.main).count) * MENU_ROW_H + 24;
    const py = Math.max(110, Math.min(Math.round(h * 0.56), h - ph - 30));
    const px = Math.round(cx - pw / 2);
    this.menuPanel.place(px, py, pw, ph);
    this.menuPanel.setVisible(!this.settings.open && !this.creditsPanel.visible);
    this.main.relayout(cx, py + 16, px + pw - 12);
    this.slots.relayout(px + 20, py + 16, px + pw - 12);

    this.settings.relayout(Math.max(8, cx - 150), Math.max(30, Math.round(h / 2 - 66)));

    const cw = Math.min(380, w - 40);
    const ch = 150;
    const bx = Math.round(cx - cw / 2);
    const by = Math.round(h / 2 - ch / 2);
    this.creditsPanel.place(bx, by, cw, ch);
    this.creditsLabels.forEach((l, i) => l.setPosition(cx, by + 16 + i * 12));

    this.versionL.setPosition(8, h - 22);
    this.keysL.setPosition(w - 8, h - 22);
    this.veil.setSize(w, h);
    this.scatterMotes(py - 12);
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
  }

  /**
   * Embers drift over the sky band, down to just above the menu panel; a
   * resize re-scatters and re-tweens them.
   */
  private scatterMotes(bottom: number): void {
    const ceiling = 24;
    const floor = Math.max(ceiling + 12, bottom);
    for (const m of this.motes) {
      const x = Phaser.Math.Between(20, Math.max(40, stage.w - 20));
      const y = Phaser.Math.Between(ceiling, floor);
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
          ? `${meta.location.toUpperCase()} LV${SaveManager.topLevel(meta)} ${SaveManager.formatTime(meta.playtime)}`
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
      this.relayout();
      return;
    }
    if (label === 'SETTINGS') {
      this.mode = 'settings';
      this.main.setVisible(false);
      this.settings.setVisible(true);
      this.relayout();
      return;
    }
    if (label === 'CREDITS') {
      this.mode = 'credits';
      this.main.setVisible(false);
      this.creditsPanel.setVisible(true);
      this.creditsLabels.forEach((l) => l.setVisible(true));
      this.relayout();
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
    this.relayout();
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
