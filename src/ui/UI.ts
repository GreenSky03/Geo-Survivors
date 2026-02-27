import { UpgradeChoice } from '../systems/LevelUpSystem';
import { WeaponBase } from '../weapons/WeaponBase';
import { t, setLang, getLang, detectLang, Lang } from '../systems/i18n';
import { MAP_HALF_W, MAP_HALF_H } from '../../shared/protocol';

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
      card.className = `level-up-card${isEvolve ? ' evolve-card' : ''}`;

      let html = `
        <div class="card-icon">${choice.icon}</div>
        <div class="card-name">${choice.name}</div>
        <div class="card-desc">${choice.description}</div>
      `;
      if (choice.statLine) {
        html += `<div class="card-stat">${choice.statLine}</div>`;
      }
      card.innerHTML = html;

      card.addEventListener('click', () => {
        const cb = this.onChoiceCallback;
        this.hideLevelUp();
        if (cb) cb(choice);
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
  }, onRestart: () => void): void {
    this.onRestartCallback = onRestart;
    this.gameOverTitle.textContent = t('gameover.title');
    this.restartBtn.textContent = t('gameover.restart');
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
    this.gameOverStats.innerHTML = html;
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
    document.getElementById('ping-hint')!.style.display = show ? 'block' : 'none';
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
    entry.innerHTML = `<span style="color:${teamColors[killerTeam] || '#fff'}">${killerName}</span> killed ${victimName}`;
    el.appendChild(entry);
    // Keep max 5 entries
    while (el.children.length > 5) {
      el.removeChild(el.children[0]);
    }
    // Auto-remove after 5s
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
    document.getElementById('death-penalty-text')!.textContent = t('death.penalty');
    document.getElementById('respawn-overlay')!.style.display = 'flex';
  }

  updateRespawnTimer(remaining: number, total: number): void {
    const secs = Math.ceil(Math.max(0, remaining));
    document.getElementById('respawn-timer-text')!.textContent = `Respawning in ${secs}...`;
    const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
    document.getElementById('respawn-bar-fill')!.style.width = `${pct}%`;
  }

  hideRespawnOverlay(): void {
    document.getElementById('respawn-overlay')!.style.display = 'none';
  }

  hideAll(): void {
    this.hideLevelUp();
    this.hideGameOver();
    this.hidePause();
    this.hideBossHp();
    this.hideRespawnOverlay();
    this.bossWarning.style.display = 'none';
  }
}
