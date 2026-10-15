/**
 * Headless smoke test: boots the game, walks from the title into the overworld,
 * then forces every battle exit path (victory, flee, story hand-off, defeat)
 * and screenshots each one. Fails (non-zero exit) on any console error or any
 * failed assertion.
 *
 *   npx vite --port 5177 &        # or: npm run dev
 *   node scripts/e2e.mjs
 *
 * `?debug=1` is required: it is what exposes `window.game` / `window.session`
 * (see src/main.ts) so the script can jump straight into `BattleScene`.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.URL ?? 'http://127.0.0.1:5177/';
const url = `${base}${base.includes('?') ? '&' : '?'}debug=1`;
const outDir = process.env.SHOT_DIR ?? 'tmp_e2e';
mkdirSync(outDir, { recursive: true });

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'chrome' });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot: ${outDir}/${name}.png`);
};

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3500);
await shot('01-boot');

await page.waitForTimeout(1500);
await shot('02-title');

await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await shot('03-world');

await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1400);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(200);
await shot('04-walk');

await page.keyboard.down('ArrowDown');
await page.waitForTimeout(900);
await page.keyboard.up('ArrowDown');
await shot('05-walk2');

await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await shot('06-interact');

/* --------------------------------------------------------------- battle */

/** Read whatever the battle scene currently exposes (private fields are only
 *  private to TypeScript, so the running instance is fully inspectable). */
const probe = () =>
  page.evaluate(() => {
    const w = window;
    const scene = w.game?.scene?.getScene('BattleScene');
    const engine = scene?.engine;
    const state = w.game?.state;
    return {
      battle: w.session?.battle ?? null,
      returnTo: w.session?.returnTo ?? null,
      story: w.session?.story ?? null,
      storyPhase: w.session?.storyPhase ?? null,
      battleOn: !!w.game?.scene?.isActive('BattleScene'),
      worldOn: !!w.game?.scene?.isActive('WorldScene'),
      storyOn: !!w.game?.scene?.isActive('StoryScene'),
      mode: scene?.mode ?? null,
      outcome: scene?.outcome ?? null,
      index: scene?.cmd?.index ?? -1,
      count: scene?.cmd?.count ?? 0,
      entryIds: (scene?.entryIds ?? []).slice(),
      entryLabels: (scene?.cmd?.items ?? []).map((it) => it.label),
      log: (scene?.history ?? []).slice(-8),
      round: engine?.round ?? null,
      foes: (engine?.foes ?? []).map((f) => `${f.name} ${f.hp}/${f.maxHp}${f.alive ? '' : ' x'}`),
      party: (engine?.party ?? []).map((p) => `${p.name} ${p.hp}/${p.maxHp}`),
      saved: (state?.party ?? []).map((m) => `${m.name} ${m.hp}/${state.memberMaxHp(m)}`),
      location: state?.location ?? null,
      px: state?.px ?? null,
      py: state?.py ?? null,
      gold: state?.gold ?? null
    };
  });

/** Jump into a battle the way `WorldScene`/`StoryScene` set one up. */
const forceBattle = (req, sessionPatch = {}) =>
  page.evaluate(
    ({ req, sessionPatch }) => {
      const w = window;
      if (!w.game || !w.session) return false;
      w.session.story = null;
      w.session.storyPhase = 'lines';
      Object.assign(w.session, sessionPatch);
      w.session.battle = req;
      w.game.scene.stop('WorldScene');
      w.game.scene.stop('StoryScene');
      w.game.scene.stop('BattleScene');
      w.game.scene.start('BattleScene');
      return true;
    },
    { req, sessionPatch }
  );

const tap = async (key, ms = 90) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
};

/**
 * Walk the command cursor onto the entry whose id is `id` ('ATTACK'..'FLEE', or
 * a target uid) using real key input. `MenuList.move()` skips disabled entries
 * and wraps, so counting key presses is unreliable — read the cursor back.
 */
const aimAt = async (id) => {
  for (let i = 0; i < 8; i++) {
    const cur = await page.evaluate(() => {
      const scene = window.game?.scene?.getScene('BattleScene');
      return { index: scene?.cmd?.index ?? -1, ids: scene?.entryIds ?? [] };
    });
    if (cur.ids[cur.index] === id) return true;
    await tap('ArrowDown', 60);
  }
  return false;
};

/**
 * Flee odds come from the speed delta (`Damage.fleeChance`), so the flee cases
 * push party speed to the cap instead of gambling on the roll.
 */
const setSpeed = (spd) =>
  page.evaluate((spd) => {
    window.game.state.party.forEach((m) => {
      m.base.spd = spd;
    });
  }, spd);

/**
 * Level the party up through the real progression path so scripted battles are
 * won/lost on purpose rather than by accident of a level-1 start.
 */
const buffParty = (xp = 900) =>
  page.evaluate((xp) => {
    const state = window.game.state;
    state.party.forEach((m) => state.gainXp(m.id, xp));
    state.restFull();
    return state.party.map((m) => `${m.name} lv${m.level} ${m.hp}/${state.memberMaxHp(m)}`);
  }, xp);
/**
 * Drive a battle to its end. `BattleScene` plays events on its own while
 * `mode === 'idle'`; keys only matter when a menu is open, so the loop reads
 * the mode first and answers it (attack by default, flee/guard on request).
 */
