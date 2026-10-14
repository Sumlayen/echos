/**
 * Turn-based battles. `BattleEngine` owns the rules and emits a flat list of
 * events; this scene plays those events back as sprite motion, floating
 * numbers and log lines, then collects the next command from the player.
 */

import Phaser from 'phaser';
import { playTheme, sfx } from '../audio/Audio';
import {
  BattleEngine,
  type BattleEvent,
  type BattleOutcome,
  type BattleRewards
} from '../battle/BattleEngine';
import { STATUSES, hasStatus } from '../battle/Status';
import type { BattleAction, BattleUnit } from '../battle/Types';
import { SCENES, TIMING } from '../config/constants';
import { gs } from '../core/GameApp';
import { bus } from '../core/EventBus';
import { session } from '../core/Session';
import { cover, onStageResize, stage } from '../core/Stage';
import { ITEMS } from '../data/Items';
import { SKILLS } from '../data/Skills';
import { STORY } from '../data/Story';
import { mapDef } from '../data/World';
import { KeyPad, type KeyName } from '../ui/Keys';
import { Label, makeLabel, wrap } from '../ui/Text';
import { C, Gauge, MenuList, Panel, type MenuEntry } from '../ui/Window';

type Mode = 'idle' | 'main' | 'skill' | 'item' | 'target' | 'result';

interface UnitView {
  unit: BattleUnit;
  img: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  gauge: Gauge | null;
  name: Label | null;
  tags: Phaser.GameObjects.Image[];
  home: { x: number; y: number };
}

/**
 * HP, MP and aliveness *as the player has seen them so far*.
 *
 * `BattleEngine.choose()` resolves an entire round in one synchronous call and
 * hands back the events, so the live `BattleUnit` is already at its end-of-round
 * values while the first event is still waiting in `pending`. Painting those
 * live values makes the party bar drop the instant ATTACK is committed — before
 * a single foe has moved — which reads exactly as "my attack hit myself".
 * Events advance this map one step at a time; `snapShown()` reconciles it.
 */
interface ShownState {
  hp: number;
  mp: number;
  alive: boolean;
}

interface PartyRow {
  unit: BattleUnit;
  name: Label;
  hp: Gauge;
  mp: Gauge;
  hpText: Label;
  mpText: Label;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Panel + sprite geometry for one battle frame. */
interface BattleLayout {
  party: Rect;
  log: Rect;
  cmd: Rect;
  partyX: number;
  partyY: number;
  partyGap: number;
  foeX: number;
  foeY: number;
  foeGap: number;
  gaugeW: number;
  rowH: number;
  noteX: number;
}

/**
 * The three panels live in a band pinned to the bottom of the stage and the
 * sprites stand on top of it. The ratios are the 640x360 baseline, so a
 * baseline stage gets exactly the classic frame and a wider window only gets
 * wider panels — never a stretched-out sprite row.
 */
function battleLayout(w: number, h: number, partyCount: number): BattleLayout {
  const bh = Math.max(84, Math.min(140, Math.round(h * 0.278)));
  const by = Math.max(24, h - bh - 8);
  const bandW = Math.max(240, Math.min(w - 24, 1200));
  const bandX = Math.round((w - bandW) / 2);
  const gap = 6;
  const inner = bandW - gap * 2;

  const partyW = Math.round((inner * 214) / 604);
  const logW = Math.round((inner * 200) / 604);
  const cmdW = inner - partyW - logW;
  const party: Rect = { x: bandX, y: by, w: partyW, h: bh };
  const log: Rect = { x: party.x + partyW + gap, y: by, w: logW, h: bh };
  const cmd: Rect = { x: log.x + logW + gap, y: by, w: cmdW, h: bh };

  const n = Math.max(1, partyCount);
  return {
    party,
    log,
    cmd,
    partyX: bandX + 84,
    partyY: by - 16,
    partyGap: Math.round((54 * bh) / 100),
    foeX: bandX + bandW - 224,
    foeY: by - 22,
    foeGap: Math.max(56, Math.min(120, Math.round(bandW * 0.117))),
    gaugeW: Math.max(40, Math.min(160, partyW - 110)),
    // Rows keep their 30px pitch while they fit, and tighten for a full party.
    rowH: n > 1 ? Math.max(16, Math.min(30, Math.floor((bh - 38) / (n - 1)))) : 30,
    noteX: cmd.x + Math.max(60, cmdW - 68)
  };
}

/** Log line pitch and how many lines the band can carry. */
const LOG_LINE_H = 11;
const LOG_LINES_MIN = 3;
const LOG_LINES_MAX = 6;

export class BattleScene extends Phaser.Scene {
  private engine!: BattleEngine;
  private views = new Map<string, UnitView>();
  private shown = new Map<string, ShownState>();
  /** Units with a floating number still on screen, so they can be staggered. */
  private floats = new Map<string, number>();
  private order: UnitView[] = [];
  private rows: PartyRow[] = [];
  private pad!: KeyPad;
  private cmd!: MenuList;
  private actorLabel!: Label;
  private roundLabel!: Label;
  private logLabels: Label[] = [];
  private history: string[] = [];
  private resultLabels: Label[] = [];
  private veil!: Phaser.GameObjects.Rectangle;
  private bg!: Phaser.GameObjects.Image;
  private panels!: { party: Panel; log: Panel; cmd: Panel };
  private resultPanel: Panel | null = null;
  private resultLines: string[] = [];
  private L!: BattleLayout;

