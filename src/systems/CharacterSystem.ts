/** Character/class selection system */

export interface CharacterDef {
  id: string;
  nameKey: string;
  descKey: string;
  color: number;
  shape: 'triangle' | 'diamond' | 'pentagon' | 'hexagon';
  startWeapon: string; // weapon id
  passiveBonus: { stat: string; value: number; mode: 'add' | 'multiply' };
  unlockCost: number; // 0 = free
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'warrior',
    nameKey: 'char.warrior.name',
    descKey: 'char.warrior.desc',
    color: 0x4488ff,
    shape: 'triangle',
    startWeapon: 'orbit',
    passiveBonus: { stat: 'maxHp', value: 1.2, mode: 'multiply' },
    unlockCost: 0,
  },
  {
    id: 'mage',
    nameKey: 'char.mage.name',
    descKey: 'char.mage.desc',
    color: 0xcc44ff,
    shape: 'diamond',
    startWeapon: 'lightning',
    passiveBonus: { stat: 'cooldown', value: 0.85, mode: 'multiply' },
    unlockCost: 500,
  },
  {
    id: 'ranger',
    nameKey: 'char.ranger.name',
    descKey: 'char.ranger.desc',
    color: 0x44ff88,
    shape: 'pentagon',
    startWeapon: 'bullet',
    passiveBonus: { stat: 'speed', value: 1.15, mode: 'multiply' },
    unlockCost: 500,
  },
  {
    id: 'engineer',
    nameKey: 'char.engineer.name',
    descKey: 'char.engineer.desc',
    color: 0xffcc44,
    shape: 'hexagon',
    startWeapon: 'forcefield',
    passiveBonus: { stat: 'magnetRange', value: 1.3, mode: 'multiply' },
    unlockCost: 800,
  },
];

export function getCharacterById(id: string): CharacterDef | undefined {
  return CHARACTERS.find(c => c.id === id);
}
