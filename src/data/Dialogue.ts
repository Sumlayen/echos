/**
 * Dialogue trees. Lines are plain data and conditions are small declarative
 * objects, so the same file can be re-read and re-balanced without touching the
 * runtime. Each id holds a list of variants — the first whose `when` passes is
 * used, which is how a villager's lines change as quests progress.
 */

import type { GameState } from '../core/GameState';

export type Cond =
  | { flag: string; equals?: boolean | number | string; min?: number }
  | { quest: string; stage?: number; done?: boolean }
  | { item?: string; char?: string; level?: number }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] };

export function condMet(c: Cond | undefined, s: GameState): boolean {
  if (!c) return true;
  if ('not' in c) return !condMet(c.not, s);
  if ('all' in c) return c.all.every((x) => condMet(x, s));
  if ('any' in c) return c.any.some((x) => condMet(x, s));
  if ('flag' in c) {
    if (c.min !== undefined) return s.num(c.flag) >= c.min;
    if (c.equals === undefined) return s.bool(c.flag);
    return s.flag(c.flag) === c.equals;
  }
  if ('quest' in c) {
    const q = s.quest(c.quest);
    if (!q) return false;
    if (c.done !== undefined && q.done !== c.done) return false;
    if (c.stage !== undefined && q.stage < c.stage) return false;
    return true;
  }
  if (c.item && s.itemCount(c.item) <= 0) return false;
  if (c.char && !s.member(c.char)) return false;
  if (c.level) {
    const lead = s.active.reduce((a, m) => Math.max(a, m.level), 1);
    if (lead < c.level) return false;
  }
  return true;
}

export interface DialogueEffect {
  setFlag?: [string, boolean | number | string];
  addFlag?: [string, number];
  give?: [string, number];
  take?: [string, number];
  gold?: number;
  recruit?: string;
  quest?: { id: string; stage?: number; done?: boolean };
  /** Opens the shop overlay with this stock key (`SHOP_STOCK`). */
  shop?: string;
  /** Rest at the inn for this price. */
  inn?: number;
  warp?: { to: string; x: number; y: number };
  battle?: string;
}

export interface DialogueChoice {
  label: string;
  /** Jump to this line index in the same variant. */
  goto?: number;
  effect?: DialogueEffect;
}

export interface DialogueLine {
  speaker?: string;
  text: string;
  /** Fired when this line finishes displaying. */
  effect?: DialogueEffect;
  /** Replaces the "continue" prompt with a choice list. */
  choices?: DialogueChoice[];
}

export interface DialogueVariant {
  id: string;
  when?: Cond;
  lines: DialogueLine[];
}

const v = (d: DialogueVariant): DialogueVariant => d;

