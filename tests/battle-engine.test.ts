/**
 * Engine-level checks around `BattleEngine.choose()` and the flee roll. The e2e
 * drives battles through real key input but cannot see the round queue, so
 * these tests pin down the contract that a command actually advances the fight.
 *
 *   npx vitest run
 */

import { describe, expect, it } from 'vitest';
import { BattleEngine, type BattleEvent } from '../src/battle/BattleEngine';
import { fleeChance } from '../src/battle/Damage';
import { SKILLS } from '../src/data/Skills';
import { GameState } from '../src/core/GameState';
import { Rng } from '../src/core/Rng';

const freshState = (ids = ['kael']): GameState => {
  const state = new GameState();
  state.startNew(ids);
  state.restFull();
  return state;
};

/** Out-runs every foe in `wolf`, so turn order (and the tests) stay stable. */
const fastParty = (state: GameState): GameState => {
  state.party.forEach((m) => {
    m.base.spd = 99;
  });
  return state;
};

const uses = (events: BattleEvent[], uid: string): boolean =>
  events.some((e) => e.t === 'use' && e.uid === uid);

/** Narrowed event shapes: the union is flat, so filters need help to type-check. */
type UseEvent = Extract<BattleEvent, { t: 'use' }>;
type HitEvent = Extract<BattleEvent, { t: 'hit' }>;

const logs = (events: BattleEvent[], re: RegExp): boolean =>
  events.some((e) => e.t === 'log' && re.test(e.text));

describe('BattleEngine.choose', () => {
  it('resumes the round queue after a command', () => {
    const engine = new BattleEngine(fastParty(freshState()), null, ['wolf', 'wolf'], { seed: 3 });
    engine.start();
    expect(engine.awaitingInput()?.side).toBe('party');

    const events = engine.choose({ kind: 'attack', targetUid: engine.foes[0].uid });

    // Regression: if `choose()` returns without running the queue again the
    // battle stalls — no events come back and nobody is ever asked to act.
    expect(uses(events, 'p0')).toBe(true);
    expect(events.some((e) => e.t === 'hit' && e.from === 'p0')).toBe(true);
    // the foes got their turn, the round closed and round 2 opened...
    expect(uses(events, 'f0')).toBe(true);
    expect(events.some((e) => e.t === 'round' && e.round === 2)).toBe(true);
    // ...and the party is being asked for a command again
    expect(engine.awaitingInput()?.uid).toBe('p0');
  });

  it('asks every party member before the foes act', () => {
    const engine = new BattleEngine(fastParty(freshState(['kael', 'lyra', 'rowan'])), null, ['wolf'], {
      seed: 9
    });
    engine.start();

    const asked: string[] = [];
    let events: BattleEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const actor = engine.awaitingInput();
      expect(actor?.side).toBe('party');
      asked.push(actor!.uid);
      events = engine.choose({ kind: 'defend' });
      // the wolf only gets in once every party member has commanded
      expect(uses(events, 'f0')).toBe(i === 2);
    }
    expect(new Set(asked).size).toBe(3);
    expect(engine.round).toBe(2);
  });

  it('refuses to run away when the fight is locked', () => {
    const engine = new BattleEngine(freshState(), null, ['wolf'], { seed: 1, fleeAllowed: false });
    engine.start();
    const events = engine.choose({ kind: 'flee' });
    expect(engine.outcome).not.toBe('fled');
    expect(logs(events, /no way out/i)).toBe(true);
  });

  it('ends the battle once the escape roll lands', () => {
    let fled = false;
    for (let seed = 1; seed <= 25 && !fled; seed++) {
      const engine = new BattleEngine(fastParty(freshState()), null, ['wolf'], { seed });
      engine.start();
      const events = engine.choose({ kind: 'flee' });
      if (engine.outcome !== 'fled') continue;
      expect(logs(events, /the party slips away/i)).toBe(true);
      expect(events.some((e) => e.t === 'result' && e.outcome === 'fled')).toBe(true);
      fled = true;
    }
    expect(fled).toBe(true);
  });
});

