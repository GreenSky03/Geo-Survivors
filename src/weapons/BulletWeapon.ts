import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Level progression:
  Lv1: 1 shot, 10 dmg, 0.6s cd, 1 pierce, 500 spd
  Lv2: +damage       → 16 dmg
  Lv3: -cooldown     → 0.45s cd
  Lv4: +pierce       → 2 pierce
  Lv5: +1 projectile → 2 shots
  Lv6: +damage       → 24 dmg
  Lv7: -cooldown     → 0.3s cd
  Lv8: EVOLVE → "Ray Blaster": fires continuous laser beam
*/

interface LevelData {
  bulletCount: number;
  damage: number;
  cooldown: number;
  pierce: number;
  bulletSpeed: number;
}

const LEVEL_TABLE: LevelData[] = [
  /* 0 */ { bulletCount: 1, damage: 10, cooldown: 0.6, pierce: 1, bulletSpeed: 500 },
  /* 1 */ { bulletCount: 1, damage: 10, cooldown: 0.6, pierce: 1, bulletSpeed: 500 },
  /* 2 */ { bulletCount: 1, damage: 16, cooldown: 0.6, pierce: 1, bulletSpeed: 500 },
  /* 3 */ { bulletCount: 1, damage: 16, cooldown: 0.45, pierce: 1, bulletSpeed: 500 },
  /* 4 */ { bulletCount: 1, damage: 16, cooldown: 0.45, pierce: 2, bulletSpeed: 500 },
  /* 5 */ { bulletCount: 2, damage: 16, cooldown: 0.45, pierce: 2, bulletSpeed: 500 },
  /* 6 */ { bulletCount: 2, damage: 24, cooldown: 0.45, pierce: 2, bulletSpeed: 550 },
  /* 7 */ { bulletCount: 2, damage: 24, cooldown: 0.30, pierce: 2, bulletSpeed: 550 },
  /* 8 */ { bulletCount: 3, damage: 35, cooldown: 0.0, pierce: 999, bulletSpeed: 0 },
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'pierce', label: 'upgrade.pierce' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  graphic: Graphics;
  life: number;
  pierceLeft: number;
  hitSet: Set<Enemy>;
}

interface LaserBeam {
  graphic: Graphics;
  target: Enemy | null;
  damageTimer: number;
}

export class BulletWeapon extends WeaponBase {
  private bullets: Bullet[] = [];
  private fireTimer = 0;

  // Ray Blaster evolution
  private beams: LaserBeam[] = [];
  private pendingBeamHits: Enemy[] = [];

