import { Application, Container, Graphics } from 'pixi.js';
import { Input } from './Input';
import { Camera } from './Camera';
import { Player } from '../entities/Player';
import { Enemy, ENEMY_DEFS } from '../entities/Enemy';
import { XPOrb } from '../entities/XPOrb';
import { Pickup, rollPickupDrop } from '../entities/Pickup';
import { spawnBoss, BossController } from '../entities/Boss';
import { BossProjectile } from '../entities/BossProjectile';
import { BlackHole } from '../entities/BlackHole';
import { RemotePlayer } from '../entities/RemotePlayer';
import { WeaponBase } from '../weapons/WeaponBase';
import { OrbitWeapon } from '../weapons/OrbitWeapon';
import { BulletWeapon } from '../weapons/BulletWeapon';
import { ChainLightning } from '../weapons/ChainLightning';
import { ForceField } from '../weapons/ForceField';
import { BoomerangWeapon } from '../weapons/BoomerangWeapon';
import { HomingMissileWeapon } from '../weapons/HomingMissileWeapon';
import { LevelUpSystem, UpgradeChoice } from '../systems/LevelUpSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { ScreenShake } from '../systems/ScreenShake';
import { DamageNumbers } from '../systems/DamageNumbers';
import { SoundManager } from '../systems/SoundManager';
import { Trail } from '../systems/Trail';
import { MetaProgression } from '../systems/MetaProgression';
import { getCharacterById, CHARACTERS } from '../systems/CharacterSystem';
import { AchievementChecker, getDailyChallenges, getTodayDateStr, type GameRunStats } from '../systems/AchievementSystem';
import { NetworkManager } from '../net/NetworkManager';
import { UI } from '../ui/UI';
import { t } from '../systems/i18n';
import { RelicSystem, RELIC_DEFS } from '../systems/RelicSystem';
import { randomAngle, distance } from '../utils/math';
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

  // Flag to prevent chat re-open after Enter send
  private chatJustClosed = false;

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

  // ─── New Feature Systems ───
  private meta!: MetaProgression;
  private achievementChecker = new AchievementChecker();
  private selectedCharacterId = 'warrior';
  private bossKillsThisGame = 0;
  private evolutionsThisGame = 0;
  private baseMagnetRange = 100;
  private basePlayerSpeed = 280;

  // Relic system (run-scoped)
  private relicSystem = new RelicSystem();

  // Combo system
  private comboCount = 0;
  private comboTimer = 0;
  private maxCombo = 0;

  // Tutorial
  private tutorialStep = -1; // -1 = inactive
  private tutorialActive = false;
  private tutorialMoveDistance = 0;

  // Spectate
  private spectating = false;
  private spectateTargetId = '';

  // Emote
  private emoteRadialOpen = false;

  // Mini-boss & Event Wave (solo)
  private miniBossTimer = 90;
  private eventWaveTimer = 60;
  private activeEvent: { type: string; timer: number } | null = null;

  // Boss attack system (solo)
  private bossControllers = new Map<Enemy, BossController>();
  private bossProjectiles: BossProjectile[] = [];

  // Black holes
  private blackHoles: BlackHole[] = [];
  private blackHoleById = new Map<number, BlackHole>();
  private nextBlackHoleTime = 90;
  private nextBlackHoleId = 1;

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

    // ESC to pause (solo only), G to ping (multiplayer), Enter for chat
    window.addEventListener('keydown', (e) => {
      // Chat: open input (multiplayer, Enter when not focused)
      if (this.isMultiplayer && this.gameActive && this.started) {
        if (e.code === 'Enter' && !this.ui.isChatInputFocused()) {
          // Prevent re-opening chat immediately after Enter-to-send closed it
          if (this.chatJustClosed) {
            this.chatJustClosed = false;
            return;
          }
          this.ui.openChatInput();
          e.preventDefault();
          return;
        }
        if (e.code === 'Escape' && this.ui.isChatInputFocused()) {
          this.ui.closeChatInput();
          e.preventDefault();
          return;
        }
      }

      if (e.code === 'Escape' && this.gameActive && this.started && !this.isMultiplayer) {
        if (this.pausedByMenu) this.resumeGame();
        else if (!this.paused) this.pauseGame();
      }
      if (e.code === 'KeyG' && this.isMultiplayer && this.gameActive && this.started && this.net.connected) {
        if (this.ui.isChatInputFocused()) return; // Don't ping while chatting
        this.net.sendPing(this.player.x, this.player.y);
        this.activePings.push({ x: this.player.x, y: this.player.y, team: this.net.myTeam, name: 'You', timer: 4 });
      }

      // Emote toggle (E key)
      if (e.code === 'KeyE' && this.isMultiplayer && this.gameActive && this.started && this.net.connected) {
        if (this.ui.isChatInputFocused()) return;
        if (this.ui.isEmoteRadialOpen()) {
          this.ui.hideEmoteRadial();
        } else {
          this.ui.showEmoteRadial((emoteId) => {
            this.net.sendEmote(emoteId);
          });
        }
      }

      // Spectate cycle (left/right arrow or A/D while spectating)
      if (this.spectating && this.isMultiplayer) {
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.net.sendSpectateCycle('next');
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.net.sendSpectateCycle('prev');
        }
      }
    });

    this.ui.onPause(
      () => this.resumeGame(),
      () => this.quitToTitle(),
      (v) => this.sound.setVolume(v),
    );

    // Chat send callback
    this.ui.onChatSend((msg) => {
      if (this.net.connected) this.net.sendChat(msg);
    });

    // Mobile chat toggle button (chat icon to open, ✕ to close)
    const chatToggleBtn = document.getElementById('chat-toggle-btn')!;
    const chatIconSvg = chatToggleBtn.innerHTML;
    const handleChatToggle = () => {
      if (this.ui.isChatInputFocused()) {
        this.ui.closeChatInput();
      } else {
        this.ui.openChatInput();
        chatToggleBtn.innerHTML = '<span style="font-size:18px;line-height:1">✕</span>';
      }
    };
    chatToggleBtn.addEventListener('click', handleChatToggle);
    chatToggleBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleChatToggle();
    });

    // Chat close callback — set flag to prevent Enter re-open + reset toggle icon
    this.ui.onChatClose(() => {
      this.chatJustClosed = true;
      chatToggleBtn.innerHTML = chatIconSvg;
    });

    // Mobile chat send button
    const chatSendBtn = document.getElementById('chat-send-btn')!;
    const handleChatSend = () => {
      const msg = this.ui.getChatInputValue();
      if (msg && this.net.connected) this.net.sendChat(msg);
      this.ui.closeChatInput();
    };
    chatSendBtn.addEventListener('click', handleChatSend);
    chatSendBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleChatSend();
    });

    // Mobile ping button
    const pingBtn = document.getElementById('ping-btn')!;
    const handlePing = () => {
      if (this.isMultiplayer && this.gameActive && this.started && this.net.connected) {
        if (this.ui.isChatInputFocused()) return;
        this.net.sendPing(this.player.x, this.player.y);
        this.activePings.push({ x: this.player.x, y: this.player.y, team: this.net.myTeam, name: 'You', timer: 4 });
      }
    };
    pingBtn.addEventListener('click', handlePing);
    pingBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlePing();
    });

    // Auto-pause on blur (solo only)
    window.addEventListener('blur', () => {
      if (this.gameActive && this.started && !this.paused && !this.isMultiplayer) {
        this.pauseGame();
      }
    });

    // ─── Initialize meta progression ───
    this.meta = new MetaProgression();
    this.ui.updateTitleCoins(this.meta.coins);

    // Shop button
    this.ui.onShopClick(() => {
      this.sound.init();
      this.sound.playButtonClick();
      this.ui.showShop(this.meta);
    });

    // Stats button
    document.getElementById('stats-btn')!.addEventListener('click', () => {
      this.sound.init();
      this.sound.playButtonClick();
      this.ui.showStats(this.meta.getRunHistory());
    });

    // Achievement button
    this.ui.onAchievementClick(() => {
      this.sound.init();
      this.sound.playButtonClick();
      this.ui.showAchievements(this.meta);
    });

    // Character select callback
    this.ui.onCharacterSelect((charId: string) => {
      this.selectedCharacterId = charId;
      this.sound.playCardSelect();
      this.ui.hideCharacterSelect();
      // Actually start game
      if (this.isMultiplayer) {
        this.ui.showConnectionStatus('Connecting...');
        this.pendingMultiStart = true;
        this.connectMultiplayer();
      } else {
        this.startGame();
      }
    });

    // Party callbacks
    this.ui.onPartyCreate(() => {
      this.sound.playButtonClick();
      this.ui.showConnectionStatus('Creating party...');
      this.pendingMultiStart = false;
      this.isMultiplayer = true;
      this.net.connect(WS_URL, this.playerName);
      this.net.on('connected', () => {
        this.net.sendCreateParty();
      });
    });
    this.ui.onPartyJoin((code: string) => {
      this.sound.playButtonClick();
      this.ui.showConnectionStatus('Joining party...');
      this.pendingMultiStart = false;
      this.isMultiplayer = true;
      this.net.connect(WS_URL, this.playerName, code);
    });
    this.ui.onPartyQuick(() => {
      this.sound.playButtonClick();
      this.isMultiplayer = true;
      this.ui.showCharacterSelect(this.meta);
    });
    this.ui.onPartyStart(() => {
      this.sound.playButtonClick();
      this.net.sendPartyStart();
      this.ui.hideParty();
      this.ui.showCharacterSelect(this.meta);
    });

    // Quit to title from death overlay (multiplayer)
    document.getElementById('quit-death-btn')!.addEventListener('click', () => {
      this.ui.hideRespawnOverlay();
      this.respawnTimer = 0;
      this.quitToTitle();
    });

    // Quit to title from game over screen (solo)
    document.getElementById('gameover-quit-btn')!.addEventListener('click', () => {
      this.ui.hideGameOver();
      this.quitToTitle();
    });

    // Spectate buttons
    document.getElementById('spectate-death-btn')!.addEventListener('click', () => {
      if (this.isMultiplayer && this.net.connected) {
        this.net.sendSpectate();
      }
    });
    document.getElementById('spectate-prev-btn')!.addEventListener('click', () => {
      if (this.spectating) this.net.sendSpectateCycle('prev');
    });
    document.getElementById('spectate-next-btn')!.addEventListener('click', () => {
      if (this.spectating) this.net.sendSpectateCycle('next');
    });
    document.getElementById('spectate-exit-btn')!.addEventListener('click', () => {
      this.spectating = false;
      this.spectateTargetId = '';
      this.ui.hideSpectateBanner();
    });

    // Tutorial skip button
    this.ui.onTutorialSkip(() => {
      this.tutorialActive = false;
      this.tutorialStep = -1;
      this.ui.hideTutorial();
      localStorage.setItem('geo_tutorial_done', '1');
    });

    // Stats button
    document.getElementById('stats-back-btn')!.addEventListener('click', () => {
      this.ui.hideStats();
    });

    this.setupTitleUI();

    this.ui.showTitle();
    this.ui.onStart(() => {
      this.sound.init();
      const nameInput = document.getElementById('name-input') as HTMLInputElement;
      this.playerName = nameInput.value.trim() || 'Player';
      // Multiplayer → party screen, Solo → character select
      if (this.isMultiplayer) {
        this.ui.showPartyScreen();
      } else {
        this.ui.showCharacterSelect(this.meta);
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

  private partyRoomCode = '';

  private connectMultiplayer(): void {
    this.net.connect(WS_URL, this.playerName, this.partyRoomCode || undefined);
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
      const serverIds = new Set<number>();
      for (let i = 0; i < data.length; i += 7) {
        const id = data[i];
        serverIds.add(id);
        const sx = data[i + 1];
        const sy = data[i + 2];
        const hp = data[i + 3];
        const flags = data[i + 4];
        const vx = data[i + 5];
        const vy = data[i + 6];
        const isElite = (flags & 2) !== 0;
        const isSlowed = (flags & 4) !== 0;
        const isPhasing = (flags & 8) !== 0;

        const enemy = this.enemyById.get(id);
        if (enemy) {
          enemy.serverX = sx;
          enemy.serverY = sy;
          enemy.hp = hp;
          enemy.serverVx = vx;
          enemy.serverVy = vy;
          enemy.lastSyncTime = Date.now();

          // Elite visual scaling (radius already set in createServerEnemy)
          if (isElite && enemy.container.scale.x < 1.5) {
            enemy.container.scale.set(1.5);
          }

          // Server slow visual: override speed to trigger blue tint in update
          if (isSlowed) {
            enemy.speed = enemy.baseSpeed * 0.5;
          } else {
            enemy.speed = enemy.baseSpeed;
          }

          // Phaser visual
          if (enemy.enemyType === 'phaser') {
            enemy.isPhasingVisual = isPhasing;
          }
        }
      }

      // Remove stale enemies not present in server sync (missed enemy_death)
      // Use 4s threshold to avoid false removals during network hiccups
      const now = Date.now();
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.serverId >= 0 && !serverIds.has(e.serverId) && now - e.lastSyncTime > 4000) {
          this.world.removeChild(e.container);
          e.container.destroy();
          this.enemyById.delete(e.serverId);
          this.enemies.splice(i, 1);
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
          this.incrementCombo();
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
      // Only show pings from same team
      if (data.team !== this.net.myTeam) return;
      this.activePings.push({ x: data.x, y: data.y, team: data.team, name: data.playerName, timer: 4 });
      this.sound.playPickup();
    });

    this.net.on('chat', (data) => {
      this.ui.addChatMessage(data.name, data.team, data.msg);
    });

    this.net.on('wave_event', (data) => {
      this.ui.showWaveEvent(data.waveNumber, data.enemyCount);
      this.screenShake.trigger(8);
      this.sound.playBossWarning();
    });

    // ─── Event Wave (multiplayer) ─────────────
    this.net.on('event_wave_start', (data) => {
      const eventKey = `event.${data.event}`;
      const colorClass = data.event === 'gold_rush' ? 'event-gold'
        : data.event === 'healing_rain' ? 'event-green' : 'event-red';
      this.ui.showEventBanner(t(eventKey), colorClass, data.duration);
      this.sound.playEventWave();
      this.activeEvent = { type: data.event, timer: data.duration };
    });

    this.net.on('event_wave_end', (_data) => {
      this.ui.hideEventBanner();
      this.activeEvent = null;
    });

    // ─── Mini Boss (multiplayer) ──────────────
    this.net.on('mini_boss_spawn', (data) => {
      this.createServerEnemy(data.enemy);
      this.ui.showEventBanner(t('event.miniboss'), 'event-red', 3);
      this.sound.playMiniBoss();
      this.screenShake.trigger(8);
    });

    // ─── Boss Attack (multiplayer) ────────────
    this.net.on('boss_attack', (data) => {
      // Create visual projectiles from server event
      for (const pd of data.projectiles) {
        const proj = new BossProjectile(data.x, data.y, pd.vx, pd.vy, pd.damage, pd.lifetime);
        this.bossProjectiles.push(proj);
        this.world.addChild(proj.container);
      }
      // AoE visual
      if (data.aoe) {
        this.particles.burst(data.aoe.x, data.aoe.y, 0xff4400, 15, data.aoe.radius);
        this.screenShake.trigger(8);
      }
    });

    // ─── BlackHole (multiplayer) ────────────
    this.net.on('blackhole_spawn', (data) => {
      if (this.blackHoleById.has(data.id)) return;
      const bh = new BlackHole(data.x, data.y);
      bh.serverId = data.id;
      this.blackHoles.push(bh);
      this.blackHoleById.set(data.id, bh);
      this.world.addChild(bh.container);
    });

    this.net.on('blackhole_sync', (holes) => {
      for (const hd of holes) {
        const bh = this.blackHoleById.get(hd.id);
        if (bh) {
          bh.syncFromServer(hd.radius, hd.age);
        }
      }
    });

    this.net.on('blackhole_despawn', (data) => {
      const bh = this.blackHoleById.get(data.id);
      if (bh) {
        bh.dead = true;
        this.world.removeChild(bh.container);
        bh.container.destroy();
        this.blackHoleById.delete(data.id);
        const idx = this.blackHoles.indexOf(bh);
        if (idx >= 0) this.blackHoles.splice(idx, 1);
      }
    });

    // ─── Party Events ─────────────────────────
    this.net.on('party_created', (data) => {
      this.ui.hideConnectionStatus();
      this.ui.showPartyCode(data.code);
    });

    this.net.on('party_joined', (data) => {
      this.ui.hideConnectionStatus();
      this.ui.showPartyCode(data.code);
      this.ui.updatePartyMembers(data.members);
    });

    this.net.on('party_member_join', (data) => {
      this.sound.playButtonClick();
      // Refresh member list from party screen
      const memberList = document.getElementById('party-members');
      if (memberList) {
        const li = document.createElement('li');
        li.textContent = data.name;
        memberList.appendChild(li);
      }
    });

    this.net.on('party_member_leave', (data) => {
      // Remove member from list
      const memberList = document.getElementById('party-members');
      if (memberList) {
        for (const li of Array.from(memberList.children)) {
          if (li.textContent === data.name) { li.remove(); break; }
        }
      }
    });

    this.net.on('party_error', (data) => {
      this.ui.showPartyError(data.reason);
    });

    this.net.on('party_game_start', (data) => {
      this.partyRoomCode = data.roomCode;
      this.ui.hideParty();
      this.ui.showCharacterSelect(this.meta);
    });

    // ─── Spectate Events ──────────────────
    this.net.on('spectate_start', (data) => {
      this.spectating = true;
      this.spectateTargetId = data.targetId;
      this.ui.showSpectateBanner(data.targetName);
    });

    this.net.on('spectate_end', () => {
      this.spectating = false;
      this.spectateTargetId = '';
      this.ui.hideSpectateBanner();
    });

    // ─── Emote Events ─────────────────────
    this.net.on('player_emote', (data) => {
      const rp = this.remotePlayers.get(data.playerId);
      if (rp) {
        rp.showEmote(data.emoteId);
      }
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
    this.sound.stopBGM();
    this.saveHighscore();
    this.net.disconnect();
    for (const rp of this.remotePlayers.values()) {
      this.world.removeChild(rp.container);
      rp.destroy();
    }
    this.remotePlayers.clear();
    // Cleanup enemies
    for (const e of this.enemies) { this.world.removeChild(e.container); e.container.destroy({ children: true }); }
    this.enemies = [];
    this.enemyById.clear();
    // Cleanup weapons
    for (const w of this.weapons) { this.world.removeChild(w.container); w.destroy(); }
    this.weapons = [];
    // Cleanup boss projectiles and black holes
    for (const proj of this.bossProjectiles) proj.container.destroy();
    this.bossProjectiles = [];
    this.bossControllers.clear();
    for (const bh of this.blackHoles) bh.container.destroy();
    this.blackHoles = [];
    this.blackHoleById.clear();
    this.ui.hideAll();
    this.ui.hideParty();
    this.ui.showMultiplayerUI(false);
    this.ui.updateTitleCoins(this.meta.coins);
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
    // Boss attack / black hole reset
    this.bossControllers.clear();
    for (const proj of this.bossProjectiles) { proj.container.destroy(); }
    this.bossProjectiles = [];
    for (const bh of this.blackHoles) { bh.container.destroy(); }
    this.blackHoles = [];
    this.blackHoleById.clear();
    this.nextBlackHoleTime = 90;
    this.nextBlackHoleId = 1;
    this.pullRequestTimer = 0;

    this.particles = new ParticleSystem();
    this.screenShake = new ScreenShake();
    this.damageNumbers = new DamageNumbers();
    this.trail = new Trail();

    this.bossKillsThisGame = 0;
    this.evolutionsThisGame = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.relicSystem.reset();
    this.miniBossTimer = 90;
    this.eventWaveTimer = 60;
    this.activeEvent = null;

    this.player = new Player(this.input);

    // Apply meta progression bonuses
    this.meta.applyToPlayer(this.player);

    // Apply character passive bonus
    const charDef = getCharacterById(this.selectedCharacterId);
    if (charDef) {
      const { stat, value, mode } = charDef.passiveBonus;
      if (stat === 'maxHp') {
        if (mode === 'multiply') { this.player.maxHp = Math.floor(this.player.maxHp * value); this.player.hp = this.player.maxHp; }
        else { this.player.maxHp += value; this.player.hp = this.player.maxHp; }
      } else if (stat === 'speed') {
        if (mode === 'multiply') this.player.speed = Math.floor(this.player.speed * value);
        else this.player.speed += value;
      } else if (stat === 'magnetRange') {
        if (mode === 'multiply') this.player.magnetRange = Math.floor(this.player.magnetRange * value);
        else this.player.magnetRange += value;
      }
      // Apply character color
      // (Player visual color is set via tint on the container children)
      this.player.container.children.forEach(child => {
        if (child instanceof Graphics) {
          (child as Graphics).tint = charDef.color;
        }
      });
    }

    this.baseMagnetRange = this.player.magnetRange;
    this.basePlayerSpeed = this.player.speed;

    this.world.addChild(this.trail.container);
    this.world.addChild(this.player.container);

    // Create starting weapon based on character
    const startWeaponId = charDef?.startWeapon || 'orbit';
    const startWeapon = this.createWeaponByTypeId(startWeaponId);
    if (this.isMultiplayer && startWeapon instanceof OrbitWeapon) startWeapon.useServerPull = true;
    this.weapons.push(startWeapon);
    this.world.addChild(startWeapon.container);

    // Start BGM
    this.sound.playBGM();

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

    // Start tutorial for first-time players
    if (!localStorage.getItem('geo_tutorial_done') && !this.isMultiplayer) {
      this.tutorialActive = true;
      this.tutorialStep = 0;
      this.tutorialMoveDistance = 0;
      this.ui.showTutorialStep(t('tutorial.move'));
    }
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

    // Block movement while chat input is focused
    this.input.movementBlocked = this.ui.isChatInputFocused();

    const prevX = this.player.x;
    const prevY = this.player.y;
    const prevHp = this.player.hp;
    this.player.update(dt);
    const isMoving = prevX !== this.player.x || prevY !== this.player.y;

    if (this.player.hp !== prevHp) {
      this.ui.updateHp(this.player.hp, this.player.maxHp);
    }

    // Tutorial progression
    if (this.tutorialActive) {
      if (this.tutorialStep === 0 && isMoving) {
        this.tutorialMoveDistance += Math.abs(this.player.x - prevX) + Math.abs(this.player.y - prevY);
        if (this.tutorialMoveDistance > 50) {
          this.tutorialStep = 1;
          this.ui.showTutorialStep(t('tutorial.weapon'));
        }
      } else if (this.tutorialStep === 1 && this.gameTime > 3) {
        this.tutorialStep = 2;
        this.ui.showTutorialStep(t('tutorial.xp'));
      }
      // Steps 2→3 and completion handled in addXp and showLevelUp
    }

    this.trail.update(dt, this.player.x, this.player.y, isMoving);

    // Camera: follow spectate target or player
    if (this.spectating && this.spectateTargetId) {
      const target = this.remotePlayers.get(this.spectateTargetId);
      if (target) {
        this.camera.follow(target.targetX, target.targetY, 0.08);
      } else {
        this.camera.follow(this.player.x, this.player.y, 0.08);
      }
    } else {
      this.camera.follow(this.player.x, this.player.y, 0.08);
    }
    this.camera.apply();
    this.screenShake.update(dt, this.world);
    this.drawGrid();
    this.drawAmbient(dt);

    // Network sync
    if (this.isMultiplayer && this.net.connected) {
      this.netSyncTimer -= dt;
      if (this.netSyncTimer <= 0) {
        this.netSyncTimer = 0.016; // match server tick rate (16ms / 60Hz)
        // Build weapon sync data (only send when changed)
        const weaponData: WeaponSyncData[] = this.weapons.map(w => ({
          id: w.info.id, level: w.level, evolved: w.evolved,
        }));
        const weaponStr = JSON.stringify(weaponData);
        const sendWeapons = weaponStr !== this.lastWeaponSync;
        if (sendWeapons) this.lastWeaponSync = weaponStr;

        const relicCount = this.relicSystem.getOwnedRelics().reduce((sum, r) => sum + r.count, 0);
        this.net.sendState(
          this.player.x, this.player.y, this.level, this.kills,
          this.player.hp, this.player.maxHp, this.player.container.rotation,
          sendWeapons ? weaponData : undefined,
          relicCount,
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
        this.bossControllers.set(boss, new BossController());
        this.bossCount++;
        this.nextBossTime += this.bossInterval;
        this.bossWarningShown = false;
      }

      // Solo: spawn black holes (90s first, then 60-90s interval)
      if (this.gameTime >= this.nextBlackHoleTime && this.blackHoles.length < 2) {
        const bhAngle = randomAngle();
        const bhDist = 300 + Math.random() * 300;
        const bh = new BlackHole(
          this.player.x + Math.cos(bhAngle) * bhDist,
          this.player.y + Math.sin(bhAngle) * bhDist,
        );
        bh.serverId = this.nextBlackHoleId++;
        this.blackHoles.push(bh);
        this.world.addChild(bh.container);
        this.nextBlackHoleTime = this.gameTime + 60 + Math.random() * 30;
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

    // ─── Solo: Boss attack system ───
    if (!this.isMultiplayer) {
      for (const enemy of this.enemies) {
        if (!enemy.isBoss || enemy.dead) continue;
        const ctrl = this.bossControllers.get(enemy);
        if (!ctrl) continue;
        const attackEvent = ctrl.update(dt, enemy, this.player.x, this.player.y);
        if (attackEvent) {
          for (const proj of attackEvent.projectiles) {
            this.bossProjectiles.push(proj);
            this.world.addChild(proj.container);
          }
          // Charge slam AoE
          if (attackEvent.type === 'charge_slam' && attackEvent.aoeX !== undefined) {
            const pdx = this.player.x - attackEvent.aoeX;
            const pdy = this.player.y - attackEvent.aoeY!;
            if (pdx * pdx + pdy * pdy < (attackEvent.aoeRadius! * attackEvent.aoeRadius!)) {
              this.player.takeDamage(attackEvent.aoeDamage!);
              this.ui.updateHp(this.player.hp, this.player.maxHp);
              this.ui.flashDamage();
              this.screenShake.trigger(10);
            }
            // Visual: AoE ring
            this.particles.burst(attackEvent.aoeX, attackEvent.aoeY!, 0xff4400, 15, attackEvent.aoeRadius!);
          }
        }
      }

      // Update boss projectiles (solo — collision + damage)
      for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
        const proj = this.bossProjectiles[i];
        proj.update(dt);
        if (proj.dead) {
          this.world.removeChild(proj.container);
          proj.container.destroy();
          this.bossProjectiles.splice(i, 1);
          continue;
        }
        // Check collision with player
        if (proj.hitTest(this.player.x, this.player.y, this.player.radius)) {
          this.player.takeDamage(proj.damage);
          this.ui.updateHp(this.player.hp, this.player.maxHp);
          this.ui.flashDamage();
          this.screenShake.trigger(4);
          proj.dead = true;
          this.world.removeChild(proj.container);
          proj.container.destroy();
          this.bossProjectiles.splice(i, 1);
        }
      }
    }

    // Update boss projectiles visuals (multiplayer — visual only, server handles damage)
    if (this.isMultiplayer) {
      for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
        const proj = this.bossProjectiles[i];
        proj.update(dt);
        if (proj.dead) {
          this.world.removeChild(proj.container);
          proj.container.destroy();
          this.bossProjectiles.splice(i, 1);
        }
      }
    }

    // ─── Update black holes ───
    for (let i = this.blackHoles.length - 1; i >= 0; i--) {
      const bh = this.blackHoles[i];
      if (!this.isMultiplayer) {
        bh.update(dt);
      }
      if (bh.dead) {
        this.world.removeChild(bh.container);
        bh.container.destroy();
        if (bh.serverId >= 0) this.blackHoleById.delete(bh.serverId);
        this.blackHoles.splice(i, 1);
        continue;
      }

      // Pull + damage effects
      // Pull player
      const pullForce = bh.getPullForce(this.player.x, this.player.y);
      if (pullForce) {
        this.player.x += pullForce.fx * dt;
        this.player.y += pullForce.fy * dt;
      }
      // Damage player (solo only — multi uses server pvp_damage)
      if (!this.isMultiplayer && bh.isInDamageZone(this.player.x, this.player.y)) {
        const dmg = Math.max(1, Math.floor(bh.damagePerSecond * dt));
        this.player.takeDamage(dmg);
        this.ui.updateHp(this.player.hp, this.player.maxHp);
      }
      // Pull + slow enemies (solo)
      if (!this.isMultiplayer) {
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          const ef = bh.getPullForce(enemy.x, enemy.y);
          if (ef) {
            enemy.x += ef.fx * dt;
            enemy.y += ef.fy * dt;
          }
          if (bh.isInDamageZone(enemy.x, enemy.y)) {
            enemy.speed = Math.min(enemy.speed, enemy.baseSpeed * 0.2);
          }
        }
      }
    }

    // ─── Relic multipliers ────────────────────
    const mults = this.relicSystem.computeMultipliers();

    // ─── SOLO: enemy collision damage (in multi, server sends pvp_damage) ───
    if (!this.isMultiplayer) {
      for (const enemy of this.enemies) {
        if (enemy.canDamagePlayer()) {
          const dist = enemy.distanceTo(this.player.x, this.player.y);
          if (dist < enemy.radius + this.player.radius) {
            const reducedDmg = Math.max(1, Math.floor(enemy.damage * (1 - this.meta.getDamageReduction())));
            this.player.takeDamage(reducedDmg);
            enemy.resetDamageCooldown();
            this.ui.updateHp(this.player.hp, this.player.maxHp);
            this.ui.flashDamage();
            this.screenShake.trigger(6);
            this.sound.playPlayerHit();
            this.particles.spark(this.player.x, this.player.y, 0xff4466);

            // Thorns: reflect damage back to enemy
            if (mults.thornsPercent > 0) {
              const thornsDmg = Math.max(1, Math.floor(reducedDmg * mults.thornsPercent));
              enemy.takeDamage(thornsDmg);
              this.particles.spark(enemy.x, enemy.y, 0xff8844);
              this.damageNumbers.spawn(enemy.x, enemy.y, thornsDmg, 0xff8844);
            }
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

    // Apply relic speed/magnet/regen bonuses (recalc each frame for stack changes)
    // Note: base stats set in startGame, relics add on top
    // Regen bonus from relics
    if (mults.regenBonus > 0 && this.player.alive && this.player.hp < this.player.maxHp) {
      this.player.heal(Math.ceil(mults.regenBonus * dt));
      this.ui.updateHp(this.player.hp, this.player.maxHp);
    }

    // Apply relic speed multiplier (recalculate from base each frame)
    this.player.speed = Math.floor(this.basePlayerSpeed * mults.speedMultiplier);

    // Update weapon multipliers from relics
    for (const weapon of this.weapons) {
      weapon.damageMultiplier = mults.damageMultiplier;
      weapon.cooldownMultiplier = mults.cooldownMultiplier;
      weapon.areaMultiplier = mults.areaMultiplier;
    }

    // Last Stand check
    const lastStandActive = mults.lastStandDamageBonus > 0 && this.player.hp <= this.player.maxHp * 0.3;
    const finalDamageMultiplier = mults.damageMultiplier * (lastStandActive ? (1 + mults.lastStandDamageBonus) : 1) * this.teamBuffMultiplier;

    // ─── Weapons ─────────────────────────────
    const playerAlive = this.player.alive;
    for (const weapon of this.weapons) {
      if (!playerAlive) break;
      weapon.update(dt, this.player.x, this.player.y, this.enemies);
      const hits = weapon.getHits(this.enemies);
      const baseDmg = Math.floor(weapon.currentDamage * finalDamageMultiplier);

      for (const enemy of hits) {
        const isCrit = Math.random() < mults.critChance;
        const displayDmg = isCrit ? Math.floor(baseDmg * mults.critDamage) : baseDmg;

        if (this.isMultiplayer) {
          // Report hit to server; getHits already applied local takeDamage for prediction
          if (enemy.serverId >= 0) {
            this.net.sendEnemyHit(enemy.serverId, displayDmg);
          }
        } else {
          // Solo: getHits already applied baseDmg via takeDamage; apply crit bonus only
          if (isCrit) {
            const fromAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
            enemy.takeDamage(baseDmg, fromAngle); // extra crit damage
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
          if (e.isBoss) {
            this.screenShake.trigger(12);
            this.bossKillsThisGame++;
          }

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
          if (e.isBoss) this.bossControllers.delete(e);
          this.kills++;
          this.ui.updateKills(this.kills);
          this.checkMilestone();
          this.incrementCombo();

          // Lifesteal from relic
          if (mults.lifestealFraction > 0 && this.player.alive) {
            const healAmt = Math.max(1, Math.floor(e.damage * mults.lifestealFraction * 10));
            this.player.heal(healAmt);
            this.ui.updateHp(this.player.hp, this.player.maxHp);
          }

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

    // Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.ui.updateCombo(0);
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

    // Solo mini-boss & event waves
    if (!this.isMultiplayer && this.gameTime > 60) {
      this.updateSoloEvents(dt, difficulty);
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
        // Show spectate button if other players alive
        const hasAlive = Array.from(this.remotePlayers.values()).some(rp => rp.alive);
        document.getElementById('spectate-death-btn')!.style.display = hasAlive ? 'inline-block' : 'none';
      } else {
        // Solo: game over
        this.gameActive = false;
        this.saveHighscore();
        this.sound.stopBGM();

        // Process meta progression
        const coinsEarned = this.processEndOfGame();

        // Record run history
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        this.meta.addRunRecord({
          date: dateStr,
          durationS: this.gameTime,
          kills: this.kills,
          level: this.level,
          maxCombo: this.maxCombo,
          totalDamage: this.totalDamage,
          coinsEarned,
          bossKills: this.bossKillsThisGame,
          character: this.selectedCharacterId,
          weaponsFinal: this.weapons.map(w => w.info.id),
        });

        this.ui.showGameOver(
          {
            time: this.gameTime, kills: this.kills, level: this.level,
            totalDamage: this.totalDamage, wave: this.wave, pickups: this.pickupsCollected,
            coinsEarned, maxCombo: this.maxCombo,
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

        // Death penalty: full reset (weapons, level, XP, stats)
        for (const w of this.weapons) {
          this.world.removeChild(w.container);
          w.destroy();
        }
        this.weapons = [];
        const charDef = getCharacterById(this.selectedCharacterId);
        const respawnWeapon = this.createWeaponByTypeId(charDef?.startWeapon || 'orbit');
        if (respawnWeapon instanceof OrbitWeapon) respawnWeapon.useServerPull = true;
        this.weapons.push(respawnWeapon);
        this.world.addChild(respawnWeapon.container);

        this.level = 1;
        this.xp = 0;
        this.xpToNext = 10;
        this.ui.updateLevel(1);
        this.ui.updateXp(0, 10);
        this.ui.updateWeaponHud(this.weapons);
        this.lastWeaponSync = '';

        // Reset player stats to defaults then re-apply meta/character bonuses
        this.player.maxHp = 100;
        this.player.speed = 280;
        this.player.magnetRange = 100;
        this.player.hpRegen = 0;
        this.meta.applyToPlayer(this.player);
        const respawnCharDef = getCharacterById(this.selectedCharacterId);
        if (respawnCharDef) {
          const { stat, value, mode } = respawnCharDef.passiveBonus;
          if (stat === 'maxHp') {
            if (mode === 'multiply') this.player.maxHp = Math.floor(this.player.maxHp * value);
            else this.player.maxHp += value;
          } else if (stat === 'speed') {
            if (mode === 'multiply') this.player.speed = Math.floor(this.player.speed * value);
            else this.player.speed += value;
          } else if (stat === 'magnetRange') {
            if (mode === 'multiply') this.player.magnetRange = Math.floor(this.player.magnetRange * value);
            else this.player.magnetRange += value;
          }
        }
        // Re-apply relic effects after respawn (glass cannon maxHp, magnet, speed base)
        this.baseMagnetRange = this.player.magnetRange;
        this.basePlayerSpeed = this.player.speed;
        const respawnMults = this.relicSystem.computeMultipliers();
        if (respawnMults.maxHpMultiplier < 1) {
          this.player.maxHp = Math.max(10, Math.floor(this.player.maxHp * respawnMults.maxHpMultiplier));
        }
        this.player.magnetRange = this.baseMagnetRange + respawnMults.magnetBonus;
        this.player.hp = this.player.maxHp;

        // Clean up XP orbs and pickups accumulated during death
        for (const orb of this.xpOrbs) {
          this.world.removeChild(orb.container);
          orb.container.destroy();
        }
        this.xpOrbs = [];
        for (const p of this.pickups) {
          this.world.removeChild(p.container);
          p.container.destroy();
        }
        this.pickups = [];

        this.ui.updateHp(this.player.hp, this.player.maxHp);
        this.ui.hideRespawnOverlay();
        // End spectate on respawn
        this.spectating = false;
        this.spectateTargetId = '';
        this.ui.hideSpectateBanner();
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
    // Tutorial: first XP collected
    if (this.tutorialActive && this.tutorialStep === 2) {
      this.tutorialStep = 3;
      this.ui.showTutorialStep(t('tutorial.levelup'));
    }
    // Late-game XP bonus: +100% per 5 minutes, plus meta XP multiplier + relic XP multiplier + combo bonus
    const relicMults = this.relicSystem.computeMultipliers();
    const comboBonus = 1 + this.comboCount * 0.01;
    const xpMultiplier = (1 + this.gameTime / 300) * this.meta.getXpMultiplier() * relicMults.xpMultiplier * comboBonus;
    // Gold rush event: 2x XP
    const eventMultiplier = this.activeEvent?.type === 'gold_rush' ? 2 : 1;
    this.xp += Math.floor(amount * xpMultiplier * eventMultiplier);
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(10 * Math.pow(this.level, 1.3));
      this.ui.updateLevel(this.level);
      this.sound.playLevelUp();
      if (this.levelUpShown) {
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
    this.levelUpShown = true;
    // Tutorial: complete on first level-up
    if (this.tutorialActive && this.tutorialStep === 3) {
      this.tutorialActive = false;
      this.tutorialStep = -1;
      this.ui.hideTutorial();
      localStorage.setItem('geo_tutorial_done', '1');
    }
    // Solo: pause game during level-up selection
    if (!this.isMultiplayer) {
      this.paused = true;
    }
    const choices = this.levelUpSystem.generateChoices(this.player, this.weapons, 3, this.relicSystem);

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
        // Track evolutions
        if (choice.icon === '★') {
          this.evolutionsThisGame++;
          this.sound.playEvolve();
        }
      }
      // Apply immediate relic effects (glass cannon maxHp, magnet, speed)
      if (choice.isRelic) {
        const rm = this.relicSystem.computeMultipliers();
        // Glass cannon: halve maxHp
        if (rm.maxHpMultiplier < 1) {
          const newMax = Math.max(10, Math.floor(this.player.maxHp * rm.maxHpMultiplier));
          if (newMax < this.player.maxHp) {
            this.player.maxHp = newMax;
            this.player.hp = Math.min(this.player.hp, this.player.maxHp);
          }
        }
        // Magnet bonus: set absolute value (baseMagnet + totalBonus) to avoid cumulative stacking
        this.player.magnetRange = this.baseMagnetRange + rm.magnetBonus;
        // Speed bonus is multiplicative — handled via update since relics may stack
      }
      this.ui.updateHp(this.player.hp, this.player.maxHp);
      this.ui.updateWeaponHud(this.weapons);
      this.updateRelicHud();
      this.levelUpShown = false;

      // Process queued level-ups
      if (this.levelUpPending > 0) {
        this.levelUpPending--;
        this.showLevelUp();
      } else if (!this.isMultiplayer) {
        // Solo: resume game after all level-ups are processed
        this.paused = false;
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
      if (r < 0.06) defKey = 'pentagon';
      else if (r < 0.14) defKey = 'charger';
      else if (r < 0.22) defKey = 'splitter';
      else if (r < 0.32) defKey = 'shield';
      else if (r < 0.44) defKey = 'zigzag';
      else if (r < 0.54) defKey = 'phaser';
      else if (r < 0.64) defKey = 'orbiter';
    } else if (t > 180) {
      const r = Math.random();
      if (r < 0.08) defKey = 'charger';
      else if (r < 0.16) defKey = 'splitter';
      else if (r < 0.26) defKey = 'shield';
      else if (r < 0.38) defKey = 'zigzag';
      else if (r < 0.48) defKey = 'phaser';
      else if (r < 0.56) defKey = 'orbiter';
    } else if (t > 90) {
      const r = Math.random();
      if (r < 0.08) defKey = 'charger';
      else if (r < 0.15) defKey = 'splitter';
      else if (r < 0.25) defKey = 'zigzag';
      else if (r < 0.32) defKey = 'phaser';
    } else if (t > 60) {
      const r = Math.random();
      if (r < 0.20) defKey = 'zigzag';
      else if (r < 0.28) defKey = 'shield';
    } else if (t > 45) {
      if (Math.random() < 0.15) defKey = 'zigzag';
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

  // ═════════════════════════════════════
  // ─── NEW FEATURE METHODS ────────────
  // ═════════════════════════════════════

  private incrementCombo(): void {
    this.comboCount++;
    this.comboTimer = 2; // 2 second window
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.ui.updateCombo(this.comboCount);
    // Milestone effects
    if (this.comboCount === 10 || this.comboCount === 25 || this.comboCount === 50 || this.comboCount === 100) {
      this.screenShake.trigger(4 + this.comboCount * 0.05);
      this.sound.playLevelUp();
    }
  }

  private updateRelicHud(): void {
    const owned = this.relicSystem.getOwnedRelics();
    const data = owned.map(r => {
      const def = RELIC_DEFS.find(d => d.id === r.id);
      return { id: r.id, count: r.count, icon: def?.icon ?? '?' };
    });
    this.ui.updateRelicHud(data);
  }

  private createWeaponByTypeId(typeId: string): WeaponBase {
    switch (typeId) {
      case 'orbit': return new OrbitWeapon();
      case 'bullet': return new BulletWeapon();
      case 'lightning': return new ChainLightning();
      case 'forcefield': return new ForceField();
      case 'boomerang': return new BoomerangWeapon();
      case 'missile': return new HomingMissileWeapon();
      default: return new OrbitWeapon();
    }
  }

  /** Called at end of game to process meta coins & achievements. Returns coins earned. */
  private processEndOfGame(): number {
    // Calculate coins (with relic coin multiplier)
    const relicMults = this.relicSystem.computeMultipliers();
    const baseCoins = this.meta.calculateCoins(
      this.kills, this.gameTime, this.level, this.bossKillsThisGame,
    );
    const coinsEarned = Math.floor(baseCoins * relicMults.coinMultiplier);
    this.meta.addCoins(coinsEarned);
    this.meta.recordGame(this.kills, this.bossKillsThisGame);

    // Check achievements
    const runStats: GameRunStats = {
      kills: this.kills,
      bossKills: this.bossKillsThisGame,
      survivalSeconds: this.gameTime,
      level: this.level,
      evolutions: this.evolutionsThisGame,
    };

    const unlockedSet = new Set<string>();
    for (const ach of this.achievementChecker.checkAfterGame(
      runStats, this.meta.totalKills, this.meta.totalBossKills, unlockedSet,
    )) {
      if (!this.meta.isAchievementUnlocked(ach.id)) {
        this.meta.unlockAchievement(ach.id);
        this.meta.addCoins(ach.reward);
        this.ui.showAchievementToast(t(ach.nameKey), ach.icon, ach.reward);
        this.sound.playAchievement();
      }
    }

    // Check daily challenges
    const today = getTodayDateStr();
    this.meta.setDailyDate(today);
    const dailies = getDailyChallenges();
    const completedSet = new Set(this.meta.getDailyCompleted());
    for (const daily of this.achievementChecker.checkDailies(runStats, dailies, completedSet)) {
      this.meta.completeDailyChallenge(daily.id);
      this.meta.addCoins(daily.reward);
    }

    this.ui.updateTitleCoins(this.meta.coins);

    return coinsEarned;
  }

  /** Solo: mini-boss & event wave system */
  private updateSoloEvents(dt: number, difficulty: number): void {
    // Mini-boss spawning
    this.miniBossTimer -= dt;
    if (this.miniBossTimer <= 0) {
      this.miniBossTimer = 90;
      this.spawnMiniBoss(difficulty);
    }

    // Event waves
    this.eventWaveTimer -= dt;
    if (this.eventWaveTimer <= 0) {
      this.eventWaveTimer = 60;
      this.triggerEventWave();
    }

    // Active event timer
    if (this.activeEvent) {
      this.activeEvent.timer -= dt;
      if (this.activeEvent.timer <= 0) {
        this.ui.hideEventBanner();
        // End event effects
        if (this.activeEvent.type === 'healing_rain') {
          // Stop healing - handled in update loop
        }
        this.activeEvent = null;
      } else if (this.activeEvent.type === 'healing_rain') {
        // Heal player
        if (this.player.alive && this.player.hp < this.player.maxHp) {
          this.player.heal(Math.ceil(3 * dt));
          this.ui.updateHp(this.player.hp, this.player.maxHp);
        }
      }
    }
  }

  private spawnMiniBoss(difficulty: number): void {
    const types = ['charger_elite', 'splitter_king', 'shield_bearer'];
    const type = types[Math.floor(Math.random() * types.length)];

    // Use strongest base enemy as template
    const baseDef = ENEMY_DEFS.pentagon || ENEMY_DEFS.diamond;
    const angle = randomAngle();
    const dist = 400 + Math.random() * 200;
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;

    const miniBoss = new Enemy(x, y, baseDef, difficulty);

    // Scale up for mini-boss
    switch (type) {
      case 'charger_elite':
        miniBoss.maxHp *= 6; miniBoss.hp = miniBoss.maxHp;
        miniBoss.speed *= 2.5;
        miniBoss.xpValue *= 5;
        break;
      case 'splitter_king':
        miniBoss.maxHp *= 8; miniBoss.hp = miniBoss.maxHp;
        miniBoss.xpValue *= 6;
        miniBoss.splitOnDeath = true;
        break;
      case 'shield_bearer':
        miniBoss.maxHp *= 10; miniBoss.hp = miniBoss.maxHp;
        miniBoss.speed *= 0.8;
        miniBoss.xpValue *= 8;
        break;
    }

    // Visual: bigger + distinct color
    miniBoss.container.scale.set(2.0);
    miniBoss.radius *= 1.5;

    this.enemies.push(miniBoss);
    this.world.addChild(miniBoss.container);

    this.ui.showEventBanner(t('event.miniboss'), 'event-red', 3);
    this.sound.playMiniBoss();
    this.screenShake.trigger(8);
  }

  private triggerEventWave(): void {
    const events = ['gold_rush', 'elite_invasion', 'boss_rush', 'healing_rain'];
    const event = events[Math.floor(Math.random() * events.length)];

    this.sound.playEventWave();

    switch (event) {
      case 'gold_rush':
        this.activeEvent = { type: 'gold_rush', timer: 30 };
        this.ui.showEventBanner(t('event.gold_rush'), 'event-gold', 30);
        break;
      case 'elite_invasion':
        this.activeEvent = { type: 'elite_invasion', timer: 20 };
        this.ui.showEventBanner(t('event.elite_invasion'), 'event-red', 20);
        // Spawn extra elite enemies
        for (let i = 0; i < 8; i++) {
          const angle = randomAngle();
          const dist = 300 + Math.random() * 300;
          const def = ENEMY_DEFS.pentagon || ENEMY_DEFS.diamond;
          const difficulty = 1 + this.gameTime / 60 * 0.4;
          const e = new Enemy(
            this.player.x + Math.cos(angle) * dist,
            this.player.y + Math.sin(angle) * dist,
            def, difficulty * 1.5,
          );
          e.maxHp *= 2; e.hp = e.maxHp;
          e.xpValue *= 2;
          this.enemies.push(e);
          this.world.addChild(e.container);
        }
        break;
      case 'boss_rush': {
        this.ui.showEventBanner(t('event.boss_rush'), 'event-red', 5);
        const difficulty = 1 + this.gameTime / 60 * 0.4;
        for (let i = 0; i < 2; i++) {
          this.spawnMiniBoss(difficulty);
        }
        break;
      }
      case 'healing_rain':
        this.activeEvent = { type: 'healing_rain', timer: 20 };
        this.ui.showEventBanner(t('event.healing_rain'), 'event-green', 20);
        break;
    }
  }
}
