/**
 * Story beats: short scripted scenes fired by map triggers. A beat can play
 * lines over a backdrop, then hand off to a fixed battle, then play the
 * aftermath. Everything is data so the pacing can be re-timed quickly.
 */

import type { DialogueEffect } from './Dialogue';

export interface StoryLine {
  speaker?: string;
  text: string;
  effect?: DialogueEffect;
}

export interface StoryBeat {
  id: string;
  /** Backdrop key from `src/art/BackdropArt.ts`. */
  backdrop?: string;
  /** Music theme to switch to for the scene. */
  theme?: string;
  lines: StoryLine[];
  /** Fixed battle started after the lines (`STORY_BATTLES`). */
  battle?: string;
  /** Fleeing is disabled for story fights unless this says otherwise. */
  flee?: boolean;
  rewardMult?: number;
  /** Effects applied when the beat begins. */
  effects?: DialogueEffect[];
  /** Lines played after the battle is won. */
  after?: StoryLine[];
  /** Effects applied after the battle is won. */
  afterEffects?: DialogueEffect[];
  /** Beat shown after this one (used for the finale). */
  next?: string;
  /** Reaches the ending once finished. */
  ending?: boolean;
}

const b = (d: StoryBeat): StoryBeat => d;

export const STORY: Record<string, StoryBeat> = {
  arrival: b({
    id: 'arrival',
    backdrop: 'story_village',
    theme: 'village',
    lines: [
      { text: 'Three nights ago, a star came down out of a clear sky.' },
      { text: 'It did not land. It stopped, hung over the Ashen Wood, and broke.' },
      { speaker: 'Aldous', text: 'You were found at the treeline, Kael. Awake, and unharmed. Nobody can explain it.' },
      { speaker: 'Aldous', text: 'Nobody can explain the wolves either. Start there. The rest will follow.' }
    ],
    effects: [{ quest: { id: 'q_wolves', stage: 0 } }, { quest: { id: 'q_warden', stage: 0 } }]
  }),

  first_wraith: b({
    id: 'first_wraith',
    backdrop: 'story_crash',
    theme: 'battle',
    lines: [
      { text: 'The trail ends in a clearing of glassed earth.' },
      { text: 'Something stands in it, wearing the light like a coat.' },
      { speaker: 'Wraith', text: 'You are the one it woke. Come then. Be the key.' }
    ],
    battle: 'first_wraith',
    flee: false,
    rewardMult: 1.5,
    after: [
      { text: 'The light goes out of it all at once, and a shard drops into the glass.' },
      { speaker: 'Lyra', text: 'That is not a weapon. That is a hinge. Something opens with it.' }
    ],
    afterEffects: [
      { give: ['star_key', 1] },
      { quest: { id: 'q_lantern', stage: 2 } },
      { quest: { id: 'q_warden', stage: 2 } }
    ]
  }),

  hermit_offer: b({
    id: 'hermit_offer',
    backdrop: 'story_crash',
    theme: 'forest',
    lines: [
      { text: 'By the broken shrine, a woman sits with her back to you, counting stones.' },
      { speaker: 'Ysolde', text: 'Do not speak. I am at nine hundred and something, and you have ruined it.' },
      { speaker: 'Ysolde', text: '...Come back when you have something useful in your pack.' }
    ]
  }),

  ruins_gate: b({
    id: 'ruins_gate',
    backdrop: 'story_gate',
    theme: 'ruins',
    lines: [
      { text: 'The gate is a single slab of black stone with a hinge-shaped hollow in it.' },
      { speaker: 'Rowan', text: 'One shard, one door. I vote we do not knock.' },
      { text: 'The shard fits. The stone goes inward without a sound.' }
    ],
    effects: [{ take: ['star_key', 1] }, { setFlag: ['ruins.open', true] }]
  }),

  boss_warden: b({
    id: 'boss_warden',
    backdrop: 'story_gate',
    theme: 'boss',
    lines: [
      { text: 'The chamber past the gate is a cage, and the cage has been open for three nights.' },
      { speaker: 'The Warden', text: 'I was set here to hold the dark. The star was my leash.' },
      { speaker: 'The Warden', text: 'You have my leash. Then you will hold it, or you will wear it.' }
    ],
    battle: 'boss_warden',
    flee: false,
    rewardMult: 2,
    after: [
      { text: 'It kneels, and stays kneeling, and does not get up.' },
      { text: 'The light over the wood goes out. The night is only a night again.' }
    ],
    afterEffects: [
      { quest: { id: 'q_warden', stage: 3, done: true } },
      { setFlag: ['world.saved', true] }
    ],
    next: 'ending'
  }),

  ending: b({
    id: 'ending',
    backdrop: 'story_village',
    theme: 'ending',
    lines: [
      { speaker: 'Aldous', text: 'The fences held. So did you.' },
      { speaker: 'Lyra', text: 'We could stay. The wood is only a wood now, and that is a kind of miracle.' },
      { speaker: 'Rowan', text: 'Somebody has to walk the road anyway. Somebody always does.' },
      { text: 'ECHOES OF THE FALLEN STAR' }
    ],
    ending: true
  })
};

export function storyBeat(id: string): StoryBeat | undefined {
  return STORY[id];
}