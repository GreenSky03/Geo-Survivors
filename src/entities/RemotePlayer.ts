import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Team, WeaponSyncData } from '../../shared/protocol';
import { TEAM_COLORS } from '../../shared/protocol';
import { lerp } from '../utils/math';

// Weapon visual configs (matching actual weapon sizes)
const WEAPON_VISUALS: Record<string, {
  draw: (g: Graphics, level: number, evolved: boolean, angle: number, color: number) => void;
}> = {
  orbit: {
    draw(g, level, evolved, angle, _color) {
      // Match OrbitWeapon LEVEL_TABLE
      const orbCounts = [3, 3, 3, 4, 4, 4, 5, 5, 8];
      const orbSizes  = [10, 10, 10, 10, 10, 16, 16, 16, 18];
      const radii     = [90, 90, 90, 90, 90, 100, 100, 100, 120];
      const idx = Math.min(level, 8);
      const orbCount = orbCounts[idx];
      const orbSize = orbSizes[idx];
      const radius = radii[idx];
      const col = evolved ? 0xaa44ff : 0x33ffcc;
      const glowCol = evolved ? 0xcc66ff : 0x33ffcc;

      // Orbit ring
      g.circle(0, 0, radius);
      g.stroke({ color: col, alpha: 0.1, width: 1 });

      for (let i = 0; i < orbCount; i++) {
        const a = angle + (Math.PI * 2 / orbCount) * i;
        const ox = Math.cos(a) * radius;
        const oy = Math.sin(a) * radius;
        // Diamond shape
        const s = orbSize;
        g.poly([ox, oy - s, ox + s * 0.7, oy, ox, oy + s, ox - s * 0.7, oy]);
        g.fill({ color: col, alpha: 0.7 });
        // Glow
        const gs = s + 5;
        g.poly([ox, oy - gs, ox + gs * 0.7, oy, ox, oy + gs, ox - gs * 0.7, oy]);
        g.fill({ color: glowCol, alpha: 0.08 });
      }
    },
  },
  bullet: {
    draw(g, _level, evolved, _angle, _color) {
      if (evolved) {
        // Ray Blaster: show 3 beam indicators
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 / 3) * i;
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a) * 80, Math.sin(a) * 80);
          g.stroke({ width: 2, color: 0xffee44, alpha: 0.15 });
        }
      } else {
        // Show bullet ring indicator
        g.circle(0, 0, 30);
        g.stroke({ width: 1, color: 0xffee44, alpha: 0.15 });
      }
    },
  },
  area: {
    draw(g, level, evolved, _angle, _color) {
      const radii = [120, 120, 120, 150, 150, 150, 180, 180, 200];
      const idx = Math.min(level, 8);
      const radius = radii[idx];
      const col = 0x44ffaa;
      if (evolved) {
        // Eternal Pulse: permanent aura
        g.circle(0, 0, radius);
        g.stroke({ color: col, alpha: 0.2, width: 2 });
        g.circle(0, 0, radius);
        g.fill({ color: col, alpha: 0.03 });
      } else {
        g.circle(0, 0, radius);
        g.stroke({ color: col, alpha: 0.1, width: 1 });
      }
    },
  },
  lightning: {
    draw(g, _level, evolved, _angle, _color) {
      const col = 0x88ccff;
      const r = evolved ? 60 : 40;
      g.circle(0, 0, r);
      g.stroke({ color: col, alpha: 0.12, width: 1 });
      // Lightning symbol
      g.moveTo(-5, -10);
      g.lineTo(3, -2);
      g.lineTo(-2, 2);
      g.lineTo(5, 10);
      g.stroke({ width: 2, color: col, alpha: 0.3 });
    },
  },
  forcefield: {
    draw(g, level, evolved, _angle, _color) {
      const radii = [60, 60, 60, 75, 75, 75, 90, 90, 140];
      const idx = Math.min(level, 8);
      const radius = radii[idx];
      const col = evolved ? 0xcc66ff : 0x66aaff;
      g.circle(0, 0, radius);
      g.stroke({ width: 2, color: col, alpha: 0.25 });
      g.circle(0, 0, radius);
      g.fill({ color: col, alpha: evolved ? 0.04 : 0.02 });
    },
  },
};

export class RemotePlayer {
  public container: Container;
  public id: string;
  public name: string;
  public team: Team;
  public targetX = 0;
  public targetY = 0;
  public targetRotation = 0;
  public level = 1;
  public kills = 0;
  public hp = 100;
  public maxHp = 100;
  public alive = true;
  public justDied = false;
  public weapons: WeaponSyncData[] = [];

