/** Shared protocol types for client↔server communication */

export type Team = 'blue' | 'red' | 'green' | 'yellow';
export const TEAMS: Team[] = ['blue', 'red', 'green', 'yellow'];
export const TEAM_COLORS: Record<Team, number> = {
  blue: 0x4488ff,
  red: 0xff4466,
  green: 0x44ff88,
  yellow: 0xffcc44,
};

// ─── Map Boundary ──────────────────────────
export const MAP_WIDTH = 3000;
export const MAP_HEIGHT = 3000;
export const MAP_HALF_W = MAP_WIDTH / 2;
export const MAP_HALF_H = MAP_HEIGHT / 2;

// ─── Weapon sync types ─────────────────────
export interface WeaponSyncData {
  id: string;       // weapon type id: 'orbit' | 'bullet' | 'area' | 'lightning' | 'forcefield'
  level: number;
  evolved: boolean;
}

/** Server-managed enemy data */
export interface ServerEnemy {
  id: number;
  type: string;     // 'triangle' | 'diamond' | 'square' | 'pentagon' | 'charger' | 'splitter' | 'elite_*'
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  isElite?: boolean;
  isCharging?: boolean;
}

// ─── Client → Server ────────────────────────
export interface C2S_Join {
  type: 'join';
  name: string;
  roomCode?: string;
}

export interface C2S_State {
  type: 'state';
  x: number;
  y: number;
  level: number;
  kills: number;
  hp: number;
  maxHp: number;
  rotation: number;
  weapons?: WeaponSyncData[];
}

export interface C2S_EnemyHit {
  type: 'enemy_hit';
  enemyId: number;
  damage: number;
}

export interface C2S_PvpHit {
  type: 'pvp_hit';
  targetId: string;
  damage: number;
}

export interface C2S_Chat {
  type: 'chat';
  msg: string;
}

export interface C2S_Ping {
  type: 'ping';
  x: number;
  y: number;
}

export interface C2S_PullRequest {
  type: 'pull_request';
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export type C2S_Message = C2S_Join | C2S_State | C2S_EnemyHit | C2S_PvpHit | C2S_Chat | C2S_Ping | C2S_PullRequest;

// ─── Server → Client ────────────────────────
export interface PlayerData {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  level: number;
  kills: number;
  hp: number;
  maxHp: number;
  rotation: number;
  alive: boolean;
  weapons?: WeaponSyncData[];
}

export interface BossData {
  active: boolean;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  index: number;
  teamDamage: Record<Team, number>;
}

export interface S2C_Welcome {
  type: 'welcome';
  id: string;
  team: Team;
  roomCode: string;
  players: PlayerData[];
  boss: BossData;
  enemies: ServerEnemy[];
  serverTime: number;
  nextBossTime: number;
}

export interface S2C_PlayerJoin {
  type: 'player_join';
  player: PlayerData;
}

export interface S2C_PlayerLeave {
  type: 'player_leave';
  id: string;
}

export interface S2C_PlayersSync {
  type: 'players_sync';
  players: PlayerData[];
}

// Batch enemy sync (positions + hp + flags)
export interface S2C_EnemiesSync {
  type: 'enemies_sync';
  /** [id, x, y, hp, flags][] - compact format. flags: bit0=isCharging, bit1=isElite */
  data: number[];
}

export interface S2C_EnemySpawn {
  type: 'enemy_spawn';
  enemy: ServerEnemy;
}

export interface S2C_EnemyDeath {
  type: 'enemy_death';
  enemyId: number;
  killerTeam: Team;
  x: number;
  y: number;
  xp: number;
  isBoss: boolean;
}

export interface S2C_BossSpawn {
  type: 'boss_spawn';
  boss: BossData;
  enemy: ServerEnemy;
}

export interface S2C_BossUpdate {
  type: 'boss_update';
  hp: number;
  teamDamage: Record<Team, number>;
}

export interface S2C_BossDead {
  type: 'boss_dead';
  winningTeam: Team;
  bossId: number;
}

export interface S2C_PvpDamage {
  type: 'pvp_damage';
  fromId: string;
  fromTeam: Team;
  damage: number;
}

export interface S2C_TeamScores {
  type: 'team_scores';
  scores: Record<Team, { kills: number; bossContrib: number; players: number }>;
}

export interface S2C_Leaderboard {
  type: 'leaderboard';
  entries: { name: string; kills: number; level: number; team: Team }[];
}

export interface S2C_Chat {
  type: 'chat';
  name: string;
  team: Team;
  msg: string;
}

export interface S2C_PingSignal {
  type: 'ping_signal';
  x: number;
  y: number;
  team: Team;
  playerName: string;
}

export interface S2C_WaveEvent {
  type: 'wave_event';
  waveNumber: number;
  enemyCount: number;
}

export type S2C_Message =
  | S2C_Welcome | S2C_PlayerJoin | S2C_PlayerLeave | S2C_PlayersSync
  | S2C_EnemiesSync | S2C_EnemySpawn | S2C_EnemyDeath
  | S2C_BossSpawn | S2C_BossUpdate | S2C_BossDead
  | S2C_PvpDamage
  | S2C_TeamScores | S2C_Leaderboard | S2C_Chat
  | S2C_PingSignal | S2C_WaveEvent;
