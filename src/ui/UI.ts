import { UpgradeChoice } from '../systems/LevelUpSystem';
import { WeaponBase } from '../weapons/WeaponBase';
import { t, setLang, getLang, detectLang, Lang } from '../systems/i18n';
import { MAP_HALF_W, MAP_HALF_H } from '../../shared/protocol';
import { MetaProgression, META_UPGRADES } from '../systems/MetaProgression';
import { CHARACTERS, CharacterDef } from '../systems/CharacterSystem';
import { ACHIEVEMENTS, AchievementDef, getDailyChallenges, DailyChallengeDef, getTodayDateStr } from '../systems/AchievementSystem';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class UI {
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private levelText: HTMLElement;
  private timeText: HTMLElement;
  private killText: HTMLElement;
  private bossWarning: HTMLElement;
  private levelUpScreen: HTMLElement;
  private levelUpChoices: HTMLElement;
  private levelUpTitle: HTMLElement;
  private gameOverScreen: HTMLElement;
  private gameOverStats: HTMLElement;
  private gameOverTitle: HTMLElement;
  private gameOverCoins: HTMLElement;
  private restartBtn: HTMLElement;
  private titleScreen: HTMLElement;
  private startBtn: HTMLElement;
  private titleHeading: HTMLElement;
  private titleSubtitle: HTMLElement;
  private controlsHint: HTMLElement;
  private hud: HTMLElement;
  private weaponHud: HTMLElement;

  private pauseScreen: HTMLElement;
  private pauseTitle: HTMLElement;
  private resumeBtn: HTMLElement;
  private quitBtn: HTMLElement;
  private volumeSlider: HTMLInputElement;
  private volumeLabel: HTMLElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private highscoreEl: HTMLElement;

  private onChoiceCallback: ((choice: UpgradeChoice) => void) | null = null;
  private onRestartCallback: (() => void) | null = null;
  private onStartCallback: (() => void) | null = null;
  private onResumeCallback: (() => void) | null = null;
  private onQuitCallback: (() => void) | null = null;
  private onVolumeCallback: ((v: number) => void) | null = null;
  private onChatSendCallback: ((msg: string) => void) | null = null;
  private onChatCloseCallback: (() => void) | null = null;

  // ─── New feature callbacks ───
  private onCharacterSelectCallback: ((charId: string) => void) | null = null;
  private onPartyCreateCallback: (() => void) | null = null;
  private onPartyJoinCallback: ((code: string) => void) | null = null;
  private onPartyQuickCallback: (() => void) | null = null;
  private onPartyStartCallback: (() => void) | null = null;
  private onPartyBackCallback: (() => void) | null = null;

  private selectedCharacterId = 'warrior';

  constructor() {
    this.hpFill = document.getElementById('hp-fill')!;
    this.xpFill = document.getElementById('xp-fill')!;
    this.levelText = document.getElementById('level-text')!;
    this.timeText = document.getElementById('time-text')!;
    this.killText = document.getElementById('kill-text')!;
    this.bossWarning = document.getElementById('boss-warning')!;
    this.levelUpScreen = document.getElementById('level-up-screen')!;
    this.levelUpChoices = document.getElementById('level-up-choices')!;
    this.levelUpTitle = this.levelUpScreen.querySelector('h2')!;
    this.gameOverScreen = document.getElementById('game-over-screen')!;
    this.gameOverStats = document.getElementById('game-over-stats')!;
    this.gameOverTitle = this.gameOverScreen.querySelector('h2')!;
    this.gameOverCoins = document.getElementById('game-over-coins')!;
    this.restartBtn = document.getElementById('restart-btn')!;
    this.titleScreen = document.getElementById('title-screen')!;
    this.startBtn = document.getElementById('start-btn')!;
    this.titleHeading = this.titleScreen.querySelector('h1')!;
    this.titleSubtitle = this.titleScreen.querySelector('.subtitle')!;
    this.controlsHint = document.getElementById('controls-hint')!;
    this.hud = document.getElementById('hud')!;
    this.weaponHud = document.getElementById('weapon-hud')!;

    this.pauseScreen = document.getElementById('pause-screen')!;
    this.pauseTitle = document.getElementById('pause-title')!;
    this.resumeBtn = document.getElementById('resume-btn')!;
    this.quitBtn = document.getElementById('quit-btn')!;
    this.volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    this.volumeLabel = document.getElementById('volume-label')!;
    this.minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimapCanvas.width = 140;
    this.minimapCanvas.height = 140;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.highscoreEl = document.getElementById('highscore')!;

    this.restartBtn.addEventListener('click', () => {
      if (this.onRestartCallback) this.onRestartCallback();
    });

    this.startBtn.addEventListener('click', () => {
      if (this.onStartCallback) this.onStartCallback();
    });

    this.resumeBtn.addEventListener('click', () => {
      if (this.onResumeCallback) this.onResumeCallback();
    });

    this.quitBtn.addEventListener('click', () => {
      if (this.onQuitCallback) this.onQuitCallback();
    });

    this.volumeSlider.addEventListener('input', () => {
      if (this.onVolumeCallback) this.onVolumeCallback(Number(this.volumeSlider.value) / 100);
    });

    // Language buttons
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = (btn as HTMLElement).dataset.lang as Lang;
        setLang(lang);
        this.applyLang();
      });
    });

    // Chat input: Enter to send+close, Escape to close
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const msg = chatInput.value.trim();
        if (msg && this.onChatSendCallback) {
          this.onChatSendCallback(msg);
        }
        this.closeChatInput();
      }
    });

    // Shop button
    document.getElementById('shop-btn')!.addEventListener('click', () => {
      // Will be handled externally via callback
    });

    // Achievement button
    document.getElementById('ach-btn')!.addEventListener('click', () => {
      // Will be handled externally via callback
    });

    // Shop back
    document.getElementById('shop-back-btn')!.addEventListener('click', () => {
      this.hideShop();
    });

    // Achievement back
    document.getElementById('ach-back-btn')!.addEventListener('click', () => {
      this.hideAchievements();
    });

    // Character select
    document.getElementById('char-select-btn')!.addEventListener('click', () => {
      if (this.onCharacterSelectCallback) {
        this.onCharacterSelectCallback(this.selectedCharacterId);
      }
    });
    document.getElementById('char-back-btn')!.addEventListener('click', () => {
      this.hideCharacterSelect();
      this.showTitle();
    });

    // Party UI
    document.getElementById('party-create-btn')!.addEventListener('click', () => {
      if (this.onPartyCreateCallback) this.onPartyCreateCallback();
    });
    document.getElementById('party-join-btn')!.addEventListener('click', () => {
      this.showPartyJoinInput();
    });
    document.getElementById('party-quick-btn')!.addEventListener('click', () => {
      if (this.onPartyQuickCallback) this.onPartyQuickCallback();
    });
    document.getElementById('party-join-confirm-btn')!.addEventListener('click', () => {
      const code = (document.getElementById('party-code-input') as HTMLInputElement).value.trim().toUpperCase();
      if (code.length === 4 && this.onPartyJoinCallback) {
        this.onPartyJoinCallback(code);
      }
    });
    document.getElementById('party-copy-btn')!.addEventListener('click', () => {
      const code = document.getElementById('party-code-display')!.textContent || '';
      navigator.clipboard.writeText(code).catch(() => {});
    });
    document.getElementById('party-start-btn')!.addEventListener('click', () => {
      if (this.onPartyStartCallback) this.onPartyStartCallback();
    });
    document.getElementById('party-back-btn')!.addEventListener('click', () => {
      if (this.onPartyBackCallback) this.onPartyBackCallback();
      this.hideParty();
      this.showTitle();
    });

    // Auto-detect language
    setLang(detectLang());
    this.applyLang();
  }

  private applyLang(): void {
    this.titleHeading.textContent = t('title.name');
    this.titleSubtitle.textContent = t('title.subtitle');
    this.startBtn.textContent = t('title.start');
    this.controlsHint.textContent = t('title.controls');
    this.restartBtn.textContent = t('gameover.restart');

    // Title buttons
    const shopBtn = document.getElementById('shop-btn');
    if (shopBtn) shopBtn.textContent = t('shop.btn');
    const achBtn = document.getElementById('ach-btn');
    if (achBtn) achBtn.textContent = t('ach.btn');

    // Party screen
    const partyCreateBtn = document.getElementById('party-create-btn');
    if (partyCreateBtn) partyCreateBtn.textContent = t('party.create');
    const partyJoinBtn = document.getElementById('party-join-btn');
    if (partyJoinBtn) partyJoinBtn.textContent = t('party.join');
    const partyQuickBtn = document.getElementById('party-quick-btn');
    if (partyQuickBtn) partyQuickBtn.textContent = t('party.quick');
    const partyStartBtn = document.getElementById('party-start-btn');
    if (partyStartBtn) partyStartBtn.textContent = t('party.start');
    const partyCopyBtn = document.getElementById('party-copy-btn');
    if (partyCopyBtn) partyCopyBtn.textContent = t('party.copy');
    const partyBackBtn = document.getElementById('party-back-btn');
    if (partyBackBtn) partyBackBtn.textContent = t('party.back');
    const partyCodeInput = document.getElementById('party-code-input') as HTMLInputElement | null;
    if (partyCodeInput) partyCodeInput.placeholder = t('party.enter_code');

    // Highlight active lang button
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach(btn => {
      const el = btn as HTMLElement;
      el.style.borderColor = el.dataset.lang === getLang()
        ? '#00e6b0' : 'rgba(255,255,255,0.2)';
    });
  }

  onStart(cb: () => void): void {
    this.onStartCallback = cb;
  }

  onShopClick(cb: () => void): void {
    document.getElementById('shop-btn')!.addEventListener('click', cb);
  }

  onAchievementClick(cb: () => void): void {
    document.getElementById('ach-btn')!.addEventListener('click', cb);
  }

  onCharacterSelect(cb: (charId: string) => void): void {
    this.onCharacterSelectCallback = cb;
  }

  onPartyCreate(cb: () => void): void { this.onPartyCreateCallback = cb; }
  onPartyJoin(cb: (code: string) => void): void { this.onPartyJoinCallback = cb; }
  onPartyQuick(cb: () => void): void { this.onPartyQuickCallback = cb; }
  onPartyStart(cb: () => void): void { this.onPartyStartCallback = cb; }
  onPartyBack(cb: () => void): void { this.onPartyBackCallback = cb; }

  showTitle(): void {
    this.titleScreen.style.display = 'flex';
    this.hud.style.display = 'none';
    this.weaponHud.style.display = 'none';
  }

  hideTitle(): void {
    this.titleScreen.style.display = 'none';
    this.hud.style.display = 'block';
    this.weaponHud.style.display = 'flex';
  }

  updateTitleCoins(coins: number): void {
    const el = document.getElementById('title-coins');
    if (el) el.textContent = `◆ ${coins}`;
  }

  updateHp(current: number, max: number): void {
    this.hpFill.style.width = `${(current / max) * 100}%`;
  }

  updateXp(current: number, max: number): void {
    this.xpFill.style.width = `${(current / max) * 100}%`;
  }

  updateLevel(level: number): void {
    this.levelText.textContent = `${t('hud.level')} ${level}`;
  }

  updateTime(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.timeText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  updateKills(kills: number): void {
    this.killText.textContent = `${t('hud.kills')}: ${kills}`;
  }

  updateWeaponHud(weapons: WeaponBase[]): void {
    this.weaponHud.innerHTML = '';
    for (const w of weapons) {
      const div = document.createElement('div');
      div.className = 'weapon-icon';
      const icon = w.evolved ? '★' : w.info.icon;
      const name = w.evolved ? t(w.info.evolveNameKey) : t(w.info.nameKey);
      div.innerHTML = `${icon}<span class="weapon-level">${w.level}</span>`;
      div.title = name;
      if (w.evolved) div.style.borderColor = 'rgba(255,200,50,0.5)';
      this.weaponHud.appendChild(div);
    }
  }

  showBossWarning(): void {
    this.bossWarning.textContent = t('boss.warning');
    this.bossWarning.style.color = '#ff2244';
    this.bossWarning.style.textShadow = '0 0 30px #ff2244, 0 0 60px #ff2244';
    this.bossWarning.style.fontSize = '42px';
    this.bossWarning.style.display = 'block';
    setTimeout(() => { this.bossWarning.style.display = 'none'; }, 3000);
  }

  showMilestone(text: string): void {
    this.bossWarning.textContent = text;
    this.bossWarning.style.color = '#ffcc44';
    this.bossWarning.style.textShadow = '0 0 30px #ffcc44, 0 0 60px #ffcc44';
    this.bossWarning.style.fontSize = '36px';
    this.bossWarning.style.display = 'block';
    setTimeout(() => { this.bossWarning.style.display = 'none'; }, 2000);
  }

  showWave(wave: number): void {
    this.bossWarning.textContent = `WAVE ${wave}`;
    this.bossWarning.style.color = '#44aaff';
    this.bossWarning.style.textShadow = '0 0 30px #44aaff, 0 0 60px #44aaff';
    this.bossWarning.style.fontSize = '32px';
    this.bossWarning.style.display = 'block';
    setTimeout(() => { this.bossWarning.style.display = 'none'; }, 2500);
  }

  showLevelUp(choices: UpgradeChoice[], onChoice: (choice: UpgradeChoice) => void): void {
    this.onChoiceCallback = onChoice;
    this.levelUpTitle.textContent = t('levelup.title');
    this.levelUpChoices.innerHTML = '';

    for (const choice of choices) {
      const card = document.createElement('div');
      const isEvolve = choice.icon === '★';
      const isRelic = !!(choice as any).isRelic;
      card.className = `level-up-card${isEvolve ? ' evolve-card' : ''}${isRelic ? ' relic-card' : ''}`;

      let html = `
        <div class="card-icon">${choice.icon}</div>
        <div class="card-name">${choice.name}</div>
        <div class="card-desc">${choice.description}</div>
      `;
      if (choice.statLine) {
        html += `<div class="card-stat">${choice.statLine}</div>`;
      }
      card.innerHTML = html;

      const selectCard = () => {
        const cb = this.onChoiceCallback;
        this.hideLevelUp();
        if (cb) cb(choice);
      };
      card.addEventListener('click', selectCard);
      card.addEventListener('touchend', (e) => {
        e.preventDefault();
        selectCard();
      });
      this.levelUpChoices.appendChild(card);
    }

    this.levelUpScreen.style.display = 'flex';
  }

  hideLevelUp(): void {
    this.levelUpScreen.style.display = 'none';
    this.onChoiceCallback = null;
  }

  showGameOver(stats: {
    time: number; kills: number; level: number;
    totalDamage?: number; wave?: number; pickups?: number;
    coinsEarned?: number; maxCombo?: number;
  }, onRestart: () => void): void {
    this.onRestartCallback = onRestart;
    this.gameOverTitle.textContent = t('gameover.title');
    this.restartBtn.textContent = t('gameover.restart');
    document.getElementById('gameover-quit-btn')!.textContent = t('gameover.toTitle');
    const m = Math.floor(stats.time / 60);
    const s = Math.floor(stats.time % 60);
    const dps = stats.time > 0 && stats.totalDamage
      ? Math.round(stats.totalDamage / stats.time) : 0;
    let html = `
      ${t('gameover.survived')}: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}<br>
      ${t('gameover.kills')}: ${stats.kills}<br>
      ${t('gameover.level')}: ${stats.level}
    `;
    if (stats.wave) html += `<br>Wave: ${stats.wave}`;
    if (stats.totalDamage) html += `<br>Total DMG: ${stats.totalDamage.toLocaleString()}`;
    if (dps) html += `<br>DPS: ${dps.toLocaleString()}`;
    if (stats.pickups) html += `<br>Pickups: ${stats.pickups}`;
    if (stats.maxCombo && stats.maxCombo > 0) html += `<br>Max Combo: ${stats.maxCombo}x`;
    this.gameOverStats.innerHTML = html;

    // Show coins earned
    if (stats.coinsEarned !== undefined && stats.coinsEarned > 0) {
      this.gameOverCoins.textContent = `◆ +${stats.coinsEarned} ${t('gameover.coins')}`;
      this.gameOverCoins.style.display = 'block';
    } else {
      this.gameOverCoins.style.display = 'none';
    }

    this.gameOverScreen.style.display = 'flex';
  }

  flashDamage(): void {
    const el = document.getElementById('damage-flash')!;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 100);
  }

  hideGameOver(): void {
    this.gameOverScreen.style.display = 'none';
  }

  // Pause
  onPause(onResume: () => void, onQuit: () => void, onVolume: (v: number) => void): void {
    this.onResumeCallback = onResume;
    this.onQuitCallback = onQuit;
    this.onVolumeCallback = onVolume;
  }

  showPause(): void {
    this.pauseTitle.textContent = t('pause.title');
    this.resumeBtn.textContent = t('pause.resume');
    this.quitBtn.textContent = t('pause.quit');
    this.volumeLabel.textContent = t('pause.volume');
    this.pauseScreen.style.display = 'flex';
  }

  hidePause(): void {
    this.pauseScreen.style.display = 'none';
  }

  // Minimap
  updateMinimap(
    px: number, py: number,
    enemies: { x: number; y: number; isBoss: boolean }[],
    pickups?: { x: number; y: number }[],
    remotePlayers?: { x: number; y: number; team: string }[],
    pings?: { x: number; y: number; team: string }[],
  ): void {
    const ctx = this.minimapCtx;
    const w = 140;
    const h = 140;
    const scale = 0.06;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    // Map boundary
    const bx1 = (-MAP_HALF_W - px) * scale + w / 2;
    const by1 = (-MAP_HALF_H - py) * scale + h / 2;
    const bx2 = (MAP_HALF_W - px) * scale + w / 2;
    const by2 = (MAP_HALF_H - py) * scale + h / 2;
    ctx.strokeStyle = 'rgba(255,34,68,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

    // Enemies
    for (const e of enemies) {
      const ex = (e.x - px) * scale + w / 2;
      const ey = (e.y - py) * scale + h / 2;
      if (ex < 0 || ex > w || ey < 0 || ey > h) continue;
      ctx.fillStyle = e.isBoss ? '#ff8800' : '#ff3344';
      const size = e.isBoss ? 3 : 1.5;
      ctx.fillRect(ex - size / 2, ey - size / 2, size, size);
    }

    // Pickups
    if (pickups) {
      for (const p of pickups) {
        const px2 = (p.x - px) * scale + w / 2;
        const py2 = (p.y - py) * scale + h / 2;
        if (px2 < 0 || px2 > w || py2 < 0 || py2 > h) continue;
        ctx.fillStyle = '#ffcc44';
        ctx.fillRect(px2 - 1.5, py2 - 1.5, 3, 3);
      }
    }

    // Remote players
    if (remotePlayers) {
      const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
      for (const rp of remotePlayers) {
        const rpx = (rp.x - px) * scale + w / 2;
        const rpy = (rp.y - py) * scale + h / 2;
        if (rpx < 0 || rpx > w || rpy < 0 || rpy > h) continue;
        ctx.fillStyle = teamColors[rp.team] || '#aaa';
        ctx.beginPath();
        ctx.arc(rpx, rpy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pings
    if (pings) {
      const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
      for (const ping of pings) {
        const ppx = (ping.x - px) * scale + w / 2;
        const ppy = (ping.y - py) * scale + h / 2;
        if (ppx < 0 || ppx > w || ppy < 0 || ppy > h) continue;
        ctx.strokeStyle = teamColors[ping.team] || '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ppx, ppy, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = teamColors[ping.team] || '#fff';
        ctx.beginPath();
        ctx.arc(ppx, ppy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player (center)
    ctx.fillStyle = '#00e6b0';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── Wave Event ────────────────────────
  showWaveEvent(waveNumber: number, enemyCount: number): void {
    this.bossWarning.textContent = `WAVE ${waveNumber} — ${enemyCount} ENEMIES!`;
    this.bossWarning.style.color = '#ff6644';
    this.bossWarning.style.textShadow = '0 0 30px #ff6644, 0 0 60px #ff6644';
    this.bossWarning.style.fontSize = '36px';
    this.bossWarning.style.display = 'block';
    setTimeout(() => { this.bossWarning.style.display = 'none'; }, 3000);
  }

  // Highscore
  updateHighscore(bestTime: number): void {
    const m = Math.floor(bestTime / 60);
    const s = Math.floor(bestTime % 60);
    this.highscoreEl.textContent = `BEST: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ─── Multiplayer UI ────────────────────
  showRoomInfo(roomCode: string, team: string): void {
    const el = document.getElementById('room-info')!;
    el.textContent = `Room: ${roomCode} · Team: ${team.toUpperCase()}`;
    el.style.display = 'block';
  }

  showMultiplayerUI(show: boolean): void {
    document.getElementById('team-scoreboard')!.style.display = show ? 'block' : 'none';
    document.getElementById('leaderboard-panel')!.style.display = show ? 'block' : 'none';
    document.getElementById('room-info')!.style.display = show ? 'block' : 'none';
    document.getElementById('kill-log')!.style.display = show ? 'block' : 'none';
    document.getElementById('ping-display')!.style.display = show ? 'block' : 'none';
    const pingHint = document.getElementById('ping-hint')!;
    pingHint.textContent = t('ping.hint');
    pingHint.style.display = show ? 'block' : 'none';
    document.getElementById('chat-panel')!.style.display = show ? 'block' : 'none';
    (document.getElementById('chat-input') as HTMLInputElement).placeholder = t('chat.placeholder');
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    document.getElementById('chat-toggle-btn')!.style.display =
      show && isTouchDevice ? 'flex' : 'none';
    document.getElementById('ping-btn')!.style.display =
      show && isTouchDevice ? 'flex' : 'none';
    if (isTouchDevice) {
      pingHint.style.display = 'none';
    }
  }

  updatePingDisplay(ms: number): void {
    const el = document.getElementById('ping-display')!;
    el.textContent = `${ms}ms`;
    el.style.color = ms < 80 ? '#44ff88' : ms < 150 ? '#ffcc44' : '#ff4466';
  }

  addKillLogEntry(killerName: string, killerTeam: string, victimName: string): void {
    const el = document.getElementById('kill-log')!;
    const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
    const entry = document.createElement('div');
    entry.className = 'kill-log-entry';
    entry.innerHTML = `<span style="color:${teamColors[killerTeam] || '#fff'}">${escapeHtml(killerName)}</span> killed ${escapeHtml(victimName)}`;
    el.appendChild(entry);
    while (el.children.length > 5) {
      el.removeChild(el.children[0]);
    }
    setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 5000);
  }

  updateTeamScoreboard(scores: Record<string, { kills: number; bossContrib: number; players: number }>): void {
    const el = document.getElementById('team-scoreboard')!;
    const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
    let html = '';
    const sorted = Object.entries(scores).sort((a, b) => b[1].kills - a[1].kills);
    for (const [team, data] of sorted) {
      if (data.players === 0) continue;
      html += `<div class="team-row">
        <span class="team-dot" style="background:${teamColors[team]}"></span>
        <span class="team-name">${team.toUpperCase()}</span>
        <span class="team-kills">${data.kills} kills</span>
        <span style="opacity:0.4">${data.players}p</span>
      </div>`;
    }
    el.innerHTML = html;
  }

  updateLeaderboard(entries: { name: string; kills: number; level: number; team: string }[]): void {
    const el = document.getElementById('lb-list')!;
    const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
    let html = '';
    entries.forEach((e, i) => {
      html += `<div class="lb-row">
        <span class="lb-rank">${i + 1}.</span>
        <span class="lb-name" style="color:${teamColors[e.team]}">${e.name}</span>
        <span>${e.kills}</span>
      </div>`;
    });
    el.innerHTML = html;
  }

  showBossHp(hp: number, maxHp: number): void {
    const bar = document.getElementById('boss-hp-bar')!;
    bar.style.display = 'block';
    this.updateBossHp(hp, maxHp);
  }

  updateBossHp(hp: number, maxHp: number): void {
    const fill = document.getElementById('boss-hp-fill')!;
    fill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    document.getElementById('boss-hp-label')!.textContent = `BOSS  ${hp} / ${maxHp}`;
  }

  hideBossHp(): void {
    document.getElementById('boss-hp-bar')!.style.display = 'none';
  }

  showBossDead(winningTeam: string): void {
    const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
    this.bossWarning.textContent = `${winningTeam.toUpperCase()} TEAM WINS!`;
    this.bossWarning.style.color = teamColors[winningTeam] || '#fff';
    this.bossWarning.style.textShadow = `0 0 30px ${teamColors[winningTeam]}, 0 0 60px ${teamColors[winningTeam]}`;
    this.bossWarning.style.display = 'block';
    setTimeout(() => {
      this.bossWarning.style.display = 'none';
      this.bossWarning.style.color = '#ff2244';
      this.bossWarning.style.textShadow = '0 0 30px #ff2244, 0 0 60px #ff2244';
    }, 4000);
  }

  showConnectionStatus(text: string): void {
    const el = document.getElementById('connection-status')!;
    el.textContent = text;
    el.style.display = 'block';
  }

  hideConnectionStatus(): void {
    document.getElementById('connection-status')!.style.display = 'none';
  }

  // ─── Respawn Overlay ─────────────────
  showRespawnOverlay(): void {
    document.getElementById('death-title-text')!.textContent = t('respawn.eliminated');
    document.getElementById('death-penalty-text')!.textContent = t('death.penalty');
    document.getElementById('death-hint-text')!.textContent = t('respawn.hint');
    document.getElementById('quit-death-btn')!.textContent = t('gameover.toTitle');
    document.getElementById('respawn-overlay')!.style.display = 'flex';
  }

  updateRespawnTimer(remaining: number, total: number): void {
    const secs = Math.ceil(Math.max(0, remaining));
    document.getElementById('respawn-timer-text')!.textContent = t('respawn.timer', { secs });
    const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
    document.getElementById('respawn-bar-fill')!.style.width = `${pct}%`;
  }

  hideRespawnOverlay(): void {
    document.getElementById('respawn-overlay')!.style.display = 'none';
  }

  // ─── Chat ───────────────────────────
  onChatSend(cb: (msg: string) => void): void {
    this.onChatSendCallback = cb;
  }

  onChatClose(cb: () => void): void {
    this.onChatCloseCallback = cb;
  }

  openChatInput(): void {
    const row = document.getElementById('chat-input-row')!;
    const input = document.getElementById('chat-input') as HTMLInputElement;
    row.style.display = 'flex';
    input.value = '';
    input.focus();
  }

  closeChatInput(): void {
    const row = document.getElementById('chat-input-row')!;
    const input = document.getElementById('chat-input') as HTMLInputElement;
    row.style.display = 'none';
    input.blur();
    if (this.onChatCloseCallback) this.onChatCloseCallback();
  }

  isChatInputFocused(): boolean {
    const input = document.getElementById('chat-input');
    return input !== null && document.activeElement === input;
  }

  getChatInputValue(): string {
    return (document.getElementById('chat-input') as HTMLInputElement).value.trim();
  }

  addChatMessage(name: string, team: string, msg: string): void {
    const container = document.getElementById('chat-messages')!;
    const teamColors: Record<string, string> = { blue: '#4488ff', red: '#ff4466', green: '#44ff88', yellow: '#ffcc44' };
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<span style="color:${teamColors[team] || '#fff'}">${escapeHtml(name)}</span>: ${escapeHtml(msg)}`;
    container.appendChild(el);

    while (container.children.length > 10) {
      container.removeChild(container.children[0]);
    }

    setTimeout(() => { el.classList.add('fading'); }, 8000);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 15000);
  }

  // ═════════════════════════════════════
  // ─── SHOP ───────────────────────────
  // ═════════════════════════════════════
  showShop(meta: MetaProgression): void {
    const screen = document.getElementById('shop-screen')!;
    document.getElementById('shop-title')!.textContent = t('shop.title');
    document.getElementById('shop-back-btn')!.textContent = t('shop.back');

    this.refreshShopContent(meta);
    screen.style.display = 'flex';
    this.titleScreen.style.display = 'none';
  }

  private refreshShopContent(meta: MetaProgression): void {
    document.getElementById('shop-coins')!.textContent = `◆ ${meta.coins} ${t('shop.coins')}`;
    const container = document.getElementById('shop-upgrades')!;
    container.innerHTML = '';

    for (const upgrade of META_UPGRADES) {
      const tier = meta.getUpgradeTier(upgrade.id);
      const isMax = tier >= upgrade.maxTier;

      const card = document.createElement('div');
      card.className = `shop-card${isMax ? ' maxed' : ''}`;

      const cost = isMax ? '' : `◆ ${upgrade.costs[tier]}`;
      const tierText = isMax ? t('shop.max') : `${t('shop.tier')} ${tier}/${upgrade.maxTier}`;
      const valueText = tier > 0
        ? (upgrade.id === 'meta_xp' ? `×${upgrade.values[tier - 1]}` :
           upgrade.id === 'meta_armor' ? `${Math.round(upgrade.values[tier - 1] * 100)}%` :
           `+${upgrade.values[tier - 1]}`)
        : '';

      card.innerHTML = `
        <div class="shop-icon">${upgrade.icon}</div>
        <div class="shop-name">${t(upgrade.nameKey)}</div>
        <div class="shop-tier">${tierText}${valueText ? ` (${valueText})` : ''}</div>
        <div class="shop-desc">${t(upgrade.descKey)}</div>
        ${!isMax ? `<div class="shop-cost">${cost}</div>` : ''}
      `;

      if (!isMax) {
        card.addEventListener('click', () => {
          if (meta.purchaseUpgrade(upgrade.id)) {
            this.refreshShopContent(meta);
          }
        });
      }

      container.appendChild(card);
    }
  }

  hideShop(): void {
    document.getElementById('shop-screen')!.style.display = 'none';
    this.showTitle();
  }

  // ═════════════════════════════════════
  // ─── CHARACTER SELECT ───────────────
  // ═════════════════════════════════════
  showCharacterSelect(meta: MetaProgression): void {
    const screen = document.getElementById('character-select-screen')!;
    document.getElementById('char-select-title')!.textContent = t('char.select.title');
    document.getElementById('char-back-btn')!.textContent = t('shop.back');

    const container = document.getElementById('char-cards')!;
    container.innerHTML = '';

    const shapeSymbols: Record<string, string> = {
      triangle: '△', diamond: '◇', pentagon: '⬠', hexagon: '⬡',
    };

    for (const char of CHARACTERS) {
      const unlocked = meta.isCharacterUnlocked(char.id);
      const card = document.createElement('div');
      card.className = `char-card${!unlocked ? ' locked' : ''}${char.id === this.selectedCharacterId ? ' selected' : ''}`;

      const colorHex = '#' + char.color.toString(16).padStart(6, '0');
      let html = `
        <div class="char-shape" style="color:${colorHex}">${shapeSymbols[char.shape] || '●'}</div>
        <div class="char-name">${t(char.nameKey)}</div>
        <div class="char-desc">${t(char.descKey)}</div>
      `;

      if (!unlocked) {
        html += `<span class="char-lock">🔒</span>`;
        html += `<div class="char-unlock-cost">◆ ${char.unlockCost}</div>`;
      }

      card.innerHTML = html;

      card.addEventListener('click', () => {
        if (!unlocked) {
          // Try to unlock
          if (meta.unlockCharacter(char.id, char.unlockCost)) {
            this.showCharacterSelect(meta); // Refresh
          }
          return;
        }
        // Select
        this.selectedCharacterId = char.id;
        container.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      container.appendChild(card);
    }

    screen.style.display = 'flex';
    this.titleScreen.style.display = 'none';
  }

  hideCharacterSelect(): void {
    document.getElementById('character-select-screen')!.style.display = 'none';
  }

  getSelectedCharacterId(): string {
    return this.selectedCharacterId;
  }

  // ═════════════════════════════════════
  // ─── ACHIEVEMENTS ───────────────────
  // ═════════════════════════════════════
  showAchievements(meta: MetaProgression): void {
    const screen = document.getElementById('achievement-screen')!;
    document.getElementById('ach-title')!.textContent = t('ach.title');
    document.getElementById('daily-title')!.textContent = t('ach.daily.title');
    document.getElementById('ach-back-btn')!.textContent = t('ach.back');

    // Daily challenges
    const today = getTodayDateStr();
    meta.setDailyDate(today);
    const dailies = getDailyChallenges();
    const completedDailies = new Set(meta.getDailyCompleted());

    const dailyList = document.getElementById('daily-list')!;
    dailyList.innerHTML = '';
    for (const daily of dailies) {
      const item = document.createElement('div');
      item.className = `daily-item${completedDailies.has(daily.id) ? ' completed' : ''}`;
      item.innerHTML = `
        <span>${t(daily.descKey)}</span>
        <span class="daily-reward">◆ ${daily.reward}</span>
      `;
      dailyList.appendChild(item);
    }

    // Achievements grid
    const grid = document.getElementById('ach-grid')!;
    grid.innerHTML = '';
    for (const ach of ACHIEVEMENTS) {
      const unlocked = meta.isAchievementUnlocked(ach.id);
      const item = document.createElement('div');
      item.className = `ach-item${unlocked ? ' unlocked' : ' locked'}`;
      item.innerHTML = `
        <div class="ach-icon">${unlocked ? ach.icon : '🔒'}</div>
        <div class="ach-name">${t(ach.nameKey)}</div>
        <div class="ach-desc">${t(ach.descKey)}</div>
        <div class="ach-reward">◆ ${ach.reward}</div>
      `;
      grid.appendChild(item);
    }

    screen.style.display = 'flex';
    this.titleScreen.style.display = 'none';
  }

  hideAchievements(): void {
    document.getElementById('achievement-screen')!.style.display = 'none';
    this.showTitle();
  }

  // ─── Achievement Toast ─────────────
  showAchievementToast(name: string, icon: string, reward: number): void {
    const toast = document.getElementById('achievement-toast')!;
    toast.querySelector('.toast-icon')!.textContent = icon;
    toast.querySelector('.toast-text')!.textContent = name;
    toast.querySelector('.toast-reward')!.textContent = `◆ +${reward}`;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  }

  // ═════════════════════════════════════
  // ─── EVENT BANNER ───────────────────
  // ═════════════════════════════════════
  private eventBannerInterval: ReturnType<typeof setInterval> | null = null;
  private eventBannerTimeout: ReturnType<typeof setTimeout> | null = null;

  showEventBanner(text: string, colorClass: string, duration: number): void {
    const banner = document.getElementById('event-banner')!;
    // Clear previous timers
    if (this.eventBannerInterval) { clearInterval(this.eventBannerInterval); this.eventBannerInterval = null; }
    if (this.eventBannerTimeout) { clearTimeout(this.eventBannerTimeout); this.eventBannerTimeout = null; }

    let remaining = duration;
    banner.textContent = `${text} (${remaining}s)`;
    banner.className = colorClass;
    banner.style.display = 'block';

    this.eventBannerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.hideEventBanner();
      } else {
        banner.textContent = `${text} (${remaining}s)`;
      }
    }, 1000);

    this.eventBannerTimeout = setTimeout(() => { this.hideEventBanner(); }, duration * 1000);
  }

  hideEventBanner(): void {
    if (this.eventBannerInterval) { clearInterval(this.eventBannerInterval); this.eventBannerInterval = null; }
    if (this.eventBannerTimeout) { clearTimeout(this.eventBannerTimeout); this.eventBannerTimeout = null; }
    document.getElementById('event-banner')!.style.display = 'none';
  }

  // ═════════════════════════════════════
  // ─── PARTY ──────────────────────────
  // ═════════════════════════════════════
  showPartyScreen(): void {
    const screen = document.getElementById('party-screen')!;
    screen.style.display = 'flex';
    this.titleScreen.style.display = 'none';
    // Reset sub-elements
    document.getElementById('party-code-display')!.style.display = 'none';
    document.getElementById('party-code-input')!.style.display = 'none';
    document.getElementById('party-join-confirm-btn')!.style.display = 'none';
    document.getElementById('party-copy-btn')!.style.display = 'none';
    document.getElementById('party-members-list')!.style.display = 'none';
    document.getElementById('party-start-btn')!.style.display = 'none';
    document.getElementById('party-status')!.textContent = '';
  }

  showPartyCode(code: string): void {
    document.getElementById('party-code-display')!.textContent = code;
    document.getElementById('party-code-display')!.style.display = 'block';
    document.getElementById('party-copy-btn')!.style.display = 'inline-block';
    document.getElementById('party-start-btn')!.style.display = 'inline-block';
    document.getElementById('party-members-list')!.style.display = 'block';
    document.getElementById('party-status')!.textContent = t('party.waiting');
  }

  showPartyJoinInput(): void {
    document.getElementById('party-code-input')!.style.display = 'block';
    document.getElementById('party-join-confirm-btn')!.style.display = 'inline-block';
    (document.getElementById('party-code-input') as HTMLInputElement).focus();
  }

  updatePartyMembers(members: string[]): void {
    const el = document.getElementById('party-members-list')!;
    el.innerHTML = `<strong>${t('party.members')}:</strong><br>` + members.map(m => `• ${escapeHtml(m)}`).join('<br>');
    el.style.display = 'block';
  }

  showPartyError(reason: string): void {
    document.getElementById('party-status')!.textContent = reason;
    document.getElementById('party-status')!.style.color = '#ff4466';
  }

  hideParty(): void {
    document.getElementById('party-screen')!.style.display = 'none';
  }

  // ─── Coin HUD (in-game) ───
  updateCoinDisplay(coins: number): void {
    const el = document.getElementById('coin-display')!;
    el.textContent = `◆ ${coins}`;
    el.style.display = 'block';
  }

  hideCoinDisplay(): void {
    document.getElementById('coin-display')!.style.display = 'none';
  }

  // ═════════════════════════════════════
  // ─── RELIC HUD ─────────────────────
  // ═════════════════════════════════════
  updateRelicHud(relics: { id: string; count: number; icon: string }[]): void {
    const hud = document.getElementById('relic-hud')!;
    hud.innerHTML = '';
    for (const r of relics) {
      const div = document.createElement('div');
      div.className = 'relic-icon';
      div.title = r.id;
      div.textContent = r.icon;
      if (r.count > 1) {
        const stack = document.createElement('span');
        stack.className = 'relic-stack';
        stack.textContent = `x${r.count}`;
        div.appendChild(stack);
      }
      hud.appendChild(div);
    }
  }

  // ═════════════════════════════════════
  // ─── COMBO COUNTER ─────────────────
  // ═════════════════════════════════════
  updateCombo(count: number): void {
    const el = document.getElementById('combo-counter')!;
    if (count < 3) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.textContent = `${count}x ${t('combo.label')}`;
    // Color progression
    if (count >= 100) {
      el.style.color = '#ff44ff';
      el.style.textShadow = '0 0 20px rgba(255,68,255,0.8)';
      el.style.fontSize = '36px';
    } else if (count >= 50) {
      el.style.color = '#ff4444';
      el.style.textShadow = '0 0 15px rgba(255,68,68,0.6)';
      el.style.fontSize = '32px';
    } else if (count >= 25) {
      el.style.color = '#ff6644';
      el.style.textShadow = '0 0 12px rgba(255,102,68,0.5)';
      el.style.fontSize = '28px';
    } else {
      el.style.color = '#ff8844';
      el.style.textShadow = '0 0 10px rgba(255,136,68,0.4)';
      el.style.fontSize = '24px';
    }
    // Pop animation
    el.style.transform = 'scale(1.2)';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 100);
  }

  // ═════════════════════════════════════
  // ─── TUTORIAL ──────────────────────
  // ═════════════════════════════════════
  showTutorialStep(text: string): void {
    const overlay = document.getElementById('tutorial-overlay')!;
    const textEl = document.getElementById('tutorial-text')!;
    textEl.textContent = text;
    overlay.style.display = 'flex';
  }

  hideTutorial(): void {
    document.getElementById('tutorial-overlay')!.style.display = 'none';
  }

  onTutorialSkip(cb: () => void): void {
    document.getElementById('tutorial-skip-btn')!.addEventListener('click', cb);
  }

  // ═════════════════════════════════════
  // ─── STATS SCREEN ──────────────────
  // ═════════════════════════════════════
  showStats(records: {
    date: string; durationS: number; kills: number; level: number;
    maxCombo: number; totalDamage: number; coinsEarned: number; bossKills: number;
  }[]): void {
    const screen = document.getElementById('stats-screen')!;
    document.getElementById('stats-title')!.textContent = t('stats.title');
    const content = document.getElementById('stats-content')!;

    if (records.length === 0) {
      content.innerHTML = `<div style="opacity:0.5;margin:40px">${t('stats.noData')}</div>`;
    } else {
      let html = `<table class="stats-table"><thead><tr>
        <th>${t('stats.date')}</th><th>${t('stats.duration')}</th>
        <th>${t('stats.kills_col')}</th><th>${t('stats.level_col')}</th>
        <th>${t('stats.maxCombo')}</th><th>${t('stats.damage')}</th>
        <th>${t('stats.coins_col')}</th><th>${t('stats.bossKills')}</th>
      </tr></thead><tbody>`;
      // Show most recent first, limit 20
      const shown = records.slice(-20).reverse();
      for (const r of shown) {
        const m = Math.floor(r.durationS / 60);
        const s = Math.floor(r.durationS % 60);
        html += `<tr>
          <td>${r.date}</td>
          <td>${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</td>
          <td>${r.kills}</td><td>${r.level}</td>
          <td>${r.maxCombo}x</td><td>${r.totalDamage.toLocaleString()}</td>
          <td>◆${r.coinsEarned}</td><td>${r.bossKills}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    }

    screen.style.display = 'flex';
    this.titleScreen.style.display = 'none';
  }

  hideStats(): void {
    document.getElementById('stats-screen')!.style.display = 'none';
    this.showTitle();
  }

  // ═════════════════════════════════════
  // ─── SPECTATE ──────────────────────
  // ═════════════════════════════════════
  showSpectateBanner(name: string): void {
    const el = document.getElementById('spectate-banner')!;
    el.textContent = t('spectate.banner', { name });
    el.style.display = 'block';
    document.getElementById('spectate-controls')!.style.display = 'flex';
  }

  hideSpectateBanner(): void {
    document.getElementById('spectate-banner')!.style.display = 'none';
    document.getElementById('spectate-controls')!.style.display = 'none';
  }

  // ═════════════════════════════════════
  // ─── EMOTE RADIAL ──────────────────
  // ═════════════════════════════════════
  private emoteCallback: ((emoteId: string) => void) | null = null;

  showEmoteRadial(cb: (emoteId: string) => void): void {
    this.emoteCallback = cb;
    const radial = document.getElementById('emote-radial')!;
    radial.innerHTML = '';
    const emotes = [
      { id: 'gg', emoji: '👍', label: 'GG' },
      { id: 'help', emoji: '❗', label: 'Help' },
      { id: 'rip', emoji: '💀', label: 'RIP' },
      { id: 'nice', emoji: '🎉', label: 'Nice' },
      { id: 'rush', emoji: '⚡', label: 'Rush' },
      { id: 'defend', emoji: '🛡️', label: 'Defend' },
    ];
    const cx = 100, cy = 100, r = 70;
    for (let i = 0; i < emotes.length; i++) {
      const angle = (Math.PI * 2 / emotes.length) * i - Math.PI / 2;
      const btn = document.createElement('button');
      btn.className = 'emote-btn';
      btn.textContent = emotes[i].emoji;
      btn.title = emotes[i].label;
      btn.style.left = `${cx + Math.cos(angle) * r - 22}px`;
      btn.style.top = `${cy + Math.sin(angle) * r - 22}px`;
      const emoteId = emotes[i].id;
      btn.addEventListener('click', () => {
        if (this.emoteCallback) this.emoteCallback(emoteId);
        this.hideEmoteRadial();
      });
      radial.appendChild(btn);
    }
    radial.style.display = 'block';
  }

  hideEmoteRadial(): void {
    document.getElementById('emote-radial')!.style.display = 'none';
    this.emoteCallback = null;
  }

  isEmoteRadialOpen(): boolean {
    return document.getElementById('emote-radial')!.style.display === 'block';
  }

  hideAll(): void {
    this.hideLevelUp();
    this.hideGameOver();
    this.hidePause();
    this.hideBossHp();
    this.hideRespawnOverlay();
    this.closeChatInput();
    this.bossWarning.style.display = 'none';
    this.hideEventBanner();
    this.hideTutorial();
    this.hideSpectateBanner();
    this.hideEmoteRadial();
    document.getElementById('combo-counter')!.style.display = 'none';
    document.getElementById('relic-hud')!.innerHTML = '';
  }
}