async function driveBattle(label, { flee = false, guard = false, maxSteps = 500 } = {}) {
  const trace = [];
  let shotResult = false;
  let shotMenu = false;
  let shotFlee = false;
  for (let step = 0; step < maxSteps; step++) {
    const s = await probe();
    if (!s.battleOn) return { ok: true, reason: 'scene-closed', steps: step, trace, last: s };
    const sig = `${s.mode}/${s.outcome}/r${s.round}`;
    if (trace[trace.length - 1] !== sig) trace.push(sig);

    if (s.mode === 'result') {
      if (!shotResult) {
        await shot(`${label}-result`);
        shotResult = true;
      }
      await tap('Enter', 700); // CONFIRM/CANCEL/MENU all end the fight
      continue;
    }
    if (s.mode === 'main') {
      if (!shotMenu) {
        await shot(`${label}-menu`);
        shotMenu = true;
      }
      // Aim with real key input, then confirm — never poke scene internals.
      const want = flee ? 'flee' : guard ? 'guard' : 'attack';
      if (!(await aimAt(want))) trace.push(`aim-miss:${want}`);
      if (flee && !shotFlee) {
        await shot(`${label}-flee`);
        shotFlee = true;
      }
      await tap('Enter', 400);
      continue;
    }
    if (s.mode === 'target') {
      await tap('Enter', 300); // first legal target
      continue;
    }
    await page.waitForTimeout(150); // 'idle': events play themselves
  }
  return { ok: false, reason: 'timeout', steps: maxSteps, trace, last: await probe() };
}

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/* ------------------------------------------------------- victory (world) */

console.log(`party: ${(await buffParty()).join(', ')}`);
const forced = await forceBattle(
  { foes: ['wolf', 'wolf'], backdrop: 'arena_forest', flee: true },
  { returnTo: 'WorldScene' }
);
console.log(`battle forced: ${forced}`);
await page.waitForTimeout(1200);
await shot('07-battle');

/**
 * Arm a read-only sampler before the first command. `shown` is what the HUD
 * paints; `model` is what the engine has already resolved for the whole round.
 * The exact expectation is `model` plus whatever the queue has not animated
 * yet — that catches both failure modes: painting the live model (the reported
 * desync, a bar dropping before any foe moved) and a bar frozen at its old
 * value, which would lag forever and never land the hit.
 */
await page.evaluate(() => {
  const w = window;
  w.__samples = [];
  const sc = w.game.scene.getScene('BattleScene');
  if (!sc || !sc.engine) return;
  sc.events.on('preupdate', () => {
    const me = sc.engine.party[0];
    const s = sc.shown?.get(me?.uid);
    if (!me || !s) return;
    const v = sc.views?.get(me.uid);
    let owed = 0;
    for (const e of sc.pending ?? []) {
      if (e.t === 'hit' && e.to === me.uid) owed += e.damage;
      else if (e.t === 'heal' && e.to === me.uid) owed -= e.amount;
      else if (e.t === 'revive' && e.uid === me.uid) owed -= e.hp;
    }
    w.__samples.push({
      pending: (sc.pending ?? []).length,
      painted: sc.rows?.[0]?.hpText?.readable ?? null,
      want: `${me.hp + owed}/${me.maxHp}`,
      floats: sc.children.list.filter((o) => o.depth === 600).length,
      numbers: (sc.history ?? []).some((h) => /takes \d+\./.test(h)),
      // The turn-order bar: one framed portrait per combatant, in the order the
      // round event published, with the marker parked on whoever is animating.
      bar: (sc.turnChips ?? []).length,
      seq: (sc.turnSeq ?? []).length,
      faces: (sc.turnChips ?? []).filter((c) => c.art).length,
      now: sc.turnNow ?? null,
      mark: sc.turnMark?.visible ?? false,
      // Feet planted or floating: every unit's offset from the ground line it is
      // anchored to, plus the gap between it and its own shadow. `moved` marks a
      // frame where a tween owns the sprite (a hit shake, a cast hop), so the
      // checks below only judge a unit when nothing is carrying it.
      drift: [...(sc.views?.values() ?? [])]
        .filter((v) => v.unit.alive && v.img.visible)
        .map((v) => ({
          uid: v.unit.uid,
          side: v.unit.side,
          dx: Math.round(v.img.x - v.home.x),
          dy: Math.round(v.img.y - v.home.y),
          sx: Math.round(v.img.x - v.shadow.x),
          busy: !!v.busy,
          moved: sc.tweens.getTweensOf(v.img).length > 0
        }))
    });
  });
});

const run = await driveBattle('08-victory');
console.log(`victory drive: ${run.reason} in ${run.steps} steps`);
console.log(`  trace: ${run.trace.join(' > ')}`);
console.log(`  foes: ${run.last.foes.join(', ')} | party: ${run.last.party.join(', ')}`);
console.log(`  log: ${(run.last.log ?? []).join(' | ')}`);
await shot('09-victory-end');
check('victory clears session.battle', run.last.battle === null, JSON.stringify(run.last.battle));
check('victory leaves BattleScene', run.last.battleOn === false);
check('victory returns to WorldScene', run.last.worldOn === true);
check('victory outcome', run.last.outcome === 'victory', String(run.last.outcome));

/* ------------------------------------------- presentation-vs-model timing */

const samples = await page.evaluate(() => {
  const all = window.__samples ?? [];
  window.__samples = [];
  return all;
});
const midQueue = samples.filter((s) => s.pending > 0);
const wrong = samples.filter((s) => s.painted !== s.want);
const peakFloats = samples.reduce((m, s) => Math.max(m, s.floats), 0);
console.log(`  samples: ${samples.length} | mid-queue: ${midQueue.length} | mismatched: ${wrong.length} | floats peak: ${peakFloats}`);
check(
  'the painted party bar tracks the event queue exactly',
  wrong.length === 0,
  wrong.length ? `${wrong.length} bad frames, e.g. ${JSON.stringify(wrong[0])}` : `${samples.length} frames`
);
check('the queue really was mid-flight during the run', midQueue.length > 0, `${midQueue.length} frames`);
check('damage numbers float over the target', peakFloats > 0, `peak ${peakFloats}`);
check('combat log carries the damage numbers', samples.some((s) => s.numbers));

