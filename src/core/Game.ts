import { Application, Container, Graphics } from 'pixi.js';
import { Input } from './Input';
import { Camera } from './Camera';
import { Player } from '../entities/Player';
import { Enemy, ENEMY_DEFS } from '../entities/Enemy';
import { XPOrb } from '../entities/XPOrb';
import { Pickup, rollPickupDrop } from '../entities/Pickup';
import { spawnBoss } from '../entities/Boss';
import { RemotePlayer } from '../entities/RemotePlayer';
import { WeaponBase } from '../weapons/WeaponBase';
import { OrbitWeapon } from '../weapons/OrbitWeapon';
import { LevelUpSystem, UpgradeChoice } from '../systems/LevelUpSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ScreenShake } from '../systems/ScreenShake';
import { DamageNumbers } from '../systems/DamageNumbers';
import { SoundManager } from '../systems/SoundManager';
import { Trail } from '../systems/Trail';
import { NetworkManager } from '../net/NetworkManager';
import { UI } from '../ui/UI';
import { randomAngle, distance, lerp } from '../utils/math';
import type { Team, PlayerData, BossData, ServerEnemy, WeaponSyncData } from '../../shared/protocol';
import { TEAM_COLORS, MAP_HALF_W, MAP_HALF_H } from '../../shared/protocol';

const HIGHSCORE_KEY = 'geo_survivors_best';
const WS_URL = import.meta.env.VITE_WS_URL
  || (location.protocol === 'https:' ? 'wss:' : 'ws:') + `//${location.host}/ws`;

export class Game {
  private app!: Application;
  private world!: Container;
  private camera!: Camera;
  private input!: Input;
  private ui!: UI;
  private levelUpSystem!: LevelUpSystem;
  private particles!: ParticleSystem;
  private screenShake!: ScreenShake;
  private damageNumbers!: DamageNumbers;
  private sound!: SoundManager;
  private trail!: Trail;
  private net!: NetworkManager;

  private player!: Player;
  private enemies: Enemy[] = [];
  private enemyById = new Map<number, Enemy>(); // server ID → Enemy (multiplayer)
  private xpOrbs: XPOrb[] = [];
  private pickups: Pickup[] = [];
  private weapons: WeaponBase[] = [];
  private remotePlayers = new Map<string, RemotePlayer>();

  private gridGraphics!: Graphics;
  private boundaryGraphics!: Graphics;
  private ambientGraphics!: Graphics;
  private indicatorGraphics!: Graphics;
  private pingGraphics!: Graphics;

  // State
  private gameTime = 0;
  private kills = 0;
  private xp = 0;
  private level = 1;
  private xpToNext = 10;
  private paused = false;
  private gameActive = false;
  private started = false;
  private pausedByMenu = false;

  // Mode
  private isMultiplayer = false;
  private playerName = 'Player';

  // Spawning (solo only)
  private spawnTimer = 0;
  private baseSpawnInterval = 1.2;
  private maxEnemies = 250;

  // Boss (solo only)
  private bossInterval = 120;
  private nextBossTime = 120;
  private bossCount = 0;
  private bossWarningShown = false;

  // Server boss (multiplayer)
  private serverBossData: BossData | null = null;

  // Ambient
  private ambientDots: { x: number; y: number; alpha: number; speed: number }[] = [];
  private bestTime = 0;
  private minimapTimer = 0;
  private netSyncTimer = 0;

  // Wave & milestones
  private wave = 1;
  private nextMilestone = 50;
  private killMilestones = [50, 100, 250, 500, 1000, 2000, 5000];

  // Stats tracking
  private totalDamage = 0;
  private pickupsCollected = 0;

  // Level-up queue (for multiplayer, where game isn't paused)
  private levelUpPending = 0;
  private levelUpShown = false;

  // Multiplayer respawn
  private respawnTimer = 0;
  private respawnDelay = 5;

  // PvP cooldowns (key: "pvp_{rpId}_{weaponId}" → remaining seconds)
  private pvpCooldowns = new Map<string, number>();

  // Multiplayer connection state
  private pendingMultiStart = false;

  // Ping system
  private activePings: { x: number; y: number; team: string; name: string; timer: number }[] = [];

  // Team proximity buff
  private teamBuffActive = false;
  private teamBuffMultiplier = 1;

  // Weapon sync (send only on change)
  private lastWeaponSync = '';
  private weaponSyncTimer = 0;

  // Charger tracking (server IDs of charging enemies)
  private chargingEnemies = new Set<number>();

  // Pull request throttle
  private pullRequestTimer = 0;

  // Death slow-motion effect
  private deathSlowTimer = 0;
  private deathSlowDuration = 0.3;

  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({ resizeTo: window, backgroundColor: 0x0a0a1a, antialias: true });
    document.body.prepend(this.app.canvas);

    this.input = new Input();
    this.ui = new UI();
    this.levelUpSystem = new LevelUpSystem();
    this.sound = new SoundManager();
    this.net = new NetworkManager();

    this.world = new Container();
    this.app.stage.addChild(this.world);
    this.gridGraphics = new Graphics();
    this.world.addChild(this.gridGraphics);
    this.boundaryGraphics = new Graphics();
    this.world.addChild(this.boundaryGraphics);
    this.ambientGraphics = new Graphics();
    this.world.addChild(this.ambientGraphics);
    this.pingGraphics = new Graphics();
    this.world.addChild(this.pingGraphics);

    this.indicatorGraphics = new Graphics();
    this.app.stage.addChild(this.indicatorGraphics);

    this.camera = new Camera(this.world, this.app.screen.width, this.app.screen.height);
    window.addEventListener('resize', () => this.camera.resize(this.app.screen.width, this.app.screen.height));

    this.bestTime = Number(localStorage.getItem(HIGHSCORE_KEY) || '0');
    this.ui.updateHighscore(this.bestTime);

