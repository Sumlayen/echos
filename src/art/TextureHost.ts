/**
 * Minimal structural type for the Phaser pieces the art generators need.
 * Keeping the concrete `phaser` import out of the art modules means every
 * generator can be unit-tested in plain Node without a DOM-backed Phaser boot.
 */

export interface FrameLike {
  realWidth: number;
  realHeight: number;
}

export interface TextureLike {
  add(name: string, sourceIndex: number, x: number, y: number, width: number, height: number): unknown;
  getFrame(name: string): FrameLike;
}

export interface TextureHost {
  textures: {
    exists(key: string): boolean;
    addCanvas(key: string, source: HTMLCanvasElement): TextureLike | null;
    get(key: string): unknown;
  };
}
