import { Container, Graphics } from 'pixi.js';
import { Input } from '../core/Input';
import { MAP_HALF_W, MAP_HALF_H } from '../../shared/protocol';

export class Player {
  public container: Container;
  public x = 0;
  public y = 0;
  public radius = 16;
  public speed = 280;
  public maxHp = 100;
  public hp = 100;
  public isInvincible = false;
  public magnetRange = 100;
  public hpRegen = 0; // HP per second

  private visual: Graphics;
  private glowVisual: Graphics;
  private invincibleTimer = 0;
  private flashTimer = 0;
  private regenAccum = 0;

  constructor(private input: Input) {
    this.container = new Container();

    // Glow
    this.glowVisual = new Graphics();
    this.glowVisual.poly([0, -28, 24, 18, -24, 18]);
    this.glowVisual.fill({ color: 0x00e6b0, alpha: 0.12 });
    this.container.addChild(this.glowVisual);

    // Body - triangle
    this.visual = new Graphics();
    this.visual.poly([0, -22, 19, 14, -19, 14]);
    this.visual.fill({ color: 0x00e6b0 });
    this.container.addChild(this.visual);

    // Inner
    const inner = new Graphics();
    inner.poly([0, -13, 11, 8, -11, 8]);
    inner.fill({ color: 0x009980, alpha: 0.5 });
    this.container.addChild(inner);
  }

  update(dt: number): void {
    // Invincibility (runs even when dead for respawn blink effect)
    if (this.isInvincible) {
      this.invincibleTimer -= dt;
      if (this.container.visible) {
        this.container.alpha = Math.sin(this.invincibleTimer * 20) > 0 ? 1 : 0.4;
      }
      if (this.invincibleTimer <= 0) {
        this.isInvincible = false;
        this.container.alpha = 1;
      }
    }

    // Flash recovery
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.visual.tint = 0xffffff;
      }
    }

    if (!this.alive) return;

    const move = this.input.getMovementVector();
    this.x += move.x * this.speed * dt;
    this.y += move.y * this.speed * dt;

    // Clamp to map boundaries
    this.x = Math.max(-MAP_HALF_W, Math.min(MAP_HALF_W, this.x));
    this.y = Math.max(-MAP_HALF_H, Math.min(MAP_HALF_H, this.y));

    this.container.x = this.x;
    this.container.y = this.y;

    // Rotate toward movement direction
    if (move.x !== 0 || move.y !== 0) {
      const targetRot = Math.atan2(move.y, move.x) + Math.PI / 2;
      let diff = targetRot - this.container.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.container.rotation += diff * 0.12;
    }

    // HP regen
    if (this.hpRegen > 0 && this.hp < this.maxHp) {
      this.regenAccum += this.hpRegen * dt;
      if (this.regenAccum >= 1) {
        const heal = Math.floor(this.regenAccum);
        this.hp = Math.min(this.maxHp, this.hp + heal);
        this.regenAccum -= heal;
      }
    }
  }

  takeDamage(amount: number): void {
    if (this.isInvincible) return;
    this.hp = Math.max(0, this.hp - amount);
    this.isInvincible = true;
    this.invincibleTimer = 0.5;
    this.visual.tint = 0xff4444;
    this.flashTimer = 0.15;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Grant invincibility for a set duration (e.g. after respawn) */
  setInvincible(duration: number): void {
    this.isInvincible = true;
    this.invincibleTimer = duration;
  }

  get alive(): boolean {
    return this.hp > 0;
  }
}
