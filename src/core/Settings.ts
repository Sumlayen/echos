/** Persistent player settings (audio levels, text speed, screen shake). */

import { SETTINGS_KEY } from '../config/constants';

export interface Settings {
  music: number;
  sfx: number;
  /** Characters per second in dialogue. */
  textSpeed: number;
  /** Battle animations run shorter when true. */
  fastBattle: boolean;
  shake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.6,
  sfx: 0.7,
  textSpeed: 42,
  fastBattle: false,
  shake: true
};

let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  cache = { ...DEFAULT_SETTINGS };
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      cache = { ...cache, ...parsed };
    }
  } catch {
    /* settings are non-critical */
  }
  return cache;
}

export function getSettings(): Settings {
  return read();
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...read(), ...patch };
  cache = next;
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function resetSettings(): Settings {
  cache = { ...DEFAULT_SETTINGS };
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  return cache;
}