/**
 * Parametric humanoid sprite builder.
 *
 * Every party member, NPC and villager is assembled from the same parts
 * (skull, hair, torso, arms, legs, boots, weapon) with a per-character palette
 * and silhouette flags. That is what keeps six+ characters looking like they
 * belong to the same game, and it makes walk/attack/hurt animation a matter of
 * moving parts rather than redrawing art.
 */

import { P } from './Palette';
import { PC } from './PixelCanvas';
import { outline } from './PixelOps';
import { placed, type FrameDef, type SpriteAtlas } from './TextureBuild';

export type Facing = 'down' | 'side' | 'up';

export interface HumanSpec {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairLight: string;
  cloth: string;
  clothShade: string;
  clothLight: string;
  trim: string;
  metal: string;
  metalDark: string;
  hairStyle: 'short' | 'long' | 'hood' | 'cap' | 'wild';
  build: 'lean' | 'mid' | 'broad';
  weapon: 'sword' | 'staff' | 'dagger' | 'none';
  cape: boolean;
  /** extra pixels of leg length, so adults/children read differently */
  legLen?: number;
}

export interface Pose {
  /** 0..3 walk cycle phase, -1 = standing */
  leg: number;
  bob: number;
  arm: 'idle' | 'back' | 'front' | 'raise' | 'guard';
  lunge: number;
  lean: number;
  eyes: 'open' | 'shut' | 'grimace';
  glow: boolean;
  crouch: number;
}

export const POSE_IDLE: Pose = {
  leg: -1, bob: 0, arm: 'idle', lunge: 0, lean: 0, eyes: 'open', glow: false, crouch: 0
};

export const FRAME_W = 26;
export const FRAME_H = 32;

const CX = 13;

function torsoWidth(build: HumanSpec['build']): number {
  return build === 'broad' ? 14 : build === 'lean' ? 11 : 12;
}

/* ------------------------------------------------------------------ head */

function drawHead(pc: PC, s: HumanSpec, facing: Facing, pose: Pose, oy: number): void {
  const y = 1 + oy;
  if (facing === 'down') {
    // skull + hair mass
    pc.rect(CX - 6, y, 12, 11, s.hairShade);
    pc.rect(CX - 5, y - 1, 10, 2, s.hair);
    pc.rect(CX - 6, y + 1, 12, 4, s.hair);
    pc.rect(CX - 5, y + 1, 8, 1, s.hairLight);
    // face
    pc.rect(CX - 5, y + 4, 10, 7, s.skin);
    pc.rect(CX + 3, y + 4, 2, 7, s.skinShade);
    pc.rect(CX - 5, y + 10, 10, 1, s.skinShade);
    // fringe over brow
    pc.rect(CX - 5, y + 4, 10, 1, s.hair);
    pc.p(CX - 4, y + 5, s.hair);
    pc.p(CX + 1, y + 5, s.hair);
    pc.p(CX + 4, y + 5, s.hair);
    // side hair
    pc.rect(CX - 6, y + 4, 1, 6, s.hair);
    pc.rect(CX + 5, y + 4, 1, 6, s.hair);
    drawEyes(pc, facing, pose, CX - 4, CX + 2, y + 6);
    // nose + mouth
    pc.p(CX, y + 8, s.skinShade);
    pc.rect(CX - 1, y + 9, 3, 1, s.skinShade);
  } else if (facing === 'side') {
    pc.rect(CX - 5, y, 11, 11, s.hairShade);
    pc.rect(CX - 4, y - 1, 9, 2, s.hair);
    pc.rect(CX - 4, y + 1, 8, 1, s.hairLight);
    // face toward +x
    pc.rect(CX + 1, y + 4, 5, 7, s.skin);
    pc.rect(CX + 4, y + 4, 2, 7, s.skinShade);
    pc.rect(CX + 1, y + 10, 5, 1, s.skinShade);
    pc.rect(CX + 1, y + 4, 5, 1, s.hair);
    pc.p(CX + 6, y + 7, s.skinShade);
    pc.p(CX + 5, y + 9, s.skinShade);
    drawEyes(pc, facing, pose, CX + 3, CX + 3, y + 6);
    if (s.hairStyle === 'long' || s.hairStyle === 'wild') {
      pc.rect(CX - 7, y + 3, 3, 9, s.hairShade);
      pc.rect(CX - 6, y + 3, 1, 8, s.hair);
    }
  } else {
    // back of the head: hair only
    pc.rect(CX - 6, y, 12, 11, s.hairShade);
    pc.rect(CX - 5, y - 1, 10, 2, s.hair);
    pc.rect(CX - 5, y + 1, 8, 1, s.hairLight);
    pc.rect(CX - 6, y + 9, 12, 2, s.hairShade);
    if (s.hairStyle === 'long') pc.rect(CX - 6, y + 10, 12, 6, s.hair);
  }

  if (s.hairStyle === 'hood') {
    pc.rect(CX - 7, y - 1, 14, 12, s.clothShade);
    pc.rect(CX - 7, y - 1, 14, 1, s.clothLight);
    if (facing !== 'up') {
      pc.rect(CX - 5, y + 3, facing === 'side' ? 11 : 10, 8, facing === 'side' ? s.skin : s.skin);
      pc.rect(CX - 7, y - 1, 14, 4, s.cloth);
      pc.rect(CX - 7, y + 10, 14, 2, s.clothShade);
    }
  }
  if (s.hairStyle === 'cap') {
    pc.rect(CX - 7, y, 14, 4, s.trim);
    pc.rect(CX - 7, y, 14, 1, s.clothLight);
    if (facing === 'side') pc.rect(CX + 5, y + 3, 3, 1, s.trim);
  }
}