/* ------------------------------------------------------------- turn-order bar */

const barFrames = samples.filter((s) => s.seq > 0);
const markerFrames = samples.filter((s) => s.now && s.mark);
const owners = new Set(samples.map((s) => s.now).filter(Boolean));
console.log(
  `  turn bar: ${barFrames.length} frames | peak field ${Math.max(0, ...samples.map((s) => s.seq))} | turns marked ${owners.size}`
);
check(
  'turn bar paints one framed portrait per combatant',
  barFrames.length > 0 && barFrames.every((s) => s.bar === s.seq && s.faces === s.seq),
  barFrames.length ? `${barFrames.length} frames, e.g. ${JSON.stringify(barFrames[0])}` : 'never built'
);
check(
  'turn bar marks the unit whose turn is animating',
  markerFrames.length > 0,
  `${markerFrames.length} of ${samples.length} frames`
);
check(
  'turn bar walks through more than one combatant',
  owners.size >= 2,
  [...owners].join(', ')
);

/* ------------------------------------------- standing still, stepping in */

const stance = samples.map((s) => s.drift ?? []).flat();
// A frame counts as parked only when nothing owns the sprite: no walk-in and no
// shake/hop tween. Parked means standing on the ground line it was placed on, so
// the offset has to be exactly zero — that is the whole floating bug in one number.
const parked = stance.filter((d) => !d.busy && !d.moved);
const adrift = parked.filter((d) => d.dx !== 0 || d.dy !== 0);
const partyParked = parked.filter((d) => d.side === 'party');
const stepping = stance.filter((d) => d.busy);
const stepPeak = stepping.reduce((m, d) => Math.max(m, Math.abs(d.dx)), 0);
const shadowGap = parked.reduce((m, d) => Math.max(m, Math.abs(d.sx)), 0);
console.log(
  `  stance: ${partyParked.length} parked party frames | ${adrift.length} adrift | ${stepping.length} step frames | reach ${stepPeak}px | shadow gap ${shadowGap}px`
);
check(
  'party members stand dead still between turns',
  partyParked.length > 300 && adrift.filter((d) => d.side === 'party').length === 0,
  adrift.length ? `${adrift.length} drifting frames, e.g. ${JSON.stringify(adrift[0])}` : `${parked.length} frames`
);
check(
  'nothing is left standing off its home position once its animation ends',
  adrift.length === 0,
  adrift.length ? `${adrift.length} frames, e.g. ${JSON.stringify(adrift[0])}` : `${parked.length} parked frames`
);
check(
  'the attack walks in rather than sliding in place',
  stepping.length > 0 && stepPeak >= 20,
  `peak reach ${stepPeak}px over ${stepping.length} frames`
);
check(
  'the shadow stays under the sprite while it stands',
  shadowGap === 0,
  `widest gap ${shadowGap}px`
);
check(
  'every walk-in ends back on its home position',
  stance.at(-1)?.busy !== true && (samples.at(-1)?.drift ?? []).every((d) => d.dx === 0 && d.dy === 0),
  JSON.stringify(samples.at(-1)?.drift)
);

/* ------------------------------------------------------------------ flee */

await buffParty(0);
await setSpeed(99); // flee odds are speed-driven; don't gamble on the roll
await forceBattle(
  { foes: ['wolf', 'wolf'], backdrop: 'arena_forest', flee: true, seed: 4 },
  { returnTo: 'WorldScene' }
);
await page.waitForTimeout(1000);
const fled = await driveBattle('10-flee', { flee: true });
console.log(`flee drive: ${fled.reason} in ${fled.steps} steps`);
console.log(`  log: ${(fled.last.log ?? []).join(' | ')}`);
await shot('11-flee-end');
check(
  'command cursor reached FLEE',
  !fled.trace.includes('aim-miss:flee'),
  fled.trace.join(' > ')
);
check(
  'flee was actually chosen',
  /the party slips away|could not escape|no way out/i.test((fled.last.log ?? []).join(' ')),
  (fled.last.log ?? []).slice(-1)[0] ?? ''
);
check('flee clears session.battle', fled.last.battle === null, JSON.stringify(fled.last.battle));
check('flee leaves BattleScene', fled.last.battleOn === false);
check('flee returns to WorldScene', fled.last.worldOn === true);
check('flee outcome', fled.last.outcome === 'fled', String(fled.last.outcome));

/* ------------------------------------------------- story hand-off (win) */

await buffParty(0);
await forceBattle(
  { foes: ['wolf'], backdrop: 'arena_forest', storyId: 'first_wraith', flee: false },
  { returnTo: 'StoryScene', story: 'first_wraith', storyPhase: 'after' }
);
await page.waitForTimeout(1000);
const story = await driveBattle('12-story');
console.log(`story drive: ${story.reason} in ${story.steps} steps`);
await shot('13-story-end');
check('story battle clears session.battle', story.last.battle === null, JSON.stringify(story.last.battle));
check('story battle leaves BattleScene', story.last.battleOn === false);
check('story battle returns to StoryScene', story.last.storyOn === true);
check('story battle resumes aftermath', story.last.storyPhase === 'after', String(story.last.storyPhase));

/* ------------------------------------------------- story hand-off (flee) */

await buffParty(0);
await forceBattle(
  { foes: ['wolf'], backdrop: 'arena_forest', storyId: 'first_wraith', flee: true, seed: 5 },
  { returnTo: 'StoryScene', story: 'first_wraith', storyPhase: 'after' }
);
await page.waitForTimeout(1000);
const storyFlee = await driveBattle('14-story-flee', { flee: true });
console.log(`story-flee drive: ${storyFlee.reason} in ${storyFlee.steps} steps`);
await shot('15-story-flee-end');
check('story flee clears session.battle', storyFlee.last.battle === null);
check('story flee leaves BattleScene', storyFlee.last.battleOn === false);
check('story flee returns to StoryScene', storyFlee.last.storyOn === true);

