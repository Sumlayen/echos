/**
 * The turn-based battle engine. It is deliberately Phaser-free: it mutates
 * `BattleUnit` records and emits a flat list of events that `BattleScene`
 * animates. That split keeps the rules unit-testable with a seeded RNG.
 *
 * Round flow:
 *   1. initiative is rolled for every living unit (`Damage.turnOrder`)
 *   2. the queue is walked in that order; party units ask for input,
 *      enemy units run their AI script
 *   3. at round end, damage-over-time and status durations tick down
 */

import { ENEMIES, enemy, STORY_BATTLES, ENCOUNTERS, type AiAction, type EnemyDef } from '../data/Enemies';
import { BALANCE } from '../config/constants';
import { ITEMS, itemHealAmount } from '../data/Items';
import { SKILLS, type SkillDef } from '../data/Skills';
import type { GameState, PartyMember } from '../core/GameState';
import { Rng } from '../core/Rng';
import * as D from './Damage';
import * as S from './Status';
import type { BattleAction, BattleUnit, BattleUnitSnapshot } from './Types';

export type BattleOutcome = 'victory' | 'defeat' | 'fled' | 'ongoing';

export type BattleEvent =
  /**
   * Opens a round. `order` is that round's initiative order, front to back.
   * It has to travel inside the event: `choose()` can resolve several rounds
   * before the scene plays a single one, so by the time `round N` animates the
   * engine's own queue already belongs to a later round.
   */
  | { t: 'round'; round: number; order: string[] }
  | { t: 'log'; text: string }
  /**
   * An actor committed an action. `mp` carries that actor's focus *after* any
   * cost was paid: `choose()` resolves the whole round at once, so without it
   * the HUD would spend a skill's MP before the cast has animated.
   */
  | { t: 'use'; uid: string; kind: 'attack' | 'skill' | 'item' | 'defend' | 'flee'; name?: string; skillId?: string; itemId?: string; mp?: number; counter?: boolean }
  | { t: 'hit'; from: string; to: string; damage: number; crit: boolean; missed: boolean; element?: string; kind: 'phys' | 'mag' | 'item' }
  | { t: 'heal'; to: string; amount: number }
  | { t: 'status'; to: string; id: string; applied: boolean }
  | { t: 'cured'; to: string; ids: string[] }
  | { t: 'death'; uid: string }
  | { t: 'revive'; uid: string; hp: number }
  | { t: 'phase'; uid: string }
  | { t: 'result'; outcome: BattleOutcome; rewards?: BattleRewards };

export interface LevelGain {
  id: string;
  name: string;
  levels: number;
  from: number;
  to: number;
  learned: string[];
}

export interface BattleRewards {
  xp: number;
  gil: number;
  drops: { id: string; count: number }[];
  levels: LevelGain[];
}

export interface BattleOptions {
  seed?: number;
  /** Extra XP/gil multiplier (story battles). */
  rewardMult?: number;
  /** Overrides the flee option entirely. */
  fleeAllowed?: boolean;
  intro?: string;
}

/* ------------------------------------------------------------ unit factory */

export function partyUnit(state: GameState, m: PartyMember, index: number): BattleUnit {
  return {
    uid: `p${index}`,
    side: 'party',
    kind: 'char',
    refId: m.id,
    name: m.name,
    level: m.level,
    art: m.id,
    scale: 1,
    boss: false,
    hp: m.hp,
    maxHp: state.memberMaxHp(m),
    mp: m.mp,
    maxMp: state.memberMaxMp(m),
    base: { ...m.base },
    skills: m.skills.slice(),
    equipment: { ...m.equipment },
    resist: {},
    statuses: [],
    guarding: false,
    alive: m.hp > 0,
    aiUses: {}
  };
}

