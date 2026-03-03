import { Graphics } from 'pixi.js';
import { WeaponBase, WeaponInfo, LevelUpgrade } from './WeaponBase';
import { Enemy } from '../entities/Enemy';
import { distance } from '../utils/math';

/*
  Level progression:
  Lv1: 1 missile, 15 dmg, 2.0s cd, speed 200, tracking 3.0 rad/s
  Lv2: +damage       → 22
  Lv3: +tracking     → 4.0 rad/s
  Lv4: +1 missile    → 2
  Lv5: -cooldown     → 1.5s
  Lv6: +damage       → 30
  Lv7: +1 missile    → 3
  Lv8: EVOLVE → "Cluster Barrage": 3 missiles, 40 dmg, split into 3 on hit
*/

interface LevelData {
  missileCount: number;
  damage: number;
  cooldown: number;
  speed: number;
  tracking: number; // rad/s
}

const LEVEL_TABLE: LevelData[] = [
  /* 0 */ { missileCount: 1, damage: 15, cooldown: 2.0, speed: 200, tracking: 3.0 },
  /* 1 */ { missileCount: 1, damage: 15, cooldown: 2.0, speed: 200, tracking: 3.0 },
  /* 2 */ { missileCount: 1, damage: 22, cooldown: 2.0, speed: 200, tracking: 3.0 },
  /* 3 */ { missileCount: 1, damage: 22, cooldown: 2.0, speed: 200, tracking: 4.0 },
  /* 4 */ { missileCount: 2, damage: 22, cooldown: 2.0, speed: 200, tracking: 4.0 },
  /* 5 */ { missileCount: 2, damage: 22, cooldown: 1.5, speed: 220, tracking: 4.0 },
  /* 6 */ { missileCount: 2, damage: 30, cooldown: 1.5, speed: 220, tracking: 4.5 },
  /* 7 */ { missileCount: 3, damage: 30, cooldown: 1.5, speed: 240, tracking: 4.5 },
  /* 8 */ { missileCount: 3, damage: 40, cooldown: 1.2, speed: 280, tracking: 5.0 },
];

const UPGRADE_DESCRIPTIONS: { stat: string; label: string }[] = [
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'speed', label: 'upgrade.speed' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'cooldown', label: 'upgrade.cooldown' },
  { stat: 'damage', label: 'upgrade.damage' },
  { stat: 'count', label: 'upgrade.count' },
  { stat: 'evolve', label: 'upgrade.evolve' },
];

interface Missile {
  x: number; y: number;
  angle: number;
  graphic: Graphics;
  life: number;
  target: Enemy | null;
  hitSet: Set<Enemy>;
  isCluster: boolean; // evolved sub-missile
  trailTimer: number;
}

export class HomingMissileWeapon extends WeaponBase {
  private missiles: Missile[] = [];
  private fireTimer = 0;
  private trailGraphics: Graphics[] = [];
  private trailDecay: number[] = [];

  get info(): WeaponInfo {
    return {
      id: 'missile',
      nameKey: 'weapon.missile.name',
      descKey: 'weapon.missile.desc',
      icon: '▲',
      maxLevel: 8,
      evolveNameKey: 'weapon.missile.evolve_name',
      evolveDescKey: 'weapon.missile.evolve_desc',
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
      case 'count': before = `${cur.missileCount}`; after = `${next.missileCount}`; break;
      case 'speed': before = `${cur.tracking}`; after = `${next.tracking}`; break;
      case 'evolve': before = ''; after = 'Cluster Barrage'; break;
    }
    return { stat: desc.stat, label: desc.label, valueBefore: before, valueAfter: after };
  }