describe('targeting', () => {
  /**
   * The reported bug was "the wolf's damage lands on my own bar". The engine
   * was audited over 150 seeded battles and never once aimed a hit at its own
   * side — the desync lived in the view, not the model. This pins the model's
   * half of that down so a future targeting change cannot regress it silently.
   */
  it('never aims a hit at the side that dealt it', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const engine = new BattleEngine(
        freshState(['kael', 'lyra', 'rowan']),
        null,
        ['wolf', 'wisp', 'beetle'],
        { seed, fleeAllowed: false }
      );
      engine.start();

      let turns = 0;
      while (engine.outcome === 'ongoing' && turns++ < 200) {
        if (!engine.awaitingInput()) break;
        const events = engine.choose(
          seed % 3 === 0 ? { kind: 'skill', skillId: 'cinder' } : { kind: 'attack' }
        );
        for (const e of events) {
          if (e.t !== 'hit') continue;
          hits++;
          const to = engine.unit(e.to);
          expect(to).toBeDefined();
          // `status` is environmental damage (burn, poison) with no actor.
          if (e.from === 'status') continue;
          const from = engine.unit(e.from);
          expect(from).toBeDefined();
          expect(from!.side).not.toBe(to!.side);
        }
      }
    }
    // Guard against the loop having quietly done nothing at all.
    expect(hits).toBeGreaterThan(200);
  });

  /**
   * `choose()` resolves the whole round at once, so the HUD needs the cost on
   * the event: without it a caster's MP bar empties before the spell animates.
   */
  it('carries the MP cost on the use event', () => {
    const engine = new BattleEngine(fastParty(freshState()), null, ['wolf', 'wolf'], { seed: 3 });
    engine.start();

    const actor = engine.awaitingInput();
    expect(actor?.uid).toBe('p0');
    const before = actor!.mp;

    const events = engine.choose({ kind: 'skill', skillId: 'cleave' });
    const use = events.find((e) => e.t === 'use' && e.uid === 'p0');
    if (!use || use.t !== 'use') throw new Error('the caster never announced the skill');

    expect(use.mp).toBe(before - SKILLS.cleave.mp);
    // The model agrees with the event; only the *timing* of the paint differs.
    expect(engine.unit('p0')?.mp).toBe(use.mp);
  });

  /**
   * The turn-order bar is painted from the `round` event, so the initiative
   * order has to travel inside it: `choose()` can resolve several rounds before
   * the scene animates any of them, and reading the engine's own queue later
   * would show a round that has not started yet. Turns must then actually be
   * taken in that order, which makes each round's `use` events a subsequence of
   * it — a unit killed before its turn is skipped, never re-ordered.
   */
  it('publishes the round order, then takes its turns in that order', () => {
    let rounds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const engine = new BattleEngine(
        freshState(['kael', 'lyra', 'rowan']),
        null,
        ['wolf', 'wisp', 'beetle'],
        { seed, fleeAllowed: false }
      );
      const all = engine.start();

      let turns = 0;
      while (engine.outcome === 'ongoing' && turns++ < 200) {
        if (!engine.awaitingInput()) break;
        all.push(...engine.choose({ kind: 'attack' }));
      }

      let order: string[] = [];
      let last = -1;
      for (const e of all) {
        if (e.t === 'round') {
          order = e.order;
          last = -1;
          rounds++;
          // Everyone standing when the round opened, each exactly once.
          expect(new Set(order).size).toBe(order.length);
          for (const uid of order) expect(engine.unit(uid)).toBeDefined();
          continue;
        }
        if (e.t !== 'use' || e.counter) continue;
        // A counter is a reaction, not a turn: it is not in the initiative order
        // and must not be walked as if it were.
        const at = order.indexOf(e.uid);
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeGreaterThan(last);
        last = at;
      }

      // Nothing had died when round 1 opened, so it lists the whole field.
      const opened = all.find((e) => e.t === 'round');
      expect(opened?.t === 'round' && opened.order.length === engine.units.length).toBe(true);
    }
    // Guard against the loop having quietly done nothing at all.
    expect(rounds).toBeGreaterThan(20);
  });
});

describe('counter-attacks', () => {
  /**
   * Creatures used to answer every single swing, which made attacking a trade
   * and threw away the reward for winning initiative. They now answer on a rare
   * roll, and the answer is not itself answerable.
   */
  it('answer a landed blow occasionally, never an answer, never their own side', () => {
    let swings = 0;
    let counters = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const engine = new BattleEngine(
        fastParty(freshState(['kael', 'lyra', 'rowan'])),
        null,
        ['wolf', 'wisp', 'beetle'],
        { seed, fleeAllowed: false }
      );
      const all = engine.start();

      let turns = 0;
      while (engine.outcome === 'ongoing' && turns++ < 200) {
        if (!engine.awaitingInput()) break;
        all.push(...engine.choose({ kind: 'attack' }));
      }

      for (const e of all) {
        if (e.t === 'hit' && !e.missed && e.kind === 'phys' && e.from.startsWith('p') && e.to.startsWith('f')) {
          swings++;
        }
      }
      const fired = all.filter((e) => e.t === 'use' && e.counter) as UseEvent[];
      counters += fired.length;

      for (const e of fired) {
        const at = all.indexOf(e);
        // The blow that provoked it came from the party...
        const swing = all.slice(0, at).reverse().find((p) => p.t === 'hit') as HitEvent | undefined;
        expect(swing?.t).toBe('hit');
        if (swing?.t !== 'hit') continue;
        expect(swing.from.startsWith('p')).toBe(true);
        expect(swing.to).toBe(e.uid);
        // ...and the answer lands straight back on the party, on the unit that
        // swung. Nothing about a counter may aim at the creature's own side.
        const answer = all.slice(at + 1).find((p) => p.t === 'hit') as HitEvent | undefined;
        expect(answer?.t).toBe('hit');
        if (answer?.t !== 'hit') continue;
        expect(answer.from).toBe(e.uid);
        expect(answer.to.startsWith('p')).toBe(true);
        // A counter is not a turn, so it never opens a second one for the same unit.
        expect(all.slice(at + 1, at + 3).some((p) => p.t === 'use' && p.counter)).toBe(false);
      }
    }
    expect(swings).toBeGreaterThan(100);
    expect(counters / swings).toBeLessThanOrEqual(0.15);
    expect(counters).toBeGreaterThan(0);
  });
});

describe('flee rolls', () => {
  it('climb with the speed advantage and stay inside the cap', () => {
    const engine = new BattleEngine(freshState(), null, ['wolf'], { seed: 2 });
    const slow = fleeChance(engine.party, engine.foes, new Rng(7));
    engine.party.forEach((u) => {
      u.base.spd = 99;
    });
    const fast = fleeChance(engine.party, engine.foes, new Rng(7));
    expect(slow).toBeGreaterThanOrEqual(0.15);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeLessThanOrEqual(0.95);
  });

  it('are shut off against a boss', () => {
    const engine = new BattleEngine(freshState(), null, ['warden'], { seed: 2, fleeAllowed: true });
    expect(fleeChance(engine.party, engine.foes, new Rng(7))).toBe(0);
    engine.start();
    const events = engine.choose({ kind: 'flee' });
    expect(engine.outcome).not.toBe('fled');
    expect(logs(events, /no way out/i)).toBe(true);
  });
});
