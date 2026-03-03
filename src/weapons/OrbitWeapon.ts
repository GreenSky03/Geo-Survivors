import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';

/*
  Level progression:
  Lv1: 3 orbs, 10 dmg, size 10, speed 2.5, radius 90
  Lv2: +damage    → 18 dmg
  Lv3: +1 orb     → 4 orbs
  Lv4: +speed     → orbit speed 3.2
  Lv5: +size      → size 16
  Lv6: +1 orb     → 5 orbs
  Lv7: +damage    → 30 dmg
  Lv8: EVOLVE → "Singularity": orbs become a continuous vortex that pulls enemies inward
*/

interface LevelData {
  orbCount: number;
  damage: number;
  orbSize: number;
  orbSpeed: number;
  radius: number;
}

const LEVEL_TABLE: LevelData[] = [
  /* 0 dummy */ { orbCount: 3, damage: 10, orbSize: 10, orbSpeed: 2.5, radius: 90 },
  /* Lv1 */     { orbCount: 3, damage: 10, orbSize: 10, orbSpeed: 2.5, radius: 90 },
  /* Lv2 */     { orbCount: 3, damage: 18, orbSize: 10, orbSpeed: 2.5, radius: 90 },
  /* Lv3 */     { orbCount: 4, damage: 18, orbSize: 10, orbSpeed: 2.5, radius: 90 },
  /* Lv4 */     { orbCount: 4, damage: 18, orbSize: 10, orbSpeed: 3.2, radius: 90 },
  /* Lv5 */     { orbCount: 4, damage: 18, orbSize: 16, orbSpeed: 3.2, radius: 100 },
  /* Lv6 */     { orbCount: 5, damage: 18, orbSize: 16, orbSpeed: 3.2, radius: 100 },
  /* Lv7 */     { orbCount: 5, damage: 30, orbSize: 16, orbSpeed: 3.2, radius: 100 },
  /* Lv8 */     { orbCount: 8, damage: 40, orbSize: 18, orbSpeed: 4.5, radius: 120 },
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  /* to Lv2 */ { stat: 'damage', label: 'upgrade.damage' },
  /* to Lv3 */ { stat: 'count', label: 'upgrade.count' },
  /* to Lv4 */ { stat: 'speed', label: 'upgrade.speed' },
  /* to Lv5 */ { stat: 'size', label: 'upgrade.size' },
  /* to Lv6 */ { stat: 'count', label: 'upgrade.count' },
  /* to Lv7 */ { stat: 'damage', label: 'upgrade.damage' },
  /* to Lv8 */ { stat: 'evolve', label: 'upgrade.evolve' },
];

export class OrbitWeapon extends WeaponBase {
  private angle = 0;
  private orbs: Graphics[] = [];
  private orbHitCooldowns: Map<Enemy, number> = new Map();

  // Singularity evolution state
  public pullStrength = 0;
  public pullRadius = 0;
  /** Set to true in multiplayer to send pull requests to server instead of local pull */
  public useServerPull = false;

  get info(): WeaponInfo {
    return {
      id: 'orbit',
      nameKey: 'weapon.orbit.name',
      descKey: 'weapon.orbit.desc',
      icon: '◆',
      maxLevel: 8,
      evolveNameKey: 'weapon.orbit.evolve_name',
      evolveDescKey: 'weapon.orbit.evolve_desc',
    };
  }

  get currentDamage(): number { return this.data.damage; }

  private get data(): LevelData {
    return LEVEL_TABLE[Math.min(this.level, LEVEL_TABLE.length - 1)];
  }

