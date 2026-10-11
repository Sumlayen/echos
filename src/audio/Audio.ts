/**
 * Procedural audio: every sound is synthesised at runtime with the WebAudio
 * API, so the game ships with zero audio assets. Importing it outside a browser
 * (tests, node) is safe - everything degrades to a no-op.
 */

import { getSettings } from '../core/Settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const g = globalThis as unknown as { AudioContext?: new () => AudioContext };
  const Ctor = g.AudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    applyVolumes();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers require a user gesture before audio may start. */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state === 'suspended') void c.resume();
}

export function applyVolumes(): void {
  const s = getSettings();
  if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, s.music)) * 0.5;
  if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, s.sfx)) * 0.6;
}

/* ------------------------------------------------------------------ tones */

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  to?: number;
  dur?: number;
  gain?: number;
  delay?: number;
  sweep?: 'exp' | 'lin';
  destination?: GainNode;
}

function tone(o: ToneOptions): void {
  const c = audioContext();
  if (!c) return;
  const dest = o.destination ?? sfxGain;
  if (!dest) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.12;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
  if (o.to && o.to !== o.freq) {
    if (o.sweep === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  }
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.18, gain = 0.25, delay = 0, hp = 400, dest?: GainNode): void {
  const c = audioContext();
  const out = dest ?? sfxGain;
  if (!c || !out) return;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(out);
  src.start(t0);
}

/* -------------------------------------------------------------------- sfx */

export type SfxName =
  | 'cursor' | 'confirm' | 'cancel' | 'blip' | 'pause'
  | 'hit' | 'crit' | 'miss' | 'guard' | 'magic' | 'heal' | 'buff' | 'debuff'
  | 'death' | 'level' | 'chest' | 'door' | 'save' | 'encounter' | 'victory'
  | 'defeat' | 'step' | 'push' | 'key' | 'warp' | 'error';

export function sfx(name: SfxName): void {
  if (!audioContext()) return;
  switch (name) {
    case 'cursor': tone({ freq: 660, to: 760, dur: 0.05, gain: 0.16 }); break;
    case 'confirm': tone({ freq: 620, to: 980, dur: 0.11, gain: 0.24 }); break;
    case 'cancel': tone({ freq: 460, to: 300, dur: 0.1, gain: 0.2 }); break;
    case 'blip': tone({ freq: 880, dur: 0.035, gain: 0.13 }); break;
    case 'pause': tone({ type: 'triangle', freq: 520, to: 780, dur: 0.09, gain: 0.2 }); break;
    case 'hit': noise(0.14, 0.3, 0, 700); tone({ freq: 220, to: 90, dur: 0.12, gain: 0.26 }); break;
    case 'crit': noise(0.2, 0.36, 0, 500); tone({ type: 'sawtooth', freq: 320, to: 70, dur: 0.2, gain: 0.3 }); break;
    case 'miss': tone({ type: 'sine', freq: 300, to: 180, dur: 0.09, gain: 0.14 }); break;
    case 'guard': tone({ type: 'triangle', freq: 300, to: 420, dur: 0.1, gain: 0.22 }); break;
    case 'magic':
      tone({ type: 'sine', freq: 420, to: 1400, dur: 0.26, gain: 0.24 });
      tone({ type: 'triangle', freq: 620, to: 1800, dur: 0.22, gain: 0.12, delay: 0.05 });
      break;
    case 'heal':
      tone({ type: 'sine', freq: 660, dur: 0.12, gain: 0.2 });
      tone({ type: 'sine', freq: 880, dur: 0.12, gain: 0.18, delay: 0.08 });
      tone({ type: 'sine', freq: 1170, dur: 0.16, gain: 0.16, delay: 0.16 });
      break;
    case 'buff': tone({ type: 'triangle', freq: 440, to: 880, dur: 0.22, gain: 0.22 }); break;
    case 'debuff': tone({ type: 'sawtooth', freq: 520, to: 180, dur: 0.26, gain: 0.2 }); break;
    case 'death': tone({ type: 'sawtooth', freq: 320, to: 60, dur: 0.42, gain: 0.26 }); noise(0.3, 0.16, 0.05, 300); break;
    case 'level': [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.14, gain: 0.2, delay: i * 0.09 })); break;
    case 'chest': [784, 988, 1318].forEach((f, i) => tone({ freq: f, dur: 0.1, gain: 0.2, delay: i * 0.07 })); break;
    case 'key':
      tone({ freq: 1046, dur: 0.09, gain: 0.2 });
      tone({ freq: 1318, dur: 0.12, gain: 0.18, delay: 0.07 });
      break;
    case 'door': tone({ type: 'triangle', freq: 240, to: 120, dur: 0.22, gain: 0.24 }); break;
    case 'warp': tone({ type: 'sine', freq: 220, to: 1320, dur: 0.5, gain: 0.2 }); break;
    case 'save': [659, 784, 988].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.12, gain: 0.2, delay: i * 0.08 })); break;
    case 'encounter': [196, 196, 392, 784].forEach((f, i) => tone({ type: 'sawtooth', freq: f, dur: 0.16, gain: 0.24, delay: i * 0.11 })); break;
    case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.2, gain: 0.22, delay: i * 0.13 })); break;
    case 'defeat': [392, 349, 294, 196].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.34, gain: 0.24, delay: i * 0.24 })); break;
    case 'step': noise(0.04, 0.06, 0, 1200); break;
    case 'push': tone({ freq: 140, to: 90, dur: 0.09, gain: 0.18 }); break;
    case 'error': tone({ freq: 200, to: 150, dur: 0.16, gain: 0.22 }); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ music */

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11
};