/* ------------------------------------- stale returnTo must fall back */

await buffParty(0);
await forceBattle(
  { foes: ['wolf'], backdrop: 'arena_forest', flee: true, seed: 6 },
  { returnTo: 'StoryScene', story: null } // stale pointer, no live beat
);
await page.waitForTimeout(1000);
const stale = await driveBattle('16-stale-return', { flee: true });
console.log(`stale-return drive: ${stale.reason} in ${stale.steps} steps`);
console.log(`  log: ${(stale.last.log ?? []).join(' | ')}`);
await shot('17-stale-return-end');
check('stale returnTo clears session.battle', stale.last.battle === null);
check('stale returnTo leaves BattleScene', stale.last.battleOn === false);
check('stale returnTo falls back to WorldScene', stale.last.worldOn === true && stale.last.storyOn === false);

/* ------------------------------------------------------------- defeat */

await page.evaluate(() => {
  window.game.state.party.forEach((m) => {
    m.hp = 1; // one wolf bite ends it
  });
});
await forceBattle({ foes: ['wolf', 'wolf'], backdrop: 'arena_forest', flee: true }, { returnTo: 'WorldScene' });
await page.waitForTimeout(1000);
const lost = await driveBattle('18-defeat', { guard: true });
console.log(`defeat drive: ${lost.reason} in ${lost.steps} steps`);
console.log(`  saved party after defeat: ${lost.last.saved.join(', ')}`);
await shot('19-defeat-end');
check('command cursor reached GUARD', !lost.trace.includes('aim-miss:guard'), lost.trace.join(' > '));
check('defeat clears session.battle', lost.last.battle === null);
check('defeat leaves BattleScene', lost.last.battleOn === false);
check('defeat returns to WorldScene', lost.last.worldOn === true);
check('defeat outcome', lost.last.outcome === 'defeat', String(lost.last.outcome));
check('defeat revives the party', lost.last.saved.every((s) => !/\b0\//.test(s)), lost.last.saved.join(', '));
check('defeat sends the party home', lost.last.location === 'village', String(lost.last.location));

/* --------------------------------------- battle with no request at all */

await page.evaluate(() => {
  window.session.battle = null;
  window.game.scene.stop('WorldScene');
  window.game.scene.stop('BattleScene');
  window.game.scene.start('BattleScene');
});
await page.waitForTimeout(1500);
const empty = await probe();
console.log(`empty request: world=${empty.worldOn} battle=${empty.battleOn}`);
await shot('20-empty-request');
check('empty request bails to WorldScene', empty.worldOn === true && empty.battleOn === false);

/* ---------------------------------- overworld movement across scene restarts */

/**
 * Phaser detaches every Key from a scene's KeyboardPlugin when that scene shuts
 * down (`KeyboardPlugin.shutdown` -> `removeAllKeys(true)`), and a detached Key
 * keeps whatever `isDown` it had. `WorldScene` polls held keys to walk, so a key
 * cache that survives a restart stops updating and leaves the direction that
 * was held at the restart stuck on: the player walks that way forever and
 * ignores every other key. Hold RIGHT across a restart, then prove the fresh
 * scene is clean.
 */
const walk = async (key, ms = 600) => {
  const at = () =>
    page.evaluate(() => {
      const ws = window.game.scene.getScene('WorldScene');
      return [ws.player.x, ws.player.y];
    });
  const before = await at();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  const after = await at();
  return { dx: Math.round(after[0] - before[0]), dy: Math.round(after[1] - before[1]) };
};

await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
await page.evaluate(() => window.game.scene.start('WorldScene', { map: 'village', x: 19, y: 16 }));
await page.waitForTimeout(1200);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
await shot('21-world-restart');

const held = await page.evaluate(() => {
  const ws = window.game.scene.getScene('WorldScene');
  const cached = ws.keys ?? {};
  const live = ws.input.keyboard.keys;
  return {
    stuck: Object.keys(cached).filter((n) => cached[n].isDown),
    orphaned: Object.keys(cached).filter((n) => cached[n] !== live[cached[n].keyCode]),
    registered: live.filter(Boolean).length
  };
});
check('no direction stuck after a scene restart', held.stuck.length === 0, JSON.stringify(held));
check('held-key cache belongs to the live plugin', held.orphaned.length === 0, JSON.stringify(held));
check('held keys are registered with the plugin', held.registered >= 8, String(held.registered));

const idleAt = () =>
  page.evaluate(() => {
    const ws = window.game.scene.getScene('WorldScene');
    return [ws.player.x, ws.player.y];
  });
const rest0 = await idleAt();
await page.waitForTimeout(1200);
const rest1 = await idleAt();
const drift = Math.round(Math.max(Math.abs(rest1[0] - rest0[0]), Math.abs(rest1[1] - rest0[1])));
check('no phantom movement with no keys held', drift < 2, `drift=${drift}px`);
await shot('22-world-idle');

const down = await walk('ArrowDown');
const up = await walk('ArrowUp');
const wasd = await walk('s');
check('arrow down moves after a restart', down.dy > 8, JSON.stringify(down));
check('arrow up moves after a restart', up.dy < -8, JSON.stringify(up));
check('wasd moves after a restart', wasd.dy > 8, JSON.stringify(wasd));

/* ------------------------------------------------------ menu toggle (ESC) */

/**
 * Both the world and the overlay see every keypress, so the ESC that closes
 * the menu is still queued in the world scene and can reopen it in the same
 * frame. A menu that will not close also freezes walking, since the world
 * ignores keys while `overlayOpen` is set.
 */
const menuState = () =>
  page.evaluate(() => ({
    active: window.game.scene.isActive('OverlayScene'),
    flag: window.game.scene.getScene('WorldScene').overlayOpen
  }));

await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const opened = await menuState();
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const closed = await menuState();
await shot('23-menu-closed');
check('ESC opens the menu', opened.active && opened.flag, JSON.stringify(opened));
check('ESC closes the menu again', !closed.active && !closed.flag, JSON.stringify(closed));

const afterClose = await walk('ArrowDown');
check('walking works after closing the menu', afterClose.dy > 8, JSON.stringify(afterClose));

/* --------------------------------------------------- overlay tab strip */

/**
 * GEAR claims LEFT/RIGHT for its equipment slots and SETTINGS hands them to the
 * settings form, so both used to swallow the arrow keys and the tab strip froze
 * (GEAR forever, SETTINGS only escapable by closing the whole menu). The strip
 * has to stay walkable in both directions while those tabs keep their own use
 * of the arrows.
 */
const overlayTab = () =>
  page.evaluate(() => {
    const o = window.game.scene.getScene('OverlayScene');
    return { tab: o?.tab ?? null, slot: o?.slot ?? null };
  });

const walkTabs = async (key, want, max = 16) => {
  const seen = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    seen.push(await overlayTab());
    if (seen[seen.length - 1].tab === want) break;
  }
  return seen;
};

await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const startTab = await overlayTab();
const rightWalk = await walkTabs('ArrowRight', 'settings');
const visited = [...new Set([startTab.tab, ...rightWalk.map((s) => s.tab)])];
const trace = rightWalk.map((s) => `${s.tab}/${s.slot}`).join(' ');
check(
  'arrow right walks the whole tab strip (no dead end on GEAR)',
  visited.length === 6 && rightWalk[rightWalk.length - 1].tab === 'settings',
  trace
);
const gearSlots = rightWalk.filter((s) => s.tab === 'gear').map((s) => s.slot);
check(
  'gear slots still cycle inside the GEAR tab',
  gearSlots.length === 5 && gearSlots.every((s, i) => s === i),
  JSON.stringify(gearSlots)
);
await shot('24-tab-strip');

await page.keyboard.press('q');
await page.waitForTimeout(250);
const offSettings = await overlayTab();
check('Q walks out of the SETTINGS tab', offSettings.tab === 'party', JSON.stringify(offSettings));

await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const onGear = await overlayTab();
const leftWalk = await walkTabs('ArrowLeft', 'items');
check(
  'arrow left rolls off GEAR onto the previous tab',
  onGear.tab === 'gear' && leftWalk[leftWalk.length - 1].tab === 'items',
  `${onGear.tab}/${onGear.slot} -> ${leftWalk.map((s) => `${s.tab}/${s.slot}`).join(' ')}`
);

await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const closedAfterTabs = await menuState();
check(
  'menu still closes after tab walking',
  !closedAfterTabs.active && !closedAfterTabs.flag,
  JSON.stringify(closedAfterTabs)
);

/* ------------------------------------------------------- window resizing */

/**
 * The play area *is* the window: `Scale.RESIZE` keeps the canvas exactly as big
 * as the viewport, `Stage` divides that by an integer zoom to get its layout
 * space, and every scene re-flows on `stage:resize`. These checks resize the
 * browser for real and read the geometry back — nothing may end up outside the
 * play area, and nothing may lose its state on the way.
 */
const stageInfo = () =>
  page.evaluate(() => {
    const w = window;
    const rect = (o) =>
      !o
        ? null
        : {
            x: Math.round(o.x - o.displayWidth * o.originX),
            y: Math.round(o.y - o.displayHeight * o.originY),
            w: Math.round(o.displayWidth),
            h: Math.round(o.displayHeight)
          };
    const canvas = document.querySelector('#game-container canvas');
    const world = w.game?.scene?.getScene('WorldScene');
    const cam = world?.cameras?.main;
    const camBounds = cam?._bounds ?? cam?.bounds;
    const box = world?.box?.panel;
    return {
      win: { w: window.innerWidth, h: window.innerHeight },
      stage: w.stage?.size ?? null,
      map: world ? { w: world.mapW * 16, h: world.mapH * 16 } : null,
      canvas: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
      cam: cam
        ? {
            zoom: cam.zoom,
            w: cam.width,
            h: cam.height,
            bw: camBounds?.width ?? 0,
            bh: camBounds?.height ?? 0
          }
        : null,
      hint: rect(world?.hudHint),
      quest: rect(world?.questLabel),
      // A scene started between two resizes used to keep Phaser's 1x camera and
      // draw its UI at half size in the corner of the window.
      zooms: (w.game?.scene?.getScenes(true) ?? []).flatMap((sc) =>
        sc.cameras.cameras.map((c) => c.zoom)
      ),
      // What each live camera actually looks at: the world coordinates behind the
      // canvas corners, plus the rect it culls against. A camera that is zoomed
      // but not re-centred sees a different patch of world through those corners,
      // and one whose cull rect disagrees with its view drops visible objects.
      frames: (w.game?.scene?.getScenes(true) ?? []).flatMap((sc) =>
        sc.cameras.cameras.map((c) => {
          const tl = c.getWorldPoint(0, 0);
          const br = c.getWorldPoint(c.width, c.height);
          return {
            scene: sc.scene.key,
            follow: !!c._follow,
            tl: { x: Math.round(tl.x), y: Math.round(tl.y) },
            br: { x: Math.round(br.x), y: Math.round(br.y) },
            view: {
              x: Math.round(c.worldView.x),
              y: Math.round(c.worldView.y),
              w: Math.round(c.worldView.width),
              h: Math.round(c.worldView.height)
            }
          };
        })
      ),
      // Pinned UI is measured where it is drawn rather than where it is laid
      // out: a camera that renders a `scrollFactor(0)` object outside the canvas
      // hides the HUD while its layout coordinates still look perfectly placed.
      pinned: (() => {
        const bad = [];
        let n = 0;
        for (const sc of w.game?.scene?.getScenes(true) ?? []) {
          const c = sc.cameras.main;
          const m = c.matrix.matrix;
          for (const o of sc.children.list) {
            if (o.scrollFactorX !== 0 || o.scrollFactorY !== 0) continue;
            n++;
            const lx = o.x - o.displayWidth * o.originX - c.scrollX * o.scrollFactorX;
            const ly = o.y - o.displayHeight * o.originY - c.scrollY * o.scrollFactorY;
            const x = m[0] * lx + m[2] * ly + m[4];
            const y = m[1] * lx + m[3] * ly + m[5];
            const w2 = m[0] * o.displayWidth + m[2] * o.displayHeight;
            const h2 = m[1] * o.displayWidth + m[3] * o.displayHeight;
            if (x < -2 || y < -2 || x + w2 > c.width + 2 || y + h2 > c.height + 2) {
              bad.push({ scene: sc.scene.key, type: o.constructor.name, x: Math.round(x), y: Math.round(y), w: Math.round(w2), h: Math.round(h2) });
            }
          }
        }
        return { n, bad };
      })(),
      // A map smaller than the window leaves a void around it, filled by the
      // backdrop — which therefore has to be at least as big as the view.
      backdrop: world?.backdrop && cam
        ? {
            covers:
              world.backdrop.x <= cam.getWorldPoint(0, 0).x + 0.5 &&
              world.backdrop.y <= cam.getWorldPoint(0, 0).y + 0.5 &&
              world.backdrop.x + world.backdrop.width >= cam.getWorldPoint(cam.width, cam.height).x - 0.5 &&
              world.backdrop.y + world.backdrop.height >= cam.getWorldPoint(cam.width, cam.height).y - 0.5
          }
        : null,
      dialog: box
        ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.skin.width), h: Math.round(box.skin.height) }
        : null
    };
  });

