import { Container, Graphics } from 'pixi.js';
import { distance } from '../utils/math';

export type EnemyShape = 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'star' | 'crescent';

export interface EnemyDef {
  type: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  color: number;
  shape: EnemyShape;
  scale?: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  triangle: {
    type: 'triangle', hp: 15, speed: 80, damage: 8, xp: 2,
    radius: 10, color: 0xff3344, shape: 'triangle',
  },
  shield: {
    type: 'shield', hp: 40, speed: 45, damage: 15, xp: 7,
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
  zigzag: {
    type: 'zigzag', hp: 20, speed: 90, damage: 10, xp: 3,
    radius: 11, color: 0x22ccff, shape: 'hexagon',
  },
  phaser: {
    type: 'phaser', hp: 35, speed: 55, damage: 15, xp: 5,
    radius: 12, color: 0xee44ff, shape: 'star',
  },
  orbiter: {
    type: 'orbiter', hp: 25, speed: 70, damage: 12, xp: 4,
    radius: 10, color: 0xff8844, shape: 'crescent',
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
  public serverId = -1;

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

  // Zigzag state
  private zigzagPhase = Math.random() * Math.PI * 2;

  // Phaser state
  public isPhasingVisual = false;
  private phaserTimer = 3 + Math.random() * 1.5;
  private phaserState: 'approach' | 'telegraph' | 'invisible' | 'appear' = 'approach';
  private phaserStateTimer = 0;

  // Orbiter state
  private orbitAngle = Math.random() * Math.PI * 2;
  private orbitDashTimer = 4 + Math.random() * 2;
  private orbitDashing = false;
  private orbitDashTime = 0;

  // Shield visual
  private shieldGfx: Graphics | null = null;

  private visual: Graphics;
  private flashTimer = 0;
  public baseSpeed: number;
  public rotation = 0;

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

    // Shield front indicator
    if (def.type === 'shield') {
      this.shieldGfx = new Graphics();
      const r = def.radius * s;
      this.shieldGfx.moveTo(r, -r * 0.7);
      this.shieldGfx.lineTo(r, r * 0.7);
      this.shieldGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
      this.container.addChild(this.shieldGfx);
    }

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
      case 'hexagon': {
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i;
          pts.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.poly(pts);
        break;
      }
      case 'star': {
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI * 2 / 10) * i - Math.PI / 2;
          const rad = i % 2 === 0 ? r : r * 0.5;
          pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        g.poly(pts);
        break;
      }
      case 'crescent': {
        // Crescent moon shape
        g.arc(0, 0, r, -Math.PI * 0.7, Math.PI * 0.7);
        g.arc(r * 0.3, 0, r * 0.7, Math.PI * 0.6, -Math.PI * 0.6, true);
        g.closePath();
        break;
      }
    }
    g.fill({ color, alpha });
  }

  update(dt: number, playerX: number, playerY: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.enemyType === 'charger') {
      this.updateCharger(dt, dx, dy, dist);
    } else if (this.enemyType === 'zigzag') {
      this.updateZigzag(dt, dx, dy, dist);
    } else if (this.enemyType === 'phaser') {
      this.updatePhaser(dt, dx, dy, dist, playerX, playerY);
    } else if (this.enemyType === 'orbiter') {
      this.updateOrbiter(dt, dx, dy, dist, playerX, playerY);
    } else {
      // Normal chase (triangle, pentagon, shield, splitter)
      if (dist > 1) {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    }

    this.container.x = this.x;
    this.container.y = this.y;
    this.rotation = Math.atan2(dy, dx);
    this.container.rotation = this.rotation;

    // Recover speed when not being slowed
    if (this.speed < this.baseSpeed) {
      this.speed = Math.min(this.baseSpeed, this.speed + this.baseSpeed * 2 * dt);
    }

    if (this.damageCooldown > 0) this.damageCooldown -= dt;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.visual.tint = this.speed < this.baseSpeed * 0.95 ? 0x6688ff : 0xffffff;
      }
    } else {
      this.visual.tint = this.speed < this.baseSpeed * 0.95 ? 0x6688ff : 0xffffff;
    }

    // Phaser visual
    if (this.enemyType === 'phaser') {
      if (this.phaserState === 'telegraph') {
        this.container.alpha = 0.4;
        this.container.scale.set(this.container.scale.x * Math.pow(0.98, dt * 60));
      } else if (this.phaserState === 'invisible') {
        this.container.alpha = 0.05;
      } else {
        this.container.alpha = 1;
      }
    }
  }

  private updateCharger(dt: number, dx: number, dy: number, dist: number): void {
    this.chargeTimer -= dt;
    if (this.isCharging) {
      this.x += this.chargeVx * dt;
      this.y += this.chargeVy * dt;
      const friction = Math.pow(0.97, dt * 60);
      this.chargeVx *= friction;
      this.chargeVy *= friction;
      if (Math.abs(this.chargeVx) < 20) this.isCharging = false;
    } else if (this.chargeTimer <= 0 && dist < 350) {
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
  }

  private updateZigzag(dt: number, dx: number, dy: number, dist: number): void {
    this.zigzagPhase += 5 * dt; // 5 rad/s frequency
    if (dist > 1) {
      const moveAngle = Math.atan2(dy, dx);
      // Perpendicular offset for zigzag
      const perpX = -Math.sin(moveAngle);
      const perpY = Math.cos(moveAngle);
      const sinOffset = Math.cos(this.zigzagPhase) * 5 * 80; // derivative of sin * amplitude * freq
      const forwardX = (dx / dist) * this.speed;
      const forwardY = (dy / dist) * this.speed;
      this.x += (forwardX + perpX * sinOffset) * dt;
      this.y += (forwardY + perpY * sinOffset) * dt;
    }
  }

  private updatePhaser(dt: number, dx: number, dy: number, dist: number, playerX: number, playerY: number): void {
    switch (this.phaserState) {
      case 'approach':
        this.phaserTimer -= dt;
        if (dist > 1) {
          this.x += (dx / dist) * this.speed * dt;
          this.y += (dy / dist) * this.speed * dt;
        }
        if (this.phaserTimer <= 0) {
          this.phaserState = 'telegraph';
          this.phaserStateTimer = 0.3;
          this.isPhasingVisual = true;
        }
        break;
      case 'telegraph':
        this.phaserStateTimer -= dt;
        if (this.phaserStateTimer <= 0) {
          this.phaserState = 'invisible';
          this.phaserStateTimer = 0.2;
        }
        break;
      case 'invisible':
        this.phaserStateTimer -= dt;
        if (this.phaserStateTimer <= 0) {
          // Teleport near player
          const angle = Math.random() * Math.PI * 2;
          const tpDist = 80 + Math.random() * 60;
          this.x = playerX + Math.cos(angle) * tpDist;
          this.y = playerY + Math.sin(angle) * tpDist;
          this.phaserState = 'appear';
          this.phaserStateTimer = 0.1;
        }
        break;
      case 'appear':
        this.phaserStateTimer -= dt;
        if (this.phaserStateTimer <= 0) {
          this.phaserState = 'approach';
          this.phaserTimer = 3 + Math.random() * 1.5;
          this.isPhasingVisual = false;
          this.container.scale.set(1);
        }
        break;
    }
  }

  private updateOrbiter(dt: number, dx: number, dy: number, dist: number, playerX: number, playerY: number): void {
    const orbitRadius = 200;

    if (this.orbitDashing) {
      // Dash inward toward player
      this.orbitDashTime -= dt;
      if (dist > 20) {
        this.x += (dx / dist) * this.speed * 3 * dt;
        this.y += (dy / dist) * this.speed * 3 * dt;
      }
      if (this.orbitDashTime <= 0) {
        this.orbitDashing = false;
        this.orbitDashTimer = 4 + Math.random() * 2;
      }
      return;
    }

    this.orbitDashTimer -= dt;
    if (this.orbitDashTimer <= 0 && dist < orbitRadius + 50) {
      this.orbitDashing = true;
      this.orbitDashTime = 0.4;
      return;
    }

    if (dist > orbitRadius + 50) {
      // Move toward orbit range
      if (dist > 1) {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    } else {
      // Orbit around player
      this.orbitAngle += (this.speed / orbitRadius) * dt;
      const targetX = playerX + Math.cos(this.orbitAngle) * orbitRadius;
      const targetY = playerY + Math.sin(this.orbitAngle) * orbitRadius;
      const tdx = targetX - this.x;
      const tdy = targetY - this.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tdist > 1) {
        this.x += (tdx / tdist) * this.speed * 1.5 * dt;
        this.y += (tdy / tdist) * this.speed * 1.5 * dt;
      }
    }
  }

  takeDamage(amount: number, fromAngle?: number): void {
    // In multiplayer (serverId >= 0), server controls HP — only show visual feedback
    if (this.serverId >= 0) {
      this.visual.tint = 0xffffff;
      this.flashTimer = 0.08;
      return;
    }

    // Shield: front 120° arc reduces damage by 75%
    if (this.enemyType === 'shield' && fromAngle !== undefined) {
      let angleDiff = fromAngle - this.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      // Front = within ±60° of facing direction
      if (Math.abs(angleDiff) < Math.PI / 3) {
        amount = Math.floor(amount * 0.25);
      }
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

  /** Interpolate toward predicted server position (server snapshot + velocity extrapolation) */
  lerpToServer(dt: number): void {
    const elapsed = Math.min((Date.now() - this.lastSyncTime) / 1000, 0.15);
    const targetX = this.serverX + this.serverVx * elapsed;
    const targetY = this.serverY + this.serverVy * elapsed;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 400) {
      this.x = targetX;
      this.y = targetY;
    } else if (dist > 1) {
      const factor = Math.min(dist < 30 ? 10 : 15, dist * 0.15);
      const t = 1 - Math.exp(-factor * dt);
      this.x += dx * t;
      this.y += dy * t;
    }

    this.container.x = this.x;
    this.container.y = this.y;

    // Face direction
    const targetRot = (this.serverVx !== 0 || this.serverVy !== 0)
      ? Math.atan2(this.serverVy, this.serverVx)
      : (dist > 1 ? Math.atan2(dy, dx) : this.container.rotation);
    let rotDiff = targetRot - this.container.rotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.container.rotation += rotDiff * Math.min(1, 8 * dt);
    this.rotation = this.container.rotation;

    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.visual.tint = this.speed < this.baseSpeed * 0.95 ? 0x6688ff : 0xffffff;
      }
    } else {
      this.visual.tint = this.speed < this.baseSpeed * 0.95 ? 0x6688ff : 0xffffff;
    }

    // Phaser visual (multiplayer)
    if (this.enemyType === 'phaser') {
      if (this.isPhasingVisual) {
        this.container.alpha = 0.15;
      } else {
        this.container.alpha = 1;
      }
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
