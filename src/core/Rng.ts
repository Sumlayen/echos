/**
 * Deterministic RNG. Everything random in the game — encounter rolls, damage
 * variance, enemy AI, loot — flows through one of these so battles and runs can
 * be replayed in tests with a fixed seed.
 */

export type RngSeed = number;

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next01: () => number;

  constructor(public seed: RngSeed = Date.now() >>> 0) {
    this.next01 = mulberry32(seed);
  }

  /** Re-seed in place (used by tests and by per-battle sub-streams). */
  reseed(seed: RngSeed): void {
    this.seed = seed;
    this.next01 = mulberry32(seed);
  }

  float(): number {
    return this.next01();
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next01() * (max - min + 1));
  }

  /** True with probability p (p in [0,1]). */
  chance(p: number): boolean {
    return this.next01() < p;
  }

  /** Symmetric variance multiplier around 1, e.g. variance 0.12 -> [0.88, 1.12]. */
  variance(v: number): number {
    return 1 - v + this.next01() * v * 2;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next01() * list.length)];
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(entries: readonly [T, number][]): T {
    const total = entries.reduce((a, e) => a + e[1], 0);
    let r = this.next01() * total;
    for (const [value, weight] of entries) {
      r -= weight;
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(list: readonly T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next01() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** Shared global stream (title ambience, cosmetic jitter). */
export const globalRng = new Rng();
