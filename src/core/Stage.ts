/**
 * The live play area: the canvas fills the browser window, so the game's
 * internal resolution changes with it. Every layout asks the stage for
 * `w`/`h` instead of a fixed frame — those are the window size divided by an
 * integer `zoom`, which keeps the 5x7 bitmap font and the pixel art crisp at
 * whole-pixel multiples instead of smearing at fractional FIT scales.
 *
 * Scenes never poll this: they subscribe with `onStageResize`, which detaches
 * itself when the scene shuts down.
 */

import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/constants';
import { bus } from './EventBus';
import { layoutFor } from './zoom';

export interface StageSize {
  /** Layout width in game pixels: window pixels divided by `zoom`. */
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Integer camera zoom applied to every scene camera. */
  zoom: number;
  /**
   * Canvas pixels, i.e. what a camera's `width`/`height` will be once Phaser has
   * finished resizing it. During a RESIZE handler the camera still holds its
   * previous size, so anything that needs the window reads it from here.
   */
  winW: number;
  winH: number;
}

class Stage {
  private game: Phaser.Game | null = null;
  private detached: (() => void) | null = null;
  private hooks: { scene: Phaser.Scene; fn: () => void }[] = [];
  private current: StageSize = {
    w: VIEW_W,
    h: VIEW_H,
    cx: VIEW_W / 2,
    cy: VIEW_H / 2,
    zoom: 1,
    winW: VIEW_W,
    winH: VIEW_H,
  };

  /** Wire the stage to a running game and measure it once. */
  attach(game: Phaser.Game): void {
    this.detach();
    this.game = game;
    const onResize = (): void => {
      this.measure();
    };
    game.scale.on(Phaser.Scale.Events.RESIZE, onResize);

    // A scene started between two resizes would otherwise keep Phaser's default
    // 1x camera and draw its UI at half size in the corner of the window, so
    // each scene is re-zoomed the moment it is created — the menu overlay is
    // started long after the window was last resized. The scene instances only
    // exist once Phaser has booted, which is after `attach` runs in `main.ts`.
    const bind = (): void => this.bindScenes(game);
    if (game.scene.scenes.length) bind();
    else game.events.once(Phaser.Core.Events.READY, bind);

    this.detached = () => {
      game.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      game.events.off(Phaser.Core.Events.READY, bind);
      this.unbindScenes();
    };
    this.measure();
  }

  /** One `create` listener per scene, re-armed whenever a scene restarts. */
  private bindScenes(game: Phaser.Game): void {
    this.unbindScenes();
    for (const scene of game.scene.scenes) {
      const fn = (): void => this.zoomScene(scene);
      scene.events.on(Phaser.Scenes.Events.CREATE, fn);
      this.hooks.push({ scene, fn });
      this.zoomScene(scene);
    }
  }

  private unbindScenes(): void {
    for (const h of this.hooks) h.scene.events.off(Phaser.Scenes.Events.CREATE, h.fn);
    this.hooks = [];
  }

  detach(): void {
    this.detached?.();
    this.detached = null;
    this.game = null;
  }

  get size(): StageSize {
    return this.current;
  }
  get w(): number {
    return this.current.w;
  }
  get h(): number {
    return this.current.h;
  }
  get cx(): number {
    return this.current.cx;
  }
  get cy(): number {
    return this.current.cy;
  }
  get zoom(): number {
    return this.current.zoom;
  }

  /**
   * Re-read the canvas size, re-zoom every camera and emit `stage:resize` when
   * the layout space actually changed. `attach` runs before Phaser has booted
   * its scenes, so this handler is registered ahead of every scene's
   * `CameraManager` and runs first: the cameras still hold the previous window
   * here, which is why the window size is carried on `current` rather than read
   * off a camera.
   */
  measure(): StageSize {
    const scale = this.game?.scale;
    const winW = scale ? Math.max(1, Math.floor(scale.width)) : VIEW_W;
    const winH = scale ? Math.max(1, Math.floor(scale.height)) : VIEW_H;
    const { w, h, zoom } = layoutFor(winW, winH);
    const before = this.current;
    this.current = {
      w,
      h,
      cx: Math.round(w / 2),
      cy: Math.round(h / 2),
      zoom,
      winW,
      winH,
    };
    this.applyZoom();
    if (before.w !== w || before.h !== h || before.zoom !== zoom) bus.emit('stage:resize', this.current);
    return this.current;
  }