  private nameText: Text;
  private hpBar: Graphics;
  private body: Graphics;
  private weaponVisuals: Graphics;
  private auraAngle = Math.random() * Math.PI * 2;
  private emoteText: Text | null = null;
  private emoteTimer = 0;

  constructor(id: string, name: string, team: Team) {
    this.id = id;
    this.name = name;
    this.team = team;

    this.container = new Container();
    const color = TEAM_COLORS[team];

    // Glow
    const glow = new Graphics();
    glow.poly([0, -24, 20, 15, -20, 15]);
    glow.fill({ color, alpha: 0.12 });
    this.container.addChild(glow);

    // Body
    this.body = new Graphics();
    this.body.poly([0, -18, 15, 11, -15, 11]);
    this.body.fill({ color, alpha: 0.8 });
    this.container.addChild(this.body);

    // Name
    this.nameText = new Text({
      text: name,
      style: new TextStyle({ fontSize: 11, fill: 0xffffff, fontFamily: 'Arial' }),
    });
    this.nameText.anchor.set(0.5);
    this.nameText.y = -32;
    this.nameText.alpha = 0.7;
    this.container.addChild(this.nameText);

    // HP bar
    this.hpBar = new Graphics();
    this.hpBar.y = 20;
    this.container.addChild(this.hpBar);

    // Weapon visuals (replaces old decorative aura)
    this.weaponVisuals = new Graphics();
    this.container.addChildAt(this.weaponVisuals, 0);
  }

  update(dt: number): void {
    // Interpolate position
    this.container.x = lerp(this.container.x, this.targetX, 0.15);
    this.container.y = lerp(this.container.y, this.targetY, 0.15);

    // Interpolate rotation
    let diff = this.targetRotation - this.container.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.container.rotation += diff * 0.15;

    // Cancel container rotation on weapon visuals (they should render in world space)
    this.weaponVisuals.rotation = -this.container.rotation;

    // HP bar
    this.hpBar.clear();
    if (this.hp < this.maxHp) {
      const w = 24;
      this.hpBar.rect(-w / 2, 0, w, 3);
      this.hpBar.fill({ color: 0x333333, alpha: 0.5 });
      this.hpBar.rect(-w / 2, 0, w * (this.hp / this.maxHp), 3);
      this.hpBar.fill({ color: 0x44ff88, alpha: 0.7 });
    }

    // Weapon visuals — draw actual weapon representations
    this.auraAngle += 2.5 * dt;
    this.weaponVisuals.clear();
    if (this.alive) {
      const color = TEAM_COLORS[this.team];
      if (this.weapons.length > 0) {
        // Draw actual weapon visuals from synced data
        for (const w of this.weapons) {
          const visual = WEAPON_VISUALS[w.id];
          if (visual) {
            visual.draw(this.weaponVisuals, w.level, w.evolved, this.auraAngle, color);
          }
        }
      }
    }

    this.container.alpha = this.alive ? 1 : 0.3;

    // Emote bubble timer
    if (this.emoteText && this.emoteTimer > 0) {
      this.emoteTimer -= dt;
      if (this.emoteTimer <= 0.5) {
        this.emoteText.alpha = Math.max(0, this.emoteTimer / 0.5);
      }
      if (this.emoteTimer <= 0) {
        this.container.removeChild(this.emoteText);
        this.emoteText.destroy();
        this.emoteText = null;
        this.emoteTimer = 0;
      }
    }
  }

  showEmote(emoteId: string): void {
    // Remove existing emote
    if (this.emoteText) {
      this.container.removeChild(this.emoteText);
      this.emoteText.destroy();
      this.emoteText = null;
    }

    const EMOTE_MAP: Record<string, string> = {
      gg: '👍', help: '❗', rip: '💀', nice: '🎉', rush: '⚡', defend: '🛡️',
    };
    const emoji = EMOTE_MAP[emoteId] || emoteId;

    this.emoteText = new Text({
      text: emoji,
      style: new TextStyle({ fontSize: 22, fill: 0xffffff, fontFamily: 'Arial' }),
    });
    this.emoteText.anchor.set(0.5);
    this.emoteText.y = -50;
    this.emoteText.alpha = 1;
    this.container.addChild(this.emoteText);
    this.emoteTimer = 2;
  }

  syncData(data: { x: number; y: number; level: number; kills: number; hp: number; maxHp: number; rotation: number; alive: boolean; weapons?: WeaponSyncData[] }): void {
    this.targetX = data.x;
    this.targetY = data.y;
    this.targetRotation = data.rotation;
    this.level = data.level;
    this.kills = data.kills;
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    // Detect death transition
    this.justDied = this.alive && !data.alive;
    this.alive = data.alive;
    if (data.weapons && data.weapons.length > 0) {
      this.weapons = data.weapons;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
