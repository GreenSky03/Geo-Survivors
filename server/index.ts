import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type {
  C2S_Message, S2C_Message, S2C_Welcome, PlayerData, BossData,
  Team, ServerEnemy, S2C_PlayersSync, S2C_EnemiesSync,
  S2C_EnemySpawn, S2C_EnemyDeath,
  S2C_BossSpawn, S2C_BossUpdate, S2C_BossDead,
  S2C_TeamScores, S2C_Leaderboard, S2C_PvpDamage,
  S2C_PingSignal, S2C_WaveEvent, WeaponSyncData,
  S2C_EventWave, S2C_EventWaveEnd, S2C_MiniBossSpawn,
  S2C_BossAttack, S2C_BlackHoleSpawn, S2C_BlackHoleSync, S2C_BlackHoleDespawn,
  S2C_PartyCreated, S2C_PartyJoined, S2C_PartyMemberJoin, S2C_PartyMemberLeave, S2C_PartyError,
  S2C_SpectateStart, S2C_SpectateEnd, S2C_PlayerEmote,
} from '../shared/protocol';
import { TEAMS, MAP_HALF_W, MAP_HALF_H } from '../shared/protocol';

const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS_PER_ROOM = 30;
const BOSS_INTERVAL_S = 120;
const TICK_MS = 16;           // 60Hz server tick
const TICK_S = TICK_MS / 1000;
const PLAYER_SYNC_MS = 16;   // every tick
const ENEMY_SYNC_MS = 16;    // every tick
const SCOREBOARD_MS = 2000;
const MAX_ENEMIES = 120;

// ForceField radius by level (index 0 = unused, 1-8 = levels)
const FF_RADIUS = [0, 80, 80, 80, 100, 100, 100, 120, 120];
const FF_RADIUS_EVOLVED = 180;
const FF_SLOW_FACTOR = 0.5;  // 50% slow when inside ForceField

// Wave event interval (seconds)
const WAVE_EVENT_INTERVAL = 60;
// Elite spawn chance (per spawn cycle)
const ELITE_CHANCE = 0.08;

// Mini-boss interval (seconds)
const MINI_BOSS_INTERVAL_S = 90;

// Event wave system interval (seconds) - distinct from regular wave events
const EVENT_WAVE_INTERVAL_S = 120;

// Party system
const MAX_PARTY_SIZE = 4;

// ─── Enemy Definitions (mirrored from client) ──
interface EnemyDef {
  type: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  shape: string;
}

const ENEMY_DEFS: Record<string, EnemyDef> = {
  triangle:  { type: 'triangle', hp: 15, speed: 80, damage: 8, xp: 2, radius: 10, shape: 'triangle' },
  shield:    { type: 'shield', hp: 40, speed: 45, damage: 15, xp: 7, radius: 14, shape: 'square' },
  pentagon:  { type: 'pentagon', hp: 80, speed: 40, damage: 20, xp: 10, radius: 16, shape: 'pentagon' },
  charger:   { type: 'charger', hp: 25, speed: 50, damage: 20, xp: 5, radius: 11, shape: 'triangle' },
  splitter:  { type: 'splitter', hp: 40, speed: 55, damage: 10, xp: 4, radius: 14, shape: 'square' },
  zigzag:    { type: 'zigzag', hp: 20, speed: 90, damage: 10, xp: 3, radius: 11, shape: 'hexagon' },
  phaser:    { type: 'phaser', hp: 35, speed: 55, damage: 15, xp: 5, radius: 12, shape: 'star' },
  orbiter:   { type: 'orbiter', hp: 25, speed: 70, damage: 12, xp: 4, radius: 10, shape: 'crescent' },
};

// ─── Server Enemy ───────────────────────────
interface RoomEnemy {
  id: number;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number;
  xp: number;
  isBoss: boolean;
  isElite: boolean;
  dead: boolean;
  // Charger state
  chargeTimer: number;
  chargeVx: number;
  chargeVy: number;
  isCharging: boolean;
  // Current velocity (for dead reckoning on client)
  vx: number;
  vy: number;
  // Targeting mode: 'nearest' | 'centroid' | 'weakest'
  targetMode: string;
  // Collision cooldowns per player (playerId → remaining seconds)
  damageCooldowns: Map<string, number>;
  // Zigzag state
  zigzagPhase: number;
  // Phaser state
  phaserState: 'approach' | 'telegraph' | 'invisible' | 'appear';
  phaserTimer: number;
  phaserStateTimer: number;
  isPhasing: boolean;
  // Orbiter state
  orbitAngle: number;
  orbitDashTimer: number;
  orbitDashing: boolean;
  orbitDashTime: number;
  // Shield facing direction (rotation)
  rotation: number;
  // Boss attack state
  bossAttackState: 'chase' | 'attack' | 'cooldown';
  bossAttackTimer: number;
  isBossAttacking: boolean;
}

// ─── Room ───────────────────────────────────
interface ServerPlayer {
  ws: WebSocket;
  data: PlayerData;
  lastUpdate: number;
}

interface ServerBlackHole {
  id: number;
  x: number;
  y: number;
  radius: number;
  age: number;
  dead: boolean;
}

interface ServerBossProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  hitPlayers: Set<string>;
}

interface Room {
  code: string;
  players: Map<string, ServerPlayer>;
  enemies: Map<number, RoomEnemy>;
  nextEnemyId: number;
  boss: BossData;
  bossEnemyId: number;
  serverTime: number;
  nextBossTime: number;
  bossIndex: number;
  teamKills: Record<Team, number>;
  spawnTimer: number;
  tickAccum: number;
  playerSyncAccum: number;
  enemySyncAccum: number;
  scoreAccum: number;
  // Wave event
  nextWaveEventTime: number;
  waveEventCount: number;
  // Mini-boss timer
  nextMiniBossTime: number;
  // Event wave timer
  nextEventWaveTime: number;
  activeEvent: { type: string; timer: number } | null;
  // Black holes
  blackHoles: Map<number, ServerBlackHole>;
  nextBlackHoleId: number;
  nextBlackHoleTime: number;
  // Boss projectiles (server-tracked for damage)
  bossProjectiles: ServerBossProjectile[];
  // Previous difficulty for detecting difficulty drops
  prevDifficulty: number;
}

// ─── Party System ─────────────────────────
interface Party {
  code: string;
  leaderId: string;
  members: Map<string, { ws: WebSocket; name: string }>;
  team: Team;
}

const parties = new Map<string, Party>();

function generatePartyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // Ensure unique
  if (parties.has(code)) return generatePartyCode();
  return code;
}

const rooms = new Map<string, Room>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getSmallestTeam(room: Room): Team {
  const counts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
  for (const p of room.players.values()) counts[p.data.team]++;
  let min = Infinity;
  let team: Team = 'blue';
  for (const t of TEAMS) {
    if (counts[t] < min) { min = counts[t]; team = t; }
  }
  return team;
}

function clampToMap(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(-MAP_HALF_W, Math.min(MAP_HALF_W, x)),
    y: Math.max(-MAP_HALF_H, Math.min(MAP_HALF_H, y)),
  };
}

// ─── Dynamic difficulty: purely player-driven (no time component) ───
// Factors: alive player count, avg level, relics, alive ratio
function getRoomDifficulty(room: Room): number {
  const allPlayers = Array.from(room.players.values());
  const alivePlayers = allPlayers.filter(p => p.data.alive);
  const aliveCount = alivePlayers.length;

  // Base difficulty: always at least 1.0
  const base = 1;

  // Level component: avg alive level
  let avgLevel = 1;
  if (aliveCount > 0) {
    let totalLevel = 0;
    for (const p of alivePlayers) totalLevel += p.data.level;
    avgLevel = totalLevel / aliveCount;
  }
  const levelComponent = avgLevel * 0.4;

  // Player count component: more alive players = harder
  const playerComponent = aliveCount * 0.3;

  // Relic component: total relic stacks across alive players
  let totalRelics = 0;
  for (const p of alivePlayers) totalRelics += (p.data.relicCount || 0);
  const relicComponent = totalRelics * 0.15;

  // Alive ratio scaling: when players die, difficulty drops significantly
  const totalPlayers = allPlayers.length;
  const aliveRatio = totalPlayers > 0 ? aliveCount / totalPlayers : 1;
  const aliveScale = 0.15 + 0.85 * aliveRatio;

  return (base + levelComponent + playerComponent + relicComponent) * aliveScale;
}

