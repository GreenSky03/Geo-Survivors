import { Container, Graphics } from 'pixi.js';

const GROW_DURATION = 5;
const PEAK_DURATION = 8;
const FADE_DURATION = 3;
const TOTAL_DURATION = GROW_DURATION + PEAK_DURATION + FADE_DURATION;
const MAX_RADIUS = 120;
const PEAK_PULL_SPEED = 200; // px/s pull
const PEAK_DAMAGE_PS = 15; // damage per second at peak

export class BlackHole {
  public container: Container;
  public x: number;
  public y: number;
  public radius = 10;
  public age = 0;
  public dead = false;
  public serverId = -1;

  // Current effective values
  public pullStrength = 0;
  public damagePerSecond = 0;

  private coreGfx: Graphics;
  private ringGfx: Graphics;
  private glowGfx: Graphics;
  private ringRotation = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;

    this.container = new Container();
    this.container.x = x;
    this.container.y = y;

    // Outer glow
    this.glowGfx = new Graphics();
    this.container.addChild(this.glowGfx);

    // Dashed ring
    this.ringGfx = new Graphics();
    this.container.addChild(this.ringGfx);

    // Dark core
    this.coreGfx = new Graphics();
    this.container.addChild(this.coreGfx);

    this.redraw();
  }

  update(dt: number): void {
    this.age += dt;
    if (this.age >= TOTAL_DURATION) {
      this.dead = true;
      return;
    }

    // Calculate phase
    let t: number;
    if (this.age < GROW_DURATION) {
      // Growing
      t = this.age / GROW_DURATION;
      this.radius = 10 + (MAX_RADIUS - 10) * t;
      this.pullStrength = PEAK_PULL_SPEED * t;
      this.damagePerSecond = PEAK_DAMAGE_PS * t;
    } else if (this.age < GROW_DURATION + PEAK_DURATION) {
      // Peak
      this.radius = MAX_RADIUS;
      this.pullStrength = PEAK_PULL_SPEED;
      this.damagePerSecond = PEAK_DAMAGE_PS;
    } else {
      // Fading
      t = 1 - (this.age - GROW_DURATION - PEAK_DURATION) / FADE_DURATION;
      this.radius = MAX_RADIUS * t;
      this.pullStrength = PEAK_PULL_SPEED * t;
      this.damagePerSecond = PEAK_DAMAGE_PS * t;
    }

    this.ringRotation += 1.5 * dt;
    this.redraw();
  }

  /** Sync from server data (multiplayer) */
  syncFromServer(radius: number, age: number): void {
    this.radius = radius;
    this.age = age;

    if (age < GROW_DURATION) {
      const t = age / GROW_DURATION;
      this.pullStrength = PEAK_PULL_SPEED * t;
      this.damagePerSecond = PEAK_DAMAGE_PS * t;
    } else if (age < GROW_DURATION + PEAK_DURATION) {
      this.pullStrength = PEAK_PULL_SPEED;
      this.damagePerSecond = PEAK_DAMAGE_PS;
    } else {
      const t = 1 - (age - GROW_DURATION - PEAK_DURATION) / FADE_DURATION;
      this.pullStrength = PEAK_PULL_SPEED * Math.max(0, t);
      this.damagePerSecond = PEAK_DAMAGE_PS * Math.max(0, t);
    }

    this.redraw();
  }

  private redraw(): void {
    const r = Math.max(1, this.radius);

    // Glow
    this.glowGfx.clear();
    this.glowGfx.circle(0, 0, r * 1.8);
    this.glowGfx.fill({ color: 0x8800cc, alpha: 0.08 });
    this.glowGfx.circle(0, 0, r * 1.3);
    this.glowGfx.fill({ color: 0x6600aa, alpha: 0.12 });

    // Dashed ring (rotating)
    this.ringGfx.clear();
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const startAngle = this.ringRotation + (Math.PI * 2 / segments) * i;
      const endAngle = startAngle + (Math.PI * 2 / segments) * 0.6;
      this.ringGfx.arc(0, 0, r, startAngle, endAngle);
      this.ringGfx.stroke({ width: 2, color: 0xaa44ff, alpha: 0.5 });
    }

    // Inner ring
    this.ringGfx.circle(0, 0, r * 0.6);
    this.ringGfx.stroke({ width: 1, color: 0x9933ee, alpha: 0.3 });

    // Core
    this.coreGfx.clear();
    this.coreGfx.circle(0, 0, r * 0.35);
    this.coreGfx.fill({ color: 0x110022, alpha: 0.9 });
    this.coreGfx.circle(0, 0, r * 0.15);
    this.coreGfx.fill({ color: 0x000000, alpha: 1 });
  }

  /** Get pull force on an entity at (ex, ey). Returns {fx, fy} force vector. */
  getPullForce(ex: number, ey: number): { fx: number; fy: number } | null {
    const dx = this.x - ex;
    const dy = this.y - ey;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pullRange = this.radius * 2.5;
    if (dist > pullRange || dist < 5) return null;

    // Pull strength falls off with distance
    const factor = this.pullStrength * (1 - dist / pullRange);
    return {
      fx: (dx / dist) * factor,
      fy: (dy / dist) * factor,
    };
  }

  /** Check if point is inside damage zone */
  isInDamageZone(ex: number, ey: number): boolean {
    const dx = this.x - ex;
    const dy = this.y - ey;
    return dx * dx + dy * dy < this.radius * this.radius;
  }
}
