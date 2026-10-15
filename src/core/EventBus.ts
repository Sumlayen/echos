/**
 * A tiny typed event bus. Scenes talk to systems (audio, UI, save) through it
 * instead of importing each other, which keeps the scene graph acyclic.
 */

export type Handler<T = unknown> = (payload: T) => void;

import type { StageSize } from './Stage';

export class EventBus<M extends object = Record<string, unknown>> {
  private map = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    const set = this.map.get(type) ?? new Set<Handler<never>>();
    set.add(fn as Handler<never>);
    this.map.set(type, set);
    return () => this.off(type, fn);
  }

  once<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void {
    this.map.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as Handler<M[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Events the whole game listens for. */
export interface GameEvents {
  'state:changed': undefined;
  'gil:changed': number;
  'item:changed': undefined;
  'flag:changed': string;
  'quest:progress': { id: string; stage: number };
  'dialogue:start': { id: string };
  'dialogue:end': undefined;
  'encounter': { foes: string[]; story?: string };
  'battle:end': { outcome: string };
  'scene:transition': { to: string };
  'audio:setting': undefined;
  'save:written': number;
  'game:over': undefined;
  'game:ending': undefined;
  'overlay:close': { tab: string };
  'party:changed': undefined;
  'stage:resize': StageSize;
}

export const bus = new EventBus<GameEvents>();