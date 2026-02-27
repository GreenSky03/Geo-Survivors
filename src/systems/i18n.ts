export type Lang = 'en' | 'ko';

const translations: Record<string, Record<Lang, string>> = {
  // Title
  'title.name': { en: 'GEO SURVIVORS', ko: 'GEO SURVIVORS' },
  'title.subtitle': { en: 'ABSTRACT GEOMETRIC SURVIVAL', ko: '추상 기하학 서바이벌' },
  'title.start': { en: 'START', ko: '시작' },
  'title.controls': { en: 'WASD or Arrow Keys to move', ko: 'WASD 또는 방향키로 이동' },

  // HUD
  'hud.level': { en: 'LV', ko: 'LV' },
  'hud.kills': { en: 'KILLS', ko: '처치' },

  // Boss
  'boss.warning': { en: '⚠ BOSS INCOMING ⚠', ko: '⚠ 보스 출현 ⚠' },

  // Level Up
  'levelup.title': { en: 'LEVEL UP', ko: '레벨 업' },

  // Game Over
  'gameover.title': { en: 'GAME OVER', ko: '게임 오버' },
  'gameover.survived': { en: 'Survived', ko: '생존 시간' },
  'gameover.kills': { en: 'Kills', ko: '처치 수' },
  'gameover.level': { en: 'Level', ko: '레벨' },
  'gameover.restart': { en: 'RESTART', ko: '재시작' },

  // Weapons
  'weapon.orbit.name': { en: 'Orbit Guard', ko: '궤도 수호' },
  'weapon.orbit.desc': { en: 'Geometric shards orbit around you', ko: '기하학 파편이 주위를 회전합니다' },
  'weapon.orbit.evolve_name': { en: 'Singularity', ko: '싱귤래리티' },
  'weapon.orbit.evolve_desc': { en: 'A gravitational vortex that pulls and shreds enemies', ko: '적을 끌어당겨 분쇄하는 중력 소용돌이' },

  'weapon.bullet.name': { en: 'Geo Blaster', ko: '지오 블라스터' },
  'weapon.bullet.desc': { en: 'Auto-fires projectiles at nearest enemy', ko: '가장 가까운 적에게 자동 발사' },
  'weapon.bullet.evolve_name': { en: 'Ray Blaster', ko: '레이 블라스터' },
  'weapon.bullet.evolve_desc': { en: 'Fires a continuous piercing laser beam', ko: '관통하는 연속 레이저 빔 발사' },

  'weapon.area.name': { en: 'Shockwave', ko: '충격파' },
  'weapon.area.desc': { en: 'Periodic area damage pulse', ko: '주기적 광역 데미지 펄스' },
  'weapon.area.evolve_name': { en: 'Eternal Pulse', ko: '영원의 파동' },
  'weapon.area.evolve_desc': { en: 'Permanent damage aura surrounds you', ko: '상시 유지되는 데미지 오라' },

  'weapon.lightning.name': { en: 'Chain Lightning', ko: '체인 라이트닝' },
  'weapon.lightning.desc': { en: 'Lightning chains between nearby enemies', ko: '근처 적들 사이를 연쇄 감전' },
  'weapon.lightning.evolve_name': { en: 'Storm Nexus', ko: '스톰 넥서스' },
  'weapon.lightning.evolve_desc': { en: 'Triple lightning bolts with rapid fire', ko: '3중 번개가 빠르게 연사' },

  'weapon.forcefield.name': { en: 'Force Field', ko: '포스 필드' },
  'weapon.forcefield.desc': { en: 'Pushes enemies away and damages them', ko: '적을 밀어내며 데미지' },
  'weapon.forcefield.evolve_name': { en: 'Event Horizon', ko: '이벤트 호라이즌' },
  'weapon.forcefield.evolve_desc': { en: 'Massive field that slows and crushes enemies', ko: '적을 감속시키고 압사하는 거대 필드' },

  // Upgrade types
  'upgrade.damage': { en: 'Damage', ko: '데미지' },
  'upgrade.count': { en: 'Count', ko: '개수' },
  'upgrade.size': { en: 'Size', ko: '크기' },
  'upgrade.speed': { en: 'Speed', ko: '속도' },
  'upgrade.cooldown': { en: 'Cooldown', ko: '쿨타임' },
  'upgrade.pierce': { en: 'Pierce', ko: '관통' },
  'upgrade.radius': { en: 'Radius', ko: '범위' },
  'upgrade.evolve': { en: 'EVOLVE!', ko: '진화!' },

  // Passive stats
  'stat.maxhp.name': { en: 'Iron Constitution', ko: '강철 체질' },
  'stat.maxhp.desc': { en: 'Your body hardens like geometric armor', ko: '기하학 갑옷처럼 단단해진다' },
  'stat.speed.name': { en: 'Phantom Step', ko: '유령의 발걸음' },
  'stat.speed.desc': { en: 'Phase through dimensions faster', ko: '차원을 더 빠르게 관통한다' },
  'stat.magnet.name': { en: 'Gravitational Pull', ko: '중력 흡인' },
  'stat.magnet.desc': { en: 'Warp space to draw energy closer', ko: '공간을 왜곡해 에너지를 끌어당긴다' },
  'stat.heal.name': { en: 'Vital Surge', ko: '생명의 파동' },
  'stat.heal.desc': { en: 'A burst of regenerative energy', ko: '재생 에너지가 폭발적으로 흐른다' },
  'stat.regen.name': { en: 'Tenacious Vitality', ko: '끈질긴 생명력' },
  'stat.regen.desc': { en: 'Your cells regenerate at an unnatural rate', ko: '세포가 비정상적 속도로 재생된다' },

  // Death penalty
  'death.penalty': { en: 'ALL PROGRESS LOST', ko: '모든 진행 초기화' },

  // Pause
  'pause.title': { en: 'PAUSED', ko: '일시정지' },
  'pause.resume': { en: 'RESUME', ko: '계속하기' },
  'pause.volume': { en: 'Volume', ko: '볼륨' },
  'pause.quit': { en: 'QUIT TO TITLE', ko: '타이틀로' },

  // Settings
  'settings.language': { en: 'Language', ko: '언어' },
};

let currentLang: Lang = 'en';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = translations[key];
  let text = entry?.[currentLang] ?? entry?.en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function detectLang(): Lang {
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith('ko')) return 'ko';
  return 'en';
}
