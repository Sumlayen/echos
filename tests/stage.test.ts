/**
 * The zoom rule is the whole contract behind the full-window stage: whole
 * multiples only, so the 5x7 bitmap font and the 16px tiles stay crisp, and
 * never a layout space smaller than the 640x360 frame the art was drawn for.
 *
 *   npx vitest run
 */

import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W } from '../src/config/constants';
import { layoutFor, zoomFor } from '../src/core/zoom';

describe('stage zoom', () => {
  it('stays at 1x for windows around the baseline', () => {
    expect(zoomFor(VIEW_W, VIEW_H)).toBe(1);
    expect(zoomFor(960, 600)).toBe(1);
    expect(zoomFor(500, 400)).toBe(1);
  });

  it('zooms by whole multiples as the window grows', () => {
    expect(zoomFor(1366, 768)).toBe(2);
    expect(zoomFor(1920, 1080)).toBe(3);
  });

  it('caps at 3x so a 4k screen still has room for the UI', () => {
    expect(zoomFor(3840, 2160)).toBe(3);
  });

  it('never leaves a layout space smaller than the frame it was drawn for', () => {
    const windows: [number, number][] = [
      [640, 360],
      [800, 500],
      [1024, 640],
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1600, 1000],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
      [500, 400],
      [480, 420]
    ];
    for (const [w, h] of windows) {
      const l = layoutFor(w, h);
      expect(Number.isInteger(l.zoom), `${w}x${h} zoom`).toBe(true);
      expect(l.w, `${w}x${h} layout w`).toBeGreaterThanOrEqual(Math.min(VIEW_W, w));
      expect(l.h, `${w}x${h} layout h`).toBeGreaterThanOrEqual(Math.min(VIEW_H, h));
      expect(l.w * l.zoom, `${w}x${h} covers the window`).toBeLessThanOrEqual(w);
      expect(l.h * l.zoom, `${w}x${h} covers the window`).toBeLessThanOrEqual(h);
    }
  });
});