const fits = (r, s) =>
  !!r && !!s && r.x >= -1 && r.y >= -1 && r.x + r.w <= s.w + 1 && r.y + r.h <= s.h + 1;

const zoomOk = (info) =>
  info.zooms.length > 0 && info.zooms.every((z) => z === info.stage.zoom);

/**
 * Every live camera must look through the canvas at exactly one stage of world,
 * and cull against that same rect. A camera left at scroll (0,0) while zoomed
 * looks at the middle of the world instead, painting the scene into one corner.
 */
const framedOk = (info) => {
  const s = info.stage;
  if (!s || !info.frames.length) return false;
  return info.frames.every((f) => {
    const spanX = Math.abs(f.br.x - f.tl.x);
    const spanY = Math.abs(f.br.y - f.tl.y);
    if (Math.abs(spanX - s.w) > 2 || Math.abs(spanY - s.h) > 2) return false;
    if (Math.abs(f.view.w - spanX) > 2 || Math.abs(f.view.h - spanY) > 2) return false;
    if (Math.abs(f.view.x - f.tl.x) > 2 || Math.abs(f.view.y - f.tl.y) > 2) return false;
    if (!f.follow) return f.tl.x === 0 && f.tl.y === 0;
    // Only the world camera roams, and only as far as the map: a view smaller
    // than the map must stay inside it, a view larger than the map must cover it
    // and sit centred rather than drift off one edge.
    const map = info.map;
    if (!map) return true;
    const axis = (lo, hi, span, size) =>
      span >= size + 1 ? lo <= 1 && hi >= size - 1 : lo >= -1 && hi <= size + 1;
    return axis(f.tl.x, f.br.x, spanX, map.w) && axis(f.tl.y, f.br.y, spanY, map.h);
  });
};

