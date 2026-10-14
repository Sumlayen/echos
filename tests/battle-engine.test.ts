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
