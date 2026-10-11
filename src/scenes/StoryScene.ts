/**
 * Story beats: authored lines played over a backdrop, an optional fixed
 * battle, then the aftermath. `session.story` names the beat and
 * `session.storyPhase` says whether the opening lines or the post-battle
 * lines should play, which is how the scene resumes after `BattleScene`.
 */

import Phaser from 'phaser';
import { playTheme, sfx } from '../audio/Audio';
import { storyFoes } from '../battle/BattleEngine';
import { SCENES, TIMING, VIEW_H, VIEW_W } from '../config/constants';
import { gs } from '../core/GameApp';
import { bus } from '../core/EventBus';
import { session } from '../core/Session';
import type { DialogueEffect } from '../data/Dialogue';
import { STORY, type StoryBeat, type StoryLine } from '../data/Story';
import { mapDef } from '../data/World';
import { DialogBox } from '../ui/Dialog';
import { DialogueRuntime } from '../ui/DialogueRuntime';
import { KeyPad, type KeyName } from '../ui/Keys';
import { Label, makeLabel } from '../ui/Text';
import { C } from '../ui/Window';

interface Toast {
  label: Label;
  life: number;
}

export class StoryScene extends Phaser.Scene {
  private beat!: StoryBeat;
  private phase: 'lines' | 'after' = 'lines';
  private index = -1;
  private box!: DialogBox;
  private talk!: DialogueRuntime;
  private pad!: KeyPad;
  private veil!: Phaser.GameObjects.Rectangle;
  private toasts: Toast[] = [];
  private transitioning = false;
  private finished = false;
  private bail = false;

  constructor() {
    super(SCENES.story);
  }

  /* ------------------------------------------------------------- startup */

  init(): void {
    const id = session.story;
    this.bail = !id || !STORY[id];
    if (!this.bail) this.beat = STORY[id as string];
    this.phase = session.storyPhase;
    this.index = -1;
    this.toasts = [];
    this.transitioning = false;
    this.finished = false;
  }

  create(): void {
    if (this.bail) {
      this.scene.start(SCENES.world);
      return;
    }

    const state = gs(this);
    this.add.image(0, 0, this.beat.backdrop ?? 'story_village').setOrigin(0, 0);
    this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x0b0f1a)
      .setOrigin(0, 0)
      .setAlpha(0.34)
      .setDepth(5);
    this.addMotes();

    this.box = new DialogBox(this, 40, VIEW_H - 92, VIEW_W - 80, 74);
    this.box.setVisible(false);
    this.talk = new DialogueRuntime(this.box, state, {
      onBattle: (key) => this.startBattle(key),
      onWarp: (w) => this.leave(SCENES.world, { map: w.to, x: w.x, y: w.y }),
      onShop: () => undefined,
      onInn: () => undefined,
      notify: (text) => this.toast(text),
      onEnd: () => undefined
    });

    this.veil = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(1000);
    this.pad = new KeyPad(this);
    this.events.once('shutdown', () => this.pad?.destroy());

    playTheme(this.beat.theme ?? 'village');
    this.tweens.add({ targets: this.veil, alpha: { from: 1, to: 0 }, duration: TIMING.fade });

    if (this.phase === 'lines') this.applyAll(this.beat.effects);
    this.show(0);
  }

  private addMotes(): void {
    for (let i = 0; i < 14; i++) {
      const mote = this.add
        .image(
          Phaser.Math.Between(20, VIEW_W - 20),
          Phaser.Math.Between(30, 240),
          'fx',
          i % 3 === 0 ? 'spark' : 'mote'
        )
        .setDepth(6)
        .setAlpha(0)
        .setTint(i % 4 === 0 ? 0xf0c04e : 0x9fc4ff);
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: 0.7 },
        y: mote.y - Phaser.Math.Between(14, 40),
        duration: Phaser.Math.Between(2400, 5200),
        delay: Phaser.Math.Between(0, 2600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
    }
  }

  /* --------------------------------------------------------------- lines */

  private lines(): StoryLine[] {
    return this.phase === 'lines' ? this.beat.lines : this.beat.after ?? [];
  }

  private show(i: number): void {
    const all = this.lines();
    if (i < 0 || i >= all.length) {
      this.finishPhase();
      return;
    }
    this.index = i;
    const line = all[i];
    this.box.setVisible(true);
    this.box.open(line.speaker, line.text);
    if (line.speaker) sfx('blip');
  }

  private advance(): void {
    if (this.box.typing()) {
      this.box.skip();
      return;
    }
    const line = this.lines()[this.index];
    if (line?.effect) this.talk.apply(line.effect);
    this.show(this.index + 1);
  }

  private applyAll(effects?: DialogueEffect[]): void {
    for (const e of effects ?? []) this.talk.apply(e);
  }

  private finishPhase(): void {
    if (this.finished || this.transitioning) return;
    this.finished = true;
    this.box.setVisible(false);

    if (this.phase === 'lines' && this.beat.battle) {
      this.startBattle(this.beat.battle);
      return;
    }

    if (this.phase === 'after') {
      this.applyAll(this.beat.afterEffects);
      if (this.beat.next) {
        session.story = this.beat.next;
        session.storyPhase = 'lines';
        this.leave(SCENES.story);
        return;
      }
      if (this.beat.ending) {
        session.ending = true;
        bus.emit('game:ending', undefined);
        this.leave(SCENES.end);
        return;
      }
    }

    session.story = null;
    session.storyPhase = 'lines';
    this.leave(SCENES.world);
  }

  /* -------------------------------------------------------------- battle */

  private startBattle(key: string): void {
    const state = gs(this);
    const foes = storyFoes(key);
    session.battle = {
      foes,
      backdrop: mapDef(state.location).arena,
      storyId: key,
      flee: this.beat.flee ?? false,
      rewardMult: this.beat.rewardMult,
      intro: foes.includes('warden') ? 'THE WARDEN BLOCKS THE WAY' : this.beat.lines[0]?.text
    };
    session.returnTo = SCENES.story;
    session.storyPhase = 'after';
    this.leave(SCENES.battle);
  }

  /* ------------------------------------------------------------ plumbing */

  private leave(next: string, data?: object): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.pad?.clear();
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: TIMING.fade,
      onComplete: () => this.scene.start(next, data)
    });
  }

  private toast(text: string): void {
    const label = makeLabel(this, text, VIEW_W / 2, 18 + this.toasts.length * 12, {
      color: C.gold,
      align: 'center'
    });
    label.setDepth(900);
    this.toasts.push({ label, life: 2600 });
  }

  private updateToasts(delta: number): void {
    const kept: Toast[] = [];
    for (const t of this.toasts) {
      t.life -= delta;
      if (t.life <= 0) {
        t.label.destroy();
        continue;
      }
      if (t.life < 500) t.label.setAlpha(t.life / 500);
      kept.push(t);
    }
    this.toasts = kept;
  }

  /* --------------------------------------------------------------- input */

  override update(_time: number, delta: number): void {
    if (this.bail) return;
    this.updateToasts(delta);
    this.box.tick(delta);
    if (this.transitioning) return;
    for (let key = this.pad.next(); key; key = this.pad.next()) this.handle(key);
  }

  private handle(key: KeyName): void {
    if (key === 'CONFIRM' || key === 'SPECIAL') this.advance();
    else if (key === 'CANCEL' || key === 'MENU') this.finishPhase();
  }
}