const resizeTo = async (width, height) => {
  await page.setViewportSize({ width, height });
  // ScaleManager polls the canvas' parent once per frame, then `Stage` re-measures.
  await page.waitForTimeout(500);
  return stageInfo();
};

const viewports = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 960, h: 600 },
  { w: 640, h: 360 },
  { w: 480, h: 420 }
];

for (const vp of viewports) {
  const info = await resizeTo(vp.w, vp.h);
  const tag = `${vp.w}x${vp.h}`;
  const zoom = info.stage?.zoom ?? 0;
  const exact =
    info.canvas?.w === info.win.w &&
    info.canvas?.h === info.win.h &&
    Number.isInteger(zoom) &&
    zoom >= 1 &&
    info.win.w - info.stage.w * zoom < zoom &&
    info.win.h - info.stage.h * zoom < zoom;
  check(
    `canvas fills the window at ${tag}`,
    exact,
    JSON.stringify({ win: info.win, canvas: info.canvas, stage: info.stage })
  );
  check(
    `camera view equals the layout space at ${tag}`,
    Math.abs(info.cam.w / info.stage.w - zoom) < 0.01 && Math.abs(info.cam.h / info.stage.h - zoom) < 0.01,
    JSON.stringify({ cam: info.cam, stage: info.stage })
  );
  check(
    `camera bounds never smaller than the view at ${tag}`,
    info.cam.bw >= info.stage.w - 1 && info.cam.bh >= info.stage.h - 1,
    JSON.stringify(info.cam)
  );
  check(
    `every running scene draws at the stage zoom at ${tag}`,
    zoomOk(info),
    JSON.stringify({ zooms: info.zooms, stage: info.stage })
  );
  check(
    `cameras frame the layout space at ${tag}`,
    framedOk(info),
    JSON.stringify({ frames: info.frames, stage: info.stage })
  );
  check(
    `world HUD stays inside the stage at ${tag}`,
    fits(info.hint, info.stage) && fits(info.quest, info.stage) && fits(info.dialog, info.stage),
    JSON.stringify({ hint: info.hint, quest: info.quest, dialog: info.dialog, stage: info.stage })
  );
  check(
    `pinned HUD is drawn on the canvas at ${tag}`,
    info.pinned.n > 0 && info.pinned.bad.length === 0,
    JSON.stringify({ pinned: info.pinned, cam: info.cam, stage: info.stage })
  );
  check(
    `backdrop covers the view at ${tag}`,
    !!info.backdrop && info.backdrop.covers,
    JSON.stringify({ backdrop: info.backdrop, cam: info.cam })
  );
  if (vp.w === 1920 || vp.w === 480) await shot(`25-world-${tag}`);
}

