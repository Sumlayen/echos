/**
 * Versioned LocalStorage saves with a checksum. Corrupt or stale saves are
 * rejected rather than trusted, so a bad write never bricks a playthrough.
 */

import { SAVE_KEY, SAVE_VERSION } from '../config/constants';
import type { GameState, SavePayload } from './GameState';

export interface SaveMeta {
  slot: number;
  savedAt: number;
  version: number;
  location: string;
  party: string[];
  levels: number[];
  gold: number;
  playtime: number;
}

interface Envelope {
  c: number;
  v: number;
  d: SavePayload;
}

/** FNV-1a, cheap and good enough to spot truncated/garbled JSON. */
export function checksum(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function slotKey(slot: number, base = SAVE_KEY): string {
  return slot <= 0 ? base : `${base}.${slot}`;
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Safari private mode throws on write rather than on access.
    const probe = '__eotfs_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export class SaveManager {
  constructor(private base = SAVE_KEY) {}

  save(slot: number, state: GameState): boolean {
    const store = storage();
    if (!store) return false;
    const payload = state.serialize();
    const body = JSON.stringify(payload);
    const envelope: Envelope = { c: checksum(body), v: SAVE_VERSION, d: payload };
    try {
      store.setItem(slotKey(slot, this.base), JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  load(slot: number): SavePayload | null {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(slotKey(slot, this.base));
    if (!raw) return null;
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return null;
    }
    if (!env || typeof env.c !== 'number' || !env.d) return null;
    if (env.c !== checksum(JSON.stringify(env.d))) return null;
    if (typeof env.v === 'number' && env.v > SAVE_VERSION) return null;
    return env.d;
  }

  meta(slot: number): SaveMeta | null {
    const d = this.load(slot);
    if (!d) return null;
    return {
      slot,
      savedAt: d.savedAt,
      version: d.version,
      location: d.location,
      party: d.party.map((m) => m.name),
      levels: d.party.map((m) => m.level),
      gold: d.gold,
      playtime: d.playtime ?? 0
    };
  }

  list(): (SaveMeta | null)[] {
    const out: (SaveMeta | null)[] = [];
    for (let i = 0; i <= 3; i++) out.push(this.meta(i));
    return out;
  }

  has(slot: number): boolean {
    return this.load(slot) !== null;
  }

  clear(slot: number): void {
    storage()?.removeItem(slotKey(slot, this.base));
  }

  clearAll(): void {
    for (let i = 0; i <= 3; i++) this.clear(i);
  }

  /** Seconds -> `hh:mm:ss`, used by the save menu. */
  static formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
}

export const saves = new SaveManager();