  get info(): WeaponInfo {
    return {
      id: 'bullet',
      nameKey: 'weapon.bullet.name',
      descKey: 'weapon.bullet.desc',
      icon: '▸',
      maxLevel: 8,
      evolveNameKey: 'weapon.bullet.evolve_name',
      evolveDescKey: 'weapon.bullet.evolve_desc',
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
      case 'pierce': before = `${cur.pierce}`; after = `${next.pierce}`; break;
      case 'count': before = `${cur.bulletCount}`; after = `${next.bulletCount}`; break;
      case 'evolve': before = ''; after = 'Ray Blaster'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  protected onEvolve(): void {
    // Clear old bullets
    for (const b of this.bullets) {
      this.container.removeChild(b.graphic);
      b.graphic.destroy();
    }
    this.bullets = [];

    // Create beam graphics
    for (let i = 0; i < this.data.bulletCount; i++) {
      const g = new Graphics();
      this.container.addChild(g);
      this.beams.push({ graphic: g, target: null, damageTimer: 0 });
    }
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    if (this.evolved) {
      this.updateBeams(dt, px, py, enemies);
      return;
    }

    const d = this.data;
    this.fireTimer -= dt;

    if (this.fireTimer <= 0 && enemies.length > 0) {
      this.fireTimer = d.cooldown * this.cooldownMultiplier;
      const sorted = enemies
        .filter(e => !e.dead)
        .sort((a, b) => distance(px, py, a.x, a.y) - distance(px, py, b.x, b.y));

      for (let i = 0; i < d.bulletCount && i < sorted.length; i++) {
        const target = sorted[i];
        const angle = Math.atan2(target.y - py, target.x - px);
        this.spawnBullet(px, py, angle);
      }
    }

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.graphic.x = b.x;
      b.graphic.y = b.y;
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.bullets[i].life <= 0 || this.bullets[i].pierceLeft <= 0) {
        this.container.removeChild(this.bullets[i].graphic);
        this.bullets[i].graphic.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateBeams(dt: number, px: number, py: number, enemies: Enemy[]): void {
    const d = this.data;
    const aliveEnemies = enemies.filter(e => !e.dead)
      .sort((a, b) => distance(px, py, a.x, a.y) - distance(px, py, b.x, b.y));

    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i];
      beam.graphic.clear();

      // Assign target
      if (!beam.target || beam.target.dead || distance(px, py, beam.target.x, beam.target.y) > 600) {
        beam.target = aliveEnemies[i] ?? null;
      }

      if (beam.target) {
        // Draw laser line
        beam.graphic.moveTo(px, py);
        beam.graphic.lineTo(beam.target.x, beam.target.y);
        beam.graphic.stroke({ width: 3, color: 0xffee44, alpha: 0.8 });
        // Glow
        beam.graphic.moveTo(px, py);
        beam.graphic.lineTo(beam.target.x, beam.target.y);
        beam.graphic.stroke({ width: 8, color: 0xffee44, alpha: 0.15 });

        beam.damageTimer -= dt;
        if (beam.damageTimer <= 0) {
          beam.damageTimer = 0.1;
          const fromAngle = Math.atan2(py - beam.target.y, px - beam.target.x);
          beam.target.takeDamage(this.scaledDamage(d.damage), fromAngle);
          this.pendingBeamHits.push(beam.target);
        }
      }
    }
  }

  private spawnBullet(x: number, y: number, angle: number): void {
    const d = this.data;
    const g = new Graphics();
    g.circle(0, 0, 4);
    g.fill({ color: 0xffee44, alpha: 0.95 });
    g.circle(0, 0, 7);
    g.fill({ color: 0xffee44, alpha: 0.15 });
    g.x = x;
    g.y = y;
    this.container.addChild(g);

    this.bullets.push({
      x, y,
      vx: Math.cos(angle) * d.bulletSpeed,
      vy: Math.sin(angle) * d.bulletSpeed,
      graphic: g, life: 2,
      pierceLeft: d.pierce,
      hitSet: new Set(),
    });
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    if (this.evolved) {
      // Check if any beam target is near the point
      for (const beam of this.beams) {
        if (!beam.target) continue;
        // Check if the beam line passes near the point (simplified: check endpoints)
        const dx = beam.target.x - x;
        const dy = beam.target.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < radius + 10) return true;
      }
      return false;
    }
    for (const b of this.bullets) {
      const dx = b.x - x;
      const dy = b.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 6 + radius) return true;
    }
    return false;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    if (this.evolved) {
      const hits = this.pendingBeamHits.slice();
      this.pendingBeamHits.length = 0;
      return hits;
    }
    const d = this.data;
    const hits: Enemy[] = [];
    for (const b of this.bullets) {
      for (const enemy of enemies) {
        if (enemy.dead || b.hitSet.has(enemy)) continue;
        const dist = distance(b.x, b.y, enemy.x, enemy.y);
        if (dist < 6 + enemy.radius) {
          const fromAngle = Math.atan2(b.y - enemy.y, b.x - enemy.x);
          enemy.takeDamage(this.scaledDamage(d.damage), fromAngle);
          b.hitSet.add(enemy);
          b.pierceLeft--;
          hits.push(enemy);
          if (b.pierceLeft <= 0) break;
        }
      }
    }
    return hits;
  }
}
