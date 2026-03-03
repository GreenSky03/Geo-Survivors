import { Enemy, EnemyDef, EnemyShape } from './Enemy';
import { BossProjectile } from './BossProjectile';

export type BossAttackType = 'radial_burst' | 'aimed_shot' | 'charge_slam';

export interface BossAttackEvent {
  type: BossAttackType;
  projectiles: BossProjectile[];
  /** For charge_slam AoE */
  aoeX?: number;
  aoeY?: number;
  aoeRadius?: number;
  aoeDamage?: number;
}

export function createBossDef(bossIndex: number): EnemyDef {
  const mult = 1 + bossIndex * 0.8;
  const shapes: EnemyShape[] = ['pentagon', 'pentagon', 'hexagon', 'star'];
  const colors = [0xff2244, 0xff8800, 0xcc22ff, 0xff44cc];

  return {
    type: `boss_${bossIndex}`,
    hp: Math.floor(300 * mult),
    speed: 35 + bossIndex * 3,
    damage: Math.floor(25 * mult),
    xp: Math.floor(50 * mult),
    radius: 18,
    scale: 3 + bossIndex * 0.5,
    color: colors[bossIndex % colors.length],
    shape: shapes[bossIndex % shapes.length],
  };
}

/** Boss state machine for solo mode */
export class BossController {
  public state: 'chase' | 'attack' | 'cooldown' = 'chase';
  public stateTimer = 3 + Math.random() * 2;
  public isAttacking = false;

  // Charge slam state
  private chargeSlamTarget = { x: 0, y: 0 };
  private chargeSlamTelegraph = 0;
  private chargeSlamDashing = false;

  update(dt: number, boss: Enemy, playerX: number, playerY: number): BossAttackEvent | null {
    switch (this.state) {
      case 'chase':
        this.stateTimer -= dt;
        this.isAttacking = false;
        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.isAttacking = true;
          return this.executeAttack(boss, playerX, playerY);
        }
        return null;

      case 'attack':
        // attack is instant for radial_burst and aimed_shot
        // charge_slam has its own timing but we handle it as instant for simplicity
        this.state = 'cooldown';
        this.stateTimer = 1;
        return null;

      case 'cooldown':
        this.stateTimer -= dt;
        this.isAttacking = false;
        if (this.stateTimer <= 0) {
          this.state = 'chase';
          this.stateTimer = 3 + Math.random() * 2;
        }
        return null;
    }
  }

  private executeAttack(boss: Enemy, playerX: number, playerY: number): BossAttackEvent {
    const attacks: BossAttackType[] = ['radial_burst', 'aimed_shot', 'charge_slam'];
    const attackType = attacks[Math.floor(Math.random() * attacks.length)];
    const bossDmg = boss.damage;

    switch (attackType) {
      case 'radial_burst': {
        const count = 8 + Math.floor(Math.random() * 5); // 8-12
        const projectiles: BossProjectile[] = [];
        const speed = 300;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          projectiles.push(new BossProjectile(boss.x, boss.y, vx, vy, Math.floor(bossDmg * 0.6), 2));
        }
        return { type: 'radial_burst', projectiles };
      }

      case 'aimed_shot': {
        const dx = playerX - boss.x;
        const dy = playerY - boss.y;
        const baseAngle = Math.atan2(dy, dx);
        const speed = 450;
        const spread = (15 * Math.PI) / 180; // 15 degrees
        const projectiles: BossProjectile[] = [];
        for (let i = -1; i <= 1; i++) {
          const angle = baseAngle + spread * i;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          projectiles.push(new BossProjectile(boss.x, boss.y, vx, vy, Math.floor(bossDmg * 0.6), 2));
        }
        return { type: 'aimed_shot', projectiles };
      }

      case 'charge_slam': {
        // Boss charges toward player and creates AoE on arrival
        const dx = playerX - boss.x;
        const dy = playerY - boss.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 400;
        const angle = Math.atan2(dy, dx);
        // Single fast projectile representing the charge
        const projectiles: BossProjectile[] = [];
        return {
          type: 'charge_slam',
          projectiles,
          aoeX: playerX,
          aoeY: playerY,
          aoeRadius: 120,
          aoeDamage: Math.floor(bossDmg * 0.8),
        };
      }
    }
  }
}

export function spawnBoss(
  px: number, py: number, bossIndex: number, difficultyMult: number,
): Enemy {
  const angle = Math.random() * Math.PI * 2;
  const dist = 500;
  const x = px + Math.cos(angle) * dist;
  const y = py + Math.sin(angle) * dist;

  const def = createBossDef(bossIndex);
  const boss = new Enemy(x, y, def, difficultyMult);
  boss.isBoss = true;
  return boss;
}
