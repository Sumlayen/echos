/**
 * Keyboard input as a per-frame queue of semantic actions. Scenes drain the
 * queue in `update()`, which keeps menu logic declarative and makes gamepads
 * or remapping a drop-in change later.
 */

import Phaser from 'phaser';

export type KeyName =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'CONFIRM'
  | 'CANCEL'
  | 'MENU'
  | 'SPECIAL';

const CODES: Record<number, KeyName> = {
  [Phaser.Input.Keyboard.KeyCodes.UP]: 'UP',
  [Phaser.Input.Keyboard.KeyCodes.W]: 'UP',
  [Phaser.Input.Keyboard.KeyCodes.DOWN]: 'DOWN',
  [Phaser.Input.Keyboard.KeyCodes.S]: 'DOWN',
  [Phaser.Input.Keyboard.KeyCodes.LEFT]: 'LEFT',
  [Phaser.Input.Keyboard.KeyCodes.A]: 'LEFT',
  [Phaser.Input.Keyboard.KeyCodes.RIGHT]: 'RIGHT',
  [Phaser.Input.Keyboard.KeyCodes.D]: 'RIGHT',
  [Phaser.Input.Keyboard.KeyCodes.Z]: 'CONFIRM',
  [Phaser.Input.Keyboard.KeyCodes.ENTER]: 'CONFIRM',
  [Phaser.Input.Keyboard.KeyCodes.SPACE]: 'CONFIRM',
  [Phaser.Input.Keyboard.KeyCodes.X]: 'CANCEL',
  [Phaser.Input.Keyboard.KeyCodes.BACKSPACE]: 'CANCEL',
  [Phaser.Input.Keyboard.KeyCodes.ESC]: 'MENU',
  [Phaser.Input.Keyboard.KeyCodes.Q]: 'SPECIAL',
  [Phaser.Input.Keyboard.KeyCodes.SHIFT]: 'SPECIAL'
};

const CAPTURE = Object.keys(CODES).map((n) => Number(n));

export class KeyPad {
  private queue: KeyName[] = [];
  private anyKey: (() => void) | null = null;
  private handler = (e: KeyboardEvent): void => {
    const name = CODES[e.keyCode];
    if (name) this.queue.push(name);
    this.anyKey?.();
  };

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture(CAPTURE);
    kb.on('keydown', this.handler);
  }

  /** Fires on the first key of any kind (used to unlock the audio context). */
  onAnyKey(fn: () => void): void {
    this.anyKey = fn;
  }

  /** Pops the next queued action, or null. */
  next(): KeyName | null {
    return this.queue.shift() ?? null;
  }

  peek(): KeyName | null {
    return this.queue[0] ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.handler);
    this.queue = [];
  }
}
