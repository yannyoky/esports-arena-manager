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

function head(ctx: CanvasRenderingContext2D, L: Look, hy: number, blink: boolean) {
  const r = 10;
  // Детали за головой
  if (L.head === 'bun') {
    circle(ctx, -4, hy - 11, 5, L.hair);
    circle(ctx, -5, hy - 12.5, 1.6, shade(L.hair, 0.3));
  }
  if (L.head === 'ears') {
    for (const s of [-1, 1]) {
      ctx.fillStyle = L.skin;
      ctx.beginPath();
      ctx.moveTo(s * 6, hy - 2);
      ctx.lineTo(s * 17, hy - 10);
      ctx.lineTo(s * 8, hy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = shade(L.skin, -0.25);
      ctx.beginPath();
      ctx.moveTo(s * 8, hy - 2);
      ctx.lineTo(s * 14, hy - 8);
      ctx.lineTo(s * 9, hy + 1);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (L.head === 'hair' || L.head === 'crown' || L.head === 'horns') {
    // волосы сзади: объём и прядь, которая колышется
    ctx.fillStyle = shade(L.hair, -0.2);
    ctx.beginPath();
    ctx.ellipse(-3, hy + 1, r + 1, r + 2, 0.2, 0, TAU);
    ctx.fill();
  }
  // лицо с объёмом: свет слева сверху
  const g = ctx.createRadialGradient(-3, hy - 4, 1, 0, hy, r + 2);
  g.addColorStop(0, shade(L.skin, 0.25));
  g.addColorStop(1, shade(L.skin, -0.18));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, hy, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUT;
  ctx.stroke();

  // Глаза смотрят по направлению движения (вправо, зеркалится снаружи)
  const eyes = (y = hy) => {
    if (blink) {
      ctx.strokeStyle = '#1b1420';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1.5, y + 1);
      ctx.lineTo(4, y + 1);
      ctx.moveTo(6, y + 1);
      ctx.lineTo(8.5, y + 1);
      ctx.stroke();
    } else {
      for (const ex of [2.8, 7.2]) {
        ctx.fillStyle = '#f7f3ea';
        ctx.beginPath();
        ctx.ellipse(ex, y, 1.9, 2.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1b1420';
        ctx.beginPath();
        ctx.ellipse(ex + 0.6, y + 0.3, 1.1, 1.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ex + 0.2, y - 0.9, 0.8, 0.8);
      }
    }
    // брови и рот
    ctx.strokeStyle = shade(L.hair, -0.3);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(1.2, y - 3.6);
    ctx.lineTo(4.2, y - 3.2);
    ctx.moveTo(5.8, y - 3.2);
    ctx.lineTo(8.6, y - 3.8);
    ctx.stroke();
    ctx.strokeStyle = shade(L.skin, -0.45);
    ctx.beginPath();
    ctx.moveTo(4, y + 5);
    ctx.quadraticCurveTo(5.8, y + 6, 7.4, y + 4.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.22)';
    ctx.beginPath();
    ctx.arc(8.4, y + 3, 1.8, 0, TAU);
    ctx.fill();
  };

  switch (L.head) {
    case 'helm': {
      const hg = ctx.createLinearGradient(-r, hy - r, r, hy + r);
      hg.addColorStop(0, shade(L.cloth, 0.45));
      hg.addColorStop(1, shade(L.cloth, -0.2));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, hy, r + 1.5, Math.PI, 0);
      ctx.lineTo(r + 1.5, hy + 5);
      ctx.lineTo(-r - 1.5, hy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#120d18';
      rr(ctx, 0.5, hy - 1.5, 10, 3, 1.2);
      ctx.fill();
      ctx.fillStyle = L.trim;
      rr(ctx, -2, hy - r - 6, 4, 9, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(-4, hy - 6, 2.4, 0, TAU);
      ctx.fill();
      return;
    }
    case 'hood':
      ctx.fillStyle = L.cloth;
      ctx.beginPath();
      ctx.arc(-1, hy - 1, r + 3, Math.PI * 0.55, Math.PI * 2.2);
      ctx.quadraticCurveTo(5, hy + 10, -2, hy + 11);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = shade(L.cloth, 0.2);
      ctx.beginPath();
      ctx.arc(-3, hy - 5, r - 2, Math.PI * 1.05, Math.PI * 1.6);
      ctx.lineTo(-3, hy - 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,6,14,0.7)';
      ctx.beginPath();
      ctx.arc(3, hy + 1, 6.5, 0, TAU);
      ctx.fill();
      glow(ctx, 5, hy, 6, L.trim, 0.6);
      ctx.fillStyle = L.trim;
      ctx.fillRect(2, hy - 0.5, 2.2, 1.8);
      ctx.fillRect(6, hy - 0.5, 2.2, 1.8);
      return;
    case 'mask':
      ctx.fillStyle = L.hair;
      ctx.beginPath();
      ctx.arc(0, hy, r + 0.5, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      eyes(hy - 1);
      ctx.fillStyle = L.trim;
      ctx.beginPath();
      ctx.moveTo(-2, hy + 2);
      ctx.lineTo(r, hy + 2);
      ctx.lineTo(r - 2, hy + 8);
      ctx.lineTo(0, hy + 9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    default: {
      eyes();
      // чёлка с бликом
      ctx.fillStyle = L.hair;
      ctx.beginPath();
      ctx.moveTo(-r - 0.5, hy + 3);
      ctx.arc(0, hy, r + 0.8, Math.PI * 0.97, Math.PI * 1.88);
      ctx.quadraticCurveTo(6, hy - 4, 2, hy - 5);
      ctx.quadraticCurveTo(-3, hy - 2, -6, hy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = shade(L.hair, 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(-1, hy - 2, r - 3, Math.PI * 1.15, Math.PI * 1.45);
      ctx.stroke();
    }
  }
  if (L.head === 'horns') {
    for (const s of [-1, 1]) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s * 5, hy - 7);
      ctx.quadraticCurveTo(s * 14, hy - 13, s * 12, hy - 21);
      ctx.stroke();
      ctx.strokeStyle = '#efe6d2';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  if (L.head === 'crown') {
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(-7, hy - 7);
    ctx.lineTo(-7, hy - 14);
    ctx.lineTo(-3.5, hy - 10.5);
    ctx.lineTo(0, hy - 16);
    ctx.lineTo(3.5, hy - 10.5);
    ctx.lineTo(7, hy - 14);
    ctx.lineTo(7, hy - 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.stroke();
    circle(ctx, 0, hy - 10, 1.6, '#ff6b8a');
  }
}

// Конечность из двух отрезков с обводкой
function limb(ctx: CanvasRenderingContext2D, pts: [number, number][], w: number, col: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = w + 2.4;
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke();
}

// Герой стоит «ногами» в точке (0,0), рост около 52 единиц
export function drawHero(ctx: CanvasRenderingContext2D, c: Champion, p: Pose) {
  const L = c.look;
  const face = p.face ?? 1;
  const ph = p.t * 11;
  const walk = p.moving ? Math.sin(ph) : 0;
  const breathe = Math.sin(p.t * 2.2) * 0.9;
  const swing = p.swing ?? 0;
  const cast = p.cast ?? 0;
  const flash = p.flash ?? 0;
  const blink = (p.t * 0.9) % 3.2 < 0.12;
  // фазы удара: замах назад, затем рывок вперёд
  const a = swing > 0 ? 1 - swing / 0.25 : 0;
  let lean = swing > 0 ? (a < 0.35 ? -(a / 0.35) * 0.14 : (1 - (a - 0.35) / 0.65) * 0.2) : 0;
  lean += walk * 0.04 + (p.moving ? 0.06 : 0) - (flash / 0.15) * 0.12;
  const lift = cast > 0 ? Math.sin((cast / 0.35) * Math.PI) * 4 : 0;
  // сжатие и растяжение при ударе
  const squash = swing > 0 && a > 0.35 && a < 0.6 ? 1.06 : 1;

  ctx.save();
  ctx.scale(face, 1);
  ctx.translate(0, -lift);
  ctx.rotate(lean);
  ctx.scale(squash, 2 - squash);

  const wide = L.body === 'heavy' ? 13.5 : L.body === 'medium' ? 11 : L.body === 'slim' ? 9.5 : 11.5;
  const bob = p.moving ? Math.abs(Math.cos(ph)) * 2 : 0;
  const bodyTop = -34 + breathe - bob;
  const hip = bodyTop + 22;

  // Аура при умении
  if (cast > 0) glow(ctx, 0, bodyTop + 10, 30 + (1 - cast / 0.35) * 14, L.trim, 0.55);

  // Плащ сзади: колышется от ходьбы и ветра
  if (L.body === 'robe' || L.body === 'slim' || L.body === 'heavy') {
    const fl = Math.sin(p.t * 3.1) * 2 + walk * 3 + (p.moving ? 4 : 0);
    const cg = ctx.createLinearGradient(0, bodyTop, 0, 0);
    cg.addColorStop(0, shade(L.cloth, -0.25));
    cg.addColorStop(1, shade(L.cloth, -0.5));
    ctx.fillStyle = L.body === 'heavy' ? shade(L.trim, -0.35) : cg;
    ctx.beginPath();
    ctx.moveTo(-wide + 2, bodyTop + 3);
    ctx.quadraticCurveTo(-wide - 8 - fl, hip - 4, -wide - 5 - fl, -1);
    ctx.lineTo(-wide - fl * 0.3, 1);
    ctx.lineTo(-2, hip);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Ноги: шаг с подъёмом стопы
  const pants = shade(L.cloth, -0.45);
  const boot = shade(L.cloth, -0.65);
  const leg = (s: number, front: boolean) => {
    const st = p.moving ? Math.sin(ph + (front ? 0 : Math.PI)) : 0;
    const fx = s + st * 5;
    const fy = -Math.max(0, Math.cos(ph + (front ? 0 : Math.PI))) * (p.moving ? 3 : 0);
    const kx = s + st * 2 + 1.5;
    const ky = hip / 2 + fy * 0.5;
    limb(ctx, [[s * 0.8, hip], [kx, ky], [fx, fy - 2]], 5, pants);
    ctx.fillStyle = boot;
    rr(ctx, fx - 3, fy - 4, 8, 4.5, 2);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  if (L.body !== 'robe') {
    leg(-3, false);
    leg(3.5, true);
  }

  // Задняя рука: качается в противофазе шагу
  const back = cast > 0 ? 2.7 : 0.25 - walk * 0.5;
  const sh: [number, number] = [-wide + 2.5, bodyTop + 5];
  const el: [number, number] = [sh[0] + Math.sin(back) * 7, sh[1] + Math.cos(back) * 7];
  const hd: [number, number] = [el[0] + Math.sin(back + 0.4) * 7, el[1] + Math.cos(back + 0.4) * 7];
  limb(ctx, [sh, el, hd], 4.6, shade(L.cloth, -0.2));
  circle(ctx, hd[0], hd[1], 2.8, shade(L.skin, -0.1));

  // Туловище с объёмом
  const tg = ctx.createLinearGradient(-wide, bodyTop, wide, hip);
  tg.addColorStop(0, shade(L.cloth, 0.28));
  tg.addColorStop(0.55, L.cloth);
  tg.addColorStop(1, shade(L.cloth, -0.3));
  ctx.fillStyle = tg;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (L.body === 'robe') {
    const hem = Math.sin(p.t * 2.6) * 1.5 + walk * 2;
    ctx.moveTo(-wide + 3, bodyTop);
    ctx.lineTo(wide - 3, bodyTop);
    ctx.quadraticCurveTo(wide + 1, hip - 6, wide + 4 + hem, 0);
    ctx.quadraticCurveTo(0, 2, -wide - 4 + hem, 0);
    ctx.quadraticCurveTo(-wide - 1, hip - 6, -wide + 3, bodyTop);
  } else if (L.body === 'heavy') {
    ctx.moveTo(-wide, bodyTop + 4);
    ctx.quadraticCurveTo(-wide - 2, hip - 2, -wide + 3, hip + 1);
    ctx.lineTo(wide - 3, hip + 1);
    ctx.quadraticCurveTo(wide + 2, hip - 2, wide, bodyTop + 4);
    ctx.quadraticCurveTo(0, bodyTop - 3, -wide, bodyTop + 4);
  } else {
    ctx.moveTo(-wide, bodyTop + 3);
    ctx.lineTo(-wide + 2.5, hip + 1);
    ctx.lineTo(wide - 2.5, hip + 1);
    ctx.lineTo(wide, bodyTop + 3);
    ctx.quadraticCurveTo(0, bodyTop - 2, -wide, bodyTop + 3);
  }
  ctx.fill();
  ctx.stroke();
  if (L.body === 'robe') {
    // складки и ноги из-под мантии
    ctx.strokeStyle = shade(L.cloth, -0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, hip - 6);
    ctx.lineTo(-5, -2);
    ctx.moveTo(4, hip - 6);
    ctx.lineTo(6, -2);
    ctx.stroke();
    ctx.fillStyle = boot;
    rr(ctx, -6 + walk * 3, -3, 6, 3.5, 1.5);
    ctx.fill();
    rr(ctx, 2 - walk * 3, -3, 6, 3.5, 1.5);
    ctx.fill();
  }
  // Воротник, пояс с пряжкой, эмблема
  ctx.fillStyle = shade(L.trim, -0.1);
  ctx.beginPath();
  ctx.moveTo(-5, bodyTop + 1);
  ctx.lineTo(0, bodyTop + 6);
  ctx.lineTo(5, bodyTop + 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(L.cloth, -0.5);
  ctx.fillRect(-wide + 1.5, hip - 6, wide * 2 - 3, 3.5);
  ctx.fillStyle = L.trim;
  rr(ctx, -2.5, hip - 6.8, 5, 5, 1.2);
  ctx.fill();
  if (L.body === 'heavy') {
    // наплечники с заклёпками
    for (const sx of [-wide + 1, wide - 1]) {
      const pg = ctx.createRadialGradient(sx - 2, bodyTop + 1, 1, sx, bodyTop + 4, 8);
      pg.addColorStop(0, shade(L.trim, 0.4));
      pg.addColorStop(1, shade(L.trim, -0.3));
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(sx, bodyTop + 4, 7, 5.5, 0, Math.PI, 0);
      ctx.lineTo(sx + 7, bodyTop + 6);
      ctx.lineTo(sx - 7, bodyTop + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      circle(ctx, sx, bodyTop + 2, 1, '#2a2230');
    }
  } else if (L.body === 'slim') {
    // шарф, развевается
    const fl = Math.sin(p.t * 4) * 2 + (p.moving ? 3 : 0);
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(-4, bodyTop + 2);
    ctx.quadraticCurveTo(-12 - fl, bodyTop + 3, -16 - fl, bodyTop + 9 + Math.sin(p.t * 5) * 1.5);
    ctx.lineTo(-12 - fl, bodyTop + 9);
    ctx.lineTo(-3, bodyTop + 5);
    ctx.closePath();
    ctx.fill();
  } else if (L.body === 'medium') {
    ctx.strokeStyle = shade(L.trim, 0.1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-wide + 2, bodyTop + 4);
    ctx.lineTo(wide - 3, hip - 7);
    ctx.stroke();
  }

  // Голова
  head(ctx, L, bodyTop - 8, blink);

  // Передняя рука с оружием: замах, удар, подъём при способности
  // ua — направление руки (0 вниз, π вверх), wr — наклон оружия
  let ua = 0.25 + walk * 0.35 + Math.sin(p.t * 2.2) * 0.04;
  let swingA = -0.35 + walk * 0.2;
  if (swing > 0) {
    if (a < 0.35) {
      const k = a / 0.35;
      ua = 0.25 + k * 2.95;
      swingA = -0.35 - k;
    } else {
      const k = (a - 0.35) / 0.65;
      ua = 3.2 - k * 2;
      swingA = -1.35 + k * 3;
    }
  } else if (cast > 0) {
    ua = 2.7;
    swingA = -0.2;
  }
  const fsh: [number, number] = [wide - 2.5, bodyTop + 5];
  const fel: [number, number] = [fsh[0] + Math.sin(ua) * 6, fsh[1] + Math.cos(ua) * 6];
  const fhd: [number, number] = [fel[0] + Math.sin(ua - 0.4) * 6, fel[1] + Math.cos(ua - 0.4) * 6];
  limb(ctx, [fsh, fel, fhd], 4.8, shade(L.cloth, 0.05));
  ctx.save();
  ctx.translate(fhd[0], fhd[1]);
  ctx.rotate(swingA);
  weapon(ctx, L, p.t, cast);
  circle(ctx, 0, 0, 3.4, L.skin);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Вспышка при получении урона
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (flash / 0.15) * 0.5;
    const fg = ctx.createRadialGradient(0, bodyTop + 6, 2, 0, bodyTop + 6, 26);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(0, bodyTop + 6, 26, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
  ctx.translate(size * 0.5, size * 1.06);
  ctx.scale(size / 50, size / 50);
  drawHero(ctx, c, { t: 0.6 });
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