  private mode: Mode = 'idle';
  private pending: BattleEvent[] = [];
  private hold = 0;
  private entryIds: string[] = [];
  private actor: BattleUnit | null = null;
  private pendingAction: BattleAction | null = null;
  private outcome: BattleOutcome = 'ongoing';
  private leaving = false;
  private bail = false;
  private foeIds: string[] = [];
  private backdrop = 'arena_forest';
  private fleeAllowed = true;
  private rewardMult: number | undefined;
  private intro: string | undefined;
  private seed: number | undefined;
  private returnTo: string = SCENES.world;

  constructor() {
    super(SCENES.battle);
  }

  /* ------------------------------------------------------------- startup */

  init(): void {
    const req = session.battle;
    this.bail = !req || !req.foes.length;
    this.foeIds = req?.foes.slice() ?? [];
    this.backdrop = req?.backdrop ?? 'arena_forest';
    this.fleeAllowed = req?.flee ?? false;
    this.rewardMult = req?.rewardMult;
    this.intro = req?.intro;
    this.seed = req?.seed;
    // Only a live story beat may pull the fight back into `StoryScene`.
    this.returnTo =
      session.returnTo === SCENES.story && !!session.story && !!STORY[session.story]
        ? SCENES.story
        : SCENES.world;
    this.views = new Map();
    this.shown = new Map();
    this.floats = new Map();
    this.order = [];
    this.rows = [];
    this.history = [];
    this.logLabels = [];
    this.resultLabels = [];
    this.resultPanel = null;
    this.resultLines = [];
    this.pending = [];
    this.entryIds = [];
    this.hold = 0;
    this.mode = 'idle';
    this.actor = null;
    this.pendingAction = null;
    this.outcome = 'ongoing';
    this.leaving = false;
  }

  create(): void {
    if (this.bail) {
      this.scene.start(SCENES.world);
      return;
    }

    this.engine = new BattleEngine(gs(this), null, this.foeIds, {
      fleeAllowed: this.fleeAllowed,
      rewardMult: this.rewardMult,
      intro: this.intro,
      // `BattleRequest.seed` exists so a scripted fight replays identically;
      // dropping it here would leave every battle on a clock-based seed.
      seed: this.seed
    });

    if (!this.textures.exists(this.backdrop)) this.backdrop = 'arena_forest';
    this.bg = this.add.image(0, 0, this.backdrop).setOrigin(0, 0).setDepth(-10);

    this.L = battleLayout(stage.w, stage.h, this.engine.party.length);
    this.registerFxAnims();
    this.buildUnits();
    this.buildPanels();

    this.veil = this.add
      .rectangle(0, 0, 1, 1, 0x000000)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(1000);
    this.tweens.add({ targets: this.veil, alpha: { from: 1, to: 0 }, duration: TIMING.fade });

    this.relayout();
    onStageResize(this, () => this.relayout());

    this.pad = new KeyPad(this);
    this.events.once('shutdown', () => this.pad?.destroy());
    playTheme(this.engine.foes.some((f) => f.boss) ? 'boss' : 'battle');

    // Seed the displayed numbers before the engine resolves anything, so the
    // first event of the queue animates from what the player is already seeing.
    this.seedShown();
    this.pending = this.engine.start();
    this.refreshAll();
  }

  /* --------------------------------------------------------------- sprites */

  private buildUnits(): void {
    this.engine.party.forEach((u, i) => {
      this.addSprite(u, this.L.partyX + i * this.L.partyGap, this.L.partyY + i * 4, false);
    });
    this.engine.foes.forEach((u, i) => {
      this.addSprite(u, this.L.foeX + i * this.L.foeGap, this.L.foeY + i * 4, true);
    });
  }

  private addSprite(u: BattleUnit, x: number, y: number, isFoe: boolean): void {
    const atlas = this.atlasOf(u);
    const scale = u.scale ?? 1;
    const shadow = this.add
      .image(x, y - 3, 'fx', 'shadow')
      .setAlpha(0.32)
      .setScale(scale)
      .setDepth(y - 1);
    const img = this.add
      .sprite(x, y, atlas, u.side === 'party' ? 's_idle0' : 'idle0')
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(y);

    const view: UnitView = { unit: u, img, shadow, gauge: null, name: null, tags: [], home: { x, y } };
    if (isFoe) {
      view.name = makeLabel(this, this.short(u.name), x, y - 48, {
        color: C.text,
        align: 'center'
      }).setDepth(420);
      view.gauge = new Gauge(this, x - 26, y - 38, 52, 5, u.boss ? 'foe' : 'hp').setDepth(420);
    }
    this.views.set(u.uid, view);
    this.order.push(view);
    this.playIdle(view);
  }

  private atlasOf(u: BattleUnit): string {
    return u.side === 'party' ? `char_${u.art}` : `enemy_${u.art}`;
  }

