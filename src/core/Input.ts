export class Input {
  private keys = new Set<string>();
  public movementBlocked = false;

  // Touch joystick
  private touchActive = false;
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
      display: 'none', zIndex: '200',
      touchAction: 'none',
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

    // Touch zone covers left half of screen
    const touchZone = document.createElement('div');
    touchZone.id = 'touch-zone';
    Object.assign(touchZone.style, {
      position: 'fixed', top: '0', left: '0',
      width: '50%', height: '100%',
      zIndex: '199', touchAction: 'none',
      display: 'none',
    });
    document.body.appendChild(touchZone);

    touchZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this.touchActive = true;
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
      e.preventDefault();
      if (!this.touchActive) return;
      const t = e.touches[0];
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
      if (this.joystickKnob) {
        const knobX = (dx / dist) * Math.min(dist, maxDist);
        const knobY = (dy / dist) * Math.min(dist, maxDist);
        this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
      }
    }, { passive: false });

    const endTouch = () => {
      this.touchActive = false;
      this.touchDx = 0;
      this.touchDy = 0;
      if (this.joystickEl) this.joystickEl.style.display = 'none';
      if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
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
