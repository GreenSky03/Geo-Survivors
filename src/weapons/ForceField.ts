import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  ForceField: slows enemies in range + periodic damage + slow visual tint
  Lv1: 8 dmg, 80 radius, 0.4s tick, 50% slow
  Lv2: +damage      → 12 dmg
  Lv3: +radius      → 100 radius
  Lv4: +tick        → 0.35s tick
  Lv5: +damage      → 18 dmg
  Lv6: +radius      → 120 radius
  Lv7: -tick        → 0.25s tick
  Lv8: EVOLVE → "Event Horizon": 180 radius, 70% slow
*/

interface LevelData {
  damage: number;
  radius: number;
  tickRate: number;
  knockback: number;
}

const LEVEL_TABLE: LevelData[] = [
  { damage: 8, radius: 80, tickRate: 0.4, knockback: 0 },
  { damage: 8, radius: 80, tickRate: 0.4, knockback: 0 },
  { damage: 12, radius: 80, tickRate: 0.4, knockback: 0 },
  { damage: 12, radius: 100, tickRate: 0.4, knockback: 0 },
  { damage: 15, radius: 100, tickRate: 0.35, knockback: 0 },
  { damage: 18, radius: 100, tickRate: 0.35, knockback: 0 },
  { damage: 18, radius: 120, tickRate: 0.35, knockback: 0 },
  { damage: 18, radius: 120, tickRate: 0.25, knockback: 0 },
  { damage: 25, radius: 180, tickRate: 0.2, knockback: 0 }, // evolved
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

export class ForceField extends WeaponBase {
  private fieldVisual: Graphics;
  private tickTimer = 0;
  private pulsePhase = 0;

  get info(): WeaponInfo {
    return {
      id: 'forcefield',
      nameKey: 'weapon.forcefield.name',
      descKey: 'weapon.forcefield.desc',
      icon: '◯',
      maxLevel: 8,
      evolveNameKey: 'weapon.forcefield.evolve_name',
      evolveDescKey: 'weapon.forcefield.evolve_desc',
    };
  }

  get currentDamage(): number { return this.data.damage; }

  private get data(): LevelData {
    return LEVEL_TABLE[Math.min(this.level, LEVEL_TABLE.length - 1)];
  }

  constructor() {
    super();
    this.fieldVisual = new Graphics();
    this.container.addChild(this.fieldVisual);
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
      case 'radius': before = `${cur.radius}`; after = `${next.radius}`; break;
      case 'speed': before = `${cur.knockback}`; after = `${next.knockback}`; break;
      case 'cooldown': before = `${cur.tickRate}s`; after = `${next.tickRate}s`; break;
      case 'evolve': before = ''; after = 'Event Horizon'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    const d = this.data;
    this.tickTimer -= dt;
    this.pulsePhase += dt * 3;
    this.container.x = px;
    this.container.y = py;

    // Slow enemies in range (solo only — multiplayer uses server-side slow)
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = distance(px, py, enemy.x, enemy.y);
      if (dist < d.radius * this.areaMultiplier && enemy.serverId < 0) {
        // Apply slow: 50% reduction (evolved: 70%)
        const slowFactor = this.evolved ? 0.3 : 0.5;
        enemy.speed = Math.min(enemy.speed, enemy.baseSpeed * slowFactor);
      }
    }

    // Count enemies being slowed for visual intensity
    let slowedCount = 0;
    for (const enemy of enemies) {
      if (!enemy.dead && distance(px, py, enemy.x, enemy.y) < d.radius * this.areaMultiplier) {
        slowedCount++;
      }
    }

    // Draw field — brighter when actively slowing enemies
    this.fieldVisual.clear();
    const breathe = Math.sin(this.pulsePhase) * 0.05 + 0.95;
    const r = d.radius * this.areaMultiplier * breathe;
    const color = this.evolved ? 0xcc66ff : 0x66aaff;
    const activeBoost = Math.min(slowedCount * 0.015, 0.08);

    // Outer ring
    this.fieldVisual.circle(0, 0, r);
    this.fieldVisual.stroke({ width: this.evolved ? 3 : 2, color, alpha: 0.5 + activeBoost });
    // Fill
    this.fieldVisual.circle(0, 0, r);
    this.fieldVisual.fill({ color, alpha: (this.evolved ? 0.08 : 0.05) + activeBoost });
    // Inner ring
    this.fieldVisual.circle(0, 0, r * 0.7);
    this.fieldVisual.stroke({ width: 1, color, alpha: 0.2 });

    if (this.evolved) {
      // Extra rings for evolved
      this.fieldVisual.circle(0, 0, r * 0.4);
      this.fieldVisual.stroke({ width: 1.5, color: 0xaa44ff, alpha: 0.25 });
    }
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    const px = this.container.x;
    const py = this.container.y;
    return distance(px, py, x, y) < this.data.radius * this.areaMultiplier + radius;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    if (this.tickTimer > 0) return [];
    this.tickTimer = d.tickRate * this.cooldownMultiplier;

    const px = this.container.x;
    const py = this.container.y;
    const hits: Enemy[] = [];

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (distance(px, py, enemy.x, enemy.y) < d.radius * this.areaMultiplier) {
        const fromAngle = Math.atan2(py - enemy.y, px - enemy.x);
        enemy.takeDamage(d.damage, fromAngle);
        hits.push(enemy);
      }
    }
    return hits;
  }
}
