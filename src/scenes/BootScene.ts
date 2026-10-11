/**
 * Boot: every texture in the game is generated here from the art modules —
 * there are no image files. Steps are chained across frames so the "forging"
 * label actually paints between the heavier atlases.
 */

import Phaser from 'phaser';
import { BACKDROPS } from '../art/BackdropArt';
import { buildEffectAtlas } from '../art/EffectArt';
import { ENEMY_ART, buildEnemyAtlas } from '../art/EnemyArt';
import { buildFontAtlas } from '../art/FontArt';
import { CHAR_SPECS } from '../data/CharacterSpecs';
import { buildCharacterAtlas } from '../art/HumanoidArt';
import { buildIconAtlas } from '../art/IconArt';
import { buildFlameAtlas, buildPropAtlas } from '../art/PropArt';
import { buildTerrainAtlas } from '../art/TileArt';
import { buildUIAtlas, buildWindowSkins } from '../art/UIArt';
import type { FrameDef, SpriteAtlas } from '../art/TextureBuild';
import { GAME_TITLE, SCENES, VIEW_W } from '../config/constants';
import { MAPS, materialsFor } from '../data/World';
import { makeLabel } from '../ui/Text';
import { C } from '../ui/Window';

/** Built atlases, kept around so scenes can bake from them (e.g. map textures). */
export const atlases = new Map<string, SpriteAtlas>();

/** Registers a generated atlas as a Phaser texture with named frames. */
export function addAtlas(scene: Phaser.Scene, atlas: SpriteAtlas): void {
  if (scene.textures.exists(atlas.key)) scene.textures.remove(atlas.key);
  const tex = scene.textures.addCanvas(atlas.key, atlas.pc.canvas);
  atlases.set(atlas.key, atlas);
  if (!tex) return;
  for (const f of atlas.frames) {
    if (!tex.has(f.name)) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  }
}

/** The rectangle a named frame occupies inside an atlas' pixel canvas. */
export function frameOf(atlas: SpriteAtlas, name: string): FrameDef {
  const f = atlas.frames.find((x) => x.name === name);
  if (!f) throw new Error(`No frame "${name}" in atlas ${atlas.key}`);
  return f;
}

/** Registers a single-image texture (backdrops, window skins). */
export function addImage(scene: Phaser.Scene, key: string, pc: { canvas: HTMLCanvasElement }): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, pc.canvas);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    const cx = VIEW_W / 2;
    makeLabel(this, GAME_TITLE, cx, 150, { color: C.gold, align: 'center', scale: 2 });
    const status = makeLabel(this, 'GENERATING ART', cx, 196, { color: C.dim, align: 'center' });
    const bar = this.add.rectangle(cx, 214, 220, 6, 0x222a3d);
    const fill = this.add.rectangle(cx - 110, 214, 0, 6, C.gold).setOrigin(0, 0.5);

    const steps: { label: string; run: () => void }[] = [
      { label: 'FONT', run: () => addAtlas(this, buildFontAtlas()) },
      { label: 'UI', run: () => addAtlas(this, buildUIAtlas()) },
      {
        label: 'WINDOWS',
        run: () => buildWindowSkins().forEach((s) => addImage(this, s.key, s.pc))
      },
      { label: 'ICONS', run: () => addAtlas(this, buildIconAtlas()) },
      { label: 'TILES', run: () => addAtlas(this, buildTerrainAtlas('terrain', allMaterials())) },
      { label: 'PROPS', run: () => addAtlas(this, buildPropAtlas('props')) },
      { label: 'FLAMES', run: () => addAtlas(this, buildFlameAtlas('flames')) },
      { label: 'EFFECTS', run: () => addAtlas(this, buildEffectAtlas('fx')) },
      {
        label: 'FOES',
        run: () => Object.keys(ENEMY_ART).forEach((kind) => addAtlas(this, buildEnemyAtlas(kind)))
      },
      {
        label: 'PEOPLE',
        run: () =>
          Object.entries(CHAR_SPECS).forEach(([id, spec]) =>
            addAtlas(this, buildCharacterAtlas(`char_${id}`, spec))
          )
      },
      {
        label: 'BACKDROPS',
        run: () => Object.entries(BACKDROPS).forEach(([key, paint]) => addImage(this, key, paint()))
      }
    ];

    steps.forEach((step, i) => {
      this.time.delayedCall(i * 16, () => {
        status.setText(`GENERATING ART - ${step.label}`);
        step.run();
        fill.setSize(220 * ((i + 1) / steps.length), 6);
      });
    });

    this.time.delayedCall(steps.length * 16 + 260, () => {
      status.setText('READY');
      bar.setVisible(false);
      fill.setVisible(false);
      this.time.delayedCall(220, () => this.scene.start(SCENES.title));
    });
  }
}

/** Union of every material used by any map, so one terrain atlas covers all. */
function allMaterials(): string[] {
  const set = new Set<string>();
  for (const map of Object.values(MAPS)) materialsFor(map).forEach((m) => set.add(m));
  return Array.from(set);
}
