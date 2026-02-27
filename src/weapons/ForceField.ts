import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Lv1: 8 dmg, 60 radius, 0.5s tick, knockback 80
  Lv2: +damage      → 12 dmg
  Lv3: +radius      → 75 radius
  Lv4: +knockback   → 120
  Lv5: +damage      → 18 dmg
  Lv6: +radius      → 90 radius
  Lv7: -tick        → 0.35s tick
  Lv8: EVOLVE → "Event Horizon": massive radius, enemies inside are slowed 50%
*/

interface LevelData {
  damage: number;
  radius: number;
  tickRate: number;
  knockback: number;
}

const LEVEL_TABLE: LevelData[] = [
  { damage: 8, radius: 60, tickRate: 0.5, knockback: 80 },
  { damage: 8, radius: 60, tickRate: 0.5, knockback: 80 },
  { damage: 12, radius: 60, tickRate: 0.5, knockback: 80 },
  { damage: 12, radius: 75, tickRate: 0.5, knockback: 80 },
  { damage: 12, radius: 75, tickRate: 0.5, knockback: 120 },
  { damage: 18, radius: 75, tickRate: 0.5, knockback: 120 },
  { damage: 18, radius: 90, tickRate: 0.5, knockback: 120 },
  { damage: 18, radius: 90, tickRate: 0.35, knockback: 120 },
  { damage: 22, radius: 140, tickRate: 0.3, knockback: 150 }, // evolved
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'speed', label: 'upgrade.speed' },    // knockback as "speed"
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

    // Knockback & slow enemies in range
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = distance(px, py, enemy.x, enemy.y);
      if (dist < d.radius && dist > 1) {
        // Knockback
        const dx = enemy.x - px;
        const dy = enemy.y - py;
        const pushStr = d.knockback * dt / dist;
        enemy.x += dx * pushStr;
        enemy.y += dy * pushStr;

        // Evolved: slow enemies inside
        if (this.evolved) {
          enemy.speed = Math.max(20, enemy.speed * 0.98);
        }
      }
    }

    // Draw field
    this.fieldVisual.clear();
    const breathe = Math.sin(this.pulsePhase) * 0.05 + 0.95;
    const r = d.radius * breathe;
    const color = this.evolved ? 0xcc66ff : 0x66aaff;

    // Outer ring
    this.fieldVisual.circle(0, 0, r);
    this.fieldVisual.stroke({ width: 2, color, alpha: 0.4 });
    // Fill
    this.fieldVisual.circle(0, 0, r);
    this.fieldVisual.fill({ color, alpha: this.evolved ? 0.06 : 0.03 });
    // Inner ring
    this.fieldVisual.circle(0, 0, r * 0.7);
    this.fieldVisual.stroke({ width: 1, color, alpha: 0.15 });

    if (this.evolved) {
      // Extra ring for evolved
      this.fieldVisual.circle(0, 0, r * 0.4);
      this.fieldVisual.stroke({ width: 1, color: 0xaa44ff, alpha: 0.2 });
    }
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    const px = this.container.x;
    const py = this.container.y;
    return distance(px, py, x, y) < this.data.radius + radius;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    if (this.tickTimer > 0) return [];
    this.tickTimer = d.tickRate;

    const px = this.container.x;
    const py = this.container.y;
    const hits: Enemy[] = [];

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (distance(px, py, enemy.x, enemy.y) < d.radius) {
        enemy.takeDamage(d.damage);
        hits.push(enemy);
      }
    }
    return hits;
  }
}