export function foeUnit(def: EnemyDef, index: number, levelBonus = 0): BattleUnit {
  const level = def.level + levelBonus;
  const scaleHp = 1 + levelBonus * 0.12;
  const hp = Math.round(def.hp * scaleHp);
  return {
    uid: `f${index}`,
    side: 'foe',
    kind: 'enemy',
    refId: def.id,
    name: def.name,
    level,
    art: def.art,
    scale: def.scale ?? 1,
    boss: !!def.boss,
    phaseAt: def.phaseAt,
    hp,
    maxHp: hp,
    mp: def.mp,
    maxMp: def.mp,
    base: { ...def.stats },
    skills: [],
    resist: { ...(def.resist ?? {}) },
    statuses: [],
    guarding: false,
    alive: true,
    ai: def.ai,
    aiUses: {},
    xp: Math.round(def.xp * scaleHp),
    gil: Math.round(def.gil * scaleHp),
    drops: def.drops
  };
}

/** Weighted random encounter group for an area key (`forest`, `ruins`, ...). */
export function rollEncounter(area: string, rng: Rng): string[] {
  const groups = ENCOUNTERS[area];
  if (!groups?.length) return ['wolf'];
  return rng.weighted(groups.map((g) => [g.ids, g.weight] as [string[], number])).slice();
}

/** Fixed story battle -> enemy ids. */
export function storyFoes(key: string): string[] {
  const ids = STORY_BATTLES[key];
  if (!ids) throw new Error(`Unknown story battle: ${key}`);
  ids.forEach((id) => ENEMIES[id]); // validate
  return ids.slice();
}

/* ------------------------------------------------------------------ engine */

export class BattleEngine {
  readonly units: BattleUnit[] = [];
  readonly party: BattleUnit[] = [];
  readonly foes: BattleUnit[] = [];
  round = 0;
  outcome: BattleOutcome = 'ongoing';
  rewards?: BattleRewards;

  private queue: BattleUnit[] = [];
  private events: BattleEvent[] = [];
  private rng: Rng;
  private opts: BattleOptions;
  private phased = new Set<string>();
  private fledThisRound = false;

  constructor(
    private state: GameState,
    partyIds: string[] | null,
    foeIds: string[],
    opts: BattleOptions = {}
  ) {
    this.opts = opts;
    this.rng = new Rng(opts.seed ?? Date.now() >>> 0);
    const ids = partyIds ?? state.partyOrder;
    ids.forEach((id, i) => {
      const m = state.member(id);
      if (!m) return;
      const u = partyUnit(state, m, i);
      this.party.push(u);
      this.units.push(u);
    });
    foeIds.forEach((id, i) => {
      const u = foeUnit(enemy(id), i);
      this.foes.push(u);
      this.units.push(u);
    });
    if (opts.intro) this.push({ t: 'log', text: opts.intro });
  }

  /* --------------------------------------------------------- public flow */

  /** Begins round 1 and runs until the player (or the result) is needed. */
  start(): BattleEvent[] {
    this.beginRound();
    return this.take();
  }

  /** The party unit currently waiting for a command, if any. */
  awaitingInput(): BattleUnit | null {
    if (this.outcome !== 'ongoing') return null;
    for (const u of this.queue) {
      if (u.alive && u.side === 'party') return u;
    }
    return null;
  }

  /** Submits the command for `awaitingInput()` and resumes the round. */
  choose(action: BattleAction): BattleEvent[] {
    const actor = this.awaitingInput();
    if (!actor) return this.take();
    this.queue = this.queue.filter((u) => u !== actor);
    this.resolve(actor, action);
    this.checkOutcome();
    // Hand the round back to whoever is next in the queue; without this the
    // battle stalls forever the moment the player picks a command.
    if (this.outcome === 'ongoing') this.runQueue();
    return this.take();
  }