  update(dt: number, px: number, py: number, enemies: Enemy[]): void {
    const d = this.data;
    this.fireTimer -= dt;

    // Fire missiles
    if (this.fireTimer <= 0 && enemies.length > 0) {
      this.fireTimer = d.cooldown;
      const sorted = enemies
        .filter(e => !e.dead)
        .sort((a, b) => distance(px, py, a.x, a.y) - distance(px, py, b.x, b.y));

      for (let i = 0; i < d.missileCount; i++) {
        const target = sorted[i % sorted.length];
        const angle = Math.atan2(target.y - py, target.x - px);
        this.spawnMissile(px, py, angle, target, false);
      }
    }

    // Update missiles
    for (const m of this.missiles) {
      // Find/retarget if target is dead
      if (!m.target || m.target.dead) {
        const alive = enemies.filter(e => !e.dead && !m.hitSet.has(e));
        if (alive.length > 0) {
          m.target = alive.reduce((closest, e) => {
            return distance(m.x, m.y, e.x, e.y) < distance(m.x, m.y, closest.x, closest.y) ? e : closest;
          });
        } else {
          m.target = null;
        }
      }

      // Homing: adjust angle toward target
      if (m.target) {
        const targetAngle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        let angleDiff = targetAngle - m.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = d.tracking * dt;
        m.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      }

      // Move
      m.x += Math.cos(m.angle) * d.speed * dt;
      m.y += Math.sin(m.angle) * d.speed * dt;
      m.life -= dt;

      m.graphic.x = m.x;
      m.graphic.y = m.y;
      m.graphic.rotation = m.angle + Math.PI / 2;

      // Trail particles
      m.trailTimer -= dt;
      if (m.trailTimer <= 0) {
        m.trailTimer = 0.05;
        this.spawnTrail(m.x - Math.cos(m.angle) * 6, m.y - Math.sin(m.angle) * 6);
      }
    }

    // Update trails
    for (let i = this.trailGraphics.length - 1; i >= 0; i--) {
      this.trailDecay[i] -= dt * 4;
      this.trailGraphics[i].alpha = Math.max(0, this.trailDecay[i]);
      if (this.trailDecay[i] <= 0) {
        this.container.removeChild(this.trailGraphics[i]);
        this.trailGraphics[i].destroy();
        this.trailGraphics.splice(i, 1);
        this.trailDecay.splice(i, 1);
      }
    }

    // Remove expired missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (this.missiles[i].life <= 0) {
        this.container.removeChild(this.missiles[i].graphic);
        this.missiles[i].graphic.destroy();
        this.missiles.splice(i, 1);
      }
    }
  }

  private spawnMissile(x: number, y: number, angle: number, target: Enemy | null, isCluster: boolean): void {
    const g = new Graphics();
    const size = isCluster ? 4 : 6;
    const color = this.evolved ? 0xff4400 : 0xff6600;
    // Triangle (missile shape)
    g.poly([0, -size, size * 0.6, size * 0.5, -size * 0.6, size * 0.5]);
    g.fill({ color, alpha: 0.95 });
    // Glow
    g.circle(0, 0, size + 3);
    g.fill({ color, alpha: 0.12 });
    g.x = x;
    g.y = y;
    g.rotation = angle + Math.PI / 2;
    this.container.addChild(g);

    this.missiles.push({
      x, y, angle, graphic: g,
      life: isCluster ? 1.5 : 3.0,
      target, hitSet: new Set(), isCluster,
      trailTimer: 0,
    });
  }

  private spawnTrail(x: number, y: number): void {
    const g = new Graphics();
    const size = 2 + Math.random() * 2;
    g.circle(0, 0, size);
    g.fill({ color: 0xff8844, alpha: 0.6 });
    g.x = x;
    g.y = y;
    this.container.addChild(g);
    this.trailGraphics.push(g);
    this.trailDecay.push(1);
  }

  checkHitPoint(x: number, y: number, radius: number): boolean {
    for (const m of this.missiles) {
      const dx = m.x - x;
      const dy = m.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < radius + 8) return true;
    }
    return false;
  }

  getHits(enemies: Enemy[]): Enemy[] {
    const d = this.data;
    const hits: Enemy[] = [];
    const toSpawnClusters: { x: number; y: number; enemies: Enemy[] }[] = [];

    for (let mi = this.missiles.length - 1; mi >= 0; mi--) {
      const m = this.missiles[mi];
      for (const enemy of enemies) {
        if (enemy.dead || m.hitSet.has(enemy)) continue;
        const dist = distance(m.x, m.y, enemy.x, enemy.y);
        if (dist < 8 + enemy.radius) {
          const fromAngle = Math.atan2(m.y - enemy.y, m.x - enemy.x);
          enemy.takeDamage(d.damage, fromAngle);
          m.hitSet.add(enemy);
          hits.push(enemy);

          // Evolved: split into cluster missiles on hit
          if (this.evolved && !m.isCluster) {
            toSpawnClusters.push({ x: m.x, y: m.y, enemies });
          }

          // Remove missile on hit
          m.life = 0;
          break;
        }
      }
    }

    // Spawn cluster missiles after loop
    for (const cluster of toSpawnClusters) {
      const alive = enemies.filter(e => !e.dead);
      for (let i = 0; i < 3; i++) {
        const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.3;
        const target = alive[i % Math.max(1, alive.length)] ?? null;
        this.spawnMissile(cluster.x, cluster.y, angle, target, true);
      }
    }

    return hits;
  }
}
