import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Lv1: 12 dmg, 3 chains, 300 range, 1.8s cd
  Lv2: +damage    → 18 dmg
  Lv3: +chains    → 4 chains
  Lv4: -cooldown  → 1.4s cd
  Lv5: +range     → 380 range
  Lv6: +chains    → 6 chains
  Lv7: +damage    → 28 dmg
  Lv8: EVOLVE → "Storm Nexus": 3 simultaneous lightning bolts, permanent chain aura
*/

interface LevelData {
  damage: number;
  chains: number;
  range: number;
  cooldown: number;
}

const LEVEL_TABLE: LevelData[] = [
  { damage: 12, chains: 3, range: 300, cooldown: 1.8 },
  { damage: 12, chains: 3, range: 300, cooldown: 1.8 },
  { damage: 18, chains: 3, range: 300, cooldown: 1.8 },
  { damage: 18, chains: 4, range: 300, cooldown: 1.8 },
  { damage: 18, chains: 4, range: 300, cooldown: 1.4 },
  { damage: 18, chains: 4, range: 380, cooldown: 1.4 },
  { damage: 18, chains: 6, range: 380, cooldown: 1.4 },
  { damage: 28, chains: 6, range: 380, cooldown: 1.4 },
  { damage: 20, chains: 10, range: 450, cooldown: 0.4 }, // evolved
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'radius', label: 'upgrade.radius' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

interface LightningBolt {
  points: { x: number; y: number }[];
  life: number;
}

export class ChainLightning extends WeaponBase {
  private fireTimer = 0;
  private bolts: LightningBolt[] = [];
  private boltGraphics: Graphics;
  private boltCount = 1;
  private pendingHits: Enemy[] = [];

  get info(): WeaponInfo {
    return {
      id: 'lightning',
      nameKey: 'weapon.lightning.name',
      descKey: 'weapon.lightning.desc',
      icon: '⚡',
      maxLevel: 8,
      evolveNameKey: 'weapon.lightning.evolve_name',
      evolveDescKey: 'weapon.lightning.evolve_desc',
    };
  }

  get currentDamage(): number { return this.data.damage; }

  private get data(): LevelData {
    return LEVEL_TABLE[Math.min(this.level, LEVEL_TABLE.length - 1)];
  }

  constructor() {
    super();
    this.boltGraphics = new Graphics();
    this.container.addChild(this.boltGraphics);
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
      case 'count': before = `${cur.chains}`; after = `${next.chains}`; break;
      case 'cooldown': before = `${cur.cooldown}s`; after = `${next.cooldown}s`; break;
      case 'radius': before = `${cur.range}`; after = `${next.range}`; break;
      case 'evolve': before = ''; after = 'Storm Nexus'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  protected onEvolve(): void {
    this.boltCount = 3;
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    const d = this.data;
    this.fireTimer -= dt;

    if (this.fireTimer <= 0 && enemies.length > 0) {
      this.fireTimer = d.cooldown * this.cooldownMultiplier;
      const alive = enemies.filter(e => !e.dead);

      for (let b = 0; b < this.boltCount && alive.length > 0; b++) {
        // Start from a different nearby enemy for each bolt
        const sorted = alive.sort((a, bb) =>
          distance(px, py, a.x, a.y) - distance(px, py, bb.x, bb.y));
        const startTarget = sorted[b % sorted.length];
        if (!startTarget || distance(px, py, startTarget.x, startTarget.y) > d.range * this.areaMultiplier) continue;

        const chainTargets: Enemy[] = [startTarget];
        const hit = new Set<Enemy>([startTarget]);
        let lastX = startTarget.x;
        let lastY = startTarget.y;

        for (let i = 1; i < d.chains; i++) {
          let nearest: Enemy | null = null;
          let nearDist = d.range * this.areaMultiplier * 0.6;
          for (const e of alive) {
            if (hit.has(e)) continue;
            const dist = distance(lastX, lastY, e.x, e.y);
            if (dist < nearDist) {
              nearest = e;
              nearDist = dist;
            }
          }
          if (!nearest) break;
          chainTargets.push(nearest);
          hit.add(nearest);
          lastX = nearest.x;
          lastY = nearest.y;
        }

        // Apply damage and collect hits
        for (const target of chainTargets) {
          const fromAngle = Math.atan2(py - target.y, px - target.x);
          target.takeDamage(this.scaledDamage(d.damage), fromAngle);
          this.pendingHits.push(target);
        }

        // Create visual bolt
        const points = [{ x: px, y: py }];
        for (const target of chainTargets) {
          points.push({ x: target.x, y: target.y });
        }
        this.bolts.push({ points, life: 0.15 });
      }
    }

    // Draw bolts
    this.boltGraphics.clear();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.life -= dt;

      if (bolt.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }

      const alpha = bolt.life / 0.15;

      for (let j = 0; j < bolt.points.length - 1; j++) {
        const p1 = bolt.points[j];
        const p2 = bolt.points[j + 1];

        // Jagged lightning segments
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segments = 4;

        this.boltGraphics.moveTo(p1.x, p1.y);
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const mx = p1.x + dx * t + (s < segments ? (Math.random() - 0.5) * 20 : 0);
          const my = p1.y + dy * t + (s < segments ? (Math.random() - 0.5) * 20 : 0);
          this.boltGraphics.lineTo(mx, my);
        }
        this.boltGraphics.stroke({ width: 2, color: 0x88ccff, alpha: alpha * 0.9 });

        // Glow
        this.boltGraphics.moveTo(p1.x, p1.y);
        this.boltGraphics.lineTo(p2.x, p2.y);
        this.boltGraphics.stroke({ width: 6, color: 0x88ccff, alpha: alpha * 0.15 });
      }
    }
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    // Check if any active bolt segment passes near the point
    for (const bolt of this.bolts) {
      for (const p of bolt.points) {
        if (distance(p.x, p.y, x, y) < radius + 15) return true;
      }
    }
    return false;
  }

  getHits(_enemies: Enemy[]): Enemy[] {
    const hits = this.pendingHits.slice();
    this.pendingHits.length = 0;
    return hits;
  }

  override destroy(): void {
    this.boltGraphics.destroy();
    this.bolts.length = 0;
    this.pendingHits.length = 0;
    super.destroy();
  }
}
