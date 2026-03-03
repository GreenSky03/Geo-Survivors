/** Relic system: run-scoped passive artifacts that modify player stats */

export interface RelicDef {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  maxStack: number;
}

export interface RelicMultipliers {
  damageMultiplier: number;
  cooldownMultiplier: number;
  areaMultiplier: number;
  critChance: number;
  critDamage: number;
  lifestealFraction: number;
  thornsPercent: number;
  xpMultiplier: number;
  coinMultiplier: number;
  lastStandDamageBonus: number;
  magnetBonus: number;
  speedMultiplier: number;
  regenBonus: number;
  maxHpMultiplier: number;
}

export const RELIC_DEFS: RelicDef[] = [
  { id: 'glass_cannon',   nameKey: 'relic.glass_cannon.name',   descKey: 'relic.glass_cannon.desc',   icon: '🔥', maxStack: 1 },
  { id: 'vampiric_touch', nameKey: 'relic.vampiric_touch.name', descKey: 'relic.vampiric_touch.desc', icon: '🩸', maxStack: 3 },
  { id: 'thorns',         nameKey: 'relic.thorns.name',         descKey: 'relic.thorns.desc',         icon: '🌹', maxStack: 2 },
  { id: 'lucky_star',     nameKey: 'relic.lucky_star.name',     descKey: 'relic.lucky_star.desc',     icon: '⭐', maxStack: 3 },
  { id: 'magnet_core',    nameKey: 'relic.magnet_core.name',    descKey: 'relic.magnet_core.desc',    icon: '🧲', maxStack: 2 },
  { id: 'swift_boots',    nameKey: 'relic.swift_boots.name',    descKey: 'relic.swift_boots.desc',    icon: '👟', maxStack: 2 },
  { id: 'cooldown_gem',   nameKey: 'relic.cooldown_gem.name',   descKey: 'relic.cooldown_gem.desc',   icon: '💎', maxStack: 3 },
  { id: 'area_amplifier', nameKey: 'relic.area_amplifier.name', descKey: 'relic.area_amplifier.desc', icon: '🔮', maxStack: 2 },
  { id: 'xp_siphon',      nameKey: 'relic.xp_siphon.name',      descKey: 'relic.xp_siphon.desc',      icon: '📘', maxStack: 2 },
  { id: 'gold_fever',     nameKey: 'relic.gold_fever.name',     descKey: 'relic.gold_fever.desc',     icon: '💰', maxStack: 2 },
  { id: 'regen_orb',      nameKey: 'relic.regen_orb.name',      descKey: 'relic.regen_orb.desc',      icon: '💚', maxStack: 3 },
  { id: 'last_stand',     nameKey: 'relic.last_stand.name',     descKey: 'relic.last_stand.desc',     icon: '💀', maxStack: 1 },
];

export class RelicSystem {
  /** relicId → stack count */
  private owned = new Map<string, number>();
  private cachedMults: RelicMultipliers | null = null;

  /** Pick up a relic. Returns false if max stacked */
  acquire(relicId: string): boolean {
    const def = RELIC_DEFS.find(r => r.id === relicId);
    if (!def) return false;
    const current = this.owned.get(relicId) ?? 0;
    if (current >= def.maxStack) return false;
    this.owned.set(relicId, current + 1);
    this.cachedMults = null; // invalidate
    return true;
  }

  canAcquire(relicId: string): boolean {
    const def = RELIC_DEFS.find(r => r.id === relicId);
    if (!def) return false;
    return (this.owned.get(relicId) ?? 0) < def.maxStack;
  }

  getCount(relicId: string): number {
    return this.owned.get(relicId) ?? 0;
  }

  getOwnedRelics(): { id: string; count: number }[] {
    const result: { id: string; count: number }[] = [];
    for (const [id, count] of this.owned) {
      result.push({ id, count });
    }
    return result;
  }

  computeMultipliers(): RelicMultipliers {
    if (this.cachedMults) return this.cachedMults;

    const m: RelicMultipliers = {
      damageMultiplier: 1,
      cooldownMultiplier: 1,
      areaMultiplier: 1,
      critChance: 0.1, // base 10%
      critDamage: 2,   // base 2x
      lifestealFraction: 0,
      thornsPercent: 0,
      xpMultiplier: 1,
      coinMultiplier: 1,
      lastStandDamageBonus: 0,
      magnetBonus: 0,
      speedMultiplier: 1,
      regenBonus: 0,
      maxHpMultiplier: 1,
    };

    for (const [id, count] of this.owned) {
      switch (id) {
        case 'glass_cannon':
          m.damageMultiplier += 0.5 * count;
          m.maxHpMultiplier *= 0.5; // halve HP
          break;
        case 'vampiric_touch':
          m.lifestealFraction += 0.05 * count;
          break;
        case 'thorns':
          m.thornsPercent += 0.30 * count;
          break;
        case 'lucky_star':
          m.critChance += 0.10 * count;
          m.critDamage += 0.5 * count;
          break;
        case 'magnet_core':
          m.magnetBonus += 80 * count;
          break;
        case 'swift_boots':
          m.speedMultiplier += 0.15 * count;
          break;
        case 'cooldown_gem':
          m.cooldownMultiplier *= Math.pow(0.9, count); // -10% per stack
          break;
        case 'area_amplifier':
          m.areaMultiplier += 0.20 * count;
          break;
        case 'xp_siphon':
          m.xpMultiplier += 0.25 * count;
          break;
        case 'gold_fever':
          m.coinMultiplier += 0.50 * count;
          break;
        case 'regen_orb':
          m.regenBonus += 2 * count;
          break;
        case 'last_stand':
          m.lastStandDamageBonus += 0.80 * count;
          break;
      }
    }

    // Clamps
    m.damageMultiplier = Math.min(m.damageMultiplier, 5);
    m.cooldownMultiplier = Math.max(m.cooldownMultiplier, 0.3);
    m.critChance = Math.min(m.critChance, 0.8);

    this.cachedMults = m;
    return m;
  }

  reset(): void {
    this.owned.clear();
    this.cachedMults = null;
  }
}
