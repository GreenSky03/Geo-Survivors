/** Meta progression: permanent upgrades purchased with coins earned across runs */

const SAVE_KEY = 'geo_survivors_meta';

export interface MetaUpgrade {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  maxTier: number;
  costs: number[];
  values: number[];
}

export interface MetaSave {
  coins: number;
  upgrades: Record<string, number>; // upgradeId → currentTier
  totalGamesPlayed: number;
  totalKills: number;
  totalBossKills: number;
  unlockedCharacters: string[];
  achievements: string[]; // unlocked achievement ids
  dailyDate: string; // 'YYYY-MM-DD'
  dailyCompleted: string[]; // completed daily ids for today
}

export const META_UPGRADES: MetaUpgrade[] = [
  {
    id: 'meta_hp', nameKey: 'meta.hp.name', descKey: 'meta.hp.desc',
    icon: '♥', maxTier: 5,
    costs: [50, 100, 200, 400, 800],
    values: [10, 20, 40, 60, 90], // cumulative HP bonus
  },
  {
    id: 'meta_speed', nameKey: 'meta.speed.name', descKey: 'meta.speed.desc',
    icon: '»', maxTier: 5,
    costs: [50, 100, 200, 400, 800],
    values: [8, 16, 28, 40, 55], // cumulative speed bonus
  },
  {
    id: 'meta_xp', nameKey: 'meta.xp.name', descKey: 'meta.xp.desc',
    icon: '✦', maxTier: 5,
    costs: [80, 160, 300, 600, 1000],
    values: [1.1, 1.2, 1.3, 1.4, 1.5], // XP multiplier
  },
  {
    id: 'meta_magnet', nameKey: 'meta.magnet.name', descKey: 'meta.magnet.desc',
    icon: '⊕', maxTier: 5,
    costs: [40, 80, 160, 320, 600],
    values: [15, 30, 50, 70, 100], // cumulative magnet range bonus
  },
  {
    id: 'meta_armor', nameKey: 'meta.armor.name', descKey: 'meta.armor.desc',
    icon: '◈', maxTier: 5,
    costs: [60, 120, 250, 500, 900],
    values: [0.05, 0.08, 0.12, 0.16, 0.20], // damage reduction %
  },
];

function defaultSave(): MetaSave {
  return {
    coins: 0,
    upgrades: {},
    totalGamesPlayed: 0,
    totalKills: 0,
    totalBossKills: 0,
    unlockedCharacters: ['warrior'], // warrior unlocked by default
    achievements: [],
    dailyDate: '',
    dailyCompleted: [],
  };
}

export class MetaProgression {
  private save: MetaSave;

  constructor() {
    this.save = this.load();
  }

  private load(): MetaSave {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults for forward-compatibility
        return { ...defaultSave(), ...parsed };
      }
    } catch { /* corrupted save */ }
    return defaultSave();
  }

  persist(): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
  }

  get coins(): number { return this.save.coins; }

  getUpgradeTier(id: string): number {
    return this.save.upgrades[id] ?? 0;
  }

  /** Calculate coins earned from a game run */
  calculateCoins(kills: number, survivalSeconds: number, level: number, bossKills: number): number {
    return Math.floor(kills * 0.5) + Math.floor(survivalSeconds / 10) + (level * 3) + (bossKills * 20);
  }

  addCoins(amount: number): void {
    this.save.coins += amount;
    this.persist();
  }

  recordGame(kills: number, bossKills: number): void {
    this.save.totalGamesPlayed++;
    this.save.totalKills += kills;
    this.save.totalBossKills += bossKills;
    this.persist();
  }

  /** Try to purchase next tier of an upgrade. Returns true if successful */
  purchaseUpgrade(id: string): boolean {
    const upgrade = META_UPGRADES.find(u => u.id === id);
    if (!upgrade) return false;
    const currentTier = this.getUpgradeTier(id);
    if (currentTier >= upgrade.maxTier) return false;
    const cost = upgrade.costs[currentTier];
    if (this.save.coins < cost) return false;
    this.save.coins -= cost;
    this.save.upgrades[id] = currentTier + 1;
    this.persist();
    return true;
  }

  /** Get bonus HP from meta upgrades */
  getBonusHp(): number {
    const tier = this.getUpgradeTier('meta_hp');
    if (tier === 0) return 0;
    return META_UPGRADES[0].values[tier - 1];
  }

  /** Get bonus speed from meta upgrades */
  getBonusSpeed(): number {
    const tier = this.getUpgradeTier('meta_speed');
    if (tier === 0) return 0;
    return META_UPGRADES[1].values[tier - 1];
  }

  /** Get XP multiplier from meta upgrades (default 1.0) */
  getXpMultiplier(): number {
    const tier = this.getUpgradeTier('meta_xp');
    if (tier === 0) return 1;
    return META_UPGRADES[2].values[tier - 1];
  }

  /** Get bonus magnet range */
  getBonusMagnet(): number {
    const tier = this.getUpgradeTier('meta_magnet');
    if (tier === 0) return 0;
    return META_UPGRADES[3].values[tier - 1];
  }

  /** Get damage reduction fraction (0..0.20) */
  getDamageReduction(): number {
    const tier = this.getUpgradeTier('meta_armor');
    if (tier === 0) return 0;
    return META_UPGRADES[4].values[tier - 1];
  }

  /** Apply permanent bonuses to player base stats */
  applyToPlayer(player: { maxHp: number; hp: number; speed: number; magnetRange: number }): void {
    const bonusHp = this.getBonusHp();
    player.maxHp += bonusHp;
    player.hp += bonusHp;
    player.speed += this.getBonusSpeed();
    player.magnetRange += this.getBonusMagnet();
  }

  // ─── Character unlock ───
  isCharacterUnlocked(id: string): boolean {
    return this.save.unlockedCharacters.includes(id);
  }

  unlockCharacter(id: string, cost: number): boolean {
    if (this.save.coins < cost) return false;
    if (this.save.unlockedCharacters.includes(id)) return false;
    this.save.coins -= cost;
    this.save.unlockedCharacters.push(id);
    this.persist();
    return true;
  }

  // ─── Achievements ───
  isAchievementUnlocked(id: string): boolean {
    return this.save.achievements.includes(id);
  }

  unlockAchievement(id: string): void {
    if (!this.save.achievements.includes(id)) {
      this.save.achievements.push(id);
      this.persist();
    }
  }

  get totalKills(): number { return this.save.totalKills; }
  get totalBossKills(): number { return this.save.totalBossKills; }
  get totalGamesPlayed(): number { return this.save.totalGamesPlayed; }

  // ─── Daily challenges ───
  getDailyDate(): string { return this.save.dailyDate; }
  getDailyCompleted(): string[] { return this.save.dailyCompleted; }

  setDailyDate(date: string): void {
    if (this.save.dailyDate !== date) {
      this.save.dailyDate = date;
      this.save.dailyCompleted = [];
      this.persist();
    }
  }

  completeDailyChallenge(id: string): void {
    if (!this.save.dailyCompleted.includes(id)) {
      this.save.dailyCompleted.push(id);
      this.persist();
    }
  }

  /** Reset all saved data (for debug) */
  resetAll(): void {
    this.save = defaultSave();
    this.persist();
  }
}
