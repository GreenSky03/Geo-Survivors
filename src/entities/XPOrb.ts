import { Container, Graphics } from 'pixi.js';

export class XPOrb {
  public container: Container;
  public x: number;
  public y: number;
  public xpAmount: number;
  public collected = false;
  public radius = 6;
  private attracted = false;

  constructor(x: number, y: number, xp: number) {
    this.x = x;
    this.y = y;
    this.xpAmount = xp;

    this.container = new Container();

    // Glow
    const glow = new Graphics();
    glow.circle(0, 0, 10);
    glow.fill({ color: 0x44aaff, alpha: 0.2 });
    this.container.addChild(glow);

    // Body
    const body = new Graphics();
    body.circle(0, 0, 5);
    body.fill({ color: 0x44ccff, alpha: 0.9 });
    this.container.addChild(body);

    this.container.x = x;
    this.container.y = y;
  }

  forceMagnet(): void {
    this.attracted = true;
  }

  update(dt: number, playerX: number, playerY: number, magnetRange: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < magnetRange) this.attracted = true;

    if (this.attracted && dist > 1) {
      const speed = 450;
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    }

    if (dist < 20) this.collected = true;

    this.container.x = this.x;
    this.container.y = this.y;
  }
}