  /** All events emitted since the last call. */
  private take(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private push(e: BattleEvent): void {
    this.events.push(e);
  }

  private log(text: string): void {
    this.push({ t: 'log', text });
  }

  alive(side?: 'party' | 'foe'): BattleUnit[] {
    return this.units.filter((u) => u.alive && (!side || u.side === side));
  }

  foesAlive(): BattleUnit[] {
    return this.foes.filter((u) => u.alive);
  }

  partyAlive(): BattleUnit[] {
    return this.party.filter((u) => u.alive);
  }

  unit(uid: string): BattleUnit | undefined {
    return this.units.find((u) => u.uid === uid);
  }

  /* ----------------------------------------------------------- round flow */

  private beginRound(): void {
    this.round += 1;
    this.fledThisRound = false;
    for (const u of this.units) u.guarding = false;
    this.queue = D.turnOrder(this.units, this.rng);
    this.push({ t: 'round', round: this.round, order: this.queue.map((u) => u.uid) });
    this.runQueue();
  }

  /** Runs queued turns until player input is required or the battle ends. */
  private runQueue(): void {
    while (this.outcome === 'ongoing' && !this.fledThisRound) {
      const next = this.queue.shift();
      if (!next) {
        this.endRound();
        continue;
      }
      if (!next.alive) continue;
      if (next.side === 'party') {
        // Put them back at the head and wait for a command.
        this.queue.unshift(next);
        return;
      }
      this.resolve(next, this.aiAction(next));
      this.checkOutcome();
    }
    if (this.fledThisRound && this.outcome === 'ongoing') {
      this.outcome = 'fled';
      this.push({ t: 'result', outcome: 'fled' });
    }
  }

  private endRound(): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      const tick = S.tickEnd(u);
      if (tick.damage > 0) {
        this.push({ t: 'hit', from: 'status', to: u.uid, damage: tick.damage, crit: false, missed: false, kind: 'item' });
      }
      for (const id of tick.expired) this.push({ t: 'status', to: u.uid, id, applied: false });
      if (!u.alive) this.push({ t: 'death', uid: u.uid });
    }
    this.checkOutcome();
    if (this.outcome === 'ongoing') this.beginRound();
  }

  private checkOutcome(): void {
    if (this.outcome !== 'ongoing') return;
    if (this.foesAlive().length === 0) {
      this.victory();
    } else if (this.partyAlive().length === 0) {
      this.outcome = 'defeat';
      this.push({ t: 'result', outcome: 'defeat' });
    }
  }

  /* -------------------------------------------------------------- targets */

  /** Targets a command may legally point at; empty means "auto, no prompt". */
  legalTargets(actor: BattleUnit, action: BattleAction): BattleUnit[] {
    if (action.kind === 'attack') return this.foesAlive();
    if (action.kind === 'defend' || action.kind === 'flee') return [];
    if (action.kind === 'skill') {
      const s = SKILLS[action.skillId ?? ''];
      if (!s) return [];
      if (s.target === 'enemy') return this.enemiesOf(actor);
      if (s.target === 'allEnemies' || s.target === 'allAllies' || s.target === 'allSelf') return [];
      if (s.target === 'self') return [actor];
      return s.kind === 'revive'
        ? this.alliesOf(actor).filter((u) => !u.alive)
        : this.alliesOf(actor).filter((u) => u.alive);
    }
    if (action.kind === 'item') {
      const eff = ITEMS[action.itemId ?? '']?.effect;
      if (!eff || eff.aoe) return [];
      if (eff.revive) return this.party.filter((u) => !u.alive);
      if (eff.element) return this.foesAlive();
      return this.partyAlive();
    }
    return [];
  }

  private alliesOf(u: BattleUnit): BattleUnit[] {
    return u.side === 'party' ? this.party : this.foes;
  }

  private enemiesOf(u: BattleUnit): BattleUnit[] {
    return (u.side === 'party' ? this.foes : this.party).filter((t) => t.alive);
  }

  private pickTarget(actor: BattleUnit, uid?: string): BattleUnit | null {
    const explicit = uid ? this.unit(uid) : undefined;
    if (explicit && explicit.alive) return explicit;
    const pool = this.enemiesOf(actor);
    return pool.length ? this.rng.pick(pool) : null;
  }

  private weakestAlly(actor: BattleUnit): BattleUnit | null {
    const pool = this.alliesOf(actor).filter((u) => u.alive);
    if (!pool.length) return null;
    return pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  }

  /* -------------------------------------------------------------- actions */

  private resolve(actor: BattleUnit, action: BattleAction): void {
    if (!actor.alive) return;
    const gate = S.canAct(actor, this.rng);
    if (!gate.ok) {
      this.log(`${actor.name} is ${gate.reason}.`);
      return;
    }
    if (gate.ended) this.push({ t: 'status', to: actor.uid, id: gate.ended, applied: false });
    switch (action.kind) {
      case 'defend':
        actor.guarding = true;
        this.push({ t: 'use', uid: actor.uid, kind: 'defend', mp: actor.mp });
        this.log(`${actor.name} takes a guard.`);
        break;
      case 'flee':
        this.doFlee(actor);
        break;
      case 'attack': {
        const target = this.pickTarget(actor, action.targetUid);
        if (!target) break;
        this.push({ t: 'use', uid: actor.uid, kind: 'attack', mp: actor.mp });
        this.strike(actor, target, D.physical(actor, target, 1, this.rng), 'phys');
        break;
      }
      case 'skill':
        this.doSkill(actor, action.skillId ?? '', action.targetUid);
        break;
      case 'item':
        this.doItem(actor, action.itemId ?? '', action.targetUid);
        break;
      default:
        break;
    }
  }

  private strike(
    from: BattleUnit | null,
    to: BattleUnit,
    res: D.DamageResult,
    kind: 'phys' | 'mag' | 'item',
    element?: string,
    /** A counter is not itself counterable, or blows would trade forever. */
    nested = false
  ): void {
    // The announcement is queued *ahead* of the hit so the log reads the crit
    // first and the number second, matching the order the two land on screen.
    if (res.crit) this.log(`Critical hit on ${to.name}!`);
    this.push({
      t: 'hit', from: from?.uid ?? 'status', to: to.uid, damage: res.damage,
      crit: res.crit, missed: res.missed, element, kind
    });
    if (res.missed) {
      this.log(`${to.name} slips away.`);
      return;
    }
    this.applyDamage(to, res.damage);
    if (!nested) this.maybeCounter(from, to, kind);
  }

  /**
   * A creature still standing after a landed blow answers it — but only every
   * so often. Countering every swing turns attacking into a trade and throws
   * away the whole point of winning the initiative, so the answer is a rare
   * sting rather than a reflex: `BALANCE.counterChance`, and only against the
   * melee that reached it (spells and thrown items are not within reach).
   */
  private maybeCounter(from: BattleUnit | null, to: BattleUnit, kind: 'phys' | 'mag' | 'item'): void {
    if (kind !== 'phys' || to.side !== 'foe') return;
    if (!from || !from.alive || !to.alive || from.side !== 'party') return;
    if (!this.rng.chance(BALANCE.counterChance)) return;
    this.log(`${to.name} counters!`);
    this.push({ t: 'use', uid: to.uid, kind: 'attack', mp: to.mp, counter: true });
    this.strike(to, from, D.physical(to, from, BALANCE.counterPower, this.rng), 'phys', undefined, true);
  }

  private applyDamage(to: BattleUnit, amount: number): void {
    to.hp = Math.max(0, to.hp - amount);
    for (const id of S.breakOnHit(to)) this.push({ t: 'status', to: to.uid, id, applied: false });
    if (to.hp <= 0 && to.alive) {
      to.alive = false;
      to.died = true;
      this.push({ t: 'death', uid: to.uid });
      this.log(`${to.name} falls.`);
    }
    this.checkPhase(to);
  }

  /** Boss phase swap once, at the configured HP fraction. */
  private checkPhase(u: BattleUnit): void {
    if (!u.boss || u.phaseAt === undefined || this.phased.has(u.uid) || u.hp <= 0) return;
    if (u.hp / u.maxHp > u.phaseAt) return;
    this.phased.add(u.uid);
    S.addStatus(u, 'raise', 99);
    S.addStatus(u, 'haste', 99);
    this.push({ t: 'phase', uid: u.uid });
    this.log(`${u.name} sheds its shell — the true form wakes!`);
  }

  private healTo(to: BattleUnit, amount: number): void {
    const before = to.hp;
    to.hp = Math.min(to.maxHp, to.hp + amount);
    if (to.hp > before) this.push({ t: 'heal', to: to.uid, amount: to.hp - before });
  }

  private tryStatus(to: BattleUnit, id: string, chance: number, turns: number): void {
    if (to.alive && this.rng.chance(chance)) {
      const applied = S.addStatus(to, id, turns);
      this.push({ t: 'status', to: to.uid, id, applied });
      if (applied) this.log(`${to.name} is ${S.statusDef(id).name.toLowerCase()}.`);
    }
  }

  /* ---------------------------------------------------------------- skills */

  private skillTargets(actor: BattleUnit, s: SkillDef, uid?: string): BattleUnit[] {
    switch (s.target) {
      case 'allEnemies':
        return this.enemiesOf(actor);
      case 'allAllies':
        return this.alliesOf(actor).filter((u) => u.alive);
      case 'allSelf':
        return this.alliesOf(actor).filter((u) => u.alive);
      case 'self':
        return [actor];
      case 'ally': {
        const explicit = uid ? this.alliesOf(actor).find((u) => u.uid === uid) : undefined;
        if (explicit) return [explicit];
        const weak = this.weakestAlly(actor);
        return weak ? [weak] : [];
      }
      case 'enemy':
      default: {
        const t = this.pickTarget(actor, uid);
        return t ? [t] : [];
      }
    }
  }

  private doSkill(actor: BattleUnit, skillId: string, uid?: string): void {
    const s = SKILLS[skillId];
    if (!s) {
      this.log(`${actor.name} hesitates.`);
      return;
    }
    if (S.hasStatus(actor, 'silence')) {
      this.log(`${actor.name} is silenced.`);
      return;
    }
    if (actor.mp < s.mp) {
      this.log(`${actor.name} lacks the focus.`);
      return;
    }
    const targets = this.skillTargets(actor, s, uid);
    if (!targets.length) {
      this.log('But nothing happens.');
      return;
    }
    actor.mp -= s.mp;
    this.push({ t: 'use', uid: actor.uid, kind: 'skill', name: s.name, skillId, mp: actor.mp });

    for (const t of targets) {
      if (s.kind === 'attack') {
        const element = s.element ?? 'none';
        const hits = s.hits ?? 1;
        for (let i = 0; i < hits; i++) {
          if (!t.alive) break;
          const res = s.element
            ? D.magical(actor, t, s.power ?? 1, this.rng, element)
            : D.physical(actor, t, s.power ?? 1, this.rng, element);
          this.strike(actor, t, res, s.element ? 'mag' : 'phys', s.element);
          if (s.inflict) this.tryStatus(t, s.inflict.id, s.inflict.chance, s.inflict.turns);
        }
      } else if (s.kind === 'heal') {
        this.healTo(t, D.healAmount(actor, s.base ?? 30, s.power ?? 1));
      } else if (s.kind === 'revive') {
        if (!t.alive) {
          t.alive = true;
          t.died = false;
          t.hp = Math.max(1, Math.round(t.maxHp * (s.revive ?? 0.5)));
          this.push({ t: 'revive', uid: t.uid, hp: t.hp });
          this.log(`${t.name} returns to the light.`);
        }
      } else if (s.kind === 'debuff' && (s.power ?? 0) > 0) {
        const res = D.physical(actor, t, s.power ?? 1, this.rng);
        this.strike(actor, t, res, 'phys');
        if (s.modifier) this.tryStatus(t, s.modifier.id, s.modifier.chance, s.modifier.turns);
      } else if (s.modifier) {
        this.tryStatus(t, s.modifier.id, s.modifier.chance, s.modifier.turns);
      } else if (s.inflict) {
        this.tryStatus(t, s.inflict.id, s.inflict.chance, s.inflict.turns);
      }
    }
  }

  /* ----------------------------------------------------------------- items */

  private doItem(actor: BattleUnit, itemId: string, uid?: string): void {
    const def = ITEMS[itemId];
    const eff = def?.effect;
    if (!def || !eff || (actor.side === 'party' && !this.state.removeItem(itemId))) {
      this.log(`${actor.name} reaches for nothing.`);
      return;
    }
    this.push({ t: 'use', uid: actor.uid, kind: 'item', name: def.name, itemId, mp: actor.mp });
    const aoe = eff.aoe;
    const targets = aoe
      ? (eff.element ? this.enemiesOf(actor) : this.alliesOf(actor).filter((u) => u.alive))
      : (() => {
          const pool = eff.element
            ? this.enemiesOf(actor)
            : eff.revive
              ? this.alliesOf(actor).filter((u) => !u.alive)
              : this.alliesOf(actor).filter((u) => u.alive);
          const explicit = uid ? pool.find((u) => u.uid === uid) : undefined;
          const chosen = explicit ?? (eff.element ? pool[0] : this.weakestAlly(actor) ?? pool[0]);
          return chosen ? [chosen] : [];
        })();

    if (!targets.length) {
      this.log('But nothing happens.');
      return;
    }
    for (const t of targets) {
      if (eff.element) {
        const res = D.magical(actor, t, eff.power ?? 1, this.rng, eff.element, eff.hp ?? 0);
        this.strike(actor, t, res, 'item', eff.element);
      } else if (eff.revive) {
        if (!t.alive) {
          t.alive = true;
          t.died = false;
          t.hp = Math.max(1, Math.round(t.maxHp * eff.revive));
          this.push({ t: 'revive', uid: t.uid, hp: t.hp });
          this.log(`${t.name} is drawn back.`);
        }
      } else {
        const heal = itemHealAmount(eff, t.maxHp);
        if (heal) this.healTo(t, heal);
        if (eff.mp) t.mp = Math.min(t.maxMp, t.mp + eff.mp);
        if (eff.cure?.length) {
          const cured = S.cureStatuses(t, eff.cure);
          if (cured.length) this.push({ t: 'cured', to: t.uid, ids: cured });
        }
        if (eff.buff) this.tryStatus(t, eff.buff.id, 1, eff.buff.turns);
      }
      if (eff.inflict) this.tryStatus(t, eff.inflict.id, eff.inflict.chance, eff.inflict.turns);
    }
  }

  /* ------------------------------------------------------------------ flee */

  private doFlee(actor: BattleUnit): void {
    this.push({ t: 'use', uid: actor.uid, kind: 'flee', mp: actor.mp });
    if (this.opts.fleeAllowed === false || this.foes.some((f) => f.boss)) {
      this.log('There is no way out.');
      return;
    }
    const p = D.fleeChance(this.party, this.foes, this.rng);
    if (this.rng.chance(p)) {
      this.fledThisRound = true;
      this.log('The party slips away.');
    } else {
      this.log('Could not escape!');
    }
  }

  /* ------------------------------------------------------------------- ai */

  private aiKey(a: AiAction): string {
    return `${a.action}:${a.skill ?? ''}`;
  }

  private aiUsable(unit: BattleUnit, a: AiAction): boolean {
    if (a.weight <= 0) return false;
    if (a.hpBelow !== undefined && unit.hp / unit.maxHp > a.hpBelow) return false;
    if (a.roundMin !== undefined && this.round < a.roundMin) return false;
    if (a.limit !== undefined && (unit.aiUses[this.aiKey(a)] ?? 0) >= a.limit) return false;
    if (a.action === 'attack' || a.action === 'guard') return true;
    const s = a.skill ? SKILLS[a.skill] : undefined;
    if (!s) return false;
    if (unit.mp < s.mp) return false;
    if (S.hasStatus(unit, 'silence')) return false;
    const allies = this.alliesOf(unit);
    if (s.kind === 'heal' && !allies.some((u) => u.alive && u.hp / u.maxHp < 0.55)) return false;
    if (s.kind === 'revive' && !allies.some((u) => !u.alive)) return false;
    const mod = s.modifier;
    if (s.kind === 'buff' && mod && allies.every((u) => u.alive && S.hasStatus(u, mod.id))) {
      return false;
    }
    return true;
  }

  /** Weighted script sampling with HP thresholds, round gates and use limits. */
  private aiAction(unit: BattleUnit): BattleAction {
    const script: AiAction[] = unit.ai?.length ? unit.ai : [{ action: 'attack', weight: 1 }];
    const usable = script.filter((a) => this.aiUsable(unit, a));
    const chosen = usable.length
      ? this.rng.weighted(usable.map((a) => [a, a.weight] as [AiAction, number]))
      : ({ action: 'attack', weight: 1 } as AiAction);

    if (chosen.action === 'guard') return { kind: 'defend' };

    if (chosen.action === 'attack' || !chosen.skill) {
      const pool = this.enemiesOf(unit);
      if (!pool.length) return { kind: 'pass' };
      // Occasionally finish off the most wounded foe, which reads as intent.
      const target = this.rng.chance(0.3)
        ? pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
        : this.rng.pick(pool);
      return { kind: 'attack', targetUid: target.uid };
    }

    const key = this.aiKey(chosen);
    unit.aiUses[key] = (unit.aiUses[key] ?? 0) + 1;
    return { kind: 'skill', skillId: chosen.skill };
  }

  /* -------------------------------------------------------------- rewards */

  private victory(): void {
    this.outcome = 'victory';
    const mult = this.opts.rewardMult ?? 1;
    let xp = 0;
    let gil = 0;
    const drops: { id: string; count: number }[] = [];
    for (const f of this.foes) {
      xp += f.xp ?? 0;
      gil += f.gil ?? 0;
      for (const [id, chance, count] of f.drops ?? []) {
        if (!this.rng.chance(chance)) continue;
        const found = drops.find((d) => d.id === id);
        if (found) found.count += count;
        else drops.push({ id, count });
      }
    }
    xp = Math.round(xp * mult);
    gil = Math.round(gil * mult);

    const levels: LevelGain[] = [];
    for (const u of this.party) {
      const before = u.level;
      const gain = this.state.gainXp(u.refId, xp);
      if (gain.levels > 0) {
        levels.push({
          id: u.refId, name: u.name, levels: gain.levels,
          from: before, to: u.level, learned: gain.learned
        });
      }
    }
    this.state.gil += gil;
    for (const d of drops) this.state.addItem(d.id, d.count);
    this.rewards = { xp, gil, drops, levels };
    this.push({ t: 'result', outcome: 'victory', rewards: this.rewards });
  }

  /** Writes battle HP/MP back onto the party records. */
  syncToState(): void {
    for (const u of this.party) {
      const m = this.state.member(u.refId);
      if (!m) continue;
      m.hp = Math.max(0, u.hp);
      m.mp = u.mp;
    }
  }

  /** Flat view for menus and HUD refreshes. */
  snapshot(): BattleUnitSnapshot[] {
    return this.units.map((u) => ({
      uid: u.uid,
      name: u.name,
      side: u.side,
      hp: u.hp,
      maxHp: u.maxHp,
      mp: u.mp,
      maxMp: u.maxMp,
      alive: u.alive,
      statuses: u.statuses.map((s) => ({ ...s }))
    }));
  }
}
