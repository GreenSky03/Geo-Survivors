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
  'weapon.forcefield.desc': { en: 'Slows nearby enemies and damages them', ko: '주변 적을 감속시키며 데미지' },
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

  // ─── New Weapons ───
  'weapon.boomerang.name': { en: 'Boomerang', ko: '부메랑' },
  'weapon.boomerang.desc': { en: 'Throws a spinning blade that returns', ko: '회전하는 칼날을 던져 돌아옵니다' },
  'weapon.boomerang.evolve_name': { en: 'Blade Storm', ko: '블레이드 스톰' },
  'weapon.boomerang.evolve_desc': { en: 'Spiraling blades orbit endlessly around you', ko: '나선형 칼날이 끝없이 주위를 회전' },

  'weapon.missile.name': { en: 'Homing Missile', ko: '유도 미사일' },
  'weapon.missile.desc': { en: 'Launches missiles that track enemies', ko: '적을 추적하는 미사일 발사' },
  'weapon.missile.evolve_name': { en: 'Cluster Barrage', ko: '클러스터 바라지' },
  'weapon.missile.evolve_desc': { en: 'Missiles split into cluster bombs on impact', ko: '명중 시 분열하는 확산 미사일' },

  // ─── Meta Progression / Shop ───
  'meta.hp.name': { en: 'HP Boost', ko: '체력 강화' },
  'meta.hp.desc': { en: 'Increases base HP permanently', ko: '기본 HP를 영구적으로 증가' },
  'meta.speed.name': { en: 'Speed Boost', ko: '이동 강화' },
  'meta.speed.desc': { en: 'Increases base speed permanently', ko: '기본 이동속도를 영구적으로 증가' },
  'meta.xp.name': { en: 'XP Multiplier', ko: 'XP 배율' },
  'meta.xp.desc': { en: 'Multiplies all XP gained', ko: '획득 XP에 배율 적용' },
  'meta.magnet.name': { en: 'Magnet Range', ko: '자석 강화' },
  'meta.magnet.desc': { en: 'Increases magnet pickup range', ko: '자석 범위를 영구적으로 증가' },
  'meta.armor.name': { en: 'Armor', ko: '방어력' },
  'meta.armor.desc': { en: 'Reduces damage taken', ko: '받는 데미지 감소' },

  'shop.title': { en: 'SHOP', ko: '상점' },
  'shop.btn': { en: 'SHOP', ko: '상점' },
  'shop.tier': { en: 'Tier', ko: '티어' },
  'shop.max': { en: 'MAX', ko: '최대' },
  'shop.cost': { en: 'Cost', ko: '비용' },
  'shop.back': { en: 'BACK', ko: '돌아가기' },
  'shop.coins': { en: 'Coins', ko: '코인' },

  // ─── Characters ───
  'char.warrior.name': { en: 'Warrior', ko: '워리어' },
  'char.warrior.desc': { en: 'HP +20%', ko: 'HP +20%' },
  'char.mage.name': { en: 'Mage', ko: '메이지' },
  'char.mage.desc': { en: 'Cooldown -15%', ko: '쿨다운 -15%' },
  'char.ranger.name': { en: 'Ranger', ko: '레인저' },
  'char.ranger.desc': { en: 'Speed +15%', ko: '이동속도 +15%' },
  'char.engineer.name': { en: 'Engineer', ko: '엔지니어' },
  'char.engineer.desc': { en: 'Magnet Range +30%', ko: '자석 범위 +30%' },

  'char.select.title': { en: 'SELECT CHARACTER', ko: '캐릭터 선택' },
  'char.locked': { en: 'LOCKED', ko: '잠김' },
  'char.unlock': { en: 'Unlock', ko: '해금' },

  // ─── Achievements ───
  'ach.title': { en: 'ACHIEVEMENTS', ko: '업적' },
  'ach.btn': { en: 'ACHIEVEMENTS', ko: '업적' },
  'ach.daily.title': { en: 'DAILY CHALLENGES', ko: '일일 도전' },
  'ach.back': { en: 'BACK', ko: '돌아가기' },

  'ach.kill100.name': { en: 'First Massacre', ko: '첫 학살' },
  'ach.kill100.desc': { en: 'Kill 100 enemies total', ko: '총 100마리 처치' },
  'ach.kill500.name': { en: 'Battlefield Veteran', ko: '전장의 베테랑' },
  'ach.kill500.desc': { en: 'Kill 500 enemies total', ko: '총 500마리 처치' },
  'ach.kill1000.name': { en: 'Slaughterer', ko: '학살자' },
  'ach.kill1000.desc': { en: 'Kill 1000 enemies total', ko: '총 1000마리 처치' },
  'ach.kill5000.name': { en: 'Legendary Hunter', ko: '전설의 사냥꾼' },
  'ach.kill5000.desc': { en: 'Kill 5000 enemies total', ko: '총 5000마리 처치' },

  'ach.surv5.name': { en: 'Survive 5 Min', ko: '5분 생존' },
  'ach.surv5.desc': { en: 'Survive 5 minutes in a single game', ko: '한 게임에서 5분 생존' },
  'ach.surv10.name': { en: 'Survive 10 Min', ko: '10분 생존' },
  'ach.surv10.desc': { en: 'Survive 10 minutes in a single game', ko: '한 게임에서 10분 생존' },
  'ach.surv15.name': { en: 'Survive 15 Min', ko: '15분 생존' },
  'ach.surv15.desc': { en: 'Survive 15 minutes in a single game', ko: '한 게임에서 15분 생존' },
  'ach.surv20.name': { en: 'Survive 20 Min', ko: '20분 생존' },
  'ach.surv20.desc': { en: 'Survive 20 minutes in a single game', ko: '한 게임에서 20분 생존' },

  'ach.boss1.name': { en: 'First Boss Kill', ko: '첫 보스 처치' },
  'ach.boss1.desc': { en: 'Kill 1 boss', ko: '보스 1마리 처치' },
  'ach.boss5.name': { en: 'Boss Hunter', ko: '보스 헌터' },
  'ach.boss5.desc': { en: 'Kill 5 bosses total', ko: '보스 5마리 처치' },
  'ach.boss10.name': { en: 'Boss Slayer', ko: '보스 슬레이어' },
  'ach.boss10.desc': { en: 'Kill 10 bosses total', ko: '보스 10마리 처치' },

  'ach.evolve1.name': { en: 'First Evolution', ko: '첫 진화' },
  'ach.evolve1.desc': { en: 'Evolve a weapon', ko: '무기 1개 진화' },
  'ach.evolve3.name': { en: 'Weapon Master', ko: '무기 마스터' },
  'ach.evolve3.desc': { en: 'Evolve 3 weapons in one game', ko: '한 게임에서 무기 3개 진화' },
  'ach.evolve5.name': { en: 'Ultimate Arsenal', ko: '최종 병기' },
  'ach.evolve5.desc': { en: 'Evolve 5 weapons in one game', ko: '한 게임에서 무기 5개 진화' },

  'ach.level10.name': { en: 'Level 10', ko: 'Lv10 도달' },
  'ach.level10.desc': { en: 'Reach level 10', ko: '레벨 10 도달' },
  'ach.level20.name': { en: 'Level 20', ko: 'Lv20 도달' },
  'ach.level20.desc': { en: 'Reach level 20', ko: '레벨 20 도달' },
  'ach.level30.name': { en: 'Level 30', ko: 'Lv30 도달' },
  'ach.level30.desc': { en: 'Reach level 30', ko: '레벨 30 도달' },

  // Daily challenges
  'daily.kill200': { en: 'Kill 200 enemies in one game', ko: '한 게임에서 200마리 처치' },
  'daily.kill100': { en: 'Kill 100 enemies in one game', ko: '한 게임에서 100마리 처치' },
  'daily.surv10': { en: 'Survive 10 minutes', ko: '10분 생존' },
  'daily.surv5': { en: 'Survive 5 minutes', ko: '5분 생존' },
  'daily.evolve2': { en: 'Evolve 2 weapons', ko: '무기 2개 진화' },
  'daily.evolve1': { en: 'Evolve 1 weapon', ko: '무기 1개 진화' },
  'daily.boss2': { en: 'Kill 2 bosses', ko: '보스 2마리 처치' },
  'daily.boss1': { en: 'Kill 1 boss', ko: '보스 1마리 처치' },
  'daily.level15': { en: 'Reach level 15', ko: '레벨 15 도달' },
  'daily.level20': { en: 'Reach level 20', ko: '레벨 20 도달' },

  // ─── Game Over Coins ───
  'gameover.coins': { en: 'Coins Earned', ko: '획득 코인' },

  // ─── Event / Mini-boss ───
  'event.gold_rush': { en: 'GOLD RUSH — 2x XP!', ko: '골드 러시 — XP 2배!' },
  'event.elite_invasion': { en: 'ELITE INVASION!', ko: '엘리트 침공!' },
  'event.boss_rush': { en: 'BOSS RUSH!', ko: '보스 러시!' },
  'event.healing_rain': { en: 'HEALING RAIN', ko: '치유의 비' },
  'event.miniboss': { en: 'MINI-BOSS INCOMING', ko: '미니보스 출현' },

  // ─── Party ───
  'party.create': { en: 'CREATE PARTY', ko: '파티 만들기' },
  'party.join': { en: 'JOIN PARTY', ko: '파티 참가' },
  'party.quick': { en: 'QUICK START', ko: '빠른 시작' },
  'party.code': { en: 'Party Code', ko: '파티 코드' },
  'party.waiting': { en: 'Waiting for members...', ko: '멤버 대기 중...' },
  'party.start': { en: 'START GAME', ko: '게임 시작' },
  'party.copy': { en: 'COPY', ko: '복사' },
  'party.members': { en: 'Members', ko: '멤버' },
  'party.back': { en: 'BACK', ko: '돌아가기' },
  'party.enter_code': { en: 'Enter 4-digit code', ko: '4자리 코드 입력' },
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
