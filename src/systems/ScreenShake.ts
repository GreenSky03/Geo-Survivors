import { Container } from 'pixi.js';

export class ScreenShake {
  private intensity = 0;
  private decay = 8;

  trigger(amount: number): void {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(dt: number, stage: Container): void {
    if (this.intensity > 0.1) {
      stage.x += (Math.random() - 0.5) * this.intensity;
      stage.y += (Math.random() - 0.5) * this.intensity;
      this.intensity *= Math.max(0, 1 - this.decay * dt);
    } else {
      this.intensity = 0;
    }
  }
}
