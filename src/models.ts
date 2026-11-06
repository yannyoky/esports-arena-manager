// Модели героев, нарисованные векторно на Canvas. Одна функция рисует героя
// и на поле боя, и на портретах в драфте.
import { Champion, Look } from './data';

export interface Pose {
  t: number; // время, для дыхания и шага
  moving?: boolean;
  swing?: number; // 0..0.25, удар
  cast?: number; // 0..0.35, способность
  flash?: number; // 0..0.15, получил урон
  face?: 1 | -1;
}

const TAU = Math.PI * 2;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= a;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha /= a;
}

const OUT = 'rgba(14,10,20,0.85)';

function weapon(ctx: CanvasRenderingContext2D, L: Look, t: number, cast: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  const wood = '#6b4a2f';
  const steel = '#d9dde3';
  switch (L.weapon) {
    case 'shield': {
      rr(ctx, -2, -12, 14, 20, 5);
      ctx.fillStyle = L.trim;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      rr(ctx, 1.5, -8.5, 7, 13, 3);
      ctx.fillStyle = L.cloth;
      ctx.fill();
      break;
    }
    case 'hammer':
      ctx.lineWidth = 3;
      ctx.strokeStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, -18);
      ctx.stroke();
      rr(ctx, -6, -24, 12, 8, 2);
      ctx.fillStyle = L.trim;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      break;
    case 'axe':
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, -18);
      ctx.stroke();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(12, -20, 10, -8);
      ctx.lineTo(0, -11);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      break;
    case 'sword':
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(-1.8, -2);
      ctx.lineTo(-1.8, -22);
      ctx.lineTo(0, -26);
      ctx.lineTo(1.8, -22);
      ctx.lineTo(1.8, -2);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = L.trim;
      ctx.fillRect(-5, -3, 10, 2.5);
      break;
    case 'spear':
      ctx.lineWidth = 2;
      ctx.strokeStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -26);
      ctx.stroke();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(-3, -25);
      ctx.lineTo(0, -34);
      ctx.lineTo(3, -25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = L.trim;
      ctx.fillRect(-2.5, -25, 5, 2);
      break;
    case 'bow':
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = L.trim;
      ctx.beginPath();
      ctx.arc(-4, -6, 14, -1.1, 1.1);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#f4efe2';
      ctx.beginPath();
      ctx.moveTo(-4 + 14 * Math.cos(-1.1), -6 + 14 * Math.sin(-1.1));
      ctx.lineTo(-4 + 14 * Math.cos(1.1), -6 + 14 * Math.sin(1.1));
      ctx.stroke();
      break;
    case 'crossbow':
      rr(ctx, -2, -4, 16, 4, 1.5);
      ctx.fillStyle = wood;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = L.trim;
      ctx.beginPath();
      ctx.arc(10, -2, 8, -1.3, 1.3);
      ctx.stroke();
      break;
    case 'staff':
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -24);
      ctx.stroke();
      glow(ctx, 0, -27, 10 + cast * 30, L.trim, 0.6);
      circle(ctx, 0, -27, 4, L.trim);
      break;
    case 'orb': {
      const y = -8 + Math.sin(t * 3) * 2;
      glow(ctx, 4, y, 11 + cast * 30, L.trim, 0.7);
      circle(ctx, 4, y, 5, L.trim);
      circle(ctx, 2.5, y - 1.5, 1.6, '#ffffff');
      break;
    }
    case 'book': {
      const y = -6 + Math.sin(t * 2.4) * 1.5;
      rr(ctx, -1, y - 6, 12, 10, 1.5);
      ctx.fillStyle = L.cloth;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = L.trim;
      ctx.fillRect(4.5, y - 6, 1.4, 10);
      if (cast > 0) glow(ctx, 5, y - 1, 18, L.trim, 0.8);
      break;
    }
    case 'daggers':
      ctx.fillStyle = steel;
      for (const dx of [0, -9]) {
        ctx.beginPath();
        ctx.moveTo(dx - 1.5, 0);
        ctx.lineTo(dx, -12);
        ctx.lineTo(dx + 1.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = L.trim;
        ctx.fillRect(dx - 3, -1, 6, 2);
        ctx.fillStyle = steel;
      }
      break;
    case 'scythe':
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = wood;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -26);
      ctx.stroke();
      ctx.fillStyle = L.trim;
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.quadraticCurveTo(-16, -28, -20, -16);
      ctx.quadraticCurveTo(-12, -23, 0, -21);
      ctx.closePath();
      ctx.fill();
      break;
    case 'lantern': {
      const sw = Math.sin(t * 2) * 0.15;
      ctx.save();
      ctx.rotate(sw);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 5);
      ctx.stroke();
      glow(ctx, 0, 10, 14 + cast * 30, L.trim, 0.8);
      rr(ctx, -4, 5, 8, 10, 2);
      ctx.fillStyle = L.trim;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'fist':
      circle(ctx, 0, 0, 5, L.trim);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.stroke();
      break;
  }
}

