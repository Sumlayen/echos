/**
 * The Phaser Game subclass. It owns the single `GameState` instance so any
 * scene can reach it through `gs(this)` without scene-to-scene plumbing.
 */

import Phaser from 'phaser';
import { GameState } from './GameState';

export class GameApp extends Phaser.Game {
  state = new GameState();

  /** Fresh playthrough: the opening party and starting gear. */
  startNew(party: string[] = ['kael']): void {
    this.state.startNew(party);
  }
}

/** The game state for a scene. */
export function gs(scene: Phaser.Scene | Phaser.Game): GameState {
  const game = scene instanceof Phaser.Game ? scene : scene.game;
  return (game as GameApp).state;
}