function drawEyes(pc: PC, facing: Facing, pose: Pose, lx: number, rx: number, y: number): void {
  if (pose.eyes === 'shut') {
    pc.hline(lx, y + 1, facing === 'side' ? 1 : 2, P.ink);
    if (facing !== 'side') pc.hline(rx, y + 1, 2, P.ink);
    return;
  }
  const c = P.ink;
  if (facing === 'side') {
    pc.rect(rx, y, 1, 2, c);
    pc.p(rx, y, P.paper);
    return;
  }
  pc.rect(lx, y, 2, 2, c);
  pc.rect(rx, y, 2, 2, c);
  pc.p(lx, y, P.paper);
  pc.p(rx, y, P.paper);
  if (pose.eyes === 'grimace') {
    pc.p(lx + 1, y + 2, P.ink);
    pc.p(rx + 1, y + 2, P.ink);
  }
}


/* ------------------------------------------------------- torso / limbs */

function drawTorso(pc: PC, s: HumanSpec, facing: Facing, _pose: Pose, oy: number): void {
  const tw = torsoWidth(s.build);
  const left = CX - Math.floor(tw / 2);
  const y = 12 + oy;

  if (s.cape && facing !== 'side') {
    pc.rect(left - 2, y, tw + 4, 12, s.clothShade);
    pc.rect(left - 1, y, tw + 2, 10, s.trim);
    pc.rect(left, y + 1, tw, 1, s.clothLight);
  }

  // shoulders + chest
  pc.rect(left - 1, y, tw + 2, 2, s.clothLight);
  pc.rect(left, y + 2, tw, 8, s.cloth);
  pc.rect(left + tw - 2, y + 2, 2, 8, s.clothShade);
  pc.rect(left, y + 2, 1, 8, s.clothShade);
  // collar / placket
  pc.rect(CX - 1, y + 2, 2, 5, facing === 'up' ? s.clothShade : s.clothLight);
  // belt
  pc.rect(left, y + 9, tw, 1, s.trim);
  pc.rect(left, y + 10, tw, 1, s.clothShade);
  pc.p(CX, y + 9, s.metal);
}

function drawArms(pc: PC, s: HumanSpec, facing: Facing, pose: Pose, oy: number): void {
  const tw = torsoWidth(s.build);
  const left = CX - Math.floor(tw / 2);
  const right = CX + Math.floor(tw / 2) - 1;
  const y = 13 + oy;

  const armFor = (x: number, front: boolean) => {
    let ay = y;
    if (pose.arm === 'raise') ay = y - 3;
    if (pose.arm === 'front') ay = y + (front ? 1 : -1);
    if (pose.arm === 'back') ay = y + (front ? -1 : 1);
    if (pose.arm === 'guard') ay = y + (front ? 2 : 0);
    pc.rect(x, ay, 2, 6, front ? s.cloth : s.clothShade);
    pc.rect(x, ay + 6, 2, 1, s.skin);
    if (pose.arm === 'raise') pc.rect(x, ay - 1, 2, 1, s.skin);
  };

  if (facing === 'side') {
    armFor(right, true);
    pc.rect(left - 1, y, 2, 6, s.clothShade);
    pc.rect(left - 1, y + 6, 2, 1, s.skinShade);
  } else {
    armFor(left - 1, false);
    armFor(right, true);
  }
}

