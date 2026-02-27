import { Container, Graphics } from 'pixi.js';
import { distance } from '../utils/math';

export interface EnemyDef {
  type: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  color: number;
  shape: 'triangle' | 'diamond' | 'square' | 'pentagon';
  scale?: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  triangle: {
    type: 'triangle', hp: 15, speed: 80, damage: 8, xp: 2,
    radius: 10, color: 0xff3344, shape: 'triangle',
  },
  diamond: {
    type: 'diamond', hp: 30, speed: 60, damage: 12, xp: 4,
    radius: 12, color: 0xff8800, shape: 'diamond',
  },
  square: {
    type: 'square', hp: 50, speed: 50, damage: 15, xp: 6,
    radius: 14, color: 0xcc44ff, shape: 'square',
  },
  pentagon: {
    type: 'pentagon', hp: 80, speed: 40, damage: 20, xp: 10,
    radius: 16, color: 0xff44aa, shape: 'pentagon',
  },
  charger: {
    type: 'charger', hp: 25, speed: 50, damage: 20, xp: 5,
    radius: 11, color: 0xffff44, shape: 'triangle',
  },
  splitter: {
    type: 'splitter', hp: 40, speed: 55, damage: 10, xp: 4,
    radius: 14, color: 0x44ff88, shape: 'square',
  },
};

export class Enemy {
  public container: Container;
  public x: number;
  public y: number;
  public hp: number;
  public maxHp: number;
  public speed: number;
  public damage: number;
  public xpValue: number;
  public radius: number;
  public dead = false;
  public damageCooldown = 0;
  public isBoss = false;
  public enemyType: string;
  public splitOnDeath = false;
  public serverId = -1; // server-assigned ID for multiplayer

  // Server-authoritative position (multiplayer only)
  public serverX = 0;
  public serverY = 0;
  public serverVx = 0;
  public serverVy = 0;
  public lastSyncTime = 0;

  // Charger state
  private chargeTimer = 0;
  private chargeVx = 0;
  private chargeVy = 0;
  private isCharging = false;

  private visual: Graphics;
  private flashTimer = 0;
  private baseSpeed: number;

  constructor(x: number, y: number, def: EnemyDef, difficultyMult: number) {
    this.x = x;
    this.y = y;
    this.hp = Math.floor(def.hp * difficultyMult);
    this.maxHp = this.hp;
    this.speed = def.speed;
    this.damage = Math.floor(def.damage * Math.max(1, difficultyMult * 0.6));
    this.xpValue = def.xp;
    this.radius = def.radius * (def.scale ?? 1);

    this.container = new Container();
    const s = def.scale ?? 1;

    // Glow
    const glow = new Graphics();
    this.drawShape(glow, def.shape, (def.radius + 6) * s, def.color, 0.12);
    this.container.addChild(glow);

    // Body
    this.visual = new Graphics();
    this.drawShape(this.visual, def.shape, def.radius * s, def.color, 1);
    this.container.addChild(this.visual);

    this.container.x = x;
    this.container.y = y;
    this.enemyType = def.type;
    this.baseSpeed = this.speed;
    if (def.type === 'splitter') this.splitOnDeath = true;
  }

  private drawShape(g: Graphics, shape: string, r: number, color: number, alpha: number): void {
    switch (shape) {
      case 'triangle':
        g.poly([r, 0, -r * 0.6, r * 0.8, -r * 0.6, -r * 0.8]);
        break;
      case 'diamond':
        g.poly([0, -r, r * 0.7, 0, 0, r, -r * 0.7, 0]);
        break;
      case 'square':
        g.rect(-r, -r, r * 2, r * 2);
        break;
      case 'pentagon': {
        const pts: number[] = [];
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
          pts.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.poly(pts);
        break;
      }
    }
    g.fill({ color, alpha });
  }

  update(dt: number, playerX: number, playerY: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Charger behavior
    if (this.enemyType === 'charger') {
      this.chargeTimer -= dt;
      if (this.isCharging) {
        this.x += this.chargeVx * dt;
        this.y += this.chargeVy * dt;
        this.chargeVx *= 0.97;
        this.chargeVy *= 0.97;
        if (Math.abs(this.chargeVx) < 20) this.isCharging = false;
      } else if (this.chargeTimer <= 0 && dist < 350) {
        // Initiate charge
        this.chargeTimer = 2.5 + Math.random();
        this.isCharging = true;
        const angle = Math.atan2(dy, dx);
        const chSpeed = 500;
        this.chargeVx = Math.cos(angle) * chSpeed;
        this.chargeVy = Math.sin(angle) * chSpeed;
      } else if (dist > 1) {
        this.x += (dx / dist) * this.speed * 0.6 * dt;
        this.y += (dy / dist) * this.speed * 0.6 * dt;
      }
    } else {
      // Normal movement
      if (dist > 1) {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    }

    this.container.x = this.x;
    this.container.y = this.y;
    this.container.rotation = Math.atan2(dy, dx);

    if (this.damageCooldown > 0) this.damageCooldown -= dt;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.visual.tint = 0xffffff;
    }
  }

  takeDamage(amount: number): void {
    // In multiplayer (serverId >= 0), server controls HP — only show visual feedback
    if (this.serverId >= 0) {
      this.visual.tint = 0xffffff;
      this.flashTimer = 0.08;
      return;
    }
    this.hp -= amount;
    this.visual.tint = 0xffffff;
    this.flashTimer = 0.08;
    if (this.hp <= 0) this.dead = true;
  }

  /** Visual-only damage feedback (flash effect, no HP change) — for multiplayer server-controlled enemies */
  takeDamageVisual(): void {
    this.visual.tint = 0xffffff;
    this.flashTimer = 0.08;
  }

  /** Smooth position-only interpolation toward server snapshot (no dead reckoning) */
  lerpToServer(dt: number): void {
    const dx = this.serverX - this.x;
    const dy = this.serverY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 400) {
      // Snap if way too far
      this.x = this.serverX;
      this.y = this.serverY;
    } else if (dist > 1) {
      // Adaptive lerp: faster when further away, slower when close
      // At 200ms sync interval, factor ~8-12 gives smooth catch-up
      const factor = Math.min(dist < 30 ? 8 : 12, dist * 0.1);
      const t = 1 - Math.exp(-factor * dt);
      this.x += dx * t;
      this.y += dy * t;
    }

    this.container.x = this.x;
    this.container.y = this.y;

    // Face direction: blend toward velocity direction for smooth rotation
    const targetRot = (this.serverVx !== 0 || this.serverVy !== 0)
      ? Math.atan2(this.serverVy, this.serverVx)
      : (dist > 1 ? Math.atan2(dy, dx) : this.container.rotation);
    let rotDiff = targetRot - this.container.rotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.container.rotation += rotDiff * Math.min(1, 8 * dt);

    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.visual.tint = 0xffffff;
    }
  }

  canDamagePlayer(): boolean {
    return this.damageCooldown <= 0;
  }

  resetDamageCooldown(): void {
    this.damageCooldown = 0.8;
  }

  distanceTo(x: number, y: number): number {
    return distance(this.x, this.y, x, y);
  }
}