    for (let i = 0; i < 60; i++) {
      this.ambientDots.push({
        x: (Math.random() - 0.5) * 3000, y: (Math.random() - 0.5) * 3000,
        alpha: 0.05 + Math.random() * 0.1, speed: 5 + Math.random() * 15,
      });
    }

    // ESC to pause (solo only), G to ping (multiplayer)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.gameActive && this.started && !this.isMultiplayer) {
        if (this.pausedByMenu) this.resumeGame();
        else if (!this.paused) this.pauseGame();
      }
      if (e.code === 'KeyG' && this.isMultiplayer && this.gameActive && this.started && this.net.connected) {
        this.net.sendPing(this.player.x, this.player.y);
        this.activePings.push({ x: this.player.x, y: this.player.y, team: this.net.myTeam, name: 'You', timer: 4 });
      }
    });

    this.ui.onPause(
      () => this.resumeGame(),
      () => this.quitToTitle(),
      (v) => this.sound.setVolume(v),
    );

    // Auto-pause on blur (solo only)
    window.addEventListener('blur', () => {
      if (this.gameActive && this.started && !this.paused && !this.isMultiplayer) {
        this.pauseGame();
      }
    });

    this.setupTitleUI();

    this.ui.showTitle();
    this.ui.onStart(() => {
      this.sound.init();
      const nameInput = document.getElementById('name-input') as HTMLInputElement;
      this.playerName = nameInput.value.trim() || 'Player';
      if (this.isMultiplayer) {
        // Wait for server connection before starting game
        this.ui.showConnectionStatus('Connecting...');
        this.pendingMultiStart = true;
        this.connectMultiplayer();
      } else {
        this.startGame();
      }
    });

    this.setupNetworkHandlers();

    this.app.ticker.add((ticker) => {
      if (!this.started) return;
      const dt = ticker.deltaMS / 1000;
      if (!this.paused && this.gameActive) {
        this.update(dt);
      }
      // Continue animating after death (particles, shake, damage numbers)
      if (!this.gameActive && this.particles) {
        this.particles.update(dt);
        this.damageNumbers.update(dt);
        this.screenShake.update(dt, this.world);
      }
      for (const rp of this.remotePlayers.values()) {
        rp.update(dt);
      }
    });
  }

  private setupTitleUI(): void {
    const soloBtn = document.getElementById('mode-solo')!;
    const multiBtn = document.getElementById('mode-multi')!;
    soloBtn.addEventListener('click', () => {
      this.isMultiplayer = false;
      soloBtn.classList.add('active');
      multiBtn.classList.remove('active');
    });
    multiBtn.addEventListener('click', () => {
      this.isMultiplayer = true;
      multiBtn.classList.add('active');
      soloBtn.classList.remove('active');
    });
  }

  private connectMultiplayer(): void {
    this.net.connect(WS_URL, this.playerName);
  }

  private setupNetworkHandlers(): void {
    this.net.on('welcome', (data) => {
      // If waiting to start, now start the game
      if (this.pendingMultiStart) {
        this.pendingMultiStart = false;
        this.ui.hideConnectionStatus();
        this.startGame();
      }
      this.ui.showRoomInfo(data.roomCode, data.team);
      this.ui.showMultiplayerUI(true);
      for (const pd of data.players) {
        if (pd.id === data.id) continue;
        this.addRemotePlayer(pd);
      }
      // Spawn existing enemies from server
      for (const se of data.enemies) {
        this.createServerEnemy(se);
      }
      if (data.boss.active) {
        this.serverBossData = data.boss;
        this.ui.showBossHp(data.boss.hp, data.boss.maxHp);
      }
    });

    this.net.on('player_join', (pd) => {
      if (pd.id === this.net.myId) return;
      this.addRemotePlayer(pd);
    });

    this.net.on('player_leave', (id) => {
      this.removeRemotePlayer(id);
    });

    this.net.on('players_sync', (players) => {
      for (const pd of players) {
        if (pd.id === this.net.myId) continue;
        const rp = this.remotePlayers.get(pd.id);
        if (rp) {
          rp.syncData(pd);
          // Remote player death: particle burst + kill log
          if (rp.justDied) {
            this.particles.burst(rp.targetX, rp.targetY, 0xff4466, 15, 250);
            this.ui.addKillLogEntry('Enemy', 'red', rp.name);
            rp.justDied = false;
          }
        } else {
          this.addRemotePlayer(pd);
        }
      }
      // Update ping display
      this.ui.updatePingDisplay(this.net.latencyMs);
    });

    // ─── Server Enemy Events ─────────────────
    this.net.on('enemy_spawn', (se) => {
      this.createServerEnemy(se);
    });

    this.net.on('enemies_sync', (data) => {
      // Compact format: [id, x, y, hp, flags, vx, vy, ...]
      for (let i = 0; i < data.length; i += 7) {
        const id = data[i];
        const sx = data[i + 1];
        const sy = data[i + 2];
        const hp = data[i + 3];
        const flags = data[i + 4];
        const vx = data[i + 5];
        const vy = data[i + 6];
        const isElite = (flags & 2) !== 0;

        const enemy = this.enemyById.get(id);
        if (enemy) {
          enemy.serverX = sx;
          enemy.serverY = sy;
          enemy.hp = hp;
          enemy.serverVx = lerp(enemy.serverVx, vx, 0.4);
          enemy.serverVy = lerp(enemy.serverVy, vy, 0.4);
          enemy.lastSyncTime = Date.now();

          // Elite visual scaling
          if (isElite && enemy.container.scale.x < 1.5) {
            enemy.container.scale.set(1.5);
            enemy.radius = Math.floor(enemy.radius * 1.5);
          }
        }
      }
    });

    this.net.on('enemy_death', (data) => {
      const enemy = this.enemyById.get(data.enemyId);
      if (enemy) {
        enemy.dead = true;
        const color = data.isBoss ? 0xff8800 : 0xff3344;
        const count = data.isBoss ? 20 : 8;
        this.particles.burst(enemy.x, enemy.y, color, count, data.isBoss ? 300 : 200);
        this.sound.playKill();
        if (data.isBoss) this.screenShake.trigger(12);

        // Drop XP (from server-determined xp amount)
        const orb = new XPOrb(enemy.x, enemy.y, data.xp);
        this.xpOrbs.push(orb);
        this.world.addChild(orb.container);

        // Drop pickups
        const pickupType = rollPickupDrop(data.isBoss);
        if (pickupType) {
          const pickup = new Pickup(enemy.x, enemy.y, pickupType);
          this.pickups.push(pickup);
          this.world.addChild(pickup.container);
        }

        // Credit kill if our team killed it
        if (data.killerTeam === this.net.myTeam) {
          this.kills++;
          this.ui.updateKills(this.kills);
          this.checkMilestone();
        }

        this.world.removeChild(enemy.container);
        enemy.container.destroy();
        this.enemyById.delete(data.enemyId);
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
      }
    });

    // ─── Boss Events ─────────────────────────
    this.net.on('boss_spawn', (data) => {
      this.serverBossData = data.boss;
      this.ui.showBossWarning();
      this.sound.playBossWarning();
      this.createServerEnemy(data.enemy);
      this.ui.showBossHp(data.boss.hp, data.boss.maxHp);
    });

    this.net.on('boss_update', (data) => {
      if (this.serverBossData) {
        this.serverBossData.hp = data.hp;
        this.serverBossData.teamDamage = data.teamDamage;
        this.ui.updateBossHp(data.hp, this.serverBossData.maxHp);
      }
    });

    this.net.on('boss_dead', (data) => {
      this.ui.showBossDead(data.winningTeam);
      this.screenShake.trigger(15);
      this.serverBossData = null;
      this.ui.hideBossHp();
    });

    // ─── PvP Damage ──────────────────────────
    this.net.on('pvp_damage', (data) => {
      if (!this.player || !this.player.alive || this.respawnTimer > 0) return;
      this.player.takeDamage(data.damage);
      this.ui.updateHp(this.player.hp, this.player.maxHp);
      this.ui.flashDamage();

      if (data.fromId.startsWith('enemy_')) {
        // Enemy collision damage from server
        this.screenShake.trigger(5);
        this.sound.playPlayerHit();
        this.particles.spark(this.player.x, this.player.y, 0xff4466);
        this.damageNumbers.spawn(this.player.x, this.player.y - 15, data.damage, 0xff4466);
      } else {
        // PvP hit from another player — strong feedback
        const teamColor = TEAM_COLORS[data.fromTeam] ?? 0xff4466;
        this.screenShake.trigger(8);
        this.sound.playPlayerHit();
        this.particles.burst(this.player.x, this.player.y, teamColor, 6, 100);
        this.damageNumbers.spawn(this.player.x, this.player.y - 20, data.damage, teamColor);
      }
    });

    this.net.on('team_scores', (scores) => {
      this.ui.updateTeamScoreboard(scores);
    });

    this.net.on('leaderboard', (entries) => {
      this.ui.updateLeaderboard(entries);
    });

    this.net.on('ping_signal', (data) => {
      this.activePings.push({ x: data.x, y: data.y, team: data.team, name: data.playerName, timer: 4 });
      this.sound.playPickup();
    });

    this.net.on('wave_event', (data) => {
      this.ui.showWaveEvent(data.waveNumber, data.enemyCount);
      this.screenShake.trigger(8);
      this.sound.playBossWarning();
    });

    this.net.on('disconnected', () => {
      const attempt = this.net.reconnectCount;
      this.ui.showConnectionStatus(attempt > 0
        ? `Reconnecting... (attempt ${attempt})`
        : 'Reconnecting...');
    });

    this.net.on('connected', () => {
      this.ui.showConnectionStatus('Connected');
      setTimeout(() => this.ui.hideConnectionStatus(), 2000);
    });
  }

  private createServerEnemy(se: ServerEnemy): void {
    if (this.enemyById.has(se.id)) return;
    const def = ENEMY_DEFS[se.type] || ENEMY_DEFS.triangle;
    const enemy = new Enemy(se.x, se.y, def, 1);
    enemy.hp = se.hp;
    enemy.maxHp = se.maxHp;
    enemy.isBoss = se.isBoss;
    enemy.serverId = se.id;
    enemy.serverX = se.x;
    enemy.serverY = se.y;
    enemy.serverVx = 0;
    enemy.serverVy = 0;
    enemy.lastSyncTime = Date.now();
    if (se.isBoss) {
      enemy.container.scale.set(2.5);
      enemy.radius = 32;
    } else if (se.isElite) {
      enemy.container.scale.set(1.5);
      enemy.radius = Math.floor(def.radius * 1.5);
    }
    this.enemies.push(enemy);
    this.enemyById.set(se.id, enemy);
    this.world.addChild(enemy.container);
  }

  private addRemotePlayer(pd: PlayerData): void {
    if (this.remotePlayers.has(pd.id)) return;
    const rp = new RemotePlayer(pd.id, pd.name, pd.team);
    rp.syncData(pd);
    rp.container.x = pd.x;
    rp.container.y = pd.y;
    this.remotePlayers.set(pd.id, rp);
    this.world.addChild(rp.container);
  }

  private removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (rp) {
      this.world.removeChild(rp.container);
      rp.destroy();
      this.remotePlayers.delete(id);
    }
  }

  private pauseGame(): void {
    if (this.isMultiplayer) return; // No pause in multiplayer
    this.paused = true;
    this.pausedByMenu = true;
    this.ui.showPause();
  }

  private resumeGame(): void {
    this.paused = false;
    this.pausedByMenu = false;
    this.ui.hidePause();
  }

  private quitToTitle(): void {
    this.paused = false;
    this.pausedByMenu = false;
    this.gameActive = false;
    this.started = false;
    this.saveHighscore();
    this.net.disconnect();
    for (const rp of this.remotePlayers.values()) {
      this.world.removeChild(rp.container);
      rp.destroy();
    }
    this.remotePlayers.clear();
    this.enemyById.clear();
    this.ui.hideAll();
    this.ui.showMultiplayerUI(false);
    this.ui.showTitle();
    this.input.showTouchControls(false);
  }

  private saveHighscore(): void {
    if (this.gameTime > this.bestTime) {
      this.bestTime = this.gameTime;
      localStorage.setItem(HIGHSCORE_KEY, String(this.bestTime));
      this.ui.updateHighscore(this.bestTime);
    }
  }

  private startGame(): void {
    this.started = true;
    this.world.removeChildren();
    this.world.addChild(this.gridGraphics);
    this.world.addChild(this.boundaryGraphics);
    this.world.addChild(this.ambientGraphics);
    this.world.addChild(this.pingGraphics);

    this.enemies = [];
    this.enemyById.clear();
    this.xpOrbs = [];
    this.pickups = [];
    this.weapons = [];
    this.gameTime = 0;
    this.kills = 0;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 10;
    this.paused = false;
    this.pausedByMenu = false;
    this.gameActive = true;
    this.spawnTimer = 0;
    this.bossCount = 0;
    this.nextBossTime = this.bossInterval;
    this.bossWarningShown = false;
    this.serverBossData = null;
    this.wave = 1;
    this.nextMilestone = 50;
    this.totalDamage = 0;
    this.pickupsCollected = 0;
    this.levelUpPending = 0;
    this.levelUpShown = false;
    this.respawnTimer = 0;
    this.pvpCooldowns.clear();
    this.activePings = [];
    this.teamBuffActive = false;
    this.teamBuffMultiplier = 1;
    this.lastWeaponSync = '';
    this.weaponSyncTimer = 0;
    this.chargingEnemies.clear();
    this.pullRequestTimer = 0;

    this.particles = new ParticleSystem();
    this.screenShake = new ScreenShake();
    this.damageNumbers = new DamageNumbers();
    this.trail = new Trail();

    this.player = new Player(this.input);
    this.world.addChild(this.trail.container);
    this.world.addChild(this.player.container);

    const startWeapon = new OrbitWeapon();
    if (this.isMultiplayer) startWeapon.useServerPull = true;
    this.weapons.push(startWeapon);
    this.world.addChild(startWeapon.container);

    for (const rp of this.remotePlayers.values()) {
      this.world.addChild(rp.container);
    }

    this.world.addChild(this.particles.container);
    this.world.addChild(this.damageNumbers.container);

    this.ui.hideTitle();
    this.ui.hideAll();
    this.ui.updateHp(this.player.hp, this.player.maxHp);
    this.ui.updateXp(0, this.xpToNext);
    this.ui.updateLevel(1);
    this.ui.updateKills(0);
    this.ui.updateTime(0);
    this.ui.updateWeaponHud(this.weapons);
    this.ui.updateHighscore(this.bestTime);
    this.input.showTouchControls(true);
  }

  private update(dt: number): void {
    dt = Math.min(dt, 0.05);

    // Death slow-motion effect
    if (this.deathSlowTimer > 0) {
      this.deathSlowTimer -= dt;
      const t = Math.max(0, this.deathSlowTimer / this.deathSlowDuration);
      dt *= 0.2 + 0.8 * (1 - t); // 20% → 100% speed over duration
      this.world.alpha = 0.6 + 0.4 * (1 - t); // 0.6 → 1.0
    }

    this.gameTime += dt;
    const minutes = this.gameTime / 60;
    const difficulty = 1 + minutes * 0.4 + Math.pow(minutes / 10, 1.5);

    const prevX = this.player.x;
    const prevY = this.player.y;
    const prevHp = this.player.hp;
    this.player.update(dt);
    const isMoving = prevX !== this.player.x || prevY !== this.player.y;

    if (this.player.hp !== prevHp) {
      this.ui.updateHp(this.player.hp, this.player.maxHp);
    }

    this.trail.update(dt, this.player.x, this.player.y, isMoving);
    this.camera.follow(this.player.x, this.player.y, 0.08);
    this.camera.apply();
    this.screenShake.update(dt, this.world);
    this.drawGrid();
    this.drawAmbient(dt);

    // Network sync
    if (this.isMultiplayer && this.net.connected) {
      this.netSyncTimer -= dt;
      if (this.netSyncTimer <= 0) {
        this.netSyncTimer = 0.1;
        // Build weapon sync data (only send when changed)
        const weaponData: WeaponSyncData[] = this.weapons.map(w => ({
          id: w.info.id, level: w.level, evolved: w.evolved,
        }));
        const weaponStr = JSON.stringify(weaponData);
        const sendWeapons = weaponStr !== this.lastWeaponSync;
        if (sendWeapons) this.lastWeaponSync = weaponStr;

        this.net.sendState(
          this.player.x, this.player.y, this.level, this.kills,
          this.player.hp, this.player.maxHp, this.player.container.rotation,
          sendWeapons ? weaponData : undefined,
        );
      }

      // Team proximity buff
      this.teamBuffActive = false;
      this.teamBuffMultiplier = 1;
      let nearbyTeammates = 0;
      for (const rp of this.remotePlayers.values()) {
        if (rp.team !== this.net.myTeam || !rp.alive) continue;
        const d = distance(this.player.x, this.player.y, rp.targetX, rp.targetY);
        if (d < 300) nearbyTeammates++;
      }
      if (nearbyTeammates > 0) {
        this.teamBuffActive = true;
        this.teamBuffMultiplier = 1 + nearbyTeammates * 0.08; // +8% per nearby teammate
      }

      // Send OrbitWeapon pull requests to server
      this.pullRequestTimer -= dt;
      if (this.pullRequestTimer <= 0) {
        this.pullRequestTimer = 0.2;
        for (const weapon of this.weapons) {
          if (weapon instanceof OrbitWeapon && weapon.evolved && weapon.pullStrength > 0) {
            this.net.sendPullRequest(this.player.x, this.player.y, weapon.pullStrength, weapon.pullRadius);
          }
        }
      }
    }

    // Update ping markers
    for (let i = this.activePings.length - 1; i >= 0; i--) {
      this.activePings[i].timer -= dt;
      if (this.activePings[i].timer <= 0) this.activePings.splice(i, 1);
    }

    // ─── SOLO: spawn enemies locally ─────────
    if (!this.isMultiplayer) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const interval = Math.max(0.25, this.baseSpawnInterval / difficulty);
        this.spawnTimer = interval;
        const count = Math.floor(1 + difficulty * 0.4);
        for (let i = 0; i < count && this.enemies.length < this.maxEnemies; i++) {
          this.spawnEnemy(difficulty);
        }
      }

      // Solo boss
      if (this.gameTime > this.nextBossTime - 3 && !this.bossWarningShown) {
        this.bossWarningShown = true;
        this.ui.showBossWarning();
        this.sound.playBossWarning();
      }
      if (this.gameTime >= this.nextBossTime) {
        const boss = spawnBoss(this.player.x, this.player.y, this.bossCount, difficulty);
        this.enemies.push(boss);
        this.world.addChild(boss.container);
        this.bossCount++;
        this.nextBossTime += this.bossInterval;
        this.bossWarningShown = false;
      }
    }

    // ─── Update enemies ───
    for (const enemy of this.enemies) {
      if (this.isMultiplayer && enemy.serverId >= 0) {
        // Multiplayer: ONLY interpolate toward server position, NO client-side AI
        enemy.lerpToServer(dt);
      } else {
        // Solo: full client-side AI
        enemy.update(dt, this.player.x, this.player.y);
      }
    }

    // ─── SOLO: enemy collision damage (in multi, server sends pvp_damage) ───
    if (!this.isMultiplayer) {
      for (const enemy of this.enemies) {
        if (enemy.canDamagePlayer()) {
          const dist = enemy.distanceTo(this.player.x, this.player.y);
          if (dist < enemy.radius + this.player.radius) {
            this.player.takeDamage(enemy.damage);
            enemy.resetDamageCooldown();
            this.ui.updateHp(this.player.hp, this.player.maxHp);
            this.ui.flashDamage();
            this.screenShake.trigger(6);
            this.sound.playPlayerHit();
            this.particles.spark(this.player.x, this.player.y, 0xff4466);
          }
        }
      }
    }

    // Decay PvP cooldowns
    if (this.isMultiplayer) {
      for (const [key, cd] of this.pvpCooldowns) {
        const remaining = cd - dt;
        if (remaining <= 0) this.pvpCooldowns.delete(key);
        else this.pvpCooldowns.set(key, remaining);
      }
    }

    // ─── Weapons ─────────────────────────────
    const playerAlive = this.player.alive;
    for (const weapon of this.weapons) {
      if (!playerAlive) break;
      weapon.update(dt, this.player.x, this.player.y, this.enemies);
      const hits = weapon.getHits(this.enemies);
      const baseDmg = weapon.currentDamage;

      for (const enemy of hits) {
        const isCrit = Math.random() < 0.1;
        const displayDmg = isCrit ? baseDmg * 2 : baseDmg;

        if (this.isMultiplayer) {
          // Report hit to server; getHits already applied local takeDamage for prediction
          if (enemy.serverId >= 0) {
            this.net.sendEnemyHit(enemy.serverId, displayDmg);
          }
        } else {
          // Solo: getHits already applied baseDmg via takeDamage; apply crit bonus only
          if (isCrit) {
            enemy.takeDamage(baseDmg); // extra crit damage
          }
          this.totalDamage += displayDmg;
        }

        this.sound.playHit();
        this.particles.spark(enemy.x, enemy.y, isCrit ? 0xffee44 : 0xffffff);
        this.damageNumbers.spawn(enemy.x, enemy.y, displayDmg, isCrit);
        if (isCrit) {
          this.screenShake.trigger(3);
          this.sound.playCrit();
        }
      }

      // ─── PvP: weapon projectiles hit remote players of other teams ───
      if (this.isMultiplayer) {
        for (const [rpId, rp] of this.remotePlayers) {
          if (rp.team === this.net.myTeam) continue;
          if (!rp.alive) continue;
          const rpDist = distance(this.player.x, this.player.y, rp.targetX, rp.targetY);
          if (rpDist > 600) continue;

          // Check actual weapon projectile collision (not proximity)
          if (weapon.checkHitPoint(rp.targetX, rp.targetY, 16)) {
            // Cooldown per weapon per target
            const cdKey = `pvp_${rpId}_${weapon.info.id}`;
            if (!this.pvpCooldowns.has(cdKey) || this.pvpCooldowns.get(cdKey)! <= 0) {
              this.pvpCooldowns.set(cdKey, 0.8);
              const pvpDmg = Math.floor(baseDmg * 0.5);
              this.net.sendPvpHit(rpId, pvpDmg);
              const teamColor = TEAM_COLORS[rp.team] ?? 0xffffff;
              this.particles.spark(rp.targetX, rp.targetY, teamColor);
              this.damageNumbers.spawn(rp.targetX, rp.targetY, pvpDmg, teamColor);
              this.screenShake.trigger(4);
              this.sound.playHit();
            }
          }
        }
      }
    }

    // ─── SOLO: remove dead enemies locally ───
    if (!this.isMultiplayer) {
      const newEnemies: Enemy[] = [];
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i].dead) {
          const e = this.enemies[i];
          const color = e.isBoss ? 0xff8800 : 0xff3344;
          const count = e.isBoss ? 20 : 8;
          this.particles.burst(e.x, e.y, color, count, e.isBoss ? 300 : 200);
          this.sound.playKill();
          if (e.isBoss) this.screenShake.trigger(12);

          if (e.splitOnDeath && !e.isBoss) {
            for (let s = 0; s < 3; s++) {
              const angle = (Math.PI * 2 / 3) * s + Math.random() * 0.5;
              const mini = new Enemy(
                e.x + Math.cos(angle) * 20, e.y + Math.sin(angle) * 20,
                ENEMY_DEFS.triangle, difficulty,
              );
              mini.speed = 100;
              newEnemies.push(mini);
              this.world.addChild(mini.container);
            }
          }

          const orb = new XPOrb(e.x, e.y, e.xpValue);
          this.xpOrbs.push(orb);
          this.world.addChild(orb.container);

          const pickupType = rollPickupDrop(e.isBoss);
          if (pickupType) {
            const pickup = new Pickup(e.x, e.y, pickupType);
            this.pickups.push(pickup);
            this.world.addChild(pickup.container);
          }

          this.world.removeChild(e.container);
          e.container.destroy();
          this.kills++;
          this.ui.updateKills(this.kills);
          this.checkMilestone();
          this.enemies.splice(i, 1);
        }
      }
      if (newEnemies.length > 0) this.enemies.push(...newEnemies);
    }

    // XP Orbs (dead players cannot collect)
    for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
      const orb = this.xpOrbs[i];
      orb.update(dt, this.player.x, this.player.y, this.player.alive ? this.player.magnetRange : 0);
      if (this.player.alive && orb.collected) {
        this.addXp(orb.xpAmount);
        this.sound.playXP();
        this.world.removeChild(orb.container);
        orb.container.destroy();
        this.xpOrbs.splice(i, 1);
      }
    }

    // Pickups (dead players cannot collect)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt, this.player.x, this.player.y);
      if (this.player.alive && p.collected) {
        this.applyPickup(p);
        this.world.removeChild(p.container);
        p.container.destroy();
        this.pickups.splice(i, 1);
      } else if (p.expired) {
        this.world.removeChild(p.container);
        p.container.destroy();
        this.pickups.splice(i, 1);
      }
    }

    // Wave tracking
    const newWave = Math.floor(this.gameTime / 60) + 1;
    if (newWave > this.wave) {
      this.wave = newWave;
      this.ui.showWave(this.wave);
      this.screenShake.trigger(5);
      this.sound.playWave();
    }

    this.particles.update(dt);
    this.damageNumbers.update(dt);
    this.ui.updateTime(this.gameTime);
    this.drawOffscreenIndicators();

    // Draw boundary + pings
    this.drawBoundary();
    this.drawPings(dt);

    // Minimap
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.15;
      const mapEntities = this.enemies.map(e => ({ x: e.x, y: e.y, isBoss: e.isBoss }));
      const mapPickups = this.pickups.map(p => ({ x: p.x, y: p.y }));
      const mapRemotePlayers: { x: number; y: number; team: string }[] = [];
      for (const rp of this.remotePlayers.values()) {
        mapRemotePlayers.push({ x: rp.targetX, y: rp.targetY, team: rp.team });
      }
      const mapPings = this.activePings.map(p => ({ x: p.x, y: p.y, team: p.team }));
      this.ui.updateMinimap(this.player.x, this.player.y, mapEntities, mapPickups, mapRemotePlayers, mapPings);
    }

    // ─── Player death ─────────────────────
    if (!this.player.alive && this.respawnTimer <= 0) {
      this.sound.playGameOver();
      this.screenShake.trigger(15);
      this.particles.burst(this.player.x, this.player.y, 0x00e6b0, 25, 350);
      // Trigger death slow-motion
      this.deathSlowTimer = this.deathSlowDuration;

      if (this.isMultiplayer) {
        // Multiplayer: show death overlay, start respawn countdown
        this.respawnTimer = this.respawnDelay;
        this.player.container.visible = false;
        // Hide weapons
        for (const w of this.weapons) w.container.visible = false;
        // Clear any open level-up screen (prevent stale choices after respawn reset)
        this.ui.hideLevelUp();
        this.levelUpShown = false;
        this.levelUpPending = 0;
        this.ui.showRespawnOverlay();
        this.ui.updateRespawnTimer(this.respawnDelay, this.respawnDelay);
      } else {
        // Solo: game over
        this.gameActive = false;
        this.saveHighscore();
        this.ui.showGameOver(
          {
            time: this.gameTime, kills: this.kills, level: this.level,
            totalDamage: this.totalDamage, wave: this.wave, pickups: this.pickupsCollected,
          },
          () => this.startGame(),
        );
      }
    }

    // ─── Multiplayer respawn countdown ───
    if (this.isMultiplayer && this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      this.ui.updateRespawnTimer(this.respawnTimer, this.respawnDelay);

      if (this.respawnTimer <= 0) {
        this.respawnTimer = 0;
        // Find a safe spawn location (away from enemies)
        const safePos = this.findSafeRespawnPosition();
        this.player.x = safePos.x;
        this.player.y = safePos.y;
        this.player.container.x = safePos.x;
        this.player.container.y = safePos.y;
        this.player.hp = this.player.maxHp;
        this.player.setInvincible(3);
        this.player.container.visible = true;
        this.player.container.alpha = 1;

        // Death penalty: full reset (weapons, level, XP)
        for (const w of this.weapons) {
          this.world.removeChild(w.container);
          w.container.destroy();
        }
        this.weapons = [];
        const startWeapon = new OrbitWeapon();
        startWeapon.useServerPull = true;
        this.weapons.push(startWeapon);
        this.world.addChild(startWeapon.container);

        this.level = 1;
        this.xp = 0;
        this.xpToNext = 10;
        this.ui.updateLevel(1);
        this.ui.updateXp(0, 10);
        this.ui.updateWeaponHud(this.weapons);
        this.lastWeaponSync = '';

        this.ui.updateHp(this.player.hp, this.player.maxHp);
        this.ui.hideRespawnOverlay();
        // Respawn effects
        this.particles.burst(safePos.x, safePos.y, 0x44ffaa, 20, 300);
        this.sound.playLevelUp();
        this.screenShake.trigger(6);
      }
    }
  }

  private findSafeRespawnPosition(): { x: number; y: number } {
    let bestX = this.player.x;
    let bestY = this.player.y;
    let bestMinDist = 0;

    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 300;
      let cx = this.player.x + Math.cos(angle) * dist;
      let cy = this.player.y + Math.sin(angle) * dist;
      // Clamp to map
      cx = Math.max(-MAP_HALF_W + 50, Math.min(MAP_HALF_W - 50, cx));
      cy = Math.max(-MAP_HALF_H + 50, Math.min(MAP_HALF_H - 50, cy));

      let minEnemyDist = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minEnemyDist) minEnemyDist = d;
      }

      if (minEnemyDist > bestMinDist) {
        bestMinDist = minEnemyDist;
        bestX = cx;
        bestY = cy;
      }
    }

    return { x: bestX, y: bestY };
  }

  private checkMilestone(): void {
    if (this.kills >= this.nextMilestone) {
      this.sound.playLevelUp();
      this.screenShake.trigger(8);
      this.particles.burst(this.player.x, this.player.y, 0xffcc44, 15, 300);
      this.ui.showMilestone(`${this.kills} KILLS!`);
      const idx = this.killMilestones.indexOf(this.nextMilestone);
      this.nextMilestone = idx + 1 < this.killMilestones.length
        ? this.killMilestones[idx + 1] : this.nextMilestone + 1000;
    }
  }

  private addXp(amount: number): void {
    if (!this.player.alive) return;
    // Late-game XP bonus: +100% per 5 minutes
    const xpMultiplier = 1 + this.gameTime / 300;
    this.xp += Math.floor(amount * xpMultiplier);
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(10 * Math.pow(this.level, 1.3));
      this.ui.updateLevel(this.level);
      this.sound.playLevelUp();
      if (this.isMultiplayer && this.levelUpShown) {
        // Queue it if a choice screen is already visible
        this.levelUpPending++;
      } else {
        this.showLevelUp();
      }
    }
    this.ui.updateXp(this.xp, this.xpToNext);
  }

  private applyPickup(p: Pickup): void {
    this.sound.playPickup();
    this.particles.burst(p.x, p.y, 0xffcc44, 10, 150);
    this.pickupsCollected++;
    switch (p.type) {
      case 'heal':
        this.player.heal(Math.floor(this.player.maxHp * 0.3));
        this.ui.updateHp(this.player.hp, this.player.maxHp);
        this.damageNumbers.spawn(this.player.x, this.player.y - 20, Math.floor(this.player.maxHp * 0.3), 0x44ff66);
        break;
      case 'magnet':
        for (const orb of this.xpOrbs) orb.forceMagnet();
        break;
      case 'bomb':
        this.screenShake.trigger(12);
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          const dist = enemy.distanceTo(this.player.x, this.player.y);
          if (dist < 500) {
            if (this.isMultiplayer && enemy.serverId >= 0) {
              this.net.sendEnemyHit(enemy.serverId, 50);
            } else {
              enemy.takeDamage(50);
            }
            this.particles.spark(enemy.x, enemy.y, 0xff8844);
          }
        }
        break;
      case 'chest':
        this.addXp(this.xpToNext * 0.5);
        this.particles.burst(p.x, p.y, 0xffcc44, 20, 250);
        break;
    }
  }

  private showLevelUp(): void {
    // In multiplayer, don't pause the game
    if (!this.isMultiplayer) {
      this.paused = true;
    }
    this.levelUpShown = true;
    const choices = this.levelUpSystem.generateChoices(this.player, this.weapons);

    const onChoice = (choice: UpgradeChoice) => {
      const newWeapon = this.levelUpSystem.createWeaponById(choice.id);
      if (newWeapon) {
        if (this.isMultiplayer && newWeapon instanceof OrbitWeapon) {
          (newWeapon as OrbitWeapon).useServerPull = true;
        }
        this.weapons.push(newWeapon);
        this.world.addChild(newWeapon.container);
      } else {
        choice.apply();
      }
      this.ui.updateHp(this.player.hp, this.player.maxHp);
      this.ui.updateWeaponHud(this.weapons);
      this.levelUpShown = false;

      if (!this.isMultiplayer) {
        this.paused = false;
      }

      // Process queued level-ups
      if (this.levelUpPending > 0) {
        this.levelUpPending--;
        this.showLevelUp();
      }
    };

    this.ui.showLevelUp(choices, onChoice);
  }

  private spawnEnemy(difficulty: number): void {
    const angle = randomAngle();
    const dist = 550 + Math.random() * 150;
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;

    let defKey = 'triangle';
    const t = this.gameTime;
    if (t > 300) {
      const r = Math.random();
      if (r < 0.08) defKey = 'pentagon';
      else if (r < 0.18) defKey = 'charger';
      else if (r < 0.30) defKey = 'splitter';
      else if (r < 0.50) defKey = 'square';
      else if (r < 0.75) defKey = 'diamond';
    } else if (t > 180) {
      const r = Math.random();
      if (r < 0.10) defKey = 'charger';
      else if (r < 0.20) defKey = 'splitter';
      else if (r < 0.35) defKey = 'square';
      else if (r < 0.55) defKey = 'diamond';
    } else if (t > 90) {
      const r = Math.random();
      if (r < 0.08) defKey = 'charger';
      else if (r < 0.15) defKey = 'splitter';
      else if (r < 0.30) defKey = 'diamond';
    } else if (t > 45) {
      if (Math.random() < 0.25) defKey = 'diamond';
    }

    const def = ENEMY_DEFS[defKey];
    const enemy = new Enemy(x, y, def, difficulty);
    this.enemies.push(enemy);
    this.world.addChild(enemy.container);
  }

  private drawOffscreenIndicators(): void {
    this.indicatorGraphics.clear();
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const margin = 30;

    const targets: { x: number; y: number; color: number; size: number }[] = [];
    for (const e of this.enemies) {
      if (!e.isBoss || e.dead) continue;
      targets.push({ x: e.x, y: e.y, color: 0xff8800, size: 8 });
    }
    for (const p of this.pickups) {
      targets.push({ x: p.x, y: p.y, color: 0xffcc44, size: 5 });
    }
    // Show off-screen remote players
    for (const rp of this.remotePlayers.values()) {
      targets.push({ x: rp.targetX, y: rp.targetY, color: TEAM_COLORS[rp.team] ?? 0xaaaaaa, size: 5 });
    }

    for (const t of targets) {
      const sx = t.x - this.camera.x + sw / 2;
      const sy = t.y - this.camera.y + sh / 2;
      if (sx >= margin && sx <= sw - margin && sy >= margin && sy <= sh - margin) continue;
      const cx = Math.max(margin, Math.min(sw - margin, sx));
      const cy = Math.max(margin, Math.min(sh - margin, sy));
      const angle = Math.atan2(sy - sh / 2, sx - sw / 2);
      const s = t.size;
      this.indicatorGraphics.poly([
        cx + Math.cos(angle) * s, cy + Math.sin(angle) * s,
        cx + Math.cos(angle + 2.4) * s * 0.6, cy + Math.sin(angle + 2.4) * s * 0.6,
        cx + Math.cos(angle - 2.4) * s * 0.6, cy + Math.sin(angle - 2.4) * s * 0.6,
      ]);
      this.indicatorGraphics.fill({ color: t.color, alpha: 0.7 });
    }
  }

  private drawGrid(): void {
    this.gridGraphics.clear();
    const spacing = 80;
    const cx = this.camera.x;
    const cy = this.camera.y;
    const hw = this.app.screen.width / 2 + spacing;
    const hh = this.app.screen.height / 2 + spacing;
    const startX = Math.floor((cx - hw) / spacing) * spacing;
    const endX = Math.ceil((cx + hw) / spacing) * spacing;
    const startY = Math.floor((cy - hh) / spacing) * spacing;
    const endY = Math.ceil((cy + hh) / spacing) * spacing;

    this.gridGraphics.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.04 });
    for (let x = startX; x <= endX; x += spacing) {
      this.gridGraphics.moveTo(x, startY);
      this.gridGraphics.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += spacing) {
      this.gridGraphics.moveTo(startX, y);
      this.gridGraphics.lineTo(endX, y);
    }
    this.gridGraphics.stroke();
  }

  private drawBoundary(): void {
    this.boundaryGraphics.clear();

    // Draw map boundary rectangle
    const borderWidth = 4;
    // Outer danger zone (red glow)
    this.boundaryGraphics.rect(-MAP_HALF_W - 20, -MAP_HALF_H - 20, MAP_HALF_W * 2 + 40, MAP_HALF_H * 2 + 40);
    this.boundaryGraphics.stroke({ width: 30, color: 0xff2244, alpha: 0.06 });

    // Main boundary line
    this.boundaryGraphics.rect(-MAP_HALF_W, -MAP_HALF_H, MAP_HALF_W * 2, MAP_HALF_H * 2);
    this.boundaryGraphics.stroke({ width: borderWidth, color: 0xff2244, alpha: 0.3 });

    // Inner warning line
    this.boundaryGraphics.rect(-MAP_HALF_W + 40, -MAP_HALF_H + 40, (MAP_HALF_W - 40) * 2, (MAP_HALF_H - 40) * 2);
    this.boundaryGraphics.stroke({ width: 1, color: 0xff2244, alpha: 0.08 });

    // Corner markers
    const cornerSize = 60;
    const corners = [
      [-MAP_HALF_W, -MAP_HALF_H], [MAP_HALF_W, -MAP_HALF_H],
      [-MAP_HALF_W, MAP_HALF_H], [MAP_HALF_W, MAP_HALF_H],
    ];
    for (const [cx, cy] of corners) {
      const sx = cx === -MAP_HALF_W ? 1 : -1;
      const sy = cy === -MAP_HALF_H ? 1 : -1;
      this.boundaryGraphics.moveTo(cx, cy);
      this.boundaryGraphics.lineTo(cx + sx * cornerSize, cy);
      this.boundaryGraphics.moveTo(cx, cy);
      this.boundaryGraphics.lineTo(cx, cy + sy * cornerSize);
      this.boundaryGraphics.stroke({ width: 3, color: 0xff2244, alpha: 0.5 });
    }
  }

  private drawPings(_dt: number): void {
    this.pingGraphics.clear();
    const teamColorMap: Record<string, number> = { blue: 0x4488ff, red: 0xff4466, green: 0x44ff88, yellow: 0xffcc44 };
    for (const ping of this.activePings) {
      const color = teamColorMap[ping.team] ?? 0xffffff;
      const alpha = Math.min(1, ping.timer / 2);
      const pulse = Math.sin(ping.timer * 6) * 5 + 20;
      // Expanding ring
      this.pingGraphics.circle(ping.x, ping.y, pulse);
      this.pingGraphics.stroke({ width: 2, color, alpha: alpha * 0.6 });
      // Center dot
      this.pingGraphics.circle(ping.x, ping.y, 4);
      this.pingGraphics.fill({ color, alpha });
      // Outer glow
      this.pingGraphics.circle(ping.x, ping.y, pulse + 10);
      this.pingGraphics.stroke({ width: 1, color, alpha: alpha * 0.2 });
    }
  }

  private drawAmbient(dt: number): void {
    this.ambientGraphics.clear();
    for (const dot of this.ambientDots) {
      dot.y -= dot.speed * dt;
      const relY = dot.y - this.camera.y;
      if (relY < -1500) dot.y += 3000;
      const relX = dot.x - this.camera.x;
      if (relX < -1500 || relX > 1500) dot.x = this.camera.x + (Math.random() - 0.5) * 3000;
      this.ambientGraphics.circle(dot.x, dot.y, 1.5);
      this.ambientGraphics.fill({ color: 0xffffff, alpha: dot.alpha });
    }
  }
}
