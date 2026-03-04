import { Container } from 'pixi.js';
import { Enemy } from '../entities/Enemy';

export interface LevelUpgrade {
  stat: string;      // 'damage' | 'count' | 'size' | 'speed' | 'cooldown' | 'pierce' | 'radius'
  label: string;     // i18n key like 'upgrade.damage'
  valueBefore: string;
  valueAfter: string;
}

export interface WeaponInfo {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  maxLevel: number;
  evolveNameKey: string;
  evolveDescKey: string;
}

export abstract class WeaponBase {
  public container: Container;
  public level = 1;
  public evolved = false;

  /** Relic-driven multipliers (set by Game.ts each frame) */
  public damageMultiplier = 1;
  public cooldownMultiplier = 1;
  public areaMultiplier = 1;

  constructor() {
    this.container = new Container();
  }

  abstract get info(): WeaponInfo;
  abstract get currentDamage(): number;
  abstract update(dt: number, px: number, py: number, enemies: Enemy[]): void;
  abstract getHits(enemies: Enemy[]): Enemy[];
  /** Check if any active weapon projectile/effect overlaps a point (for PvP hit detection) */
  abstract checkHitPoint(x: number, y: number, radius: number): boolean;

  /** Returns what changes at the NEXT level */
  abstract getNextUpgrade(): LevelUpgrade | null;

  upgrade(): void {
    this.level++;
    if (this.level >= this.info.maxLevel && !this.evolved) {
      this.evolved = true;
      this.onEvolve();
    }
  }

  /** Apply damageMultiplier to base damage */
  protected scaledDamage(baseDamage: number): number {
    return Math.floor(baseDamage * this.damageMultiplier);
  }

  /** Clean up all PixiJS resources */
  destroy(): void {
    this.container.destroy({ children: true });
  }

  /** Override to apply evolution transformation */
  protected onEvolve(): void {}
}
