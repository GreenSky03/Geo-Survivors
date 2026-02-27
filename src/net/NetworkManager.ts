import type {
  C2S_Message, S2C_Message, PlayerData, BossData, Team, ServerEnemy, WeaponSyncData,
} from '../../shared/protocol';

export type NetEventMap = {
  welcome: {
    id: string; team: Team; roomCode: string; players: PlayerData[];
    boss: BossData; enemies: ServerEnemy[]; nextBossTime: number;
  };
  player_join: PlayerData;
  player_leave: string;
  players_sync: PlayerData[];
  enemies_sync: number[];
  enemy_spawn: ServerEnemy;
  enemy_death: { enemyId: number; killerTeam: Team; x: number; y: number; xp: number; isBoss: boolean };
  boss_spawn: { boss: BossData; enemy: ServerEnemy };
  boss_update: { hp: number; teamDamage: Record<Team, number> };
  boss_dead: { winningTeam: Team; bossId: number };
  pvp_damage: { fromId: string; fromTeam: Team; damage: number };
  team_scores: Record<Team, { kills: number; bossContrib: number; players: number }>;
  leaderboard: { name: string; kills: number; level: number; team: Team }[];
  chat: { name: string; team: Team; msg: string };
  ping_signal: { x: number; y: number; team: Team; playerName: string };
  wave_event: { waveNumber: number; enemyCount: number };
  connected: void;
  disconnected: void;
};

type Listener<T> = (data: T) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Listener<any>[]>();
  private reconnectTimer: number | null = null;
  private serverUrl = '';
  private playerName = '';
  private roomCodePref = '';
  public connected = false;
  public myId = '';
  public myTeam: Team = 'blue';
  public roomCode = '';
  public latencyMs = 0;
  private lastPingTime = 0;
  private reconnectAttempts = 0;

  connect(url: string, name: string, roomCode?: string): void {
    this.serverUrl = url;
    this.playerName = name;
    this.roomCodePref = roomCode || '';
    this.cleanup();

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastPingTime = performance.now();
      this.send({ type: 'join', name, roomCode });
      this.emit('connected', undefined);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: S2C_Message = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch { /* ignore bad messages */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit('disconnected', undefined);
      // Exponential backoff: 1s → 2s → 4s → 8s → ... max 30s
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
      this.reconnectTimer = window.setTimeout(() => {
        if (!this.connected) {
          this.connect(this.serverUrl, this.playerName, this.roomCodePref);
        }
      }, delay);
    };

    this.ws.onerror = (e) => {
      console.error('[NetworkManager] WebSocket error:', e);
    };
  }

  private handleMessage(msg: S2C_Message): void {
    switch (msg.type) {
      case 'welcome':
        this.myId = msg.id;
        this.myTeam = msg.team;
        this.roomCode = msg.roomCode;
        if (this.lastPingTime > 0) {
          this.latencyMs = Math.round(performance.now() - this.lastPingTime);
        }
        this.emit('welcome', {
          id: msg.id, team: msg.team, roomCode: msg.roomCode,
          players: msg.players, boss: msg.boss, enemies: msg.enemies,
          nextBossTime: msg.nextBossTime,
        });
        break;
      case 'player_join': this.emit('player_join', msg.player); break;
      case 'player_leave': this.emit('player_leave', msg.id); break;
      case 'players_sync':
        // Estimate latency from sync arrival time
        if (this.lastPingTime > 0) {
          const now = performance.now();
          const elapsed = now - this.lastPingTime;
          // players_sync sent every 100ms, estimate round-trip
          if (elapsed < 1000) {
            this.latencyMs = Math.round(elapsed * 0.5); // half round-trip
          }
          this.lastPingTime = now;
        }
        this.emit('players_sync', msg.players);
        break;
      case 'enemies_sync': this.emit('enemies_sync', msg.data); break;
      case 'enemy_spawn': this.emit('enemy_spawn', msg.enemy); break;
      case 'enemy_death': this.emit('enemy_death', {
        enemyId: msg.enemyId, killerTeam: msg.killerTeam,
        x: msg.x, y: msg.y, xp: msg.xp, isBoss: msg.isBoss,
      }); break;
      case 'boss_spawn': this.emit('boss_spawn', { boss: msg.boss, enemy: msg.enemy }); break;
      case 'boss_update': this.emit('boss_update', { hp: msg.hp, teamDamage: msg.teamDamage }); break;
      case 'boss_dead': this.emit('boss_dead', { winningTeam: msg.winningTeam, bossId: msg.bossId }); break;
      case 'pvp_damage': this.emit('pvp_damage', { fromId: msg.fromId, fromTeam: msg.fromTeam, damage: msg.damage }); break;
      case 'team_scores': this.emit('team_scores', msg.scores); break;
      case 'leaderboard': this.emit('leaderboard', msg.entries); break;
      case 'chat': this.emit('chat', { name: msg.name, team: msg.team, msg: msg.msg }); break;
      case 'ping_signal': this.emit('ping_signal', { x: msg.x, y: msg.y, team: msg.team, playerName: msg.playerName }); break;
      case 'wave_event': this.emit('wave_event', { waveNumber: msg.waveNumber, enemyCount: msg.enemyCount }); break;
    }
  }

  send(msg: C2S_Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendState(x: number, y: number, level: number, kills: number, hp: number, maxHp: number, rotation: number, weapons?: WeaponSyncData[]): void {
    this.send({ type: 'state', x, y, level, kills, hp, maxHp, rotation, weapons });
  }

  sendEnemyHit(enemyId: number, damage: number): void {
    this.send({ type: 'enemy_hit', enemyId, damage });
  }

  sendPvpHit(targetId: string, damage: number): void {
    this.send({ type: 'pvp_hit', targetId, damage });
  }

  sendPing(x: number, y: number): void {
    this.send({ type: 'ping', x, y });
  }

  sendPullRequest(x: number, y: number, strength: number, radius: number): void {
    this.send({ type: 'pull_request', x, y, strength, radius });
  }

  sendChat(msg: string): void {
    this.send({ type: 'chat', msg });
  }

  on<K extends keyof NetEventMap>(event: K, listener: Listener<NetEventMap[K]>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener);
  }

  private emit<K extends keyof NetEventMap>(event: K, data: NetEventMap[K]): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const fn of list) fn(data);
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  get reconnectCount(): number {
    return this.reconnectAttempts;
  }

  disconnect(): void {
    this.cleanup();
    this.connected = false;
    this.reconnectAttempts = 0;
  }
}