  /** Integer zoom on every camera of every scene, so all scenes agree. */
  private applyZoom(): void {
    const game = this.game;
    if (!game) return;
    for (const scene of game.scene.scenes) this.zoomScene(scene);
  }

  /**
   * One scene's cameras, for scenes that start between two resizes.
   *
   * The origin is pinned to the top-left of the canvas and the scroll to the
   * world coordinate behind that corner, so a position and the pixel it lands on
   * differ by exactly `zoom`. That is what keeps the two kinds of UI in a scene
   * agreeing: content that scrolls with the world, and the HUD pinned to the
   * window with `setScrollFactor(0)`. Phaser centres a camera on its origin
   * instead, and from 2x up that leaves a `scrollFactor(0)` object half a canvas
   * outside the window — the world HUD used to render off-screen at 1080p.
   *
   * The window size is taken from the stage rather than the camera: on Phaser's
   * RESIZE event the camera has not been resized yet, so working off `cam.width`
   * would work with the *previous* window.
   */
  private zoomScene(scene: Phaser.Scene): void {
    const { zoom } = this.current;
    for (const cam of scene.cameras?.cameras ?? []) {
      if (cam.zoom !== zoom) cam.setZoom(zoom);
      cam.setRoundPixels(true);
      cam.setOrigin(0, 0);
      this.trackView(cam);
      // A camera that follows a target works out its own scroll every frame.
      if ((cam as unknown as { _follow?: unknown })._follow) continue;
      cam.setScroll(0, 0);
    }
  }

  /**
   * Phaser derives `worldView` as the rect centred on `scroll + size / 2` — the
   * view of a camera centred on its origin, which the stage's cameras are not.
   * Restate it from the scroll, which is the world coordinate behind the canvas'
   * top-left pixel. Culling reads the camera matrix rather than this rect, but
   * masks, tilemaps and anything else asking what is on screen read it.
   */
  private trackView(cam: Phaser.Cameras.Scene2D.Camera): void {
    if (viewTracked.has(cam)) return;
    viewTracked.add(cam);
    const preRender = cam.preRender.bind(cam);
    cam.preRender = (): void => {
      preRender();
      cam.worldView.setTo(cam.scrollX, cam.scrollY, cam.displayWidth, cam.displayHeight);
    };
  }
}

/** Cameras whose `worldView` `trackView` has already taken over. */
const viewTracked = new WeakSet<Phaser.Cameras.Scene2D.Camera>();

/** The one stage, attached to the game in `main.ts`. */
export const stage = new Stage();

/**
 * Runs `fn` on every stage resize and stops when the scene shuts down. Call it
 * from `create()`; the scene's own objects are then re-laid-out in place, which
 * keeps menus, dialogue and battle state alive across a window drag.
 */
export function onStageResize(scene: Phaser.Scene, fn: (size: StageSize) => void): () => void {
  const off = bus.on('stage:resize', fn);
  scene.events.once('shutdown', off);
  return off;
}

/**
 * Backdrops are painted at the 640x360 baseline. `cover` scales one up so it
 * fills the whole stage (cropping the overflow, centred) rather than leaving
 * letterbox bands at the edges. Idempotent: it always measures the texture.
 */
export function cover(
  img: Phaser.GameObjects.Image,
  w: number = stage.w,
  h: number = stage.h
): Phaser.GameObjects.Image {
  const scale = Math.max(w / img.width, h / img.height);
  img.setScale(scale).setPosition((w - img.width * scale) / 2, (h - img.height * scale) / 2);
  return img;
}

/** Clamp a layout measurement to a sane band for the current stage. */
export function fit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