function findOrCreateRoom(preferCode?: string): Room {
  if (preferCode) {
    const room = rooms.get(preferCode);
    if (room && room.players.size < MAX_PLAYERS_PER_ROOM) return room;
  }
  for (const room of rooms.values()) {
    if (room.players.size < MAX_PLAYERS_PER_ROOM) return room;
  }
  const code = generateRoomCode();
  const room: Room = {
    code,
    players: new Map(),
    enemies: new Map(),
    nextEnemyId: 1,
    boss: { active: false, hp: 0, maxHp: 0, x: 0, y: 0, index: 0, teamDamage: { blue: 0, red: 0, green: 0, yellow: 0 } },
    bossEnemyId: -1,
    serverTime: 0,
    nextBossTime: BOSS_INTERVAL_S,
    bossIndex: 0,
    teamKills: { blue: 0, red: 0, green: 0, yellow: 0 },
    spawnTimer: 0,
    tickAccum: 0,
    playerSyncAccum: 0,
    enemySyncAccum: 0,
    scoreAccum: 0,
    nextWaveEventTime: WAVE_EVENT_INTERVAL,
    waveEventCount: 0,
    nextMiniBossTime: MINI_BOSS_INTERVAL_S,
    nextEventWaveTime: EVENT_WAVE_INTERVAL_S,
    activeEvent: null,
    blackHoles: new Map(),
    nextBlackHoleId: 1,
    nextBlackHoleTime: 90,
    bossProjectiles: [],
    prevDifficulty: 1,
  };
  rooms.set(code, room);
  console.log(`Room created: ${code}`);
  return room;
}

function broadcast(room: Room, msg: S2C_Message, exclude?: string): void {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.data.id !== exclude && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: S2C_Message): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ─── Centroid calculation ───────────────────
function getPlayerCentroid(room: Room): { x: number; y: number } | null {
  const alive = Array.from(room.players.values()).filter(p => p.data.alive);
  if (alive.length === 0) return null;
  let sx = 0, sy = 0;
  for (const p of alive) { sx += p.data.x; sy += p.data.y; }
  return { x: sx / alive.length, y: sy / alive.length };
}

// ─── Enemy Spawning ─────────────────────────
function pickEnemyType(time: number): string {
  if (time > 300) {
    const r = Math.random();
    if (r < 0.06) return 'pentagon';
    if (r < 0.14) return 'charger';
    if (r < 0.22) return 'splitter';
    if (r < 0.32) return 'shield';
    if (r < 0.44) return 'zigzag';
    if (r < 0.54) return 'phaser';
    if (r < 0.64) return 'orbiter';
  } else if (time > 180) {
    const r = Math.random();
    if (r < 0.08) return 'charger';
    if (r < 0.16) return 'splitter';
    if (r < 0.26) return 'shield';
    if (r < 0.38) return 'zigzag';
    if (r < 0.48) return 'phaser';
    if (r < 0.56) return 'orbiter';
  } else if (time > 90) {
    const r = Math.random();
    if (r < 0.08) return 'charger';
    if (r < 0.15) return 'splitter';
    if (r < 0.25) return 'zigzag';
    if (r < 0.32) return 'phaser';
  } else if (time > 60) {
    const r = Math.random();
    if (r < 0.20) return 'zigzag';
    if (r < 0.28) return 'shield';
  } else if (time > 45) {
    if (Math.random() < 0.15) return 'zigzag';
  }
  return 'triangle';
}

function createRoomEnemy(
  room: Room, typeKey: string, x: number, y: number,
  opts: { isElite?: boolean; isBoss?: boolean; hpOverride?: number; speedOverride?: number; xpOverride?: number } = {},
): RoomEnemy {
  const difficulty = getRoomDifficulty(room);
  const def = ENEMY_DEFS[typeKey] || ENEMY_DEFS.triangle;
  const eliteMult = opts.isElite ? 3 : 1;
  const hp = opts.hpOverride ?? Math.floor(def.hp * difficulty * (1 + room.players.size * 0.15) * eliteMult);
  const speed = opts.speedOverride ?? def.speed;
  const xp = opts.xpOverride ?? Math.floor(def.xp * eliteMult);
  const id = room.nextEnemyId++;

  // Assign targeting mode: 70% nearest, 15% centroid, 15% weakest
  const r = Math.random();
  const targetMode = r < 0.70 ? 'nearest' : r < 0.85 ? 'centroid' : 'weakest';

  const pos = clampToMap(x, y);

  return {
    id, type: typeKey,
    x: pos.x, y: pos.y, hp, maxHp: hp,
    speed, baseSpeed: speed, xp,
    isBoss: opts.isBoss ?? false,
    isElite: opts.isElite ?? false,
    dead: false,
    chargeTimer: 2 + Math.random(), chargeVx: 0, chargeVy: 0, isCharging: false,
    vx: 0, vy: 0,
    targetMode,
    damageCooldowns: new Map(),
    // Zigzag
    zigzagPhase: Math.random() * Math.PI * 2,
    // Phaser
    phaserState: 'approach' as const,
    phaserTimer: 3 + Math.random() * 1.5,
    phaserStateTimer: 0,
    isPhasing: false,
    // Orbiter
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDashTimer: 4 + Math.random() * 2,
    orbitDashing: false,
    orbitDashTime: 0,
    // Shield
    rotation: 0,
    // Boss attack
    bossAttackState: 'chase' as const,
    bossAttackTimer: 3 + Math.random() * 2,
    isBossAttacking: false,
  };
}