function drawLegs(pc: PC, s: HumanSpec, facing: Facing, pose: Pose, oy: number): void {
  const tw = torsoWidth(s.build);
  const left = CX - Math.floor(tw / 2);
  const y = 22 + oy;
  const len = s.legLen ?? 5;
  const stride = pose.leg < 0 ? 0 : pose.leg;
  const lOff = stride === 1 ? -1 : stride === 3 ? 1 : 0;
  const rOff = stride === 1 ? 1 : stride === 3 ? -1 : 0;

  if (facing === 'side') {
    const gap = 3;
    pc.rect(CX - 4, y, 4, len, s.clothShade);
    pc.rect(CX - 4 + gap, y, 4, len, s.cloth);
    pc.rect(CX - 5, y + len, 5, 2, s.metalDark);
    pc.rect(CX - 4 + gap, y + len, 5, 2, s.metalDark);
    pc.rect(CX - 4 + gap, y + len, 5, 1, s.clothShade);
    if (stride === 1) pc.rect(CX - 5, y + len - 1, 5, 1, s.clothShade);
    if (stride === 3) pc.rect(CX - 4 + gap, y + len - 1, 5, 1, s.cloth);
    return;
  }

  const lx = left + 1, rx = left + tw - 5;
  pc.rect(lx, y + Math.max(0, lOff), 4, len - Math.abs(lOff), s.clothShade);
  pc.rect(rx, y + Math.max(0, rOff), 4, len - Math.abs(rOff), s.cloth);
  pc.rect(lx - 1, y + len, 5, 2, s.metalDark);
  pc.rect(rx - 1, y + len, 5, 2, s.metalDark);
  pc.rect(lx - 1, y + len, 5, 1, s.clothShade);
  pc.rect(rx - 1, y + len, 5, 1, s.clothShade);
}

/* ------------------------------------------------------------- weapons */

function drawWeapon(pc: PC, s: HumanSpec, facing: Facing, pose: Pose, oy: number): void {
  if (s.weapon === 'none') return;
  const tw = torsoWidth(s.build);
  const handX = CX + Math.floor(tw / 2) + 1;
  const handY = 19 + oy;
  const raised = pose.arm === 'raise';
  const thrust = pose.arm === 'front';

  if (s.weapon === 'sword') {
    if (facing === 'side') {
      const tipY = raised ? handY - 14 : thrust ? handY - 4 : handY - 10;
      pc.rect(handX, tipY, 2, handY - tipY, s.metal);
      pc.rect(handX, tipY, 1, handY - tipY, P.paper);
      pc.rect(handX - 2, handY, 6, 1, s.trim);
      pc.rect(handX, handY + 1, 2, 2, s.metalDark);
    } else {
      pc.rect(handX, handY - 9, 2, 10, s.metal);
      pc.p(handX, handY - 9, P.paper);
      pc.rect(handX - 1, handY + 1, 4, 1, s.trim);
    }
  } else if (s.weapon === 'staff') {
    const topY = raised ? handY - 18 : handY - 14;
    pc.rect(handX, topY, 2, handY - topY + 3, s.trim);
    pc.rect(handX, topY, 1, handY - topY + 3, s.clothLight);
    const orbY = topY - 2;
    pc.disc(handX, orbY, 2, 2, P.mystic);
    pc.p(handX - 1, orbY - 1, P.star);
    if (pose.glow) pc.ring(handX, orbY, 4, 4, P.star);
  } else {
    pc.rect(handX, handY - 5, 1, 6, s.metal);
    pc.rect(handX - 1, handY - 5, 3, 1, s.metalDark);
  }
}


/* ---------------------------------------------------------- assembly */