/* ------------------------------------ battle re-flows without losing state */

const battleGeo = () =>
  page.evaluate(() => {
    const s = window.game?.scene?.getScene('BattleScene');
    const L = s?.L;
    return {
      mode: s?.mode ?? null,
      cursor: s?.cmd?.index ?? -1,
      panels: L ? [L.party, L.log, L.cmd].map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })) : [],
      homes: (s?.order ?? []).map((v) => ({ x: v.home.x, y: v.home.y })),
      // The turn bar is rebuilt on resize, and its cells shrink to fit: every
      // portrait has to still be on the stage afterwards.
      bar: (s?.turnChips ?? []).map((c) => ({
        x: Math.round(c.x),
        y: Math.round(c.y),
        art: !!c.art
      })),
      seq: (s?.turnSeq ?? []).length
    };
  });

await buffParty();
await forceBattle({ foes: ['wolf'], backdrop: 'arena_forest', flee: true }, { returnTo: 'WorldScene' });

let menuUp = false;
for (let i = 0; i < 40 && !menuUp; i++) {
  menuUp = (await battleGeo()).mode === 'main';
  if (!menuUp) await page.waitForTimeout(200);
}
const battleBefore = await battleGeo();
const wide = await resizeTo(1600, 1000);
const battleWide = await battleGeo();
check('battle command menu was open before resizing', battleBefore.mode === 'main', String(battleBefore.mode));
check(
  'battle panels and sprites stay inside the stage at 1600x1000',
  battleWide.panels.every((p) => fits(p, wide.stage)) &&
    battleWide.homes.every((p) => p.x > 0 && p.x < wide.stage.w && p.y > 0 && p.y < wide.stage.h),
  JSON.stringify({ panels: battleWide.panels, homes: battleWide.homes, stage: wide.stage })
);
check(
  'battle cursor survives the resize',
  battleWide.mode === 'main' && battleWide.cursor === battleBefore.cursor,
  JSON.stringify({ before: battleBefore.cursor, after: battleWide.cursor })
);
check(
  'battle scene draws at the stage zoom at 1600x1000',
  zoomOk(wide),
  JSON.stringify({ zooms: wide.zooms, stage: wide.stage })
);
check(
  'battle camera frames the layout space at 1600x1000',
  framedOk(wide),
  JSON.stringify({ frames: wide.frames, stage: wide.stage })
);
await shot('26-battle-1600x1000');

const tight = await resizeTo(520, 430);
const battleTight = await battleGeo();
check(
  'battle panels and sprites stay inside the stage at 520x430',
  battleTight.panels.every((p) => fits(p, tight.stage)) &&
    battleTight.homes.every((p) => p.x > 0 && p.x < tight.stage.w && p.y > 0 && p.y < tight.stage.h),
  JSON.stringify({ panels: battleTight.panels, homes: battleTight.homes, stage: tight.stage })
);
const barOnStage = (b, stage) =>
  b.seq > 0 && b.bar.length === b.seq && b.bar.every((c) => c.art && c.x > 0 && c.x < stage.w);
check(
  'turn bar is rebuilt, still full and still on the stage after both resizes',
  barOnStage(battleWide, wide.stage) && barOnStage(battleTight, tight.stage),
  JSON.stringify({
    wide: { stage: wide.stage.w, bar: battleWide.bar },
    tight: { stage: tight.stage.w, bar: battleTight.bar }
  })
);
await shot('27-battle-520x430');

const driven = await driveBattle('resized-battle');
check(
  'battle still finishes after all that resizing',
  driven.ok,
  JSON.stringify({ reason: driven.reason, trace: driven.trace.slice(-4) })
);

/* ---------------------------------------- menu re-flows without losing state */

const menuProbe = () =>
  page.evaluate(() => {
    const o = window.game?.scene?.getScene('OverlayScene');
    const p = o?.panel;
    return {
      tab: o?.tab ?? null,
      cursor: o?.list?.index ?? -1,
      panel: p
        ? { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.skin.width), h: Math.round(p.skin.height) }
        : null,
      note: o?.note ? { x: Math.round(o.note.x), y: Math.round(o.note.y) } : null
    };
  });

await resizeTo(1280, 860);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await tap('ArrowRight');
await tap('ArrowDown');
await tap('ArrowDown');
const menuBefore = await menuProbe();
const menuStage = await stageInfo();
const shrunk = await resizeTo(700, 520);
const menuAfter = await menuProbe();
check(
  'menu tab and cursor survive a resize',
  menuAfter.tab === menuBefore.tab && menuAfter.cursor === menuBefore.cursor,
  JSON.stringify({ before: menuBefore, after: menuAfter })
);
check(
  'menu overlay draws at the stage zoom at 1280x860',
  zoomOk(menuStage),
  JSON.stringify({ zooms: menuStage.zooms, stage: menuStage.stage })
);
check(
  'menu camera frames the layout space at 1280x860',
  framedOk(menuStage),
  JSON.stringify({ frames: menuStage.frames, stage: menuStage.stage })
);
check(
  'menu overlay is drawn on the canvas at 1280x860',
  menuStage.pinned.n > 0 && menuStage.pinned.bad.length === 0,
  JSON.stringify(menuStage.pinned)
);
check(
  'menu camera frames the layout space at 700x520',
  framedOk(shrunk),
  JSON.stringify({ frames: shrunk.frames, stage: shrunk.stage })
);
check(
  'menu frame stays inside the stage at 700x520',
  fits(menuAfter.panel, shrunk.stage) && menuAfter.note.x <= shrunk.stage.w && menuAfter.note.y <= shrunk.stage.h,
  JSON.stringify({ panel: menuAfter.panel, note: menuAfter.note, stage: shrunk.stage })
);
await shot('28-menu-700x520');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

