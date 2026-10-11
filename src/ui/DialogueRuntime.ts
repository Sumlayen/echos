/**
 * Runs authored dialogue: picks the variant that matches the current state,
 * types each line, handles choices, and applies effects through small hooks so
 * the scene stays in charge of battles, warps and shops.
 */

import { bus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import { ITEMS } from '../data/Items';
import { dialogueFor, type DialogueEffect, type DialogueVariant } from '../data/Dialogue';
import { sfx } from '../audio/Audio';
import { DialogBox } from './Dialog';
import type { KeyName } from './Keys';

export interface RuntimeHooks {
  onBattle(storyKey: string): void;
  onWarp(w: { to: string; x: number; y: number }): void;
  onShop(stockKey: string): void;
  onInn(price: number): void;
  notify(text: string): void;
  onEnd(): void;
}

export class DialogueRuntime {
  private variant: DialogueVariant | null = null;
  private index = -1;
  private choicesShown = false;

  constructor(
    private box: DialogBox,
    private state: GameState,
    private hooks: RuntimeHooks
  ) {}

  get active(): boolean {
    return this.variant !== null;
  }

  /** Returns false when there is no dialogue for this id. */
  start(id: string): boolean {
    const variant = dialogueFor(id, this.state);
    if (!variant) return false;
    this.variant = variant;
    this.index = -1;
    this.show(this.index + 1);
    bus.emit('dialogue:start', { id });
    return true;
  }

  end(): void {
    this.variant = null;
    this.box.clearChoices();
    this.box.setVisible(false);
    bus.emit('dialogue:end', undefined);
    this.hooks.onEnd();
  }

  private show(i: number): void {
    const v = this.variant;
    if (!v) return;
    if (i < 0 || i >= v.lines.length) {
      this.end();
      return;
    }
    this.index = i;
    this.choicesShown = false;
    const line = v.lines[i];
    this.box.setVisible(true);
    this.box.open(line.speaker, line.text);
    if (line.speaker) sfx('blip');
  }

  /** Drives the typewriter and reveals choices once a line finishes. */
  update(delta: number): void {
    if (!this.variant) return;
    if (this.box.typing()) {
      this.box.tick(delta);
      return;
    }
    const line = this.variant.lines[this.index];
    if (line?.choices && !this.choicesShown) {
      this.choicesShown = true;
      this.box.setChoices(line.choices.map((c) => c.label), (i) => this.pickChoice(i));
    }
  }

  key(name: KeyName): boolean {
    if (!this.variant) return false;
    const line = this.variant.lines[this.index];

    if (this.box.hasChoices()) {
      if (name === 'UP') this.box.moveChoice(-1);
      else if (name === 'DOWN') this.box.moveChoice(1);
      else if (name === 'CONFIRM') {
        sfx('confirm');
        this.box.confirmChoice();
      } else if (name === 'CANCEL') this.end();
      return true;
    }

    if (!this.box.typing()) {
      if (name === 'CONFIRM' || name === 'SPECIAL') {
        if (line?.effect) this.apply(line.effect);
        this.show(this.index + 1);
      } else if (name === 'CANCEL') {
        this.end();
      }
      return true;
    }

    if (name === 'CONFIRM' || name === 'SPECIAL') this.box.skip();
    return true;
  }

  private pickChoice(i: number): void {
    const line = this.variant?.lines[this.index];
    const choice = line?.choices?.[i];
    if (!choice) return;
    this.box.clearChoices();
    if (choice.effect) this.apply(choice.effect);
    if (choice.goto !== undefined) this.show(choice.goto);
    else if (choice.effect?.battle || choice.effect?.shop || choice.effect?.warp) {
      // the hook owns what happens next; keep the box closed but stay alive
      this.variant = null;
    } else this.end();
  }

  /* ------------------------------------------------------------- effects */

  apply(e: DialogueEffect): void {
    const s = this.state;
    if (e.setFlag) {
      s.setFlag(e.setFlag[0], e.setFlag[1]);
      bus.emit('flag:changed', e.setFlag[0]);
    }
    if (e.addFlag) {
      s.addFlagNum(e.addFlag[0], e.addFlag[1]);
      bus.emit('flag:changed', e.addFlag[0]);
    }
    if (e.give) {
      const [id, n] = e.give;
      s.addItem(id, n);
      bus.emit('item:changed', undefined);
      this.hooks.notify(`+${n} ${ITEMS[id]?.name ?? id}`);
    }
    if (e.take) {
      const [id, n] = e.take;
      if (s.itemCount(id) >= n) {
        s.removeItem(id, n);
        bus.emit('item:changed', undefined);
        this.hooks.notify(`-${n} ${ITEMS[id]?.name ?? id}`);
      }
    }
    if (e.gold) {
      s.gold = Math.max(0, s.gold + e.gold);
      bus.emit('gold:changed', s.gold);
      this.hooks.notify(`${e.gold > 0 ? '+' : ''}${e.gold} COIN`);
    }
    if (e.recruit) {
      const level = Math.max(1, Math.round(avgLevel(s)));
      const m = s.recruit(e.recruit, level);
      bus.emit('state:changed', undefined);
      this.hooks.notify(`${m.name.toUpperCase()} JOINS`);
    }
    if (e.quest) {
      const { id, stage, done } = e.quest;
      if (done) s.completeQuest(id, stage);
      else {
        s.startQuest(id);
        if (stage !== undefined) s.setQuestStage(id, stage);
      }
      bus.emit('quest:progress', { id, stage: s.questStage(id) });
      this.hooks.notify(`QUEST ${done ? 'COMPLETE' : 'UPDATED'}`);
    }
    if (e.shop) this.hooks.onShop(e.shop);
    if (e.inn !== undefined) this.hooks.onInn(e.inn);
    if (e.warp) this.hooks.onWarp(e.warp);
    if (e.battle) this.hooks.onBattle(e.battle);
  }
}

function avgLevel(s: GameState): number {
  const list = s.active;
  if (!list.length) return 1;
  return list.reduce((a, m) => a + m.level, 0) / list.length;
}
