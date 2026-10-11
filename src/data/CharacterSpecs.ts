/**
 * The cast. Each entry is a palette + silhouette recipe fed to the parametric
 * humanoid renderer, so every character shares one construction language while
 * reading distinctly on screen (hair, build, weapon, cape, leg length).
 */

import { P } from '../art/Palette';
import type { HumanSpec } from '../art/HumanoidArt';

const SKIN_A = { skin: P.skin, skinShade: P.skinD };
const SKIN_B = { skin: '#c98a5c', skinShade: '#96603c' };
const SKIN_C = { skin: '#e8c39a', skinShade: '#b98f63' };

export const CHAR_SPECS: Record<string, HumanSpec> = {
  /** Protagonist — blue tunic, short dark hair, sword. */
  kael: {
    ...SKIN_A,
    hair: '#3b2a1c', hairShade: '#241a11', hairLight: '#5c4229',
    cloth: '#3f5f9c', clothShade: '#28406e', clothLight: '#6f92cc',
    trim: '#c8a13c', metal: P.stoneLt, metalDark: P.slate,
    hairStyle: 'short', build: 'mid', weapon: 'sword', cape: false
  },
  /** Mage — plum robes, long rose hair, star staff, cape. */
  lyra: {
    ...SKIN_C,
    hair: '#8d3f5e', hairShade: '#5c2740', hairLight: '#c06a86',
    cloth: '#6b4a9c', clothShade: '#463068', clothLight: '#9a7bc9',
    trim: '#d8b45a', metal: P.stoneLt, metalDark: P.slate,
    hairStyle: 'long', build: 'lean', weapon: 'staff', cape: true
  },
  /** Scout — green leathers, broad build, cap, dagger. */
  rowan: {
    ...SKIN_B,
    hair: '#7d4a24', hairShade: '#4d2d15', hairLight: '#a8713c',
    cloth: '#3d7a4c', clothShade: '#265232', clothLight: '#66a86e',
    trim: '#8a6a3a', metal: P.stoneLt, metalDark: P.slate,
    hairStyle: 'cap', build: 'broad', weapon: 'dagger', cape: false
  },
  elder: {
    ...SKIN_C,
    hair: '#c9c4bb', hairShade: '#8f8a80', hairLight: '#e8e4dc',
    cloth: '#7a6a52', clothShade: '#544734', clothLight: '#a08d6c',
    trim: '#4a3f30', metal: P.steel, metalDark: P.slate,
    hairStyle: 'long', build: 'mid', weapon: 'none', cape: true, legLen: 4
  },
  merchant: {
    ...SKIN_B,
    hair: '#2e2620', hairShade: '#1c1712', hairLight: '#4a3f34',
    cloth: '#a4562f', clothShade: '#6f3a20', clothLight: '#cd7f4c',
    trim: '#e0c066', metal: P.gold, metalDark: P.rust,
    hairStyle: 'short', build: 'broad', weapon: 'none', cape: false, legLen: 4
  },
  child: {
    ...SKIN_A,
    hair: '#5c3a22', hairShade: '#38220f', hairLight: '#8a5c34',
    cloth: '#c86a4a', clothShade: '#8f4630', clothLight: '#e89a72',
    trim: '#3f5f9c', metal: P.steel, metalDark: P.slate,
    hairStyle: 'short', build: 'lean', weapon: 'none', cape: false, legLen: 2
  },
  guard: {
    ...SKIN_B,
    hair: '#241d16', hairShade: '#141009', hairLight: '#3d3126',
    cloth: '#5a6272', clothShade: '#3b4250', clothLight: '#8b93a4',
    trim: '#8a3a24', metal: P.stoneLt, metalDark: P.slate,
    hairStyle: 'hood', build: 'broad', weapon: 'sword', cape: false
  },
  scholar: {
    ...SKIN_C,
    hair: '#4a3a58', hairShade: '#2c2236', hairLight: '#6f5c82',
    cloth: '#3f6b8c', clothShade: '#28475e', clothLight: '#6d9cbb',
    trim: '#c8b2ef', metal: P.steel, metalDark: P.slate,
    hairStyle: 'hood', build: 'lean', weapon: 'staff', cape: true
  }
};
