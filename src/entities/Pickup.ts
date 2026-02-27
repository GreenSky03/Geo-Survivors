import { Container, Graphics } from 'pixi.js';
import { distance } from '../utils/math';

export type PickupType = 'heal' | 'magnet' | 'bomb' | 'chest';

interface PickupDef {
  color: number;
  glowColor: number;
  radius: number;
  lifetime: number;
}

const PICKUP_DEFS: Record<PickupType, PickupDef> = {
  heal:   { color: 0x44ff66, glowColor: 0x44ff66, radius: 10, lifetime: 15 },
  magnet: { color: 0x44aaff, glowColor: 0x44aaff, radius: 10, lifetime: 12 },
  bomb:   { color: 0xff8844, glowColor: 0xff6622, radius: 12, lifetime: 10 },
  chest:  { color: 0xffcc44, glowColor: 0xffaa00, radius: 14, lifetime: 20 },
};

export class Pickup {
  public container: Container;
  public x: number;
  public y: number;
  public type: PickupType;
  public collected = false;
  public expired = false;
  public radius: number;

  private lifetime: number;
  private bobPhase: number;
  private visual: Graphics;

  constructor(x: number, y: number, type: PickupType) {
    this.x = x;
    this.y = y;
    this.type = type;

    const def = PICKUP_DEFS[type];
    this.radius = def.radius;
    this.lifetime = def.lifetime;
    this.bobPhase = Math.random() * Math.PI * 2;

    this.container = new Container();
    this.container.x = x;
    this.container.y = y;

    // Glow
    const glow = new Graphics();
    glow.circle(0, 0, def.radius + 6);
    glow.fill({ color: def.glowColor, alpha: 0.1 });
    this.container.addChild(glow);

    // Body
    this.visual = new Graphics();
    this.drawIcon(this.visual, type, def);
    this.container.addChild(this.visual);
  }

  private drawIcon(g: Graphics, type: PickupType, def: PickupDef): void {
    const r = def.radius;
    switch (type) {
      case 'heal':
        // Cross shape
        g.rect(-r * 0.25, -r * 0.7, r * 0.5, r * 1.4);
        g.fill({ color: def.color, alpha: 0.9 });
        g.rect(-r * 0.7, -r * 0.25, r * 1.4, r * 0.5);
        g.fill({ color: def.color, alpha: 0.9 });
        break;
      case 'magnet':
        // U-shape magnet approximation
        g.circle(0, 0, r * 0.7);
        g.stroke({ color: def.color, width: 3, alpha: 0.9 });
        g.moveTo(-r * 0.5, -r * 0.2);
        g.lineTo(-r * 0.5, r * 0.4);
        g.stroke({ color: 0xff4466, width: 2 });
        g.moveTo(r * 0.5, -r * 0.2);
        g.lineTo(r * 0.5, r * 0.4);
        g.stroke({ color: 0x4466ff, width: 2 });
        break;
      case 'bomb':
        // Circle with fuse
        g.circle(0, 2, r * 0.6);
        g.fill({ color: def.color, alpha: 0.9 });
        g.moveTo(0, -r * 0.3);
        g.lineTo(r * 0.3, -r * 0.7);
        g.stroke({ color: 0xffee44, width: 2 });
        break;
      case 'chest':
        // Box shape
        g.rect(-r * 0.65, -r * 0.5, r * 1.3, r);
        g.fill({ color: def.color, alpha: 0.9 });
        g.rect(-r * 0.65, -r * 0.1, r * 1.3, r * 0.2);
        g.fill({ color: 0xaa8822, alpha: 0.6 });
        break;
    }
  }

  update(dt: number, px: number, py: number): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.expired = true;
      return;
    }

    // Bob animation
    this.bobPhase += dt * 3;
    this.container.y = this.y + Math.sin(this.bobPhase) * 3;

    // Blink when about to expire
    if (this.lifetime < 3) {
      this.container.alpha = Math.sin(this.lifetime * 8) > 0 ? 1 : 0.3;
    }

    // Check collection
    const dist = distance(this.x, this.y, px, py);
    if (dist < this.radius + 20) {
      this.collected = true;
    }
  }
}

// Drop chance table
export function rollPickupDrop(isBoss: boolean): PickupType | null {
  const roll = Math.random();
  if (isBoss) {
    // Bosses always drop something
    if (roll < 0.4) return 'chest';
    if (roll < 0.7) return 'bomb';
    return 'heal';
  }
  // Normal enemies: ~6% drop rate
  if (roll < 0.025) return 'heal';
  if (roll < 0.04) return 'magnet';
  if (roll < 0.06) return 'bomb';
  return null;
}