export const DIALOGUE: Record<string, DialogueVariant[]> = {
  elder: [
    v({
      id: 'elder.final',
      when: { quest: 'q_warden', done: true },
      lines: [{ speaker: 'Aldous', text: 'The wood is quiet again. Sit, eat, and stay a while.' }]
    }),
    v({
      id: 'elder.gate',
      when: { quest: 'q_warden', stage: 2 },
      lines: [
        { speaker: 'Aldous', text: 'You found the shard key. The ruins will open, but what sleeps inside will know you came.' },
        { speaker: 'Aldous', text: 'Take the road south. I will keep a lantern lit here until you return.' }
      ]
    }),
    v({
      id: 'elder.main',
      lines: [
        { speaker: 'Aldous', text: 'Kael. You woke the night the star fell. That is no coincidence, though I wish it were.' },
        { speaker: 'Aldous', text: 'The wood has gone mad since. Wolves come down to the fences at noon. Cull a few and we will speak properly.' },
        {
          speaker: 'Aldous',
          text: 'Lyra is at the well, sharpening what she calls research. Bring her.',
          effect: { quest: { id: 'q_wolves', stage: 1 }, recruit: 'lyra' }
        }
      ]
    })
  ],

  guard: [
    v({
      id: 'guard.post',
      when: { quest: 'q_wolves', done: true },
      lines: [{ speaker: 'Serra', text: 'Fences hold again. Mostly. Watch the treeline at dusk anyway.' }]
    }),
    v({
      id: 'guard.pre',
      lines: [
        { speaker: 'Serra', text: 'Two more fences torn out overnight. Whatever does it walks on two legs some nights.' },
        { speaker: 'Serra', text: 'Raise your shield the turn before you strike. Guarding halves what lands on you.' }
      ]
    })
  ],

  child: [
    v({
      id: 'child.lore',
      when: { flag: 'story.first_wraith' },
      lines: [
        { speaker: 'Pim', text: 'I saw the bright man in the trees! He had no feet. No feet at all!' },
        { speaker: 'Pim', text: 'He said the word "warden" like it was a door.' }
      ]
    }),
    v({
      id: 'child.default',
      lines: [{ speaker: 'Pim', text: 'Are you the one the star chose? You look tired. My mum says tired people make the best heroes.' }]
    })
  ],

  villager: [
    v({
      id: 'villager.warn',
      when: { quest: 'q_wolves', stage: 1 },
      lines: [{ speaker: 'Bren', text: 'Wolves in the wood, wraiths in the ruins. Pick a nightmare and go.' }]
    }),
    v({
      id: 'villager.default',
      lines: [{ speaker: 'Bren', text: 'Inn is north-west, store north-east. Sleep off the bruises; coin buys more than bread.' }]
    })
  ],

  wanderer: [
    v({
      id: 'wander.join',
      when: { quest: 'q_wolves', done: true },
      lines: [
        { speaker: 'Rowan', text: 'You cleared the treeline. I have been paid in salt and lies all season; a real wage interests me.' },
        {
          speaker: 'Rowan',
          text: 'I know the wood, and I know how to run. Both are useful. I am coming with you.',
          effect: { recruit: 'rowan', quest: { id: 'q_warden', stage: 1 } }
        }
      ]
    }),
    v({
      id: 'wander.default',
      lines: [{ speaker: 'Rowan', text: 'Scout, mostly. I run ahead, I lie about the distance, and I charge for it.' }]
    })
  ],

  hermit: [
    v({
      id: 'hermit.done',
      when: { quest: 'q_lantern', done: true },
      lines: [{ speaker: 'Ysolde', text: 'The torch keeps the cold off the stones. Go south, and do not touch the crystals.' }]
    }),
    v({
      id: 'hermit.ask',
      when: { quest: 'q_lantern', stage: 1 },
      lines: [{ speaker: 'Ysolde', text: 'A pitch torch. The ruins drink light, and I am too old to carry one.' }]
    }),
    v({
      id: 'hermit.offer',
      lines: [
        { speaker: 'Ysolde', text: 'You smell of the fall. Good. South of the road, the ruins keep a thing that used to keep the world.' },
        {
          speaker: 'Ysolde',
          text: 'Bring me a pitch torch from the store and I will tell you how to open the gate.',
          effect: { quest: { id: 'q_lantern', stage: 1 } }
        }
      ]
    })
  ],

  pedlar: [
    v({
      id: 'pedlar.trade',
      lines: [
        { speaker: 'Marrow', text: 'Road goods, road prices.' },
        {
          speaker: 'Marrow',
          text: 'Buy, sell, or walk on.',
          choices: [
            { label: 'Buy', goto: 2 },
            { label: 'Sell', goto: 3 },
            { label: 'Walk on' }
          ]
        },
        { speaker: 'Marrow', text: 'Coin first, questions later.', effect: { shop: 'road' } },
        { speaker: 'Marrow', text: 'Empty those pockets.', effect: { shop: 'sell' } }
      ]
    })
  ],

  innkeep: [
    v({
      id: 'inn.rest',
      lines: [
        { speaker: 'Hesper', text: 'Beds are warm, water is not. Twelve coin for the night.' },
        {
          speaker: 'Hesper',
          text: 'Sleep?',
          choices: [
            { label: 'Sleep (12 coin)', goto: 2, effect: { inn: 12 } },
            { label: 'Not now' }
          ]
        },
        { speaker: 'Hesper', text: 'Wake when you are ready. That is the whole trick of it.' }
      ]
    })
  ],

  shopkeep: [
    v({
      id: 'shop.stock',
      when: { quest: 'q_warden', stage: 2 },
      lines: [
        { speaker: 'Odin', text: 'Star steel came in. It cost me a fortune and it will cost you more.' },
        { speaker: 'Odin', text: 'Look, touch, pay.', effect: { shop: 'ruins' } }
      ]
    }),
    v({
      id: 'shop.default',
      lines: [
        { speaker: 'Odin', text: 'Salves, steel, and one staff I cannot explain.' },
        {
          speaker: 'Odin',
          text: 'Buy or sell?',
          choices: [
            { label: 'Buy', goto: 2 },
            { label: 'Sell', goto: 3 },
            { label: 'Just looking' }
          ]
        },
        { speaker: 'Odin', text: 'Take what you can carry.', effect: { shop: 'village' } },
        { speaker: 'Odin', text: 'I buy at half price. That is called a business.', effect: { shop: 'sell' } }
      ]
    })
  ],

  sage: [
    v({
      id: 'sage.key',
      when: { quest: 'q_lantern', done: true },
      lines: [
        { speaker: 'Vaun', text: 'The gate wants a shard, not a key. The wraith in the wood carries one.' },
        { speaker: 'Vaun', text: 'Take it, and try not to become part of the legend.' }
      ]
    }),
    v({
      id: 'sage.lore',
      lines: [
        { speaker: 'Vaun', text: 'The Fallen Star was a ward, not a gift. When it broke, the thing it held broke too.' },
        { speaker: 'Vaun', text: 'Fire burns the wraiths. Ice slows the sentinels. Write that down somewhere.' }
      ]
    })
  ]
};

/** Picks the variant that currently applies. */
export function dialogueFor(id: string, s: GameState): DialogueVariant | null {
  const list = DIALOGUE[id];
  if (!list) return null;
  for (const variant of list) if (condMet(variant.when, s)) return variant;
  return list[list.length - 1] ?? null;
}