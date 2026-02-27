import { Container, Graphics } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  graphic: Graphics;
}

const POOL_MAX = 100;

export class ParticleSystem {
  public container: Container;
  private particles: Particle[] = [];
  private pool: Graphics[] = [];

  constructor() {
    this.container = new Container();
  }

  private getGraphic(): Graphics {
    if (this.pool.length > 0) {
      const g = this.pool.pop()!;
      g.clear();
      g.alpha = 1;
      g.scale.set(1);
      g.visible = true;
      return g;
    }
    return new Graphics();
  }

  private returnGraphic(g: Graphics): void {
    g.visible = false;
    this.container.removeChild(g);
    if (this.pool.length < POOL_MAX) {
      this.pool.push(g);
    } else {
      g.destroy();
    }
  }

  /** Burst of particles at a position (e.g. enemy death) */
  burst(x: number, y: number, color: number, count = 8, speed = 200): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.5 + Math.random() * 0.8);
      const g = this.getGraphic();
      const size = 2 + Math.random() * 4;
      g.rect(-size / 2, -size / 2, size, size);
      g.fill({ color, alpha: 1 });
      g.x = x;
      g.y = y;
      this.container.addChild(g);

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.5,
        size, color,
        graphic: g,
      });
    }
  }

  /** Small hit spark */
  spark(x: number, y: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 120;
      const g = this.getGraphic();
      g.circle(0, 0, 1.5 + Math.random() * 1.5);
      g.fill({ color, alpha: 0.9 });
      g.x = x;
      g.y = y;
      this.container.addChild(g);

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.2 + Math.random() * 0.15,
        maxLife: 0.3,
        size: 2, color,
        graphic: g,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;

      const alpha = Math.max(0, p.life / p.maxLife);
      p.graphic.x = p.x;
      p.graphic.y = p.y;
      p.graphic.alpha = alpha;
      p.graphic.scale.set(alpha);

      if (p.life <= 0) {
        this.returnGraphic(p.graphic);
        this.particles.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.returnGraphic(p.graphic);
    }
    this.particles = [];
  }
}