export function noteFreq(name: string): number {
  if (!name || name === '-') return 0;
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const semis = NOTE_SEMITONES[m[1]] ?? 0;
  const octave = Number(m[2]);
  const midi = (octave + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface Theme {
  id: string;
  bpm: number;
  /** One entry per bar; each bar is a 16-step grid of note names or `-`. */
  bass: string[][];
  lead: string[][];
  wave?: OscillatorType;
}

const bar = (s: string): string[] => s.split(' ');

export const THEMES: Record<string, Theme> = {
  title: {
    id: 'title', bpm: 78, wave: 'triangle',
    bass: [bar('A2 - A2 - F2 - F2 -'), bar('C3 - C3 - G2 - G2 -'), bar('F2 - F2 - A2 - A2 -'), bar('E2 - E2 - A2 - - -')],
    lead: [bar('A4 - C5 - E5 - C5 -'), bar('F4 - A4 - C5 - A4 -'), bar('A4 - C5 - F5 - E5 -'), bar('D5 - C5 - A4 - - -')]
  },
  village: {
    id: 'village', bpm: 104, wave: 'triangle',
    bass: [bar('C3 - G2 - C3 - G2 -'), bar('F2 - C3 - F2 - C3 -'), bar('A2 - E3 - A2 - E3 -'), bar('G2 - D3 - G2 - D3 -')],
    lead: [bar('E4 G4 A4 - G4 E4 - -'), bar('F4 A4 C5 - A4 F4 - -'), bar('A4 C5 E5 - C5 A4 - -'), bar('B4 D5 G5 - D5 B4 - -')]
  },
  forest: {
    id: 'forest', bpm: 92, wave: 'sine',
    bass: [bar('D3 - - D3 - - A2 -'), bar('B2 - - B2 - - F#2 -'), bar('G2 - - G2 - - D3 -'), bar('A2 - - A2 - - E3 -')],
    lead: [bar('D4 F4 A4 - - - - -'), bar('B3 D4 F#4 - - - - -'), bar('G3 B3 D4 - E4 - - -'), bar('A3 C#4 E4 - A4 - - -')]
  },
  ruins: {
    id: 'ruins', bpm: 70, wave: 'sine',
    bass: [bar('A2 - - - E2 - - -'), bar('F2 - - - C2 - - -'), bar('D2 - - - A2 - - -'), bar('E2 - - - B1 - - -')],
    lead: [bar('A4 - - - - - - -'), bar('C5 - - - A4 - - -'), bar('F4 - - - - - - -'), bar('G#4 - - - E4 - - -')]
  },
  battle: {
    id: 'battle', bpm: 148, wave: 'square',
    bass: [bar('D3 D3 A2 A2 D3 D3 A2 A2'), bar('C3 C3 G2 G2 C3 C3 G2 G2'), bar('A2 A2 E2 E2 A2 A2 E2 E2'), bar('B2 B2 F#2 F#2 B2 B2 F#2 F#2')],
    lead: [bar('D5 - A4 D5 F5 - D5 -'), bar('C5 - G4 C5 E5 - C5 -'), bar('A4 - E4 A4 C5 - A4 -'), bar('B4 - F#4 B4 D5 - F5 -')]
  },
  boss: {
    id: 'boss', bpm: 160, wave: 'sawtooth',
    bass: [bar('E2 E2 E2 B1 E2 E2 B1 B1'), bar('F2 F2 F2 C2 F2 F2 C2 C2'), bar('G2 G2 G2 D2 G2 G2 D2 D2'), bar('B1 B1 B1 F#2 B1 B1 C2 C2')],
    lead: [bar('E5 - B4 - G4 - B4 -'), bar('F5 - C5 - A4 - C5 -'), bar('G5 - D5 - B4 - D5 -'), bar('B5 - A5 - G5 - F5 -')]
  },
  ending: {
    id: 'ending', bpm: 66, wave: 'triangle',
    bass: [bar('C3 - - - G2 - - -'), bar('A2 - - - E2 - - -'), bar('F3 - - - C3 - - -'), bar('G2 - - - G2 - - -')],
    lead: [bar('E5 - - - D5 - - -'), bar('C5 - - - E5 - - -'), bar('F5 - - - E5 - - -'), bar('D5 - - - C5 - - -')]
  }
};

interface Player {
  theme: Theme;
  step: number;
  timer: number;
}

let player: Player | null = null;
let currentThemeId = '';

function stepDur(theme: Theme): number {
  return 60 / theme.bpm / 4; // 16th notes
}

function scheduleStep(p: Player): void {
  if (!audioContext()) return;
  const theme = p.theme;
  const bars = Math.max(1, theme.bass.length);
  const barIndex = Math.floor(p.step / 16) % bars;
  const inBar = p.step % 16;
  const dur = stepDur(theme);
  const bassNote = theme.bass[barIndex]?.[inBar] ?? '-';
  const leadNote = theme.lead[barIndex]?.[inBar] ?? '-';

  if (bassNote !== '-') {
    const f = noteFreq(bassNote);
    if (f) tone({ type: 'triangle', freq: f, dur: dur * 1.7, gain: 0.2, destination: musicGain ?? undefined });
  }
  if (leadNote !== '-') {
    const f = noteFreq(leadNote);
    if (f) tone({ type: theme.wave ?? 'square', freq: f, dur: dur * 1.5, gain: 0.13, destination: musicGain ?? undefined });
  }
  if (inBar % 4 === 0) noise(dur * 0.6, 0.03, 0, 3000, musicGain ?? undefined);
}

export function playTheme(id: string): void {
  const theme = THEMES[id];
  if (!theme) return;
  if (currentThemeId === id && player) return;
  stopTheme();
  currentThemeId = id;
  if (!audioContext() || typeof window === 'undefined') return;
  player = { theme, step: 0, timer: 0 };
  player.timer = window.setInterval(() => {
    if (!player) return;
    scheduleStep(player);
    player.step += 1;
  }, stepDur(theme) * 1000);
  scheduleStep(player);
}

export function stopTheme(): void {
  if (player && typeof window !== 'undefined') window.clearInterval(player.timer);
  player = null;
  currentThemeId = '';
}

export function currentTheme(): string {
  return currentThemeId;
}

/** Brief dip in volume, used when a battle starts or a cutscene speaks. */
export function duckTheme(millis = 400): void {
  const c = audioContext();
  if (!c || !musicGain) return;
  const now = c.currentTime;
  const target = getSettings().music * 0.5;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(0.02, now + millis / 1000);
  musicGain.gain.linearRampToValueAtTime(target, now + millis / 1000 + 0.6);
}