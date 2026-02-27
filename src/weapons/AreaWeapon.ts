import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Level progression:
  Lv1: 20 dmg, 120 radius, 2.5s cooldown
  Lv2: +damage    → 30 dmg
  Lv3: +radius    → 150 radius
  Lv4: -cooldown  → 2.0s cd
  Lv5: +damage    → 42 dmg
  Lv6: +radius    → 180 radius
  Lv7: -cooldown  → 1.5s cd
  Lv8: EVOLVE → "Eternal Pulse": permanent damage aura, no cooldown
*/

interface LevelData {
  damage: number;
  radius: number;
  cooldown: number;
}

const LEVEL_TABLE: LevelData[] = [
  /* 0 */ { damage: 20, radius: 120, cooldown: 2.5 },
  /* 1 */ { damage: 20, radius: 120, cooldown: 2.5 },
  /* 2 */ { damage: 30, radius: 120, cooldown: 2.5 },
  /* 3 */ { damage: 30, radius: 150, cooldown: 2.5 },
  /* 4 */ { damage: 30, radius: 150, cooldown: 2.0 },
  /* 5 */ { damage: 42, radius: 150, cooldown: 2.0 },
  /* 6 */ { damage: 42, radius: 180, cooldown: 2.0 },
  /* 7 */ { damage: 42, radius: 180, cooldown: 1.5 },
  /* 8 */ { damage: 25, radius: 200, cooldown: 0 }, // permanent but lower per-tick
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

export class AreaWeapon extends WeaponBase {
  private pulseTimer = 0;
  private pulseVisual: Graphics;
  private pulseAlpha = 0;

  // Eternal Pulse evolution
  private auraDamageTimer = 0;
  private auraVisual: Graphics | null = null;

  get info(): WeaponInfo {
    return {
      id: 'area',
      nameKey: 'weapon.area.name',
      descKey: 'weapon.area.desc',
      icon: '◎',
      maxLevel: 8,
      evolveNameKey: 'weapon.area.evolve_name',
      evolveDescKey: 'weapon.area.evolve_desc',
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
      case 'radius': before = `${cur.radius}`; after = `${next.radius}`; break;
      case 'cooldown': before = `${cur.cooldown}s`; after = `${next.cooldown}s`; break;
      case 'evolve': before = ''; after = 'Eternal Pulse'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  constructor() {
    super();
    this.pulseVisual = new Graphics();
    this.container.addChild(this.pulseVisual);
    this.pulseTimer = 2.5;
  }

  protected onEvolve(): void {
    this.auraVisual = new Graphics();
    this.container.addChild(this.auraVisual);
  }

  update(dt: number, px: number, py: number, _enemies: Enemy[]): void {
    const d = this.data;

    if (this.evolved) {
      // Eternal Pulse: permanent aura
      this.auraDamageTimer -= dt;
      if (this.auraVisual) {
        this.auraVisual.clear();
        const breathe = Math.sin(performance.now() / 300) * 0.03 + 0.97;
        const r = d.radius * breathe;
        this.auraVisual.circle(0, 0, r);
        this.auraVisual.stroke({ color: 0x44ffaa, alpha: 0.3, width: 2 });
        this.auraVisual.circle(0, 0, r);
        this.auraVisual.fill({ color: 0x44ffaa, alpha: 0.04 });
        // Inner ring
        this.auraVisual.circle(0, 0, r * 0.6);
        this.auraVisual.stroke({ color: 0x44ffaa, alpha: 0.15, width: 1 });
      }
      this.container.x = px;
      this.container.y = py;
      this.pulseVisual.clear();
      return;
    }

    // Normal pulse mode
    this.pulseTimer -= dt;

    if (this.pulseTimer <= 0) {
      this.pulseTimer = d.cooldown;
      this.pulseAlpha = 0.5;
    }

    if (this.pulseAlpha > 0) {
      this.pulseAlpha -= dt * 1.5;
      this.pulseVisual.clear();
      const r = d.radius * (1 - this.pulseAlpha * 0.5);
      this.pulseVisual.circle(0, 0, r);
      this.pulseVisual.stroke({ color: 0x44ffaa, alpha: Math.max(0, this.pulseAlpha), width: 2 });
      this.pulseVisual.circle(0, 0, r);
      this.pulseVisual.fill({ color: 0x44ffaa, alpha: Math.max(0, this.pulseAlpha * 0.08) });
    } else {
      this.pulseVisual.clear();
    }

    this.container.x = px;
    this.container.y = py;
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    const px = this.container.x;
    const py = this.container.y;
    const d = this.data;
    if (this.evolved) {
      return distance(px, py, x, y) < d.radius + radius;
    }
    // Only hit during pulse
    if (this.pulseAlpha > 0.1) {
      return distance(px, py, x, y) < d.radius + radius;
    }
    return false;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    const px = this.container.x;
    const py = this.container.y;

    if (this.evolved) {
      // Continuous aura damage
      if (this.auraDamageTimer <= 0) {
        this.auraDamageTimer = 0.25; // damage tick interval
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
      return [];
    }

    // Normal: only hit on pulse frame
    if (this.pulseTimer > this.data.cooldown - 0.05) {
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
    return [];
  }
}