/* -------------------------------- title re-flows without losing the cursor */

/**
 * The title screen places every element from the live stage — backdrop, logo
 * lockup, menu panel and the three sub-panels. A window drag must re-place them
 * all without throwing away where the player is standing in the menu.
 *
 * A real save is written first so CONTINUE is live: the menu skips disabled
 * entries, and the slot picker is the widest panel the title has to fit.
 */
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
if ((await menuProbe()).tab) {
  // The overlay remembers the last tab, so walk forward until SAVE is up.
  for (let i = 0; i < 8 && (await menuProbe()).tab !== 'save'; i++) await tap('ArrowRight', 140);
  await tap('z', 300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
}

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3500);

const titleProbe = () =>
  page.evaluate(() => {
    const t = window.game?.scene?.getScene('TitleScene');
    const frame = (p) =>
      p
        ? { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.skin.width), h: Math.round(p.skin.height) }
        : null;
    const bg = t?.bg;
    const lock = t?.titleL;
    return {
      mode: t?.mode ?? null,
      cursor: t?.main?.index ?? -1,
      contLive: t?.main?.items?.[1]?.enabled ?? false,
      panel: frame(t?.menuPanel),
      credits: frame(t?.creditsPanel),
      settings: frame(t?.settings?.panel),
      lockup: lock
        ? {
            x: Math.round(lock.x - (lock.metrics.w * lock.scaleX) / 2),
            y: Math.round(lock.y),
            w: Math.round(lock.metrics.w * lock.scaleX),
            h: Math.round(lock.metrics.h * lock.scaleY)
          }
        : null,
      backdrop: bg
        ? {
            x: Math.round(bg.x),
            y: Math.round(bg.y),
            w: Math.round(bg.width * bg.scaleX),
            h: Math.round(bg.height * bg.scaleY)
          }
        : null
    };
  });

const coversStage = (b, s) =>
  !!b && !!s && b.x <= 0 && b.y <= 0 && b.x + b.w >= s.w - 1 && b.y + b.h >= s.h - 1;

for (const vp of [{ w: 1920, h: 1080 }, { w: 960, h: 600 }, { w: 640, h: 360 }, { w: 480, h: 420 }]) {
  const info = await resizeTo(vp.w, vp.h);
  const t = await titleProbe();
  const tag = `${vp.w}x${vp.h}`;
  check(
    `title menu panel stays inside the stage at ${tag}`,
    fits(t.panel, info.stage) && fits(t.lockup, info.stage),
    JSON.stringify({ panel: t.panel, lockup: t.lockup, stage: info.stage })
  );
  check(
    `title backdrop covers the view at ${tag}`,
    coversStage(t.backdrop, info.stage),
    JSON.stringify({ backdrop: t.backdrop, stage: info.stage })
  );
  if (vp.w === 1920 || vp.w === 480) await shot(`29-title-${tag}`);
}

const small = await resizeTo(520, 430);
await tap('ArrowDown');
const parkedAt = (await titleProbe()).cursor;
await tap('Enter');
await page.waitForTimeout(500);
const slots = await titleProbe();
check(
  'title slot picker opens and fits the stage at 520x430',
  slots.mode === 'slots' && fits(slots.panel, small.stage),
  JSON.stringify({ mode: slots.mode, contLive: slots.contLive, panel: slots.panel, stage: small.stage })
);
await shot('29-title-slots-520x430');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const back = await titleProbe();
check(
  'title menu keeps its cursor through the slot picker and a resize',
  back.mode === 'main' && back.cursor === parkedAt && fits(back.panel, small.stage),
  JSON.stringify({ mode: back.mode, cursor: back.cursor, parkedAt, panel: back.panel })
);

await tap('ArrowDown');
await tap('Enter');
await page.waitForTimeout(500);
const settings = await titleProbe();
check(
  'title settings panel fits the stage at 520x430',
  settings.mode === 'settings' && fits(settings.settings, small.stage),
  JSON.stringify({ mode: settings.mode, panel: settings.settings, stage: small.stage })
);
await shot('29-title-settings-520x430');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await tap('ArrowDown');
await tap('Enter');
await page.waitForTimeout(500);
const credits = await titleProbe();
check(
  'title credits panel fits the stage at 520x430',
  credits.mode === 'credits' && fits(credits.credits, small.stage),
  JSON.stringify({ mode: credits.mode, panel: credits.credits, stage: small.stage })
);
await shot('29-title-credits-520x430');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

const bootError = await page.evaluate(() => {
  const el = document.getElementById('boot-error');
  return el && el.style.display === 'flex' ? el.textContent : null;
});
if (bootError) problems.push(`boot-error: ${bootError}`);

await browser.close();

if (problems.length) {
  console.log('\nPROBLEMS:');
  console.log(problems.join('\n'));
}
if (failures.length) {
  console.log('\nFAILED CHECKS:');
  console.log(failures.join('\n'));
}
if (problems.length || failures.length) process.exit(1);
console.log(`\nno console errors, ${failures.length === 0 ? 'all battle-exit checks passed' : 'checks failed'}`);
