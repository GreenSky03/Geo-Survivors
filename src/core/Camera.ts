import { Container } from 'pixi.js';
import { lerp } from '../utils/math';

export class Camera {
  public x = 0;
  public y = 0;

  constructor(
    private world: Container,
    private screenWidth: number,
    private screenHeight: number,
  ) {}

  follow(targetX: number, targetY: number, smoothing = 0.1): void {
    this.x = lerp(this.x, targetX, smoothing);
    this.y = lerp(this.y, targetY, smoothing);
  }

  apply(): void {
    this.world.x = this.screenWidth / 2 - this.x;
    this.world.y = this.screenHeight / 2 - this.y;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx - this.screenWidth / 2 + this.x,
      y: sy - this.screenHeight / 2 + this.y,
    };
  }

  resize(w: number, h: number): void {
    this.screenWidth = w;
    this.screenHeight = h;
  }
}