function head(ctx: CanvasRenderingContext2D, L: Look, hy: number) {
  const r = 9;
  // Детали за головой
  if (L.head === 'bun') circle(ctx, -3, hy - 10, 4.5, L.hair);
  if (L.head === 'ears') {
    ctx.fillStyle = L.skin;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, hy - 2);
      ctx.lineTo(s * 15, hy - 8);
      ctx.lineTo(s * 7, hy + 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  circle(ctx, 0, hy, r, L.skin);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = OUT;
  ctx.beginPath();
  ctx.arc(0, hy, r, 0, TAU);
  ctx.stroke();

  // Глаза смотрят по направлению движения (вправо, зеркалится снаружи)
  const eyes = () => {
    ctx.fillStyle = '#1b1420';
    ctx.fillRect(1.5, hy - 1, 2, 3);
    ctx.fillRect(5.5, hy - 1, 2, 3);
  };

  switch (L.head) {
    case 'helm':
      ctx.fillStyle = shade(L.cloth, 0.15);
      ctx.beginPath();
      ctx.arc(0, hy, r + 1, Math.PI, 0);
      ctx.lineTo(r + 1, hy + 4);
      ctx.lineTo(-r - 1, hy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1b1420';
      ctx.fillRect(0, hy - 1, 9, 2.2);
      ctx.fillStyle = L.trim;
      ctx.fillRect(-1.5, hy - r - 2, 3, 6);
      return;
    case 'hood':
      ctx.fillStyle = L.cloth;
      ctx.beginPath();
      ctx.arc(-1, hy - 1, r + 2, Math.PI * 0.55, Math.PI * 2.2);
      ctx.quadraticCurveTo(4, hy + 9, -2, hy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(10,6,14,0.55)';
      ctx.beginPath();
      ctx.arc(3, hy + 1, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = L.trim;
      ctx.fillRect(2, hy, 2, 1.6);
      ctx.fillRect(5.5, hy, 2, 1.6);
      return;
    case 'mask':
      ctx.fillStyle = L.hair;
      ctx.beginPath();
      ctx.arc(0, hy, r, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      eyes();
      ctx.fillStyle = L.trim;
      ctx.beginPath();
      ctx.moveTo(-2, hy + 2);
      ctx.lineTo(r, hy + 2);
      ctx.lineTo(r - 2, hy + 7);
      ctx.lineTo(0, hy + 8);
      ctx.closePath();
      ctx.fill();
      return;
    default:
      ctx.fillStyle = L.hair;
      ctx.beginPath();
      ctx.arc(0, hy, r + 0.5, Math.PI * 1.0, Math.PI * 1.9);
      ctx.lineTo(-r, hy + 3);
      ctx.closePath();
      ctx.fill();
      eyes();
  }
  if (L.head === 'horns') {
    ctx.strokeStyle = '#efe6d2';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 5, hy - 7);
      ctx.quadraticCurveTo(s * 13, hy - 12, s * 11, hy - 19);
      ctx.stroke();
    }
  }
  if (L.head === 'crown') {
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(-6, hy - 7);
    ctx.lineTo(-6, hy - 13);
    ctx.lineTo(-3, hy - 10);
    ctx.lineTo(0, hy - 15);
    ctx.lineTo(3, hy - 10);
    ctx.lineTo(6, hy - 13);
    ctx.lineTo(6, hy - 7);
    ctx.closePath();
    ctx.fill();
  }
}

// Герой стоит «ногами» в точке (0,0), рост около 46 единиц
export function drawHero(ctx: CanvasRenderingContext2D, c: Champion, p: Pose) {
  const L = c.look;
  const face = p.face ?? 1;
  const walk = p.moving ? Math.sin(p.t * 14) : 0;
  const breathe = Math.sin(p.t * 2.2) * 0.8;
  const swing = p.swing ?? 0;
  const cast = p.cast ?? 0;
  ctx.save();
  ctx.scale(face, 1);

  const wide = L.body === 'heavy' ? 13 : L.body === 'medium' ? 10.5 : L.body === 'slim' ? 9 : 11;
  const bodyTop = -30 + breathe - Math.abs(walk) * 1.5;

  // Ноги
  if (L.body !== 'robe') {
    ctx.fillStyle = shade(L.cloth, -0.45);
    rr(ctx, -6 + walk * 3, -12, 5, 12, 2);
    ctx.fill();
    rr(ctx, 1 - walk * 3, -12, 5, 12, 2);
    ctx.fill();
  }

  // Плащ или накидка сзади
  if (L.body === 'robe' || L.body === 'slim') {
    ctx.fillStyle = shade(L.cloth, -0.3);
    ctx.beginPath();
    ctx.moveTo(-wide + 1, bodyTop + 4);
    ctx.quadraticCurveTo(-wide - 6 - walk * 2, -6, -wide - 2, 0);
    ctx.lineTo(-2, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Туловище
  ctx.fillStyle = L.cloth;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.3;
  if (L.body === 'robe') {
    ctx.beginPath();
    ctx.moveTo(-wide + 3, bodyTop);
    ctx.lineTo(wide - 3, bodyTop);
    ctx.lineTo(wide + 2, 0);
    ctx.lineTo(-wide - 2, 0);
    ctx.closePath();
  } else rr(ctx, -wide, bodyTop, wide * 2, 20, L.body === 'heavy' ? 7 : 5);
  ctx.fill();
  ctx.stroke();
  // Пояс и отделка
  ctx.fillStyle = L.trim;
  ctx.fillRect(-wide + 1, bodyTop + 13, wide * 2 - 2, 2.5);
  if (L.body === 'heavy') {
    circle(ctx, -wide + 1, bodyTop + 3, 5.5, L.trim);
    circle(ctx, wide - 1, bodyTop + 3, 5.5, L.trim);
  }

  // Задняя рука
  circle(ctx, -wide + 1, bodyTop + 10 - walk * 2, 3.2, L.skin);

  // Голова
  head(ctx, L, bodyTop - 7);

  // Передняя рука с оружием: замах при ударе, подъём при способности
  const swingA = swing > 0 ? -1.4 + (1 - swing / 0.25) * 2.2 : cast > 0 ? -0.9 : -0.25 + walk * 0.1;
  ctx.save();
  ctx.translate(wide - 1, bodyTop + 10);
  ctx.rotate(swingA);
  weapon(ctx, L, p.t, cast);
  circle(ctx, 0, 0, 3.4, L.skin);
  ctx.restore();

  // Вспышка при получении урона
  if (p.flash && p.flash > 0) {
    ctx.globalAlpha = (p.flash / 0.15) * 0.55;
    ctx.fillStyle = '#ffffff';
    rr(ctx, -wide - 1, bodyTop - 17, wide * 2 + 2, 37, 9);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Портреты для интерфейса: рисуем бюст героя один раз и кэшируем картинку
const cache = new Map<string, string>();
export function portrait(c: Champion, size = 96): string {
  const key = c.id + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.translate(size * 0.5, size * 1.02);
  ctx.scale(size / 44, size / 44);
  drawHero(ctx, c, { t: 0.6 });
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
