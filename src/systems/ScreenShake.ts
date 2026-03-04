import { Container } from 'pixi.js';

export class ScreenShake {
  private intensity = 0;
  private decay = 8;
  private offsetX = 0;
  private offsetY = 0;

  trigger(amount: number): void {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(dt: number, stage: Container): void {
    // Undo previous frame's offset
    stage.x -= this.offsetX;
    stage.y -= this.offsetY;

    if (this.intensity > 0.1) {
      this.offsetX = (Math.random() - 0.5) * this.intensity;
      this.offsetY = (Math.random() - 0.5) * this.intensity;
      stage.x += this.offsetX;
      stage.y += this.offsetY;
      this.intensity *= Math.max(0, 1 - this.decay * dt);
    } else {
      this.intensity = 0;
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }
}
