/** Achievement / challenge system */

export interface AchievementDef {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  category: string;
  condition: { type: string; target: number };
  reward: number; // coin reward
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Kill achievements (cumulative)
  { id: 'kill_100', nameKey: 'ach.kill100.name', descKey: 'ach.kill100.desc', icon: '⚔', category: 'kill', condition: { type: 'total_kills', target: 100 }, reward: 30 },
  { id: 'kill_500', nameKey: 'ach.kill500.name', descKey: 'ach.kill500.desc', icon: '⚔', category: 'kill', condition: { type: 'total_kills', target: 500 }, reward: 80 },
  { id: 'kill_1000', nameKey: 'ach.kill1000.name', descKey: 'ach.kill1000.desc', icon: '⚔', category: 'kill', condition: { type: 'total_kills', target: 1000 }, reward: 150 },
  { id: 'kill_5000', nameKey: 'ach.kill5000.name', descKey: 'ach.kill5000.desc', icon: '⚔', category: 'kill', condition: { type: 'total_kills', target: 5000 }, reward: 500 },

  // Survival achievements (single game)
  { id: 'surv_5', nameKey: 'ach.surv5.name', descKey: 'ach.surv5.desc', icon: '⏱', category: 'survival', condition: { type: 'survive_seconds', target: 300 }, reward: 30 },
  { id: 'surv_10', nameKey: 'ach.surv10.name', descKey: 'ach.surv10.desc', icon: '⏱', category: 'survival', condition: { type: 'survive_seconds', target: 600 }, reward: 80 },
  { id: 'surv_15', nameKey: 'ach.surv15.name', descKey: 'ach.surv15.desc', icon: '⏱', category: 'survival', condition: { type: 'survive_seconds', target: 900 }, reward: 200 },
  { id: 'surv_20', nameKey: 'ach.surv20.name', descKey: 'ach.surv20.desc', icon: '⏱', category: 'survival', condition: { type: 'survive_seconds', target: 1200 }, reward: 500 },

  // Boss achievements (cumulative)
  { id: 'boss_1', nameKey: 'ach.boss1.name', descKey: 'ach.boss1.desc', icon: '👑', category: 'boss', condition: { type: 'total_boss_kills', target: 1 }, reward: 50 },
  { id: 'boss_5', nameKey: 'ach.boss5.name', descKey: 'ach.boss5.desc', icon: '👑', category: 'boss', condition: { type: 'total_boss_kills', target: 5 }, reward: 150 },
  { id: 'boss_10', nameKey: 'ach.boss10.name', descKey: 'ach.boss10.desc', icon: '👑', category: 'boss', condition: { type: 'total_boss_kills', target: 10 }, reward: 400 },

  // Evolution achievements (single game)
  { id: 'evolve_1', nameKey: 'ach.evolve1.name', descKey: 'ach.evolve1.desc', icon: '★', category: 'evolve', condition: { type: 'evolutions', target: 1 }, reward: 50 },
  { id: 'evolve_3', nameKey: 'ach.evolve3.name', descKey: 'ach.evolve3.desc', icon: '★', category: 'evolve', condition: { type: 'evolutions', target: 3 }, reward: 200 },
  { id: 'evolve_5', nameKey: 'ach.evolve5.name', descKey: 'ach.evolve5.desc', icon: '★', category: 'evolve', condition: { type: 'evolutions', target: 5 }, reward: 500 },

  // Level achievements (single game)
  { id: 'level_10', nameKey: 'ach.level10.name', descKey: 'ach.level10.desc', icon: '▲', category: 'level', condition: { type: 'level', target: 10 }, reward: 30 },
  { id: 'level_20', nameKey: 'ach.level20.name', descKey: 'ach.level20.desc', icon: '▲', category: 'level', condition: { type: 'level', target: 20 }, reward: 100 },
  { id: 'level_30', nameKey: 'ach.level30.name', descKey: 'ach.level30.desc', icon: '▲', category: 'level', condition: { type: 'level', target: 30 }, reward: 300 },
];

// ─── Daily challenges ───
export interface DailyChallengeDef {
  id: string;
  descKey: string;
  condition: { type: string; target: number };
  reward: number;
}

