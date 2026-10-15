/**
 * Quest definitions. A quest is a list of stages; the engine only ever stores
 * `{ stage, done }`, so the text here is presentation-only and can be reworded
 * freely without breaking saves.
 */

export interface QuestStage {
  stage: number;
  text: string;
}

export interface QuestDef {
  id: string;
  name: string;
  summary: string;
  stages: QuestStage[];
  reward?: { gil?: number; xp?: number; items?: [string, number][] };
}

const q = (d: QuestDef): QuestDef => d;

export const QUESTS: Record<string, QuestDef> = {
  q_wolves: q({
    id: 'q_wolves',
    name: 'The Fence Line',
    summary: 'Havenport keeps losing livestock to the wood.',
    stages: [
      { stage: 0, text: 'Speak with Aldous, who has been watching the treeline.' },
      { stage: 1, text: 'Cull four ashen wolves in the Ashen Wood.' },
      { stage: 2, text: 'Report back to Aldous in the plaza.' }
    ],
    reward: { gil: 60, items: [['potion_l', 2]] }
  }),

  q_lantern: q({
    id: 'q_lantern',
    name: 'Light for the Gate',
    summary: 'The hermit in the wood knows how the ruins open.',
    stages: [
      { stage: 0, text: 'A hermit waits by the shrine east of the wood.' },
      { stage: 1, text: 'Bring Ysolde a pitch torch (the store sells them).' },
      { stage: 2, text: 'The gate needs a shard. The wraith in the wood carries one.' }
    ],
    reward: { items: [['torch', 1], ['ether', 1]] }
  }),

  q_warden: q({
    id: 'q_warden',
    name: 'The Thing That Kept the World',
    summary: 'Whatever the fallen star was holding back is awake.',
    stages: [
      { stage: 0, text: 'Find out what woke when the star fell.' },
      { stage: 1, text: 'Travel the Ash Road south of Havenport.' },
      { stage: 2, text: 'Take the shard key from the wraith and open the gate.' },
      { stage: 3, text: 'End what waits in the Sunken Ruins.' }
    ],
    reward: { gil: 400, items: [['amulet_star', 1]] }
  })
};

export function questDef(id: string): QuestDef | undefined {
  return QUESTS[id];
}

/** The current objective text for a quest at a stage. */
export function questText(id: string, stage: number): string {
  const def = QUESTS[id];
  if (!def) return '';
  const found = def.stages.find((s) => s.stage === stage);
  return found ? found.text : def.stages[def.stages.length - 1]?.text ?? '';
}

/** Objective text for every quest the player is currently carrying. */
export function activeObjectives(s: {
  activeQuests(): { id: string; stage: number }[];
}): { id: string; name: string; text: string }[] {
  return s.activeQuests().map((qs) => ({
    id: qs.id,
    name: QUESTS[qs.id]?.name ?? qs.id,
    text: questText(qs.id, qs.stage)
  }));
}