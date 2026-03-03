export class Input {
  private keys = new Set<string>();
  public movementBlocked = false;

  // Touch joystick
  private touchActive = false;
  private touchId: number = -1; // Track specific touch finger
  private touchStartX = 0;
  private touchStartY = 0;
  private touchDx = 0;
  private touchDy = 0;
  private joystickEl: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  public isTouchDevice = false;

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Detect touch device
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (this.isTouchDevice) {
      this.createJoystick();
    }
  }

  private createJoystick(): void {
    // Joystick base
    this.joystickEl = document.createElement('div');
    this.joystickEl.id = 'touch-joystick';
    Object.assign(this.joystickEl.style, {
      position: 'fixed', bottom: '40px', left: '40px',
      width: '120px', height: '120px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.2)',
      background: 'rgba(255,255,255,0.05)',
      display: 'none', zIndex: '15',
      touchAction: 'none', pointerEvents: 'none',
    });

    // Knob
    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute', width: '40px', height: '40px',
      borderRadius: '50%', background: 'rgba(0,230,176,0.4)',
      border: '2px solid rgba(0,230,176,0.6)',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });
    this.joystickEl.appendChild(this.joystickKnob);
    document.body.appendChild(this.joystickEl);

    // Touch zone covers entire screen (below UI elements)
    const touchZone = document.createElement('div');
    touchZone.id = 'touch-zone';
    Object.assign(touchZone.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      zIndex: '10', touchAction: 'none',
      display: 'none',
    });
    document.body.appendChild(touchZone);

    touchZone.addEventListener('touchstart', (e) => {
      // Ignore touches on UI elements (level-up cards, buttons, etc.)
      const target = e.target as HTMLElement;
      if (target.closest('.mobile-action-btn, #level-up-screen, #pause-screen, #game-over-screen, #title-screen, #chat-input-row, #chat-panel, #respawn-overlay')) {
        return;
      }
      // Only track one joystick finger at a time
      if (this.touchActive) return;

      e.preventDefault();
      const t = e.changedTouches[0];
      this.touchActive = true;
      this.touchId = t.identifier;
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
      this.touchDx = 0;
      this.touchDy = 0;
      if (this.joystickEl) {
        this.joystickEl.style.left = `${t.clientX - 60}px`;
        this.joystickEl.style.top = `${t.clientY - 60}px`;
        this.joystickEl.style.bottom = 'auto';
        this.joystickEl.style.display = 'block';
      }
    }, { passive: false });

    touchZone.addEventListener('touchmove', (e) => {
      if (!this.touchActive) return;
      // Find our tracked touch by identifier
      let t: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.touchId) {
          t = e.touches[i];
          break;
        }
      }
      if (!t) return;
      e.preventDefault();

      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      const maxDist = 50;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, maxDist);
      if (dist > 0) {
        this.touchDx = (dx / dist) * (clampedDist / maxDist);
        this.touchDy = (dy / dist) * (clampedDist / maxDist);
      }
      // Move knob
      if (this.joystickKnob && dist > 0) {
        const knobX = (dx / dist) * Math.min(dist, maxDist);
        const knobY = (dy / dist) * Math.min(dist, maxDist);
        this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
      }
    }, { passive: false });

    const endTouch = (e: TouchEvent) => {
      // Only end if our tracked finger was lifted
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          this.touchActive = false;
          this.touchId = -1;
          this.touchDx = 0;
          this.touchDy = 0;
          if (this.joystickEl) this.joystickEl.style.display = 'none';
          if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
          break;
        }
      }
    };

    touchZone.addEventListener('touchend', endTouch);
    touchZone.addEventListener('touchcancel', endTouch);
  }

  showTouchControls(show: boolean): void {
    if (!this.isTouchDevice) return;
    const zone = document.getElementById('touch-zone');
    if (zone) zone.style.display = show ? 'block' : 'none';
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  getMovementVector(): { x: number; y: number } {
    if (this.movementBlocked) return { x: 0, y: 0 };

    // Touch joystick takes priority
    if (this.touchActive && (this.touchDx !== 0 || this.touchDy !== 0)) {
      return { x: this.touchDx, y: this.touchDy };
    }

    let x = 0;
    let y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;

    // Normalize diagonal
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
}