const DAILY_CHALLENGE_POOL: DailyChallengeDef[] = [
  { id: 'daily_kill_200', descKey: 'daily.kill200', condition: { type: 'game_kills', target: 200 }, reward: 60 },
  { id: 'daily_kill_100', descKey: 'daily.kill100', condition: { type: 'game_kills', target: 100 }, reward: 40 },
  { id: 'daily_surv_10', descKey: 'daily.surv10', condition: { type: 'survive_seconds', target: 600 }, reward: 80 },
  { id: 'daily_surv_5', descKey: 'daily.surv5', condition: { type: 'survive_seconds', target: 300 }, reward: 50 },
  { id: 'daily_evolve_2', descKey: 'daily.evolve2', condition: { type: 'evolutions', target: 2 }, reward: 70 },
  { id: 'daily_evolve_1', descKey: 'daily.evolve1', condition: { type: 'evolutions', target: 1 }, reward: 40 },
  { id: 'daily_boss_2', descKey: 'daily.boss2', condition: { type: 'game_boss_kills', target: 2 }, reward: 100 },
  { id: 'daily_boss_1', descKey: 'daily.boss1', condition: { type: 'game_boss_kills', target: 1 }, reward: 50 },
  { id: 'daily_level_15', descKey: 'daily.level15', condition: { type: 'level', target: 15 }, reward: 60 },
  { id: 'daily_level_20', descKey: 'daily.level20', condition: { type: 'level', target: 20 }, reward: 80 },
];

/** Get today's date string (UTC) */
function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Simple seed-based pseudo-random for daily selection */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function dateToSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Get 3 daily challenges for today */
export function getDailyChallenges(): DailyChallengeDef[] {
  const today = todayUTC();
  const rng = seededRandom(dateToSeed(today));
  const pool = [...DAILY_CHALLENGE_POOL];
  const selected: DailyChallengeDef[] = [];

  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    selected.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return selected;
}

export function getTodayDateStr(): string {
  return todayUTC();
}

export interface GameRunStats {
  kills: number;
  bossKills: number;
  survivalSeconds: number;
  level: number;
  evolutions: number;
}

export class AchievementChecker {
  /**
   * Check which achievements were newly unlocked after a game run.
   * Returns list of newly unlocked achievement IDs.
   */
  checkAfterGame(
    stats: GameRunStats,
    totalKills: number,
    totalBossKills: number,
    unlockedSet: Set<string>,
  ): AchievementDef[] {
    const newlyUnlocked: AchievementDef[] = [];

    for (const ach of ACHIEVEMENTS) {
      if (unlockedSet.has(ach.id)) continue;

      let met = false;
      switch (ach.condition.type) {
        case 'total_kills':
          met = totalKills >= ach.condition.target;
          break;
        case 'total_boss_kills':
          met = totalBossKills >= ach.condition.target;
          break;
        case 'survive_seconds':
          met = stats.survivalSeconds >= ach.condition.target;
          break;
        case 'evolutions':
          met = stats.evolutions >= ach.condition.target;
          break;
        case 'level':
          met = stats.level >= ach.condition.target;
          break;
        case 'game_kills':
          met = stats.kills >= ach.condition.target;
          break;
        case 'game_boss_kills':
          met = stats.bossKills >= ach.condition.target;
          break;
      }

      if (met) {
        newlyUnlocked.push(ach);
      }
    }

    return newlyUnlocked;
  }

  /** Check daily challenges against game stats */
  checkDailies(
    stats: GameRunStats,
    dailies: DailyChallengeDef[],
    completedSet: Set<string>,
  ): DailyChallengeDef[] {
    const newlyCompleted: DailyChallengeDef[] = [];

    for (const daily of dailies) {
      if (completedSet.has(daily.id)) continue;

      let met = false;
      switch (daily.condition.type) {
        case 'game_kills':
          met = stats.kills >= daily.condition.target;
          break;
        case 'survive_seconds':
          met = stats.survivalSeconds >= daily.condition.target;
          break;
        case 'evolutions':
          met = stats.evolutions >= daily.condition.target;
          break;
        case 'game_boss_kills':
          met = stats.bossKills >= daily.condition.target;
          break;
        case 'level':
          met = stats.level >= daily.condition.target;
          break;
      }

      if (met) {
        newlyCompleted.push(daily);
      }
    }

    return newlyCompleted;
  }
}