  getNextUpgrade(): LevelUpgrade | null {
    if (this.level >= 8) return null;
    const idx = this.level - 1; // upgrade index (0-based)
    if (idx >= UPGRADE_DESCRIPTIONS.length) return null;

    const desc = UPGRADE_DESCRIPTIONS[idx];
    const cur = LEVEL_TABLE[this.level];
    const next = LEVEL_TABLE[this.level + 1];

    let before = '';
    let after = '';
    switch (desc.stat) {
      case 'damage': before = `${cur.damage}`; after = `${next.damage}`; break;
      case 'count': before = `${cur.orbCount}`; after = `${next.orbCount}`; break;
      case 'speed': before = `${cur.orbSpeed}`; after = `${next.orbSpeed}`; break;
      case 'size': before = `${cur.orbSize}`; after = `${next.orbSize}`; break;
      case 'evolve': before = ''; after = 'Singularity'; break;
    }

    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  protected onEvolve(): void {
    this.pullStrength = 60;
    this.pullRadius = this.data.radius + 80;
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    const d = this.data;
    this.angle += d.orbSpeed * dt;

    // Sync orb visuals
    while (this.orbs.length < d.orbCount) {
      const orb = new Graphics();
      this.container.addChild(orb);
      this.orbs.push(orb);
    }
    while (this.orbs.length > d.orbCount) {
      const orb = this.orbs.pop()!;
      this.container.removeChild(orb);
      orb.destroy();
    }

    const color = this.evolved ? 0xaa44ff : 0x33ffcc;
    const glowColor = this.evolved ? 0xcc66ff : 0x33ffcc;

    for (let i = 0; i < this.orbs.length; i++) {
      const a = this.angle + (Math.PI * 2 / this.orbs.length) * i;
      const ox = px + Math.cos(a) * d.radius;
      const oy = py + Math.sin(a) * d.radius;

      const orb = this.orbs[i];
      orb.clear();
      const s = d.orbSize;
      orb.poly([0, -s, s * 0.7, 0, 0, s, -s * 0.7, 0]);
      orb.fill({ color, alpha: 0.9 });
      const g = s + 5;
      orb.poly([0, -g, g * 0.7, 0, 0, g, -g * 0.7, 0]);
      orb.fill({ color: glowColor, alpha: 0.12 });
      orb.x = ox;
      orb.y = oy;
      orb.rotation = a;
    }

    // Singularity pull effect
    // In multiplayer: visual-only pull on client (server handles actual position changes)
    // In solo: apply pull directly
    if (this.evolved && this.pullStrength > 0) {
      this.pullRadius = d.radius + 80;
      if (!this.useServerPull) {
        // Solo mode: apply pull directly
        for (const enemy of enemies) {
          if (enemy.dead) continue;
          const dx = px - enemy.x;
          const dy = py - enemy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.pullRadius && dist > 30) {
            enemy.x += (dx / dist) * this.pullStrength * dt;
            enemy.y += (dy / dist) * this.pullStrength * dt;
          }
        }
      }
      // In multiplayer, Game.ts sends pull_request to server
    }

    // Decay cooldowns
    for (const [enemy, cd] of this.orbHitCooldowns) {
      if (enemy.dead) {
        this.orbHitCooldowns.delete(enemy);
      } else {
        const newCd = cd - dt;
        if (newCd <= 0) this.orbHitCooldowns.delete(enemy);
        else this.orbHitCooldowns.set(enemy, newCd);
      }
    }
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    for (const orb of this.orbs) {
      const dx = orb.x - x;
      const dy = orb.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < this.data.orbSize + radius) return true;
    }
    return false;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    const hits: Enemy[] = [];
    for (const orb of this.orbs) {
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        if (this.orbHitCooldowns.has(enemy)) continue;
        const dx = orb.x - enemy.x;
        const dy = orb.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < d.orbSize + enemy.radius) {
          const fromAngle = Math.atan2(orb.y - enemy.y, orb.x - enemy.x);
          enemy.takeDamage(d.damage, fromAngle);
          this.orbHitCooldowns.set(enemy, this.evolved ? 0.15 : 0.3);
          hits.push(enemy);
        }
      }
    }
    return hits;
  }
}
