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
