/**
 * Transient session state shared between scenes. Phaser's scene data is fine
 * for one-shot handoffs, but the overlay menu runs in parallel with the world
 * and needs somewhere to leave a request for the next frame.
 */

export interface BattleRequest {
  /** Enemy ids, front-to-back. */
  foes: string[];
  /** Backdrop texture key (`arena_forest`, `arena_ruins`, ...). */
  backdrop: string;
  /** Set when this is a scripted fight. */
  storyId?: string;
  flee: boolean;
  rewardMult?: number;
  intro?: string;
  seed?: number;
}

export interface ShopRequest {
  /** Stock key from `SHOP_STOCK`; empty for a pure sell counter. */
  stock: string;
  sell: boolean;
  label: string;
}

export interface WarpRequest {
  to: string;
  x: number;
  y: number;
  dir?: 'up' | 'down' | 'left' | 'right';
}

interface Session {
  battle: BattleRequest | null;
  /** Story beat id handed to `StoryScene`. */
  story: string | null;
  /** Where `StoryScene` resumes a beat: its intro lines, or the aftermath. */
  storyPhase: 'lines' | 'after';
  shop: ShopRequest | null;
  /** Overlay tab requested when the menu opens (party/items/map...). */
  tab: string | null;
  /** Where the battle overlay should return to. */
  returnTo: string;
  warp: WarpRequest | null;
  /** Set after a story beat that should end the game. */
  ending: boolean;
  /** True once the player has confirmed the title screen. */
  audioUnlocked: boolean;
}

export const session: Session = {
  battle: null,
  story: null,
  storyPhase: 'lines',
  shop: null,
  tab: null,
  returnTo: 'WorldScene',
  warp: null,
  ending: false,
  audioUnlocked: false
};

export function clearRequests(): void {
  session.battle = null;
  session.story = null;
  session.shop = null;
  session.tab = null;
  session.warp = null;
}
