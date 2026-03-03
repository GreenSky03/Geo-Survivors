import { WeaponBase } from '../weapons/WeaponBase';
import { OrbitWeapon } from '../weapons/OrbitWeapon';
import { BulletWeapon } from '../weapons/BulletWeapon';
import { AreaWeapon } from '../weapons/AreaWeapon';
import { ChainLightning } from '../weapons/ChainLightning';
import { ForceField } from '../weapons/ForceField';
import { BoomerangWeapon } from '../weapons/BoomerangWeapon';
import { HomingMissileWeapon } from '../weapons/HomingMissileWeapon';
import { Player } from '../entities/Player';
import { t } from './i18n';
import { RelicSystem, RELIC_DEFS } from './RelicSystem';

export interface UpgradeChoice {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Detailed stat change line, e.g. "Damage: 10 → 18" */
  statLine: string;
  apply: () => void;
  isRelic?: boolean;
}

export class LevelUpSystem {
  private weaponClasses = [OrbitWeapon, BulletWeapon, AreaWeapon, ChainLightning, ForceField, BoomerangWeapon, HomingMissileWeapon];

  generateChoices(player: Player, weapons: WeaponBase[], count = 3, relicSystem?: RelicSystem): UpgradeChoice[] {
    const pool: UpgradeChoice[] = [];

    // Weapon upgrades
    for (const w of weapons) {
      if (w.level < w.info.maxLevel) {
        const nextUp = w.getNextUpgrade();
        const isEvolve = nextUp?.stat === 'evolve';

        let name: string;
        let desc: string;
        let statLine: string;

        if (isEvolve) {
          name = `★ ${t(w.info.evolveNameKey)}`;
          desc = t(w.info.evolveDescKey);
          statLine = `${t(w.info.nameKey)} → ${t(w.info.evolveNameKey)}`;
        } else {
          name = `${t(w.info.nameKey)} Lv${w.level + 1}`;
          desc = t(w.info.descKey);
          statLine = nextUp
            ? `${t(nextUp.label)}: ${nextUp.valueBefore} → ${nextUp.valueAfter}`
            : '';
        }

        pool.push({
          id: `upgrade_${w.info.id}`,
          name,
          description: desc,
          icon: isEvolve ? '★' : w.info.icon,
          statLine,
          apply: () => w.upgrade(),
        });
      }
    }

    // New weapons
    const ownedIds = new Set(weapons.map(w => w.info.id));
    for (const Cls of this.weaponClasses) {
      const temp = new Cls();
      if (!ownedIds.has(temp.info.id)) {
        const info = temp.info;
        pool.push({
          id: `new_${info.id}`,
          name: `${t(info.nameKey)} [NEW]`,
          description: t(info.descKey),
          icon: info.icon,
          statLine: '',
          apply: () => {},
        });
      }
      temp.container.destroy();
    }

    // Passive stats
    pool.push({
      id: 'stat_maxhp',
      name: t('stat.maxhp.name'),
      description: t('stat.maxhp.desc'),
      icon: '♥',
      statLine: `HP: ${player.maxHp} → ${player.maxHp + 20}`,
      apply: () => { player.maxHp += 20; player.hp += 20; },
    });
    pool.push({
      id: 'stat_speed',
      name: t('stat.speed.name'),
      description: t('stat.speed.desc'),
      icon: '»',
      statLine: `Speed: ${Math.round(player.speed)} → ${Math.round(Math.min(player.speed * 1.15, 500))}`,
      apply: () => { player.speed = Math.min(player.speed * 1.15, 500); },
    });
    pool.push({
      id: 'stat_magnet',
      name: t('stat.magnet.name'),
      description: t('stat.magnet.desc'),
      icon: '⊕',
      statLine: `Range: ${player.magnetRange} → ${player.magnetRange + 50}`,
      apply: () => { player.magnetRange += 50; },
    });
    pool.push({
      id: 'stat_heal',
      name: t('stat.heal.name'),
      description: t('stat.heal.desc'),
      icon: '+',
      statLine: `+${Math.floor(player.maxHp * 0.3)} HP`,
      apply: () => { player.heal(Math.floor(player.maxHp * 0.3)); },
    });
    pool.push({
      id: 'stat_regen',
      name: t('stat.regen.name'),
      description: t('stat.regen.desc'),
      icon: '♻',
      statLine: `Regen: ${player.hpRegen.toFixed(1)} → ${(player.hpRegen + 1.5).toFixed(1)} HP/s`,
      apply: () => { player.hpRegen += 1.5; },
    });

    // Relic choices (one random available relic per level-up pool)
    if (relicSystem) {
      const availableRelics = RELIC_DEFS.filter(r => relicSystem.canAcquire(r.id));
      // Shuffle available relics
      for (let i = availableRelics.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableRelics[i], availableRelics[j]] = [availableRelics[j], availableRelics[i]];
      }
      // Add up to 2 relics to the pool
      const relicCount = Math.min(2, availableRelics.length);
      for (let i = 0; i < relicCount; i++) {
        const rdef = availableRelics[i];
        const curCount = relicSystem.getCount(rdef.id);
        pool.push({
          id: `relic_${rdef.id}`,
          name: `${t(rdef.nameKey)}`,
          description: t(rdef.descKey),
          icon: rdef.icon,
          statLine: curCount > 0 ? `Stack: ${curCount} → ${curCount + 1}` : t('relic.label'),
          apply: () => { relicSystem.acquire(rdef.id); },
          isRelic: true,
        });
      }
    }

    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Prioritize evolves at the top
    pool.sort((a, b) => {
      const aEvolve = a.icon === '★' ? 0 : 1;
      const bEvolve = b.icon === '★' ? 0 : 1;
      return aEvolve - bEvolve;
    });

    return pool.slice(0, count);
  }

  createWeaponById(id: string): WeaponBase | null {
    if (id === 'new_orbit') return new OrbitWeapon();
    if (id === 'new_bullet') return new BulletWeapon();
    if (id === 'new_area') return new AreaWeapon();
    if (id === 'new_lightning') return new ChainLightning();
    if (id === 'new_forcefield') return new ForceField();
    if (id === 'new_boomerang') return new BoomerangWeapon();
    if (id === 'new_missile') return new HomingMissileWeapon();
    return null;
  }
}
