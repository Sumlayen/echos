/**
 * The zoom rule, kept apart from `Stage` so it can be tested without Phaser:
 * the window is divided by the largest whole number that still leaves a layout
 * space at least the 640x360 frame the art and UI were drawn for.
 */

import { VIEW_H, VIEW_W } from '../config/constants';

/** Never past 3x: below that the layout space shrinks under the frame the UI was drawn for. */
export const MAX_ZOOM = 3;

/**
 * Zoom is "how many whole 640x360 frames fit in this window", rounded to the
 * nearest integer and then walked back down until the layout space is still at
 * least the baseline. A 1920x1080 screen gets 3x and shows exactly the frame
 * the art was drawn for; a 1366x768 window gets 2x and shows a little more
 * around it; a 500x400 window stays at 1x and simply shows less.
 */
export function zoomFor(winW: number, winH: number): number {
  const frames = Math.min(winW / VIEW_W, winH / VIEW_H);
  let zoom = Math.max(1, Math.min(MAX_ZOOM, Math.round(frames)));
  while (zoom > 1 && (winW < VIEW_W * zoom || winH < VIEW_H * zoom)) zoom--;
  return zoom;
}

/** Layout space for a window: window pixels divided by `zoomFor`. */
export function layoutFor(winW: number, winH: number): { w: number; h: number; zoom: number } {
  const zoom = zoomFor(winW, winH);
  return {
    w: Math.max(1, Math.floor(winW / zoom)),
    h: Math.max(1, Math.floor(winH / zoom)),
    zoom
  };
}