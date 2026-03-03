import { Container, Graphics } from 'pixi.js';

export class BossProjectile {
  public container: Container;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public damage: number;
  public radius = 6;
  public lifetime: number;
  public dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, lifetime: number) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.lifetime = lifetime;

    this.container = new Container();

    // Glow
    const glow = new Graphics();
    glow.circle(0, 0, 10);
    glow.fill({ color: 0xff4400, alpha: 0.2 });
    this.container.addChild(glow);

    // Core
    const core = new Graphics();
    core.circle(0, 0, this.radius);
    core.fill({ color: 0xff6622, alpha: 0.9 });
    this.container.addChild(core);

    // Inner bright core
    const inner = new Graphics();
    inner.circle(0, 0, 3);
    inner.fill({ color: 0xffcc44, alpha: 1 });
    this.container.addChild(inner);

    this.container.x = x;
    this.container.y = y;
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.container.x = this.x;
    this.container.y = this.y;

    this.lifetime -= dt;
    if (this.lifetime <= 0) this.dead = true;

    // Rotate for visual flair
    this.container.rotation += 8 * dt;
  }

  /** Check collision with a point (player position) */
  hitTest(px: number, py: number, playerRadius: number): boolean {
    const dx = this.x - px;
    const dy = this.y - py;
    return dx * dx + dy * dy < (this.radius + playerRadius) * (this.radius + playerRadius);
  }
}