function spawnEnemy(room: Room): void {
  const centroid = getPlayerCentroid(room);
  if (!centroid) return;

  const alive = Array.from(room.players.values()).filter(p => p.data.alive);

  // Centroid-based spawn: 60% near centroid, 40% near random player
  let spawnX: number, spawnY: number;
  if (alive.length > 1 && Math.random() < 0.6) {
    // Spawn near centroid
    const angle = Math.random() * Math.PI * 2;
    const dist = 400 + Math.random() * 200;
    spawnX = centroid.x + Math.cos(angle) * dist;
    spawnY = centroid.y + Math.sin(angle) * dist;
  } else {
    // Spawn near a random player
    const p = alive[Math.floor(Math.random() * alive.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 550 + Math.random() * 150;
    spawnX = p.data.x + Math.cos(angle) * dist;
    spawnY = p.data.y + Math.sin(angle) * dist;
  }

  const typeKey = pickEnemyType(room.serverTime);
  const isElite = Math.random() < ELITE_CHANCE && room.serverTime > 60;

  const enemy = createRoomEnemy(room, typeKey, spawnX, spawnY, { isElite });
  room.enemies.set(enemy.id, enemy);

  const spawnMsg: S2C_EnemySpawn = {
    type: 'enemy_spawn',
    enemy: {
      id: enemy.id, type: typeKey,
      x: enemy.x, y: enemy.y, hp: enemy.hp, maxHp: enemy.maxHp,
      isBoss: false, isElite: enemy.isElite,
    },
  };
  broadcast(room, spawnMsg);
}

function spawnWaveEnemies(room: Room): void {
  const centroid = getPlayerCentroid(room);
  if (!centroid) return;

  room.waveEventCount++;
  const waveSize = Math.floor(8 + room.waveEventCount * 3 + room.players.size * 2);
  const actualCount = Math.min(waveSize, MAX_ENEMIES - room.enemies.size);

  // Spawn enemies in a ring around centroid
  for (let i = 0; i < actualCount; i++) {
    const angle = (Math.PI * 2 / actualCount) * i + Math.random() * 0.3;
    const dist = 500 + Math.random() * 200;
    const x = centroid.x + Math.cos(angle) * dist;
    const y = centroid.y + Math.sin(angle) * dist;

    const typeKey = pickEnemyType(room.serverTime);
    const enemy = createRoomEnemy(room, typeKey, x, y);
    // Wave enemies all target centroid initially
    enemy.targetMode = 'centroid';
    room.enemies.set(enemy.id, enemy);

    broadcast(room, {
      type: 'enemy_spawn',
      enemy: {
        id: enemy.id, type: typeKey,
        x: enemy.x, y: enemy.y, hp: enemy.hp, maxHp: enemy.maxHp,
        isBoss: false, isElite: false,
      },
    } as S2C_EnemySpawn);
  }

  // Broadcast wave event to clients
  const waveMsg: S2C_WaveEvent = {
    type: 'wave_event',
    waveNumber: room.waveEventCount,
    enemyCount: actualCount,
  };
  broadcast(room, waveMsg);
  console.log(`[${room.code}] Wave #${room.waveEventCount}: ${actualCount} enemies`);
}

function spawnBoss(room: Room): void {
  const centroid = getPlayerCentroid(room);
  if (!centroid) return;

  const mult = 1 + room.bossIndex * 0.8;
  const hp = Math.floor(800 * mult * Math.max(1, room.players.size * 0.5));
  const angle = Math.random() * Math.PI * 2;
  const bx = centroid.x + Math.cos(angle) * 500;
  const by = centroid.y + Math.sin(angle) * 500;

  const enemy = createRoomEnemy(room, 'pentagon', bx, by, {
    isBoss: true, hpOverride: hp, speedOverride: 35, xpOverride: 30 + room.bossIndex * 10,
  });
  room.enemies.set(enemy.id, enemy);

  room.boss = {
    active: true, hp, maxHp: hp,
    x: enemy.x, y: enemy.y, index: room.bossIndex,
    teamDamage: { blue: 0, red: 0, green: 0, yellow: 0 },
  };
  room.bossEnemyId = enemy.id;
  room.bossIndex++;
  room.nextBossTime += BOSS_INTERVAL_S;

  const msg: S2C_BossSpawn = {
    type: 'boss_spawn',
    boss: room.boss,
    enemy: { id: enemy.id, type: 'pentagon', x: enemy.x, y: enemy.y, hp, maxHp: hp, isBoss: true },
  };
  broadcast(room, msg);
  console.log(`[${room.code}] Boss #${room.bossIndex - 1} spawned (${hp} HP)`);
}

// ─── Mini-Boss Spawning ─────────────────────
function spawnMiniBoss(room: Room): void {
  const centroid = getPlayerCentroid(room);
  if (!centroid) return;

  const miniBossDefs = [
    { type: 'charger', bossType: 'charger_elite' },
    { type: 'pentagon', bossType: 'splitter_king' },
    { type: 'shield', bossType: 'shield_bearer' },
  ];
  const chosen = miniBossDefs[Math.floor(Math.random() * miniBossDefs.length)];
  const typeKey = chosen.type;
  const bossType = chosen.bossType;

  const angle = Math.random() * Math.PI * 2;
  const bx = centroid.x + Math.cos(angle) * 400;
  const by = centroid.y + Math.sin(angle) * 400;

  const difficulty = getRoomDifficulty(room);
  let hpMult = 6;
  let speedMult = 1.0;
  let xpMult = 5;

  switch (bossType) {
    case 'charger_elite': hpMult = 6; speedMult = 2.5; xpMult = 5; break;
    case 'splitter_king': hpMult = 8; speedMult = 1.0; xpMult = 6; break;
    case 'shield_bearer': hpMult = 10; speedMult = 0.8; xpMult = 8; break;
  }

  const def = ENEMY_DEFS[typeKey] || ENEMY_DEFS.pentagon;
  const hp = Math.floor(def.hp * difficulty * hpMult * Math.max(1, room.players.size * 0.3));
  const speed = def.speed * speedMult;
  const xp = Math.floor(def.xp * xpMult);

  const enemy = createRoomEnemy(room, typeKey, bx, by, {
    hpOverride: hp, speedOverride: speed, xpOverride: xp, isElite: true,
  });
  room.enemies.set(enemy.id, enemy);

  const se: ServerEnemy = {
    id: enemy.id, type: typeKey, x: enemy.x, y: enemy.y,
    hp, maxHp: hp, isBoss: false, isElite: true,
  };

  const msg: S2C_MiniBossSpawn = {
    type: 'mini_boss_spawn',
    enemy: se,
    bossType,
  };
  broadcast(room, msg);
  console.log(`[${room.code}] Mini-boss "${bossType}" spawned (${hp} HP)`);
}

// ─── Event Wave System ──────────────────────
function triggerEventWave(room: Room): void {
  const events = ['gold_rush', 'elite_invasion', 'boss_rush', 'healing_rain'];
  const event = events[Math.floor(Math.random() * events.length)] as string;

  let duration = 0;
  switch (event) {
    case 'gold_rush': duration = 30; break;
    case 'elite_invasion': duration = 20; break;
    case 'boss_rush': duration = 0; break; // instant
    case 'healing_rain': duration = 20; break;
  }

  // Broadcast event start
  if (duration > 0) {
    room.activeEvent = { type: event, timer: duration };
    const startMsg: S2C_EventWave = {
      type: 'event_wave_start',
      event: event as any,
      duration,
    };
    broadcast(room, startMsg);
  }

  // Apply event effects
  switch (event) {
    case 'elite_invasion': {
      // Spawn 8 elite enemies
      const centroid = getPlayerCentroid(room);
      if (centroid) {
        for (let i = 0; i < 8 && room.enemies.size < MAX_ENEMIES; i++) {
          const a = (Math.PI * 2 / 8) * i;
          const d = 400 + Math.random() * 200;
          const ex = centroid.x + Math.cos(a) * d;
          const ey = centroid.y + Math.sin(a) * d;
          const typeKey = pickEnemyType(room.serverTime);
          const enemy = createRoomEnemy(room, typeKey, ex, ey, { isElite: true });
          room.enemies.set(enemy.id, enemy);
          broadcast(room, {
            type: 'enemy_spawn',
            enemy: { id: enemy.id, type: typeKey, x: enemy.x, y: enemy.y, hp: enemy.hp, maxHp: enemy.maxHp, isBoss: false, isElite: true },
          } as S2C_EnemySpawn);
        }
      }
      break;
    }
    case 'boss_rush':
      // Spawn 2 mini-bosses
      spawnMiniBoss(room);
      spawnMiniBoss(room);
      // Broadcast as event banner (short duration)
      broadcast(room, { type: 'event_wave_start', event: 'boss_rush', duration: 5 } as S2C_EventWave);
      break;
  }

  console.log(`[${room.code}] Event wave: ${event} (${duration}s)`);
}

// ─── Enemy Movement (server-side) ───────────
function updateEnemies(room: Room): void {
  const players = Array.from(room.players.values()).filter(p => p.data.alive);
  if (players.length === 0) return;

  const centroid = getPlayerCentroid(room);

  // Collect ForceField players for slow effect
  const ffPlayers: { x: number; y: number; radius: number }[] = [];
  for (const p of players) {
    if (!p.data.weapons) continue;
    const ff = p.data.weapons.find(w => w.id === 'forcefield');
    if (!ff) continue;
    const r = ff.evolved ? FF_RADIUS_EVOLVED : (FF_RADIUS[ff.level] ?? 60);
    ffPlayers.push({ x: p.data.x, y: p.data.y, radius: r });
  }

  for (const enemy of room.enemies.values()) {
    if (enemy.dead) continue;

    // ForceField slow: reduce speed if enemy is inside any player's ForceField
    let inForceField = false;
    for (const ff of ffPlayers) {
      const fdx = enemy.x - ff.x;
      const fdy = enemy.y - ff.y;
      if (fdx * fdx + fdy * fdy < ff.radius * ff.radius) {
        inForceField = true;
        break;
      }
    }
    if (inForceField) {
      enemy.speed = Math.min(enemy.speed, enemy.baseSpeed * FF_SLOW_FACTOR);
    }

    // Find target based on targeting mode
    let targetX = 0, targetY = 0;

    if (enemy.targetMode === 'centroid' && centroid) {
      // Move toward centroid (between players)
      targetX = centroid.x;
      targetY = centroid.y;
    } else if (enemy.targetMode === 'weakest') {
      // Target lowest HP player
      let minHp = Infinity;
      for (const p of players) {
        if (p.data.hp < minHp) {
          minHp = p.data.hp;
          targetX = p.data.x;
          targetY = p.data.y;
        }
      }
    } else {
      // 'nearest' — default
      let nearestDist = Infinity;
      for (const p of players) {
        const dx = p.data.x - enemy.x;
        const dy = p.data.y - enemy.y;
        const d = dx * dx + dy * dy;
        if (d < nearestDist) {
          nearestDist = d;
          targetX = p.data.x;
          targetY = p.data.y;
        }
      }
    }

    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Update rotation toward target
    if (dist > 1) {
      enemy.rotation = Math.atan2(dy, dx);
    }

    // Enemy-type-specific movement
    if (enemy.type === 'charger') {
      enemy.chargeTimer -= TICK_S;
      if (enemy.isCharging) {
        enemy.x += enemy.chargeVx * TICK_S;
        enemy.y += enemy.chargeVy * TICK_S;
        enemy.vx = enemy.chargeVx;
        enemy.vy = enemy.chargeVy;
        enemy.chargeVx *= 0.97;
        enemy.chargeVy *= 0.97;
        if (Math.abs(enemy.chargeVx) < 20) enemy.isCharging = false;
      } else if (enemy.chargeTimer <= 0 && dist < 350) {
        enemy.chargeTimer = 2.5 + Math.random();
        enemy.isCharging = true;
        const angle = Math.atan2(dy, dx);
        enemy.chargeVx = Math.cos(angle) * 500;
        enemy.chargeVy = Math.sin(angle) * 500;
      } else if (dist > 1) {
        const spd = enemy.speed * 0.6;
        enemy.vx = (dx / dist) * spd;
        enemy.vy = (dy / dist) * spd;
        enemy.x += enemy.vx * TICK_S;
        enemy.y += enemy.vy * TICK_S;
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
    } else if (enemy.type === 'zigzag') {
      enemy.zigzagPhase += 5 * TICK_S;
      if (dist > 1) {
        const moveAngle = Math.atan2(dy, dx);
        const perpX = -Math.sin(moveAngle);
        const perpY = Math.cos(moveAngle);
        const sinOffset = Math.sin(enemy.zigzagPhase) * 80;
        const forwardX = (dx / dist) * enemy.speed;
        const forwardY = (dy / dist) * enemy.speed;
        enemy.vx = forwardX + perpX * sinOffset * 3;
        enemy.vy = forwardY + perpY * sinOffset * 3;
        enemy.x += enemy.vx * TICK_S;
        enemy.y += enemy.vy * TICK_S;
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
    } else if (enemy.type === 'phaser') {
      switch (enemy.phaserState) {
        case 'approach':
          enemy.phaserTimer -= TICK_S;
          if (dist > 1) {
            enemy.vx = (dx / dist) * enemy.speed;
            enemy.vy = (dy / dist) * enemy.speed;
            enemy.x += enemy.vx * TICK_S;
            enemy.y += enemy.vy * TICK_S;
          }
          if (enemy.phaserTimer <= 0) {
            enemy.phaserState = 'telegraph';
            enemy.phaserStateTimer = 0.3;
            enemy.isPhasing = true;
          }
          break;
        case 'telegraph':
          enemy.phaserStateTimer -= TICK_S;
          enemy.vx = 0;
          enemy.vy = 0;
          if (enemy.phaserStateTimer <= 0) {
            enemy.phaserState = 'invisible';
            enemy.phaserStateTimer = 0.2;
          }
          break;
        case 'invisible':
          enemy.phaserStateTimer -= TICK_S;
          enemy.vx = 0;
          enemy.vy = 0;
          if (enemy.phaserStateTimer <= 0) {
            const tpAngle = Math.random() * Math.PI * 2;
            const tpDist = 80 + Math.random() * 60;
            enemy.x = targetX + Math.cos(tpAngle) * tpDist;
            enemy.y = targetY + Math.sin(tpAngle) * tpDist;
            enemy.phaserState = 'appear';
            enemy.phaserStateTimer = 0.1;
          }
          break;
        case 'appear':
          enemy.phaserStateTimer -= TICK_S;
          enemy.vx = 0;
          enemy.vy = 0;
          if (enemy.phaserStateTimer <= 0) {
            enemy.phaserState = 'approach';
            enemy.phaserTimer = 3 + Math.random() * 1.5;
            enemy.isPhasing = false;
          }
          break;
      }
    } else if (enemy.type === 'orbiter') {
      const orbitRadius = 200;
      if (enemy.orbitDashing) {
        enemy.orbitDashTime -= TICK_S;
        if (dist > 20) {
          enemy.vx = (dx / dist) * enemy.speed * 3;
          enemy.vy = (dy / dist) * enemy.speed * 3;
          enemy.x += enemy.vx * TICK_S;
          enemy.y += enemy.vy * TICK_S;
        }
        if (enemy.orbitDashTime <= 0) {
          enemy.orbitDashing = false;
          enemy.orbitDashTimer = 4 + Math.random() * 2;
        }
      } else {
        enemy.orbitDashTimer -= TICK_S;
        if (enemy.orbitDashTimer <= 0 && dist < orbitRadius + 50) {
          enemy.orbitDashing = true;
          enemy.orbitDashTime = 0.4;
        } else if (dist > orbitRadius + 50) {
          if (dist > 1) {
            enemy.vx = (dx / dist) * enemy.speed;
            enemy.vy = (dy / dist) * enemy.speed;
            enemy.x += enemy.vx * TICK_S;
            enemy.y += enemy.vy * TICK_S;
          }
        } else {
          enemy.orbitAngle += (enemy.speed / orbitRadius) * TICK_S;
          const ox = targetX + Math.cos(enemy.orbitAngle) * orbitRadius;
          const oy = targetY + Math.sin(enemy.orbitAngle) * orbitRadius;
          const odx = ox - enemy.x;
          const ody = oy - enemy.y;
          const odist = Math.sqrt(odx * odx + ody * ody);
          if (odist > 1) {
            enemy.vx = (odx / odist) * enemy.speed * 1.5;
            enemy.vy = (ody / odist) * enemy.speed * 1.5;
            enemy.x += enemy.vx * TICK_S;
            enemy.y += enemy.vy * TICK_S;
          }
        }
      }
    } else if (dist > 1) {
      // Normal chase (triangle, pentagon, shield, splitter)
      enemy.vx = (dx / dist) * enemy.speed;
      enemy.vy = (dy / dist) * enemy.speed;
      enemy.x += enemy.vx * TICK_S;
      enemy.y += enemy.vy * TICK_S;
    } else {
      enemy.vx = 0;
      enemy.vy = 0;
    }

    // Boss attack state machine
    if (enemy.isBoss && room.boss.active) {
      enemy.bossAttackTimer -= TICK_S;
      switch (enemy.bossAttackState) {
        case 'chase':
          enemy.isBossAttacking = false;
          if (enemy.bossAttackTimer <= 0) {
            enemy.bossAttackState = 'attack';
            enemy.isBossAttacking = true;
            // Execute attack
            executeBossAttack(room, enemy, targetX, targetY);
          }
          break;
        case 'attack':
          enemy.bossAttackState = 'cooldown';
          enemy.bossAttackTimer = 1;
          break;
        case 'cooldown':
          enemy.isBossAttacking = false;
          if (enemy.bossAttackTimer <= 0) {
            enemy.bossAttackState = 'chase';
            enemy.bossAttackTimer = 3 + Math.random() * 2;
          }
          break;
      }
    }

    // Clamp enemy to map boundaries
    const clamped = clampToMap(enemy.x, enemy.y);
    enemy.x = clamped.x;
    enemy.y = clamped.y;

    // Restore speed if slowed and NOT inside a ForceField (quick recovery outside)
    if (!inForceField && enemy.speed < enemy.baseSpeed) {
      enemy.speed = Math.min(enemy.baseSpeed, enemy.speed + enemy.baseSpeed * 2 * TICK_S);
    }

    // Update boss position in boss data
    if (enemy.isBoss && room.boss.active) {
      room.boss.x = enemy.x;
      room.boss.y = enemy.y;
    }

    // Decay collision cooldowns
    for (const [pid, cd] of enemy.damageCooldowns) {
      const remaining = cd - TICK_S;
      if (remaining <= 0) enemy.damageCooldowns.delete(pid);
      else enemy.damageCooldowns.set(pid, remaining);
    }

    // Player collision damage (server-side) - with per-player cooldown
    for (const p of players) {
      if (!p.data.alive) continue;
      if (enemy.damageCooldowns.has(p.data.id)) continue;

      const pdx = p.data.x - enemy.x;
      const pdy = p.data.y - enemy.y;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      const def = ENEMY_DEFS[enemy.type];
      const enemyRadius = enemy.isElite ? (def?.radius ?? 12) * 1.5 : (def?.radius ?? 12);
      if (pdist < enemyRadius + 10) {
        enemy.damageCooldowns.set(p.data.id, 0.8);
        const baseDmg = def ? def.damage : 10;
        const colDifficulty = getRoomDifficulty(room);
        const dmg = Math.floor(baseDmg * colDifficulty * (enemy.isElite ? 1.5 : 1));
        const pvpMsg: S2C_PvpDamage = {
          type: 'pvp_damage',
          fromId: `enemy_${enemy.id}`,
          fromTeam: 'red',
          damage: dmg,
        };
        send(p.ws, pvpMsg);
      }
    }
  }
}

// ─── Boss Attack Execution ──────────────────
function executeBossAttack(room: Room, boss: RoomEnemy, targetX: number, targetY: number): void {
  const attacks: Array<'radial_burst' | 'aimed_shot' | 'charge_slam'> = ['radial_burst', 'aimed_shot', 'charge_slam'];
  const attackType = attacks[Math.floor(Math.random() * attacks.length)];
  const baseDmg = boss.hp > 0 ? Math.floor((ENEMY_DEFS.pentagon?.damage ?? 20) * getRoomDifficulty(room)) : 20;

  const msg: S2C_BossAttack = {
    type: 'boss_attack',
    attackType,
    bossId: boss.id,
    x: boss.x,
    y: boss.y,
    projectiles: [],
  };

  switch (attackType) {
    case 'radial_burst': {
      const count = 8 + Math.floor(Math.random() * 5);
      const speed = 300;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        msg.projectiles.push({
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: Math.floor(baseDmg * 0.6),
          lifetime: 2,
        });
      }
      break;
    }
    case 'aimed_shot': {
      const dx = targetX - boss.x;
      const dy = targetY - boss.y;
      const baseAngle = Math.atan2(dy, dx);
      const speed = 450;
      const spread = (15 * Math.PI) / 180;
      for (let i = -1; i <= 1; i++) {
        const angle = baseAngle + spread * i;
        msg.projectiles.push({
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: Math.floor(baseDmg * 0.6),
          lifetime: 2,
        });
      }
      break;
    }
    case 'charge_slam': {
      msg.aoe = {
        x: targetX,
        y: targetY,
        radius: 120,
        damage: Math.floor(baseDmg * 0.8),
      };
      // Server-side AoE damage to nearby players
      for (const p of room.players.values()) {
        if (!p.data.alive) continue;
        const pdx = p.data.x - targetX;
        const pdy = p.data.y - targetY;
        if (pdx * pdx + pdy * pdy < 120 * 120) {
          send(p.ws, {
            type: 'pvp_damage',
            fromId: `boss_${boss.id}`,
            fromTeam: 'red',
            damage: Math.floor(baseDmg * 0.8),
          } as S2C_PvpDamage);
        }
      }
      break;
    }
  }

  // Track projectiles server-side for player damage
  if (attackType !== 'charge_slam') {
    for (const p of msg.projectiles) {
      room.bossProjectiles.push({
        x: boss.x, y: boss.y,
        vx: p.vx, vy: p.vy,
        damage: p.damage,
        life: p.lifetime,
        hitPlayers: new Set(),
      });
    }
  }

  broadcast(room, msg);
}

// ─── Black Hole Management ──────────────────
const BH_GROW = 5;
const BH_PEAK = 8;
const BH_FADE = 3;
const BH_TOTAL = BH_GROW + BH_PEAK + BH_FADE;
const BH_MAX_RADIUS = 120;
const BH_PULL_SPEED = 200;
const BH_DMG_PS = 15;
const BH_MAX_COUNT = 2;

function spawnBlackHole(room: Room): void {
  if (room.blackHoles.size >= BH_MAX_COUNT) return;
  const centroid = getPlayerCentroid(room);
  if (!centroid) return;

  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 300;
  const x = centroid.x + Math.cos(angle) * dist;
  const y = centroid.y + Math.sin(angle) * dist;
  const clamped = clampToMap(x, y);

  const id = room.nextBlackHoleId++;
  const bh: ServerBlackHole = { id, x: clamped.x, y: clamped.y, radius: 10, age: 0, dead: false };
  room.blackHoles.set(id, bh);

  const msg: S2C_BlackHoleSpawn = { type: 'blackhole_spawn', id, x: clamped.x, y: clamped.y };
  broadcast(room, msg);
  console.log(`[${room.code}] BlackHole #${id} spawned at (${Math.round(clamped.x)}, ${Math.round(clamped.y)})`);
}

function updateBlackHoles(room: Room): void {
  const players = Array.from(room.players.values()).filter(p => p.data.alive);

  for (const bh of room.blackHoles.values()) {
    if (bh.dead) continue;
    bh.age += TICK_S;

    if (bh.age >= BH_TOTAL) {
      bh.dead = true;
      const msg: S2C_BlackHoleDespawn = { type: 'blackhole_despawn', id: bh.id };
      broadcast(room, msg);
      continue;
    }

    // Calculate current phase
    let t: number;
    let pullStrength: number;
    let dmgPs: number;
    if (bh.age < BH_GROW) {
      t = bh.age / BH_GROW;
      bh.radius = 10 + (BH_MAX_RADIUS - 10) * t;
      pullStrength = BH_PULL_SPEED * t;
      dmgPs = BH_DMG_PS * t;
    } else if (bh.age < BH_GROW + BH_PEAK) {
      bh.radius = BH_MAX_RADIUS;
      pullStrength = BH_PULL_SPEED;
      dmgPs = BH_DMG_PS;
    } else {
      t = 1 - (bh.age - BH_GROW - BH_PEAK) / BH_FADE;
      bh.radius = BH_MAX_RADIUS * Math.max(0, t);
      pullStrength = BH_PULL_SPEED * Math.max(0, t);
      dmgPs = BH_DMG_PS * Math.max(0, t);
    }

    const pullRange = bh.radius * 2.5;

    // Pull + slow enemies
    for (const enemy of room.enemies.values()) {
      if (enemy.dead) continue;
      const edx = bh.x - enemy.x;
      const edy = bh.y - enemy.y;
      const eDist = Math.sqrt(edx * edx + edy * edy);
      if (eDist < pullRange && eDist > 5) {
        const factor = pullStrength * (1 - eDist / pullRange) * TICK_S;
        enemy.x += (edx / eDist) * factor;
        enemy.y += (edy / eDist) * factor;
        // Slow enemies inside the hole radius
        if (eDist < bh.radius) {
          enemy.speed = Math.min(enemy.speed, enemy.baseSpeed * 0.2);
        }
      }
    }

    // Pull + damage players
    for (const p of players) {
      const pdx = bh.x - p.data.x;
      const pdy = bh.y - p.data.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pDist < pullRange && pDist > 5) {
        // Pull (client handles visual, we just apply damage)
        // Damage if inside damage zone
        if (pDist < bh.radius) {
          const dmg = Math.max(1, Math.floor(dmgPs * TICK_S));
          send(p.ws, {
            type: 'pvp_damage',
            fromId: `blackhole_${bh.id}`,
            fromTeam: 'red',
            damage: dmg,
          } as S2C_PvpDamage);
        }
      }
    }
  }

  // Cleanup dead black holes
  for (const [id, bh] of room.blackHoles) {
    if (bh.dead) room.blackHoles.delete(id);
  }
}

// ─── Sync helpers ───────────────────────────
function buildEnemySyncData(room: Room): number[] {
  const data: number[] = [];
  for (const e of room.enemies.values()) {
    if (e.dead) continue;
    // flags: bit0=isCharging, bit1=isElite, bit2=isSlowed, bit3=isPhasing, bit4=isBossAttacking
    const isSlowed = e.speed < e.baseSpeed * 0.95;
    const flags = (e.isCharging ? 1 : 0)
      | (e.isElite ? 2 : 0)
      | (isSlowed ? 4 : 0)
      | (e.isPhasing ? 8 : 0)
      | (e.isBossAttacking ? 16 : 0);
    data.push(e.id, Math.round(e.x), Math.round(e.y), e.hp, flags,
              Math.round(e.vx), Math.round(e.vy));
  }
  return data;
}

function getFullEnemyList(room: Room): ServerEnemy[] {
  const list: ServerEnemy[] = [];
  for (const e of room.enemies.values()) {
    if (e.dead) continue;
    list.push({
      id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
      isBoss: e.isBoss, isElite: e.isElite, isCharging: e.isCharging,
    });
  }
  return list;
}

function getTeamScores(room: Room): S2C_TeamScores {
  const scores: Record<Team, { kills: number; bossContrib: number; players: number }> =
    { blue: { kills: 0, bossContrib: 0, players: 0 }, red: { kills: 0, bossContrib: 0, players: 0 },
      green: { kills: 0, bossContrib: 0, players: 0 }, yellow: { kills: 0, bossContrib: 0, players: 0 } };
  for (const p of room.players.values()) {
    const t = p.data.team;
    scores[t].kills += p.data.kills;
    scores[t].players++;
  }
  for (const t of TEAMS) {
    scores[t].bossContrib = room.boss.teamDamage[t] ?? 0;
  }
  return { type: 'team_scores', scores };
}

function getLeaderboard(room: Room): S2C_Leaderboard {
  const entries = Array.from(room.players.values())
    .map(p => ({ name: p.data.name, kills: p.data.kills, level: p.data.level, team: p.data.team }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);
  return { type: 'leaderboard', entries };
}

// ─── MIME types for static serving ──────────
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const DIST_DIR = path.resolve(process.cwd(), 'dist');

// ─── HTTP + WebSocket Server ────────────────
const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Static file serving (dist/)
  let urlPath = req.url || '/';
  // Strip query string
  const qIdx = urlPath.indexOf('?');
  if (qIdx !== -1) urlPath = urlPath.slice(0, qIdx);
  // Decode and resolve to prevent path traversal (%2e%2e etc)
  try { urlPath = decodeURIComponent(urlPath); } catch { res.writeHead(400); res.end(); return; }

  const filePath = path.resolve(DIST_DIR, '.' + path.normalize(urlPath === '/' ? '/index.html' : urlPath));
  // Prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const compressible = ['.html', '.js', '.css', '.json', '.svg', '.txt'].includes(ext);
  const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');

  const sendCompressed = (data: Buffer, ct: string) => {
    if (compressible && acceptGzip && data.length > 1024) {
      zlib.gzip(data, (err, compressed) => {
        if (err) { res.writeHead(200, { 'Content-Type': ct }); res.end(data); return; }
        res.writeHead(200, { 'Content-Type': ct, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
        res.end(compressed);
      });
    } else {
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    }
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for non-file routes
      if (err.code === 'ENOENT' && !ext) {
        fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Not Found'); return; }
          sendCompressed(data2, 'text/html');
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    sendCompressed(data, contentType);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
wss.on('error', (err) => { console.error('WSS error:', err.message); });
server.listen(PORT, () => {
  console.log(`Geo Survivors server running on http://localhost:${PORT} (ws: /ws)`);
});

wss.on('connection', (ws: WebSocket) => {
  let playerId = '';
  let playerRoom: Room | null = null;
  // Rate limiting: max 100 messages per second per client
  let msgCount = 0;
  let msgResetTime = Date.now();
  console.log('New WebSocket connection');

  ws.on('message', (raw: Buffer) => {
    // Rate limit check
    const now = Date.now();
    if (now - msgResetTime > 1000) { msgCount = 0; msgResetTime = now; }
    if (++msgCount > 100) return;

    let msg: C2S_Message;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    try { switch (msg.type) {
      case 'join': {
        // Prevent duplicate joins: clean up previous session
        if (playerId && playerRoom) {
          playerRoom.players.delete(playerId);
          broadcast(playerRoom, { type: 'player_leave', id: playerId });
        }
        playerId = generateId();

        // Lobby mode: establish identity for party operations without joining a room
        if (msg.lobby) {
          const pName = (typeof msg.name === 'string' ? msg.name.slice(0, 20).replace(/[<>&"']/g, '') : '') || `Player_${playerId.slice(0, 4)}`;
          (ws as any).__lobbyName = pName;
          playerRoom = null;
          console.log(`[lobby] ${pName} connected (${playerId.slice(0, 6)})`);
          break;
        }

        // Check if player is in a party and should be assigned to a specific room/team
        let partyTeam: Team | null = null;
        let partyRoomCode: string | undefined = msg.roomCode;
        const partyCode = (ws as any).__partyCode as string | undefined;
        if (partyCode) {
          const party = parties.get(partyCode);
          if (party && (party as any).roomCode) {
            partyRoomCode = (party as any).roomCode;
            partyTeam = (party as any).forcedTeam || null;
          }
        }
        const room = findOrCreateRoom(partyRoomCode);
        playerRoom = room;
        const team = partyTeam || getSmallestTeam(room);

        const playerData: PlayerData = {
          id: playerId,
          name: (typeof msg.name === 'string' ? msg.name.slice(0, 20).replace(/[<>&"']/g, '') : '') || `Player_${playerId.slice(0, 4)}`,
          team,
          x: 0, y: 0, level: 1, kills: 0,
          hp: 100, maxHp: 100, rotation: 0, alive: true,
          weapons: [], relicCount: 0,
        };

        room.players.set(playerId, { ws, data: playerData, lastUpdate: Date.now() });

        const welcome: S2C_Welcome = {
          type: 'welcome',
          id: playerId, team,
          roomCode: room.code,
          players: Array.from(room.players.values()).map(p => p.data),
          boss: room.boss,
          enemies: getFullEnemyList(room),
          serverTime: room.serverTime,
          nextBossTime: room.nextBossTime,
        };
        send(ws, welcome);
        broadcast(room, { type: 'player_join', player: playerData }, playerId);
        console.log(`[${room.code}] ${playerData.name} joined team ${team} (${room.players.size} players)`);
        break;
      }

      case 'state': {
        if (!playerRoom) return;
        const sp = playerRoom.players.get(playerId);
        if (!sp) return;
        // Clamp player position to map boundaries
        const clamped = clampToMap(msg.x, msg.y);
        sp.data.x = clamped.x;
        sp.data.y = clamped.y;
        // Validate and clamp incoming stats
        sp.data.level = Math.max(1, Math.min(Math.floor(msg.level || 1), 100));
        sp.data.kills = Math.max(0, Math.min(Math.floor(msg.kills || 0), 99999));
        sp.data.maxHp = Math.max(50, Math.min(Math.floor(msg.maxHp || 100), 2000));
        sp.data.hp = Math.max(0, Math.min(Math.floor(msg.hp || 0), sp.data.maxHp));
        sp.data.rotation = typeof msg.rotation === 'number' && isFinite(msg.rotation) ? msg.rotation : 0;
        sp.data.alive = sp.data.hp > 0;
        sp.data.relicCount = Math.max(0, Math.min(Math.floor(msg.relicCount || 0), 50));
        if (msg.weapons && Array.isArray(msg.weapons) && msg.weapons.length <= 8) {
          sp.data.weapons = msg.weapons;
        }
        sp.lastUpdate = Date.now();
        break;
      }

      case 'enemy_hit': {
        if (!playerRoom) return;
        const sp = playerRoom.players.get(playerId);
        if (!sp) return;
        const enemy = playerRoom.enemies.get(msg.enemyId);
        if (!enemy || enemy.dead) return;

        // Anti-cheat: cap damage per hit at 200
        let dmg = Math.min(msg.damage, 200);

        // Shield: front 120° arc reduces damage by 75%
        if (enemy.type === 'shield') {
          const attackAngle = Math.atan2(sp.data.y - enemy.y, sp.data.x - enemy.x);
          let angleDiff = attackAngle - enemy.rotation;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          // Attack coming from the front of the shield (enemy faces player, so front = toward attacker)
          // We check if attack is within ±60° of the enemy's facing direction
          if (Math.abs(angleDiff) < Math.PI / 3) {
            dmg = Math.floor(dmg * 0.25);
          }
        }

        enemy.hp -= dmg;

        // Boss damage tracking
        if (enemy.isBoss && playerRoom.boss.active) {
          playerRoom.boss.hp = enemy.hp;
          playerRoom.boss.teamDamage[sp.data.team] += dmg;

          const upd: S2C_BossUpdate = {
            type: 'boss_update',
            hp: Math.max(0, enemy.hp),
            teamDamage: playerRoom.boss.teamDamage,
          };
          broadcast(playerRoom, upd);
        }

        if (enemy.hp <= 0) {
          enemy.dead = true;
          const deathMsg: S2C_EnemyDeath = {
            type: 'enemy_death',
            enemyId: enemy.id,
            killerTeam: sp.data.team,
            x: enemy.x, y: enemy.y,
            xp: enemy.xp,
            isBoss: enemy.isBoss,
          };
          broadcast(playerRoom, deathMsg);

          playerRoom.teamKills[sp.data.team]++;

          // Boss death
          if (enemy.isBoss && playerRoom.boss.active) {
            playerRoom.boss.active = false;
            let maxDmg = 0;
            let winner: Team = 'blue';
            for (const t of TEAMS) {
              if (playerRoom.boss.teamDamage[t] > maxDmg) {
                maxDmg = playerRoom.boss.teamDamage[t];
                winner = t;
              }
            }
            const deadMsg: S2C_BossDead = { type: 'boss_dead', winningTeam: winner, bossId: enemy.id };
            broadcast(playerRoom, deadMsg);
            console.log(`[${playerRoom.code}] Boss killed! Winner: ${winner}`);
          }

          setTimeout(() => { playerRoom?.enemies.delete(enemy.id); }, 1000);

          // Splitter: spawn mini enemies
          if (enemy.type === 'splitter' && !enemy.isBoss) {
            for (let s = 0; s < 3; s++) {
              const a = (Math.PI * 2 / 3) * s + Math.random() * 0.5;
              const mx = enemy.x + Math.cos(a) * 20;
              const my = enemy.y + Math.sin(a) * 20;
              const mini = createRoomEnemy(playerRoom, 'triangle', mx, my, {
                hpOverride: Math.floor(15 * getRoomDifficulty(playerRoom)),
                speedOverride: 100,
                xpOverride: 1,
              });
              playerRoom.enemies.set(mini.id, mini);
              broadcast(playerRoom, {
                type: 'enemy_spawn',
                enemy: { id: mini.id, type: 'triangle', x: mini.x, y: mini.y, hp: mini.hp, maxHp: mini.maxHp, isBoss: false },
              });
            }
          }
        }
        break;
      }

      case 'pvp_hit': {
        if (!playerRoom) return;
        const attacker = playerRoom.players.get(playerId);
        const target = playerRoom.players.get(msg.targetId);
        if (!attacker || !target) return;
        if (attacker.data.team === target.data.team) return;
        const dmg = Math.min(msg.damage, 100);
        const pvpMsg: S2C_PvpDamage = {
          type: 'pvp_damage',
          fromId: playerId,
          fromTeam: attacker.data.team,
          damage: dmg,
        };
        send(target.ws, pvpMsg);
        break;
      }

      case 'chat': {
        if (!playerRoom) return;
        const sp = playerRoom.players.get(playerId);
        if (!sp) return;
        broadcast(playerRoom, {
          type: 'chat', name: sp.data.name, team: sp.data.team, msg: msg.msg.slice(0, 100),
        });
        break;
      }

      case 'ping': {
        if (!playerRoom) return;
        const sp = playerRoom.players.get(playerId);
        if (!sp) return;
        const pingPos = clampToMap(msg.x, msg.y);
        const pingMsg: S2C_PingSignal = {
          type: 'ping_signal',
          x: pingPos.x,
          y: pingPos.y,
          team: sp.data.team,
          playerName: sp.data.name,
        };
        broadcast(playerRoom, pingMsg, playerId);
        break;
      }

      case 'pull_request': {
        if (!playerRoom) return;
        // Validate pull parameters
        const pullRadius = Math.min(Math.max(msg.radius || 0, 0), 300);
        const pullStrength = Math.min(Math.max(msg.strength || 0, 0), 500);
        const pullPos = clampToMap(msg.x, msg.y);
        // Apply pull force to enemies near the specified position
        for (const enemy of playerRoom.enemies.values()) {
          if (enemy.dead) continue;
          const edx = pullPos.x - enemy.x;
          const edy = pullPos.y - enemy.y;
          const eDist = Math.sqrt(edx * edx + edy * edy);
          if (eDist < pullRadius && eDist > 30) {
            const pullForce = pullStrength * TICK_S;
            enemy.x += (edx / eDist) * pullForce;
            enemy.y += (edy / eDist) * pullForce;
          }
        }
        break;
      }

      case 'create_party': {
        const code = generatePartyCode();
        const party: Party = {
          code,
          leaderId: playerId,
          members: new Map(),
          team: 'blue',
        };
        // Get name from room player data or lobby
        const pName = playerRoom?.players.get(playerId)?.data.name || (ws as any).__lobbyName || 'Player';
        party.members.set(playerId, { ws, name: pName });
        parties.set(code, party);
        // Store party code on player for lookup
        (ws as any).__partyCode = code;
        const createdMsg: S2C_PartyCreated = { type: 'party_created', code };
        send(ws, createdMsg);
        console.log(`Party created: ${code} by ${pName}`);
        break;
      }

      case 'join_party': {
        const partyCode = msg.code.toUpperCase();
        const party = parties.get(partyCode);
        if (!party) {
          send(ws, { type: 'party_error', reason: 'Party not found' } as S2C_PartyError);
          break;
        }
        if (party.members.size >= MAX_PARTY_SIZE) {
          send(ws, { type: 'party_error', reason: 'Party is full' } as S2C_PartyError);
          break;
        }
        const pName = playerRoom?.players.get(playerId)?.data.name || (ws as any).__lobbyName || 'Player';
        party.members.set(playerId, { ws, name: pName });
        (ws as any).__partyCode = partyCode;
        // Notify joiner
        const memberNames = Array.from(party.members.values()).map(m => m.name);
        const joinedMsg: S2C_PartyJoined = { type: 'party_joined', code: partyCode, members: memberNames };
        send(ws, joinedMsg);
        // Notify others
        const joinNotify: S2C_PartyMemberJoin = { type: 'party_member_join', name: pName };
        for (const [mid, m] of party.members) {
          if (mid !== playerId) send(m.ws, joinNotify);
        }
        console.log(`${pName} joined party ${partyCode} (${party.members.size} members)`);
        break;
      }

      case 'party_start': {
        const partyCode = (ws as any).__partyCode as string | undefined;
        if (!partyCode) break;
        const party = parties.get(partyCode);
        if (!party || party.leaderId !== playerId) break;
        // All party members join the same room with the same team
        const room = findOrCreateRoom();
        const team = getSmallestTeam(room);
        party.team = team;
        // The leader's join will happen normally when they connect
        // Store party room info for subsequent joins
        (party as any).roomCode = room.code;
        (party as any).forcedTeam = team;
        console.log(`Party ${partyCode} starting in room ${room.code}, team ${team}`);
        // Notify all party members to join the game
        for (const m of party.members.values()) {
          send(m.ws, { type: 'party_game_start', roomCode: room.code } as any);
        }
        break;
      }

      // ─── Spectate ───
      case 'spectate': {
        const sp = playerRoom?.players.get(playerId);
        if (!playerRoom || !sp) break;
        // Find alive players in the room (excluding self)
        const alivePlayers = Array.from(playerRoom.players.values())
          .filter(p => p.data.alive && p.data.id !== playerId);
        if (alivePlayers.length === 0) break;
        const target = alivePlayers[0];
        (sp as any).isSpectating = true;
        (sp as any).spectateTarget = target.data.id;
        send(ws, { type: 'spectate_start', targetId: target.data.id, targetName: target.data.name } as any);
        break;
      }

      case 'spectate_cycle': {
        const sp = playerRoom?.players.get(playerId);
        if (!playerRoom || !sp || !(sp as any).isSpectating) break;
        const dir = (msg as any).direction;
        const alivePlayers = Array.from(playerRoom.players.values())
          .filter(p => p.data.alive && p.data.id !== playerId);
        if (alivePlayers.length === 0) {
          (sp as any).isSpectating = false;
          send(ws, { type: 'spectate_end' } as any);
          break;
        }
        const curIdx = alivePlayers.findIndex(p => p.data.id === (sp as any).spectateTarget);
        let nextIdx = dir === 'next' ? (curIdx + 1) % alivePlayers.length
          : (curIdx - 1 + alivePlayers.length) % alivePlayers.length;
        const next = alivePlayers[nextIdx];
        (sp as any).spectateTarget = next.data.id;
        send(ws, { type: 'spectate_start', targetId: next.data.id, targetName: next.data.name } as any);
        break;
      }

      // ─── Emote ───
      case 'emote': {
        const sp = playerRoom?.players.get(playerId);
        if (!playerRoom || !sp) break;
        const emoteId = (msg as any).emoteId as string;
        // Validate emote id
        const validEmotes = ['gg', 'help', 'rip', 'nice', 'rush', 'defend'];
        if (!validEmotes.includes(emoteId)) break;
        // Cooldown (3s)
        const now = Date.now();
        const lastEmote = (sp as any).__lastEmoteTime || 0;
        if (now - lastEmote < 3000) break;
        (sp as any).__lastEmoteTime = now;
        // Broadcast to room
        broadcast(playerRoom, { type: 'player_emote', playerId, emoteId } as any);
        break;
      }
    } } catch (err) {
      console.error(`Error handling message from ${playerId}:`, err);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${playerId}:`, err.message);
  });

  ws.on('close', () => {
    if (playerRoom && playerId) {
      const sp = playerRoom.players.get(playerId);
      const playerName = sp?.data.name || playerId;
      playerRoom.players.delete(playerId);
      broadcast(playerRoom, { type: 'player_leave', id: playerId });
      console.log(`[${playerRoom.code}] Player ${playerName} left (${playerRoom.players.size} remain)`);
      if (playerRoom.players.size === 0) {
        rooms.delete(playerRoom.code);
        console.log(`Room ${playerRoom.code} deleted (empty)`);
      }
    }

    // Handle party cleanup
    const partyCode = (ws as any).__partyCode as string | undefined;
    if (partyCode) {
      const party = parties.get(partyCode);
      if (party) {
        const member = party.members.get(playerId);
        const memberName = member?.name || 'Unknown';
        party.members.delete(playerId);

        // Notify remaining party members
        const leaveMsg: S2C_PartyMemberLeave = { type: 'party_member_leave', name: memberName };
        for (const m of party.members.values()) send(m.ws, leaveMsg);

        // Transfer leadership
        if (party.leaderId === playerId && party.members.size > 0) {
          const [newLeaderId] = party.members.keys();
          party.leaderId = newLeaderId;
        }

        // Delete empty party
        if (party.members.size === 0) {
          parties.delete(partyCode);
          console.log(`Party ${partyCode} deleted (empty)`);
        }
      }
    }
  });
});

// ─── Game Loop ──────────────────────────────
setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;

    room.serverTime += TICK_S;

    // Spawn enemies (only if alive players exist)
    const difficulty = getRoomDifficulty(room);
    const alivePlayers = Array.from(room.players.values()).filter(p => p.data.alive);
    const spawnInterval = Math.max(0.3, 1.2 / difficulty);
    room.spawnTimer -= TICK_S;
    if (room.spawnTimer <= 0 && room.enemies.size < MAX_ENEMIES && alivePlayers.length > 0) {
      room.spawnTimer = spawnInterval;
      const count = Math.floor(1 + difficulty * 0.3 + alivePlayers.length * 0.2);
      for (let i = 0; i < count && room.enemies.size < MAX_ENEMIES; i++) {
        spawnEnemy(room);
      }
    }

    // Dynamic difficulty adjustment: when difficulty drops significantly,
    // cull excess enemies to match the new target count
    if (difficulty < room.prevDifficulty * 0.7 && alivePlayers.length < room.players.size) {
      // Target enemy count based on current difficulty
      const targetMax = Math.max(10, Math.floor(MAX_ENEMIES * (difficulty / Math.max(1, room.prevDifficulty))));
      const excess = room.enemies.size - targetMax;
      if (excess > 0) {
        // Remove the farthest non-boss enemies from alive players
        const enemies = Array.from(room.enemies.values())
          .filter(e => !e.dead && !e.isBoss);
        // Sort by distance from nearest alive player (farthest first)
        enemies.sort((a, b) => {
          const distA = Math.min(...alivePlayers.map(p => (p.data.x - a.x) ** 2 + (p.data.y - a.y) ** 2));
          const distB = Math.min(...alivePlayers.map(p => (p.data.x - b.x) ** 2 + (p.data.y - b.y) ** 2));
          return distB - distA;
        });
        const toRemove = Math.min(excess, Math.ceil(enemies.length * 0.3));
        for (let i = 0; i < toRemove && i < enemies.length; i++) {
          const e = enemies[i];
          e.dead = true;
          broadcast(room, { type: 'enemy_death', enemyId: e.id, killerTeam: 'blue', x: e.x, y: e.y, xp: 0, isBoss: false } as S2C_EnemyDeath);
        }
      }
    }
    room.prevDifficulty = difficulty;

    // Wave event (periodic large wave)
    if (room.serverTime >= room.nextWaveEventTime && room.players.size > 0) {
      room.nextWaveEventTime = room.serverTime + WAVE_EVENT_INTERVAL;
      spawnWaveEnemies(room);
    }

    // Boss spawn
    if (!room.boss.active && room.serverTime >= room.nextBossTime) {
      spawnBoss(room);
    }

    // Mini-boss spawn (every 90s after 60s)
    if (room.serverTime > 60 && room.serverTime >= room.nextMiniBossTime) {
      room.nextMiniBossTime = room.serverTime + MINI_BOSS_INTERVAL_S;
      spawnMiniBoss(room);
    }

    // Event wave (every 120s after 60s)
    if (room.serverTime > 60 && room.serverTime >= room.nextEventWaveTime) {
      room.nextEventWaveTime = room.serverTime + EVENT_WAVE_INTERVAL_S;
      triggerEventWave(room);
    }

    // Active event timer decay
    if (room.activeEvent) {
      room.activeEvent.timer -= TICK_S;
      if (room.activeEvent.timer <= 0) {
        const endMsg: S2C_EventWaveEnd = { type: 'event_wave_end', event: room.activeEvent.type };
        broadcast(room, endMsg);
        room.activeEvent = null;
      }
      // healing_rain: handled client-side (server hp gets overwritten by client state messages)
    }

    // Update enemy positions
    updateEnemies(room);

    // Black hole spawning
    if (room.serverTime >= room.nextBlackHoleTime && room.blackHoles.size < BH_MAX_COUNT) {
      spawnBlackHole(room);
      room.nextBlackHoleTime = room.serverTime + 60 + Math.random() * 30;
    }

    // Update black holes
    updateBlackHoles(room);

    // Update boss projectiles (server-side damage to players)
    for (let i = room.bossProjectiles.length - 1; i >= 0; i--) {
      const proj = room.bossProjectiles[i];
      proj.x += proj.vx * TICK_S;
      proj.y += proj.vy * TICK_S;
      proj.life -= TICK_S;
      if (proj.life <= 0) { room.bossProjectiles.splice(i, 1); continue; }
      // Check collision with players
      for (const [pid, p] of room.players) {
        if (!p.data.alive || proj.hitPlayers.has(pid)) continue;
        const dx = p.data.x - proj.x;
        const dy = p.data.y - proj.y;
        if (dx * dx + dy * dy < 20 * 20) {
          proj.hitPlayers.add(pid);
          send(p.ws, {
            type: 'pvp_damage',
            fromId: 'boss_proj',
            fromTeam: 'red',
            damage: proj.damage,
          } as S2C_PvpDamage);
        }
      }
    }

    // Broadcast player positions
    room.playerSyncAccum += TICK_MS;
    if (room.playerSyncAccum >= PLAYER_SYNC_MS) {
      room.playerSyncAccum = 0;
      const sync: S2C_PlayersSync = {
        type: 'players_sync',
        players: Array.from(room.players.values()).map(p => p.data),
      };
      broadcast(room, sync);
    }

    // Broadcast enemy positions (compact format with flags)
    room.enemySyncAccum += TICK_MS;
    if (room.enemySyncAccum >= ENEMY_SYNC_MS) {
      room.enemySyncAccum = 0;
      const esync: S2C_EnemiesSync = {
        type: 'enemies_sync',
        data: buildEnemySyncData(room),
      };
      broadcast(room, esync);

      // Black hole sync (alongside enemy sync)
      if (room.blackHoles.size > 0) {
        const holes: { id: number; radius: number; age: number }[] = [];
        for (const bh of room.blackHoles.values()) {
          if (!bh.dead) holes.push({ id: bh.id, radius: Math.round(bh.radius), age: Math.round(bh.age * 10) / 10 });
        }
        if (holes.length > 0) {
          const bhSync: S2C_BlackHoleSync = { type: 'blackhole_sync', holes };
          broadcast(room, bhSync);
        }
      }
    }

    // Scoreboard
    room.scoreAccum += TICK_MS;
    if (room.scoreAccum >= SCOREBOARD_MS) {
      room.scoreAccum = 0;
      broadcast(room, getTeamScores(room));
      broadcast(room, getLeaderboard(room));
    }

    // Remove stale players
    for (const [id, p] of room.players) {
      if (now - p.lastUpdate > 15000) {
        p.ws.close();
        room.players.delete(id);
        broadcast(room, { type: 'player_leave', id });
      }
    }

    // Clean dead enemies
    for (const [id, e] of room.enemies) {
      if (e.dead) room.enemies.delete(id);
    }
  }
}, TICK_MS);