export function drawHuman(pc: PC, s: HumanSpec, facing: Facing, pose: Pose): void {
  const oy = pose.bob + pose.crouch;
  const tmp = new PC(FRAME_W, FRAME_H);
  drawTorso(tmp, s, facing, pose, oy);
  drawLegs(tmp, s, facing, pose, oy);
  drawArms(tmp, s, facing, pose, oy);
  drawHead(tmp, s, facing, pose, oy);
  drawWeapon(tmp, s, facing, pose, oy);
  outline(tmp, P.ink);
  pc.blit(tmp, pose.lunge + pose.lean, 0);
}

const mk = (p: Partial<Pose>): Pose => ({ ...POSE_IDLE, ...p });

/** The frame set every character gets. Names are shared across characters. */
export const FRAME_PLAN: { name: string; facing: Facing; pose: Pose }[] = [
  { name: 'd_idle0', facing: 'down', pose: mk({}) },
  { name: 'd_idle1', facing: 'down', pose: mk({ bob: 1 }) },
  { name: 'd_walk0', facing: 'down', pose: mk({ leg: 0 }) },
  { name: 'd_walk1', facing: 'down', pose: mk({ leg: 1, bob: 1 }) },
  { name: 'd_walk2', facing: 'down', pose: mk({ leg: 2 }) },
  { name: 'd_walk3', facing: 'down', pose: mk({ leg: 3, bob: 1 }) },
  { name: 'u_idle0', facing: 'up', pose: mk({}) },
  { name: 'u_idle1', facing: 'up', pose: mk({ bob: 1 }) },
  { name: 'u_walk0', facing: 'up', pose: mk({ leg: 0 }) },
  { name: 'u_walk1', facing: 'up', pose: mk({ leg: 1, bob: 1 }) },
  { name: 'u_walk2', facing: 'up', pose: mk({ leg: 2 }) },
  { name: 'u_walk3', facing: 'up', pose: mk({ leg: 3, bob: 1 }) },
  { name: 's_idle0', facing: 'side', pose: mk({}) },
  { name: 's_idle1', facing: 'side', pose: mk({ bob: 1 }) },
  { name: 's_walk0', facing: 'side', pose: mk({ leg: 0 }) },
  { name: 's_walk1', facing: 'side', pose: mk({ leg: 1, bob: 1 }) },
  { name: 's_walk2', facing: 'side', pose: mk({ leg: 2 }) },
  { name: 's_walk3', facing: 'side', pose: mk({ leg: 3, bob: 1 }) },
  { name: 's_attack0', facing: 'side', pose: mk({ arm: 'raise', lean: -2, eyes: 'grimace' }) },
  { name: 's_attack1', facing: 'side', pose: mk({ arm: 'front', lunge: 4, eyes: 'grimace' }) },
  { name: 's_attack2', facing: 'side', pose: mk({ arm: 'front', lunge: 2 }) },
  { name: 's_hurt0', facing: 'side', pose: mk({ lean: -3, bob: 1, eyes: 'grimace' }) },
  { name: 's_hurt1', facing: 'side', pose: mk({ lean: -2, eyes: 'shut' }) },
  { name: 's_cast0', facing: 'side', pose: mk({ arm: 'raise', bob: -1 }) },
  { name: 's_cast1', facing: 'side', pose: mk({ arm: 'raise', bob: -2, glow: true }) },
  { name: 's_guard', facing: 'side', pose: mk({ arm: 'guard', bob: 1, crouch: 1 }) },
  { name: 's_win0', facing: 'side', pose: mk({ arm: 'raise', bob: -1 }) },
  { name: 's_win1', facing: 'side', pose: mk({ arm: 'raise', bob: -2 }) },
  { name: 's_dead', facing: 'side', pose: mk({ crouch: 8, eyes: 'shut', lean: -2 }) }
];

/** Build one character's atlas (all frames, named). */
export function buildCharacterAtlas(key: string, spec: HumanSpec): SpriteAtlas {
  const cols = 10;
  const rows = Math.ceil(FRAME_PLAN.length / cols);
  const pc = new PC(cols * FRAME_W, rows * FRAME_H);
  const frames: FrameDef[] = [];
  FRAME_PLAN.forEach((f, i) => {
    const x = (i % cols) * FRAME_W;
    const y = Math.floor(i / cols) * FRAME_H;
    const cell = new PC(FRAME_W, FRAME_H);
    drawHuman(cell, spec, f.facing, f.pose);
    pc.blit(cell, x, y);
    frames.push({ name: f.name, x, y, w: FRAME_W, h: FRAME_H });
  });
  return placed(key, pc, frames);
}