  private short(name: string): string {
    const up = name.toUpperCase();
    return up.length > 14 ? `${up.slice(0, 13)}.` : up;
  }

  /** Two-frame idle loop, shared by every unit that uses the same art. */
  private playIdle(v: UnitView): void {
    if (!v.unit.alive) return;
    const atlas = this.atlasOf(v.unit);
    if (!this.textures.exists(atlas)) return;
    const isChar = v.unit.side === 'party';
    const key = `battle_idle_${atlas}`;
    if (!this.anims.exists(key)) {
      const wanted = isChar ? ['s_idle0', 's_idle1'] : ['idle0', 'idle1'];
      const frames = wanted.filter((f) => this.textures.get(atlas).has(f));
      if (frames.length < 2) return;
      this.anims.create({
        key,
        frames: frames.map((f) => ({ key: atlas, frame: f })),
        frameRate: 2,
        repeat: -1
      });
    }
    v.img.play(key, true);
  }

  /** Freeze the idle loop on a specific pose (`attack`, `hurt`, `die`...). */
  private pose(v: UnitView, frame: string): void {
    v.img.anims.stop();
    if (this.textures.get(v.img.texture.key).has(frame)) v.img.setFrame(frame);
  }

  private resume(v: UnitView, delay = 280): void {
    this.time.delayedCall(delay, () => {
      if (v.img.active && v.unit.alive) this.playIdle(v);
    });
  }

