import { Container, Text, TextStyle } from 'pixi.js';

interface DmgNumber {
  text: Text;
  life: number;
  vy: number;
}

const STYLE = new TextStyle({
  fontFamily: 'Segoe UI, Arial',
  fontSize: 14,
  fontWeight: 'bold',
  fill: 0xffffff,
});

const CRIT_STYLE = new TextStyle({
  fontFamily: 'Segoe UI, Arial',
  fontSize: 20,
  fontWeight: 'bold',
  fill: 0xffee44,
});

export class DamageNumbers {
  public container: Container;
  private numbers: DmgNumber[] = [];

  constructor() {
    this.container = new Container();
  }

  spawn(x: number, y: number, amount: number, color?: number | boolean): void {
    let style: TextStyle;
    if (typeof color === 'number') {
      style = new TextStyle({
        fontFamily: 'Segoe UI, Arial', fontSize: 16, fontWeight: 'bold', fill: color,
      });
    } else {
      style = color === true ? CRIT_STYLE : STYLE;
    }
    const text = new Text({ text: String(amount), style });
    text.anchor.set(0.5);
    text.x = x + (Math.random() - 0.5) * 16;
    text.y = y - 10;
    this.container.addChild(text);

    this.numbers.push({
      text,
      life: 0.7,
      vy: -60 - Math.random() * 30,
    });
  }

  update(dt: number): void {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      n.text.y += n.vy * dt;
      n.vy *= 0.95;
      n.text.alpha = Math.max(0, n.life / 0.7);

      if (n.life <= 0) {
        this.container.removeChild(n.text);
        n.text.destroy();
        this.numbers.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const n of this.numbers) {
      this.container.removeChild(n.text);
      n.text.destroy();
    }
    this.numbers = [];
  }
}
