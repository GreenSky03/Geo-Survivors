import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Level progression:
  Lv1: 1 boomerang, 12 dmg, 1.2s cd, range 250, speed 400
  Lv2: +damage     → 18
  Lv3: -cooldown   → 1.0s
  Lv4: +1 boomerang → 2
  Lv5: +range      → 320
  Lv6: +damage     → 26
  Lv7: -cooldown   → 0.7s
  Lv8: EVOLVE → "Blade Storm": 4 boomerangs, 35 dmg, spiral trajectory, 0.3s cd
*/

interface LevelData {
  count: number;
  damage: number;
  cooldown: number;
  range: number;
  speed: number;
}

const LEVEL_TABLE: LevelData[] = [
  /* 0 */ { count: 1, damage: 12, cooldown: 1.2, range: 250, speed: 400 },
  /* 1 */ { count: 1, damage: 12, cooldown: 1.2, range: 250, speed: 400 },
  /* 2 */ { count: 1, damage: 18, cooldown: 1.2, range: 250, speed: 400 },
  /* 3 */ { count: 1, damage: 18, cooldown: 1.0, range: 250, speed: 400 },
  /* 4 */ { count: 2, damage: 18, cooldown: 1.0, range: 250, speed: 400 },
  /* 5 */ { count: 2, damage: 18, cooldown: 1.0, range: 320, speed: 400 },
  /* 6 */ { count: 2, damage: 26, cooldown: 1.0, range: 320, speed: 420 },
  /* 7 */ { count: 2, damage: 26, cooldown: 0.7, range: 320, speed: 420 },
  /* 8 */ { count: 4, damage: 35, cooldown: 0.3, range: 350, speed: 500 },
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

interface Boomerang {
  x: number; y: number;
  startX: number; startY: number;
  angle: number;
  t: number; // 0→1 outgoing, 1→2 return
  graphic: Graphics;
  hitSet: Set<Enemy>;
  rotation: number;
}

export class BoomerangWeapon extends WeaponBase {
  private boomerangs: Boomerang[] = [];
  private fireTimer = 0;
  // Evolved spiral state
  private spiralAngles: number[] = [];
  private spiralGraphics: Graphics[] = [];
  private spiralTime = 0;
  private spiralHitCooldowns: Map<Enemy, number> = new Map();

  get info(): WeaponInfo {
    return {
      id: 'boomerang',
      nameKey: 'weapon.boomerang.name',
      descKey: 'weapon.boomerang.desc',
      icon: '◇',
      maxLevel: 8,
      evolveNameKey: 'weapon.boomerang.evolve_name',
      evolveDescKey: 'weapon.boomerang.evolve_desc',
    };
  }

  get currentDamage(): number { return this.data.damage; }

  private get data(): LevelData {
    return LEVEL_TABLE[Math.min(this.level, LEVEL_TABLE.length - 1)];
  }

  getNextUpgrade(): LevelUpgrade | null {
    if (this.level >= 8) return null;
    const idx = this.level - 1;
    if (idx >= UPGRADE_DESCRIPTIONS.length) return null;
    const desc = UPGRADE_DESCRIPTIONS[idx];
    const cur = LEVEL_TABLE[this.level];
    const next = LEVEL_TABLE[this.level + 1];

    let before = '', after = '';
    switch (desc.stat) {
      case 'damage': before = `${cur.damage}`; after = `${next.damage}`; break;
      case 'cooldown': before = `${cur.cooldown}s`; after = `${next.cooldown}s`; break;
      case 'count': before = `${cur.count}`; after = `${next.count}`; break;
      case 'radius': before = `${cur.range}`; after = `${next.range}`; break;
      case 'evolve': before = ''; after = 'Blade Storm'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  protected onEvolve(): void {
    // Clean up existing boomerangs
    for (const b of this.boomerangs) {
      this.container.removeChild(b.graphic);
      b.graphic.destroy();
    }
    this.boomerangs = [];

    // Create spiral boomerangs
    const d = this.data;
    for (let i = 0; i < d.count; i++) {
      const g = new Graphics();
      this.drawBoomerangGraphic(g, true);
      this.container.addChild(g);
      this.spiralGraphics.push(g);
      this.spiralAngles.push((Math.PI * 2 / d.count) * i);
    }
  }

  private drawBoomerangGraphic(g: Graphics, evolved = false): void {
    g.clear();
    const color = evolved ? 0xff8844 : 0xff6633;
    const size = evolved ? 10 : 8;
    // Diamond shape (rotated square)
    g.poly([0, -size, size, 0, 0, size, -size, 0]);
    g.fill({ color, alpha: 0.9 });
    // Inner glow
    const iSize = size * 0.5;
    g.poly([0, -iSize, iSize, 0, 0, iSize, -iSize, 0]);
    g.fill({ color: 0xffcc88, alpha: 0.4 });
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    if (this.evolved) {
      this.updateSpiral(dt, px, py, enemies);
      return;
    }

    const d = this.data;
    this.fireTimer -= dt;

    if (this.fireTimer <= 0 && enemies.length > 0) {
      this.fireTimer = d.cooldown * this.cooldownMultiplier;
      const sorted = enemies
        .filter(e => !e.dead)
        .sort((a, b) => distance(px, py, a.x, a.y) - distance(px, py, b.x, b.y));

      for (let i = 0; i < d.count; i++) {
        const target = sorted[i % sorted.length];
        const angle = Math.atan2(target.y - py, target.x - px);
        this.spawnBoomerang(px, py, angle);
      }
    }

    // Update boomerangs (bezier curve out and back)
    for (const b of this.boomerangs) {
      b.t += dt * (d.speed / d.range);
      b.rotation += dt * 12; // spin

      if (b.t <= 1) {
        // Outgoing: bezier curve
        const t = b.t;
        const perpX = -Math.sin(b.angle) * d.range * 0.4;
        const perpY = Math.cos(b.angle) * d.range * 0.4;
        const endX = b.startX + Math.cos(b.angle) * d.range;
        const endY = b.startY + Math.sin(b.angle) * d.range;
        const cpX = (b.startX + endX) / 2 + perpX;
        const cpY = (b.startY + endY) / 2 + perpY;
        // Quadratic bezier
        const it = 1 - t;
        b.x = it * it * b.startX + 2 * it * t * cpX + t * t * endX;
        b.y = it * it * b.startY + 2 * it * t * cpY + t * t * endY;
      } else {
        // Returning: straight back to current player pos
        const rt = Math.min(b.t - 1, 1);
        const endX = b.startX + Math.cos(b.angle) * d.range;
        const endY = b.startY + Math.sin(b.angle) * d.range;
        b.x = endX + (px - endX) * rt;
        b.y = endY + (py - endY) * rt;
      }

      b.graphic.x = b.x;
      b.graphic.y = b.y;
      b.graphic.rotation = b.rotation;
    }

    // Remove completed boomerangs
    for (let i = this.boomerangs.length - 1; i >= 0; i--) {
      if (this.boomerangs[i].t >= 2) {
        this.container.removeChild(this.boomerangs[i].graphic);
        this.boomerangs[i].graphic.destroy();
        this.boomerangs.splice(i, 1);
      }
    }
  }

  private updateSpiral(dt: number, px: number, py: number, _enemies: Enemy[]): void {
    const d = this.data;
    this.spiralTime += dt;

    // Tick down spiral hit cooldowns
    for (const [enemy, cd] of this.spiralHitCooldowns) {
      const remaining = cd - dt;
      if (remaining <= 0 || enemy.dead) this.spiralHitCooldowns.delete(enemy);
      else this.spiralHitCooldowns.set(enemy, remaining);
    }

    // Spiral outward and inward
    const spiralSpeed = 4; // rotations per second
    const maxRadius = d.range;

    for (let i = 0; i < this.spiralGraphics.length; i++) {
      this.spiralAngles[i] += spiralSpeed * dt * Math.PI * 2 / this.spiralGraphics.length;
      const baseAngle = this.spiralAngles[i] + this.spiralTime * spiralSpeed;
      // Pulsating radius
      const pulseT = (Math.sin(this.spiralTime * 2) + 1) / 2;
      const radius = maxRadius * (0.3 + pulseT * 0.7);

      const g = this.spiralGraphics[i];
      g.x = px + Math.cos(baseAngle) * radius;
      g.y = py + Math.sin(baseAngle) * radius;
      g.rotation += dt * 15;
    }
  }

  private spawnBoomerang(x: number, y: number, angle: number): void {
    const g = new Graphics();
    this.drawBoomerangGraphic(g);
    g.x = x;
    g.y = y;
    this.container.addChild(g);

    this.boomerangs.push({
      x, y, startX: x, startY: y,
      angle, t: 0, graphic: g,
      hitSet: new Set(), rotation: 0,
    });
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    if (this.evolved) {
      for (const g of this.spiralGraphics) {
        const dx = g.x - x;
        const dy = g.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < radius + 12) return true;
      }
      return false;
    }
    for (const b of this.boomerangs) {
      const dx = b.x - x;
      const dy = b.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < radius + 10) return true;
    }
    return false;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    const hits: Enemy[] = [];

    if (this.evolved) {
      // Spiral hits (with cooldown per enemy to prevent infinite DPS)
      for (const g of this.spiralGraphics) {
        for (const enemy of enemies) {
          if (enemy.dead || this.spiralHitCooldowns.has(enemy)) continue;
          const dist = distance(g.x, g.y, enemy.x, enemy.y);
          if (dist < 12 + enemy.radius) {
            const fromAngle = Math.atan2(g.y - enemy.y, g.x - enemy.x);
            enemy.takeDamage(this.scaledDamage(d.damage), fromAngle);
            this.spiralHitCooldowns.set(enemy, 0.25);
            hits.push(enemy);
          }
        }
      }
      return hits;
    }

    for (const b of this.boomerangs) {
      for (const enemy of enemies) {
        if (enemy.dead || b.hitSet.has(enemy)) continue;
        const dist = distance(b.x, b.y, enemy.x, enemy.y);
        if (dist < 10 + enemy.radius) {
          const fromAngle = Math.atan2(b.y - enemy.y, b.x - enemy.x);
          enemy.takeDamage(this.scaledDamage(d.damage), fromAngle);
          b.hitSet.add(enemy);
          hits.push(enemy);
        }
      }
    }
    return hits;
  }

  override destroy(): void {
    for (const b of this.boomerangs) b.graphic.destroy();
    for (const g of this.spiralGraphics) g.destroy();
    this.boomerangs.length = 0;
    this.spiralGraphics.length = 0;
    this.spiralHitCooldowns.clear();
    super.destroy();
  }
}
