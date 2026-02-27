import { Enemy, EnemyDef } from './Enemy';

export function createBossDef(bossIndex: number): EnemyDef {
  const mult = 1 + bossIndex * 0.8;
  const shapes: Array<'triangle' | 'diamond' | 'square' | 'pentagon'> =
    ['diamond', 'pentagon', 'square', 'triangle'];
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
