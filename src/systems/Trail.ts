import { Container, Graphics } from 'pixi.js';

interface TrailDot {
  x: number;
  y: number;
  life: number;
  graphic: Graphics;
}

export class Trail {
  public container: Container;
  private dots: TrailDot[] = [];
  private spawnTimer = 0;

  constructor(private color: number = 0x00e6b0) {
    this.container = new Container();
  }

  update(dt: number, x: number, y: number, moving: boolean): void {
    this.spawnTimer -= dt;

    if (moving && this.spawnTimer <= 0) {
      this.spawnTimer = 0.03;
      const g = new Graphics();
      g.circle(0, 0, 3);
      g.fill({ color: this.color, alpha: 0.4 });
      g.x = x;
      g.y = y;
      this.container.addChild(g);
      this.dots.push({ x, y, life: 0.3, graphic: g });
    }

    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life -= dt;
      d.graphic.alpha = Math.max(0, d.life / 0.3) * 0.3;
      d.graphic.scale.set(Math.max(0, d.life / 0.3));

      if (d.life <= 0) {
        this.container.removeChild(d.graphic);
        d.graphic.destroy();
        this.dots.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const d of this.dots) {
      this.container.removeChild(d.graphic);
      d.graphic.destroy();
    }
    this.dots = [];
  }
}