  /** Every `name_0..n` frame group in the fx atlas becomes a one-shot anim. */
  private registerFxAnims(): void {
    if (!this.textures.exists('fx')) return;
    const names = this.textures.get('fx').getFrameNames().filter((n) => n !== '__BASE');
    const groups = new Map<string, string[]>();
    for (const n of names) {
      const m = /^(.*)_(\d+)$/.exec(n);
      if (!m) continue;
      const list = groups.get(m[1]) ?? [];
      list.push(n);
      groups.set(m[1], list);
    }
    for (const [prefix, frames] of groups) {
      const key = `fx_${prefix}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: frames.map((f) => ({ key: 'fx', frame: f })),
        frameRate: 14,
        repeat: 0
      });
    }
  }

  /* ---------------------------------------------------------------- panels */

  private buildPanels(): void {
    const L = this.L;
    this.panels = {
      party: new Panel(this, L.party.x, L.party.y, L.party.w, L.party.h).setDepth(500),
      log: new Panel(this, L.log.x, L.log.y, L.log.w, L.log.h).setDepth(500),
      cmd: new Panel(this, L.cmd.x, L.cmd.y, L.cmd.w, L.cmd.h).setDepth(500)
    };

    this.engine.party.forEach((u, i) => {
      const y = L.party.y + 12 + i * L.rowH;
      this.rows.push({
        unit: u,
        name: makeLabel(this, u.name.toUpperCase(), L.party.x + 12, y, { color: C.text }).setDepth(501),
        hp: new Gauge(this, L.party.x + 12, y + 11, L.gaugeW, 7, 'hp').setDepth(501),
        mp: new Gauge(this, L.party.x + 12, y + 21, L.gaugeW, 5, 'mp').setDepth(501),
        hpText: makeLabel(this, '', L.party.x + 12 + L.gaugeW + 6, y + 10, { color: C.dim }).setDepth(501),
        mpText: makeLabel(this, '', L.party.x + 12 + L.gaugeW + 6, y + 20, { color: C.dim }).setDepth(501)
      });
    });

    this.actorLabel = makeLabel(this, '', L.cmd.x + 8, L.cmd.y + 6, { color: C.gold }).setDepth(501);
    this.roundLabel = makeLabel(this, '', stage.w - 8, 8, { color: C.gold, align: 'right' }).setDepth(501);
    this.cmd = new MenuList({
      scene: this,
      x: L.cmd.x + 24,
      y: L.cmd.y + 24,
      rowH: 14,
      noteX: L.noteX,
      onConfirm: () => this.onCommand(),
      // Above the command panel (500), or the menu hides behind its own frame.
      depth: 501
    });
    this.cmd.setVisible(false);
    this.paintLog();
  }

  /**
   * A resize re-derives the band and moves everything already on screen: panels
   * and gauges resize in place, sprites re-anchor unless a tween owns them at
   * that moment, and the log re-wraps to its new width. Battle state — whose
   * turn it is, the cursor, the pending events — is untouched.
   */
  private relayout(): void {
    const { w, h } = stage;
    this.L = battleLayout(w, h, this.engine.party.length);
    const L = this.L;

    cover(this.bg, w, h);
    this.veil.setSize(w, h);

    this.panels.party.place(L.party.x, L.party.y, L.party.w, L.party.h);
    this.panels.log.place(L.log.x, L.log.y, L.log.w, L.log.h);
    this.panels.cmd.place(L.cmd.x, L.cmd.y, L.cmd.w, L.cmd.h);

    this.rows.forEach((row, i) => {
      const y = L.party.y + 12 + i * L.rowH;
      row.name.setPosition(L.party.x + 12, y);
      row.hp.place(L.party.x + 12, y + 11, L.gaugeW, 7);
      row.mp.place(L.party.x + 12, y + 21, L.gaugeW, 5);
      row.hpText.setPosition(L.party.x + 12 + L.gaugeW + 6, y + 10);
      row.mpText.setPosition(L.party.x + 12 + L.gaugeW + 6, y + 20);
    });

    this.actorLabel.setPosition(L.cmd.x + 8, L.cmd.y + 6);
    this.roundLabel.setPosition(w - 8, 8);
    this.cmd.relayout(L.cmd.x + 24, L.cmd.y + 24, L.noteX);
    this.paintLog();
    this.rehome();

    if (this.resultLabels.length) this.rebuildResultPanel();
  }

  /** Sprites stand on the band, so they move with it. */
  private rehome(): void {
    const L = this.L;
    this.engine.party.forEach((u, i) => this.anchor(this.views.get(u.uid), L.partyX + i * L.partyGap, L.partyY + i * 4));
    this.engine.foes.forEach((u, i) => this.anchor(this.views.get(u.uid), L.foeX + i * L.foeGap, L.foeY + i * 4));
  }

  private anchor(v: UnitView | undefined, x: number, y: number): void {
    if (!v) return;
    v.home = { x, y };
    // Mid-lunge, mid-flinch: leave the sprite to its tween, which returns it to
    // the (already updated) home position when it finishes.
    if (this.tweens.getTweensOf(v.img).length) return;
    v.img.setPosition(x, y).setDepth(y);
    v.shadow.setPosition(x, y - 3).setDepth(y - 1);
    if (v.name) v.name.setPosition(x, y - 48);
    if (v.gauge) v.gauge.place(x - 26, y - 38, 52, 5);
    v.tags.forEach((t, i) => t.setPosition(x - 16 + i * 8, y - 12));
  }

  private log(text: string): void {
    if (!text) return;
    this.history.push(text);
    if (this.history.length > 24) this.history.shift();
    this.paintLog();
  }

  /** How many log lines the band can carry at its current height. */
  private logLines(): number {
    return Math.max(
      LOG_LINES_MIN,
      Math.min(LOG_LINES_MAX, Math.floor((this.L.log.h - 18) / LOG_LINE_H))
    );
  }

  private paintLog(): void {
    this.logLabels.forEach((l) => l.destroy());
    this.logLabels = [];
    const keep = this.logLines();
    const lines: string[] = [];
    for (const entry of this.history.slice(-keep)) {
      lines.push(...wrap(entry, this.L.log.w - 24).slice(-2));
    }
    const shown = lines.slice(-keep);
    shown.forEach((line, i) => {
      this.logLabels.push(
        makeLabel(this, line, this.L.log.x + 12, this.L.log.y + 12 + i * LOG_LINE_H, {
          color: i === shown.length - 1 ? C.text : C.dim
        }).setDepth(501)
      );
    });
  }

  /* --------------------------------------------------------------- refresh */

  private refreshAll(): void {
    for (const row of this.rows) {
      const u = row.unit;
      const s = this.shownOf(u);
      row.hp.set(u.maxHp > 0 ? s.hp / u.maxHp : 0, true);
      row.mp.set(u.maxMp > 0 ? s.mp / u.maxMp : 0, true);
      row.hpText.setText(`${s.hp}/${u.maxHp}`);
      row.mpText.setText(`${s.mp}/${u.maxMp}`);
      row.name.setColor(s.alive ? (u === this.actor ? C.gold : C.text) : C.hpLow);
    }
    for (const v of this.order) {
      const s = this.shownOf(v.unit);
      if (v.gauge) v.gauge.set(v.unit.maxHp > 0 ? s.hp / v.unit.maxHp : 0, true);
      if (v.name) v.name.setColor(s.alive ? C.text : C.dark);
      this.paintTags(v);
    }
    this.roundLabel.setText(`ROUND ${Math.max(1, this.engine.round)}`);
  }

  /** Start the displayed numbers from full, before the engine resolves a turn. */
  private seedShown(): void {
    this.shown.clear();
    for (const u of [...this.engine.party, ...this.engine.foes]) {
      this.shown.set(u.uid, { hp: u.hp, mp: u.mp, alive: u.alive });
    }
  }

  private shownOf(u: BattleUnit): ShownState {
    let s = this.shown.get(u.uid);
    if (!s) {
      s = { hp: u.hp, mp: u.mp, alive: u.alive };
      this.shown.set(u.uid, s);
    }
    return s;
  }

  /**
   * Reconcile the displayed numbers with the model once the queue is empty.
   * Anything an event does not describe — a boss phase swap, a late bonus —
   * self-heals here rather than leaving a bar stuck behind the truth.
   */
  private snapShown(): void {
    for (const u of [...this.engine.party, ...this.engine.foes]) {
      const s = this.shown.get(u.uid);
      if (s) {
        s.hp = u.hp;
        s.mp = u.mp;
        s.alive = u.alive;
      }
    }
  }

  /**
   * Move the displayed numbers in step with the event being animated. A `hit`
   * event is the only thing allowed to lower a bar: the model has already run
   * the whole round, so skipping this would paint the end state up front.
   */
  private applyShown(e: BattleEvent): void {
    switch (e.t) {
      case 'use': {
        const s = this.shown.get(e.uid);
        if (s && e.mp !== undefined) s.mp = e.mp;
        break;
      }
      case 'hit': {
        // A miss carries damage 0, so it correctly changes nothing.
        const s = this.shown.get(e.to);
        if (s) s.hp = Math.max(0, s.hp - e.damage);
        break;
      }
      case 'heal': {
        const s = this.shown.get(e.to);
        if (s) s.hp = Math.min(this.engine.unit(e.to)?.maxHp ?? s.hp, s.hp + e.amount);
        break;
      }
      case 'revive': {
        const s = this.shown.get(e.uid);
        if (s) {
          s.hp = e.hp;
          s.alive = true;
        }
        break;
      }
      case 'death': {
        const s = this.shown.get(e.uid);
        if (s) {
          s.hp = 0;
          s.alive = false;
        }
        break;
      }
      default:
        break;
    }
  }

  /** Small status icons under each sprite. */
  private paintTags(v: UnitView): void {
    v.tags.forEach((t) => t.destroy());
    v.tags = [];
    if (!this.textures.exists('icons')) return;
    const atlas = this.textures.get('icons');
    v.unit.statuses.slice(0, 5).forEach((s, i) => {
      const def = STATUSES[s.id];
      if (!def || !atlas.has(def.icon)) return;
      v.tags.push(
        this.add
          .image(v.home.x - 16 + i * 8, v.home.y - 12, 'icons', def.icon)
          .setOrigin(0, 0)
          .setScale(0.55)
          .setAlpha(def.good ? 0.85 : 1)
          .setDepth(v.home.y + 8)
      );
    });
  }


  /* ----------------------------------------------------------------- input */

  override update(_time: number, delta: number): void {
    if (this.bail || this.leaving) return;
    for (let key = this.pad.next(); key; key = this.pad.next()) this.handle(key);
    if (this.leaving || this.mode !== 'idle') return;
    if (this.hold > 0) {
      this.hold -= delta;
      return;
    }
    const event = this.pending.shift();
    if (event) {
      this.play(event);
      return;
    }
    this.afterEvents();
  }

  private handle(key: KeyName): void {
    if (this.mode === 'result') {
      if (key === 'CONFIRM' || key === 'CANCEL' || key === 'MENU') this.finishBattle();
      return;
    }
    if (this.mode === 'idle') return;
    if (key === 'UP') this.cmd.move(-1);
    else if (key === 'DOWN') this.cmd.move(1);
    else if (key === 'CONFIRM') this.cmd.confirm();
    else if (key === 'CANCEL' || key === 'MENU') this.back();
  }

  /** Back out of a submenu without leaving the battle. */
  private back(): void {
    if (this.mode === 'main') return;
    this.pendingAction = null;
    sfx('cancel');
    if (this.actor) this.openMain();
  }

  /* ----------------------------------------------------------- command menu */

  private afterEvents(): void {
    // Nothing is left to animate, so the view and the model must now agree.
    this.snapShown();
    if (this.engine.outcome !== 'ongoing') return;
    const actor = this.engine.awaitingInput();
    if (!actor) return;
    this.openMenuFor(actor);
  }

  private openMenuFor(actor: BattleUnit): void {
    this.actor = actor;
    const s = this.shownOf(actor);
    this.actorLabel.setText(`${actor.name.toUpperCase()} ${s.hp}/${actor.maxHp} ${s.mp}/${actor.maxMp}`);
    this.openMain();
    this.refreshAll();
  }

  private openMain(): void {
    const actor = this.actor;
    if (!actor) return;
    const canSkill = actor.skills.length > 0 && !hasStatus(actor, 'silence');
    const canFlee = this.fleeAllowed && !this.engine.foes.some((f) => f.boss && f.alive);
    this.setMenu(
      'main',
      [
        { label: 'ATTACK' },
        { label: 'SKILL', enabled: canSkill },
        { label: 'ITEM', enabled: this.usableItems().length > 0 },
        { label: 'GUARD' },
        { label: 'FLEE', enabled: canFlee }
      ],
      ['attack', 'skill', 'item', 'guard', 'flee']
    );
  }

  private openSkillMenu(): void {
    const actor = this.actor;
    if (!actor) return;
    this.setMenu(
      'skill',
      actor.skills.map((id) => {
        const s = SKILLS[id];
        return {
          label: this.short(s?.name ?? id),
          note: `${s?.mp ?? 0} MP`,
          enabled: (s?.mp ?? 0) <= actor.mp
        };
      }),
      actor.skills.slice()
    );
  }

  private openItemMenu(): void {
    const items = this.usableItems();
    this.setMenu(
      'item',
      items.map(({ id, count }) => ({
        label: this.short(ITEMS[id]?.name ?? id),
        note: `X${count}`
      })),
      items.map(({ id }) => id)
    );
  }

  private setMenu(mode: Mode, items: MenuEntry[], ids: string[]): void {
    this.mode = mode;
    this.entryIds = ids;
    this.cmd.setItems(items);
    this.cmd.setIndex(0);
    this.cmd.setVisible(true);
    sfx('cursor');
  }

  private onCommand(): void {
    const id = this.entryIds[this.cmd.index] ?? '';
    if (this.mode === 'main') {
      if (id === 'attack') this.tryAction({ kind: 'attack' });
      else if (id === 'guard') this.tryAction({ kind: 'defend' });
      else if (id === 'flee') this.tryAction({ kind: 'flee' });
      else if (id === 'skill') this.openSkillMenu();
      else if (id === 'item') this.openItemMenu();
      return;
    }
    if (this.mode === 'skill') {
      this.tryAction({ kind: 'skill', skillId: id });
      return;
    }
    if (this.mode === 'item') {
      this.tryAction({ kind: 'item', itemId: id });
      return;
    }
    if (this.mode === 'target' && this.pendingAction) {
      this.submit({ ...this.pendingAction, targetUid: id });
    }
  }

  /** Ask for a target only when there is more than one candidate. */
  private tryAction(action: BattleAction): void {
    const actor = this.actor;
    if (!actor) return;
    const pool = this.engine.legalTargets(actor, action);
    if (pool.length > 1) {
      this.pendingAction = action;
      this.setMenu(
        'target',
        // Read the displayed numbers, not the model: the whole HUD has one
        // source of truth, so a target list can never show HP that has not
        // finished animating away.
        pool.map((t) => {
          const s = this.shownOf(t);
          return {
            label: this.short(t.name),
            note: `${s.hp}/${t.maxHp}`,
            color: s.alive ? C.text : C.dark
          };
        }),
        pool.map((t) => t.uid)
      );
      return;
    }
    this.submit(pool.length ? { ...action, targetUid: pool[0].uid } : action);
  }

  private submit(action: BattleAction): void {
    this.cmd.setVisible(false);
    this.actorLabel.setText('');
    this.actor = null;
    this.pendingAction = null;
    this.mode = 'idle';
    this.hold = 0;
    this.pending = this.engine.choose(action);
  }

  private usableItems(): { id: string; count: number }[] {
    return gs(this)
      .listInventory()
      .filter(({ id }) => {
        const def = ITEMS[id];
        return !!def?.effect && (def.usable === 'both' || def.usable === 'battle');
      });
  }

  /* -------------------------------------------------------- event playback */

  private play(e: BattleEvent): void {
    this.applyShown(e);
    switch (e.t) {
      case 'round':
        this.log(`ROUND ${e.round}`);
        this.hold = 460;
        break;
      case 'log':
        this.log(e.text);
        this.hold = 300;
        break;
      case 'use':
        this.onUse(e.uid, e.kind, e.name, e.skillId);
        break;
      case 'hit':
        this.onHit(e.to, e.damage, e.crit, e.missed, e.element, e.kind);
        break;
      case 'heal':
        this.onHeal(e.to, e.amount);
        break;
      case 'status':
        this.onStatus(e.to, e.id, e.applied);
        break;
      case 'cured':
        this.fxAt(e.to, 'heal');
        sfx('heal');
        this.hold = 320;
        break;
      case 'death':
        this.onDeath(e.uid);
        break;
      case 'revive':
        this.onRevive(e.uid);
        break;
      case 'phase':
        this.onPhase(e.uid);
        break;
      case 'result':
        this.onResult(e.outcome, e.rewards);
        break;
    }
    this.refreshAll();
  }

  private onUse(
    uid: string,
    kind: 'attack' | 'skill' | 'item' | 'defend' | 'flee',
    name?: string,
    skillId?: string
  ): void {
    const v = this.views.get(uid);
    const who = this.nameOf(uid);
    if (kind === 'attack') this.log(`${who} attacks.`);
    else if (name) this.log(`${who} uses ${name}.`);
    this.hold = 340;
    if (!v) return;
    if (kind === 'attack') {
      this.lunge(v);
      this.resume(v);
    } else if (kind === 'skill') {
      const element = skillId ? SKILLS[skillId]?.element : undefined;
      const orb = element ? `orb_${element}` : '';
      this.pose(v, v.unit.side === 'party' ? 's_cast1' : 'attack');
      this.fxAt(uid, orb && this.fxKey(orb) ? orb : 'rune');
      sfx('magic');
      this.resume(v);
    } else if (kind === 'item') {
      this.hop(v);
      sfx('heal');
    } else if (kind === 'defend') {
      this.pose(v, v.unit.side === 'party' ? 's_guard' : 'idle1');
      this.fxAt(uid, 'shield');
      sfx('guard');
      this.resume(v);
    } else {
      this.hop(v);
    }
  }

  private onHit(
    uid: string,
    damage: number,
    crit: boolean,
    missed: boolean,
    element: string | undefined,
    kind: 'phys' | 'mag' | 'item'
  ): void {
    const v = this.views.get(uid);
    if (!v) {
      this.hold = 260;
      return;
    }
    if (missed) {
      this.float(v, 'MISS', C.dim);
      sfx('miss');
      this.hold = 320;
      return;
    }
    const wanted = kind === 'mag' && element ? `orb_${element}` : kind === 'item' ? 'impact' : 'slash';
    this.fxAt(uid, this.fxKey(wanted) ? wanted : 'impact');
    this.flash(v);
    this.float(v, String(damage), crit ? C.gold : C.hp);
    // The number belongs in the log as well: a plain hit otherwise leaves no
    // trace, and the only bar that visibly moves is the party's own.
    this.log(`${this.nameOf(uid)} takes ${damage}.`);
    sfx(crit ? 'crit' : 'hit');
    if (crit) this.shakeScreen();
    this.hold = crit ? 520 : 420;
  }

  private onHeal(uid: string, amount: number): void {
    const v = this.views.get(uid);
    this.fxAt(uid, 'heal');
    if (v) this.float(v, `+${amount}`, C.ok);
    this.log(`${this.nameOf(uid)} recovers ${amount}.`);
    sfx('heal');
    this.hold = 380;
  }

  private onStatus(uid: string, id: string, applied: boolean): void {
    const def = STATUSES[id];
    const v = this.views.get(uid);
    if (!applied) {
      this.hold = 240;
      return;
    }
    if (v) this.fxAt(uid, def?.good ? 'rune' : 'smoke');
    sfx(def?.good ? 'buff' : 'debuff');
    this.hold = 320;
  }

  private onDeath(uid: string): void {
    const v = this.views.get(uid);
    sfx('death');
    this.hold = 520;
    if (!v) return;
    this.pose(v, v.unit.side === 'party' ? 's_dead' : 'die');
    v.img.setAlpha(0.4);
    v.shadow.setAlpha(0.12);
    v.tags.forEach((t) => t.destroy());
    v.tags = [];
  }

  private onRevive(uid: string): void {
    const v = this.views.get(uid);
    this.fxAt(uid, 'heal');
    sfx('level');
    this.hold = 460;
    if (!v) return;
    v.img.setAlpha(1);
    v.shadow.setAlpha(0.32);
    this.playIdle(v);
  }

  /** Boss phase swap: a flare of light over the sprite. */
  private onPhase(uid: string): void {
    const v = this.views.get(uid);
    this.fxAt(uid, 'rune');
    sfx('magic');
    this.hold = 640;
    if (!v) return;
    v.img.setTintFill(0xffffff);
    this.time.delayedCall(160, () => {
      if (v.img.active) v.img.clearTint();
    });
    this.shakeScreen();
  }

  private nameOf(uid: string): string {
    return this.engine.unit(uid)?.name ?? 'IT';
  }

  /* ------------------------------------------------------------- visuals */

  private fxKey(prefix: string): boolean {
    return this.anims.exists(`fx_${prefix}`);
  }

  private fxAt(uid: string, prefix: string): void {
    const v = this.views.get(uid);
    const key = `fx_${prefix}`;
    if (!v || !this.anims.exists(key)) return;
    const img = this.add.sprite(v.home.x, v.home.y - 16, 'fx', `${prefix}_0`).setDepth(v.home.y + 10);
    img.play(key);
    img.once('animationcomplete', () => img.destroy());
    this.time.delayedCall(900, () => {
      if (img.active) img.destroy();
    });
  }

  private lunge(v: UnitView): void {
    const dir = v.unit.side === 'party' ? 1 : -1;
    this.pose(v, v.unit.side === 'party' ? 's_attack1' : 'attack');
    this.tweens.add({
      targets: v.img,
      x: v.home.x + dir * 26,
      duration: 140,
      yoyo: true,
      ease: 'Quad.In'
    });
  }

  private hop(v: UnitView): void {
    this.tweens.add({ targets: v.img, y: v.home.y - 6, duration: 130, yoyo: true });
  }

  private flash(v: UnitView): void {
    v.img.setTintFill(0xffffff);
    this.time.delayedCall(80, () => {
      if (v.img.active) v.img.clearTint();
    });
    this.tweens.add({
      targets: v.img,
      x: v.home.x + 3,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (v.img.active) v.img.setX(v.home.x);
      }
    });
  }

  /**
   * A number that pops over a unit, rises and fades. Foes carry a name plate at
   * `y - 48` and an HP gauge at `y - 38`, so their numbers clear both instead of
   * landing on top of the name. Concurrent numbers on one unit fan out sideways
   * so a multi-hit skill stays readable.
   */
  private float(v: UnitView, text: string, color: number): void {
    const uid = v.unit.uid;
    const n = this.floats.get(uid) ?? 0;
    this.floats.set(uid, n + 1);

    // 0, -10, +10, -20, +20 ... around the sprite.
    const step = Math.ceil((n + 1) / 2);
    const x = v.home.x + (n % 2 === 0 ? step - 1 : -step) * 10;
    const y = v.home.y - (v.unit.side === 'foe' ? 62 : 44);

    const shadow = makeLabel(this, text, x + 1, y + 1, { color: C.shadow, align: 'center' }).setDepth(599);
    const label = makeLabel(this, text, x, y, { color, align: 'center' }).setDepth(600);
    shadow.setScaleValue(1.7);
    label.setScaleValue(1.7);

    this.tweens.add({ targets: [shadow, label], scale: 1, duration: 120, ease: 'Back.Out' });
    this.tweens.add({
      targets: [shadow, label],
      y: '-=16',
      alpha: 0,
      delay: 300,
      duration: 420,
      ease: 'Quad.In',
      onComplete: () => {
        const left = (this.floats.get(uid) ?? 1) - 1;
        if (left > 0) this.floats.set(uid, left);
        else this.floats.delete(uid);
        if (shadow.active) shadow.destroy();
        if (label.active) label.destroy();
      }
    });
  }

  private shakeScreen(): void {
    const cam = this.cameras.main;
    const ox = cam.scrollX;
    const oy = cam.scrollY;
    this.tweens.add({
      targets: cam,
      scrollX: ox + 3,
      scrollY: oy + 2,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => cam.setScroll(ox, oy)
    });
  }

  /* ---------------------------------------------------------------- result */

  private onResult(outcome: BattleOutcome, rewards?: BattleRewards): void {
    this.outcome = outcome;
    this.mode = 'result';
    this.snapShown();
    this.cmd.setVisible(false);
    this.actorLabel.setText('');
    // Nothing meaningful is queued behind a result; fold any late log lines in.
    for (const e of this.pending) if (e.t === 'log') this.log(e.text);
    this.pending = [];

    const lines: string[] = [];
    if (outcome === 'victory' && rewards) {
      sfx('victory');
      lines.push('VICTORY');
      lines.push(`XP    +${rewards.xp}`);
      lines.push(`COIN  +${rewards.gold}`);
      for (const d of rewards.drops) lines.push(`FOUND   ${ITEMS[d.id]?.name ?? d.id} X${d.count}`);
      for (const lv of rewards.levels) {
        lines.push(`${lv.name.toUpperCase()}  LV${lv.from} -> ${lv.to}`);
        for (const s of lv.learned) lines.push(`LEARNED ${SKILLS[s]?.name ?? s}`);
      }
    } else if (outcome === 'defeat') {
      sfx('defeat');
      lines.push('THE PARTY FALLS');
      lines.push('THE ROAD GOES DARK');
    } else {
      sfx('cancel');
      lines.push('THE PARTY SLIPS AWAY');
    }

    this.log(lines[0]);
    this.showResultPanel(lines);
    this.hold = 520;
  }

  /** Rewards / epitaph card, cleared with any key. */
  private showResultPanel(lines: string[]): void {
    this.resultLines = lines.slice(0, 10);
    const shown = this.resultLines;
    const pw = Math.min(300, stage.w - 32);
    const ph = 30 + shown.length * 14;
    const x = Math.round(stage.cx - pw / 2);
    const y = Math.max(12, Math.min(this.L.party.y - ph - 10, stage.h - ph - 12));
    this.resultPanel = new Panel(this, x, y, pw, ph).setDepth(700);
    shown.forEach((line, i) => {
      this.resultLabels.push(
        makeLabel(this, line.toUpperCase(), x + 14, y + 12 + i * 14, {
          color: i === 0 ? C.gold : C.text
        }).setDepth(701)
      );
    });
    const prompt = makeLabel(this, '[Z] CONTINUE', x + pw - 14, y + ph - 18, {
      color: C.dim,
      align: 'right'
    }).setDepth(701);
    this.resultLabels.push(prompt);
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.3 }, duration: 520, yoyo: true, repeat: -1 });
  }

  /** The card holds no state, so a resize just redraws it at the new size. */
  private rebuildResultPanel(): void {
    this.resultLabels.forEach((l) => l.destroy());
    this.resultLabels = [];
    this.resultPanel?.destroy();
    this.resultPanel = null;
    this.showResultPanel(this.resultLines);
  }

  /** Hand the run back to whichever scene asked for the fight. */
  private finishBattle(): void {
    if (this.leaving) return;
    this.leaving = true;

    this.engine.syncToState();
    const state = gs(this);
    const outcome = this.outcome;
    const returnTo = this.returnTo;

    bus.emit('battle:end', { outcome });
    bus.emit('party:changed', undefined);
    bus.emit('gold:changed', state.gold);
    bus.emit('state:changed', undefined);
    session.battle = null;
    this.pad.clear();

    if (outcome === 'defeat') {
      state.restFull();
      if (returnTo === SCENES.story) {
        // Story fights are re-playable: send the beat back to its opening lines.
        session.storyPhase = 'lines';
        session.returnTo = SCENES.story;
        this.leave(SCENES.story);
        return;
      }
      const home = mapDef('village').spawn;
      session.returnTo = SCENES.world;
      this.leave(SCENES.world, { map: 'village', x: home.x, y: home.y });
      return;
    }

    if (returnTo === SCENES.story) {
      session.storyPhase = 'after';
      session.returnTo = SCENES.story;
      this.leave(SCENES.story);
      return;
    }

    session.returnTo = SCENES.world;
    this.leave(SCENES.world, { map: state.location, x: state.px, y: state.py });
  }

  private leave(next: string, data?: object): void {
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: TIMING.fade,
      onComplete: () => this.scene.start(next, data)
    });
  }
}

