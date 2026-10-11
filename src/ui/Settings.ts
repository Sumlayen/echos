/**
 * Settings form shared by the title screen and the in-game menu. Rows are
 * stepped with left/right; values write straight through to `Settings`, which
 * persists them, and audio volumes are re-applied on change.
 */

import Phaser from 'phaser';
import { applyVolumes } from '../audio/Audio';
import { getSettings, setSettings } from '../core/Settings';
import { Label, makeLabel } from './Text';
import { C, Panel } from './Window';

const SPEEDS = [
  { label: 'SLOW', value: 22 },
  { label: 'NORMAL', value: 42 },
  { label: 'FAST', value: 72 }
];

function speedIndex(): number {
  const cur = getSettings().textSpeed;
  let best = 0;
  let gap = Infinity;
  SPEEDS.forEach((sp, i) => {
    const d = Math.abs(sp.value - cur);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const bump = (v: number, dir: number): number =>
  Math.max(0, Math.min(10, Math.round(v * 10) + dir)) / 10;

interface Row {
  name: string;
  value: () => string;
  step: (dir: number) => void;
}

export class SettingsForm {
  private panel: Panel;
  private labels: Label[] = [];
  private rows: Row[];
  private cursor: Phaser.GameObjects.Image;
  index = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, w = 300) {
    this.panel = new Panel(scene, x, y, w, 132);
    this.rows = [
      {
        name: 'MUSIC',
        value: () => pct(getSettings().music),
        step: (d) => {
          setSettings({ music: bump(getSettings().music, d) });
          applyVolumes();
        }
      },
      {
        name: 'SOUND',
        value: () => pct(getSettings().sfx),
        step: (d) => {
          setSettings({ sfx: bump(getSettings().sfx, d) });
          applyVolumes();
        }
      },
      {
        name: 'TEXT',
        value: () => SPEEDS[speedIndex()].label,
        step: (d) => {
          const i = Math.max(0, Math.min(SPEEDS.length - 1, speedIndex() + d));
          setSettings({ textSpeed: SPEEDS[i].value });
        }
      },
      {
        name: 'BATTLE',
        value: () => (getSettings().fastBattle ? 'FAST' : 'NORMAL'),
        step: () => setSettings({ fastBattle: !getSettings().fastBattle })
      },
      {
        name: 'SHAKE',
        value: () => (getSettings().shake ? 'ON' : 'OFF'),
        step: () => setSettings({ shake: !getSettings().shake })
      }
    ];

    makeLabel(scene, 'SETTINGS', x + 14, y + 10, { color: C.gold });
    this.labels = this.rows.map((r, i) =>
      makeLabel(scene, r.name, x + 26, y + 34 + i * 17, { color: C.text })
    );
    this.cursor = scene.add.image(x + 12, y + 37, 'ui', 'cursor_0').setOrigin(0, 0.5);
    this.paint();
  }

  private paint(): void {
    this.rows.forEach((r, i) => {
      const active = i === this.index;
      this.labels[i].setText(`${r.name}  ${r.value()}`);
      this.labels[i].setColor(active ? 0xffffff : C.dim);
    });
    this.cursor
      .setVisible(this.panel.visible)
      .setPosition(this.panel.x + 12, this.panel.y + 37 + this.index * 17);
  }

  setVisible(v: boolean): this {
    this.panel.setVisible(v);
    this.labels.forEach((l) => l.setVisible(v));
    this.cursor.setVisible(v);
    return this;
  }

  get open(): boolean {
    return this.panel.visible;
  }

  /** Returns true when the key was consumed by the form. */
  key(name: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): boolean {
    if (name === 'UP') this.index = (this.index + this.rows.length - 1) % this.rows.length;
    else if (name === 'DOWN') this.index = (this.index + 1) % this.rows.length;
    else if (name === 'LEFT' || name === 'RIGHT') this.rows[this.index].step(name === 'RIGHT' ? 1 : -1);
    else return false;
    this.paint();
    return true;
  }

  destroy(): void {
    this.panel.destroy();
    this.labels.forEach((l) => l.destroy());
    this.cursor.destroy();
  }
}

