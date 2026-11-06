// Отрисовка матча на Canvas 2D. Карта рисуется один раз в отдельный холст,
// каждый кадр поверх неё рисуются только герои и эффекты. Не больше 30 кадров/с.
import { SIDE_COLORS } from './data';
import { drawHero } from './models';
import { CAMPS, LANE_PTS, OBJECTIVES, riverX } from './map';
import { CORE_HP, Creep, H, Match, Neutral, Tower, Unit, W } from './sim';
import { Rng } from './rng';

interface View {
  portrait: boolean;
  k: number; // пикселей экрана на единицу мира
  ox: number;
  oy: number;
  cw: number;
  ch: number;
}

const TAU = Math.PI * 2;

function view(cw: number, ch: number): View {
  const portrait = ch > cw * 1.05;
  const k = portrait ? Math.min(cw / H, ch / W) : Math.min(cw / W, ch / H);
  const ox = (cw - (portrait ? H : W) * k) / 2;
  const oy = (ch - (portrait ? W : H) * k) / 2;
  return { portrait, k, ox, oy, cw, ch };
}

// Мир → экран. В портретном режиме синие внизу, красные наверху.
const P = (v: View, x: number, y: number): [number, number] =>
  v.portrait ? [v.ox + y * v.k, v.oy + (W - x) * v.k] : [v.ox + x * v.k, v.oy + y * v.k];

function worldTransform(ctx: CanvasRenderingContext2D, v: View) {
  if (v.portrait) ctx.setTransform(0, -v.k, v.k, 0, v.ox, v.oy + W * v.k);
  else ctx.setTransform(v.k, 0, 0, v.k, v.ox, v.oy);
}

// ---------- Карта ----------

let mapCache: { key: string; cv: HTMLCanvasElement } | null = null;

// Линии как функции t → точка, по готовым точкам из map.ts
const LANES = LANE_PTS.map((pts) => (t: number) => pts[Math.round(Math.max(0, Math.min(1, t)) * (pts.length - 1))]);

const DECOR = (() => {
  const r = new Rng(77);
  const items: { kind: 'tree' | 'rock' | 'bush'; x: number; y: number; s: number }[] = [];
  const clear = (x: number, y: number) => {
    if (Math.hypot(x - 55, y - 300) < 170 || Math.hypot(x - 945, y - 300) < 170) return false;
    if (Math.abs(x - riverX(y)) < 50) return false;
    for (const [cx, cy] of [...CAMPS, OBJECTIVES.spirit, OBJECTIVES.colossus]) if (Math.hypot(x - cx, y - cy) < 60) return false;
    for (const lane of LANES)
      for (let t = 0; t <= 1; t += 0.04) {
        const [lx, ly] = lane(t);
        if (Math.hypot(x - lx, y - ly) < 50) return false;
      }
    return true;
  };
  let tries = 0;
  while (items.length < 46 && tries++ < 3000) {
    const x = r.range(10, 990);
    const y = r.range(10, 590);
    if (!clear(x, y)) continue;
    if (items.some((i) => Math.hypot(i.x - x, i.y - y) < 34)) continue;
    const roll = r.next();
    items.push({ kind: roll < 0.45 ? 'tree' : roll < 0.75 ? 'bush' : 'rock', x, y, s: r.range(0.8, 1.25) });
  }
  return items.sort((a, b) => a.y - b.y);
})();

function paintMap(ctx: CanvasRenderingContext2D) {
  const r = new Rng(11);
  // Земля
  const g = ctx.createRadialGradient(500, 300, 80, 500, 300, 640);
  g.addColorStop(0, '#2f4a2e');
  g.addColorStop(1, '#1d2e22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = r.next() < 0.5 ? 'rgba(120,160,90,0.10)' : 'rgba(10,20,10,0.16)';
    const s = r.range(2, 7);
    ctx.fillRect(r.range(0, W), r.range(0, H), s, s * 0.6);
  }

  // Дорожки из камня
  for (const lane of LANES) {
    ctx.strokeStyle = '#4a4538';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const [x, y] = lane(t);
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let t = 0; t <= 1; t += 0.012) {
      const [x, y] = lane(t);
      ctx.fillStyle = r.next() < 0.5 ? '#5b5546' : '#3d392f';
      ctx.beginPath();
      ctx.ellipse(x + r.range(-12, 12), y + r.range(-10, 10), r.range(4, 8), r.range(3, 6), r.range(0, 3), 0, TAU);
      ctx.fill();
    }
  }

  // Река с бродом
  ctx.fillStyle = '#1f4f63';
  ctx.beginPath();
  for (let y = 0; y <= H; y += 10) ctx.lineTo(riverX(y) - 34, y);
  for (let y = H; y >= 0; y -= 10) ctx.lineTo(riverX(y) + 34, y);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,230,0.25)';
  ctx.lineWidth = 2;
  for (const off of [-34, 34]) {
    ctx.beginPath();
    for (let y = 0; y <= H; y += 10) ctx.lineTo(riverX(y) + off, y);
    ctx.stroke();
  }
  for (const lane of LANES) {
    for (let t = 0.44; t <= 0.56; t += 0.025) {
      const [x, y] = lane(t);
      ctx.fillStyle = '#6d6858';
      ctx.beginPath();
      ctx.ellipse(x, y + r.range(-8, 8), 9, 7, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Логова лесных лагерей и ямы объектов
  for (const [cx, cy] of CAMPS) {
    ctx.fillStyle = '#243424';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 30, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (const [[cx, cy], col] of [
    [OBJECTIVES.spirit, '#2c6b6a'],
    [OBJECTIVES.colossus, '#5a5040'],
  ] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 52, 40, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Площадки баз
  [55, 945].forEach((cx, side) => {
    ctx.fillStyle = '#3b3a35';
    ctx.beginPath();
    ctx.arc(cx, 300, 135, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#57544a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = SIDE_COLORS[side];
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(cx, 300, 118, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (let a = 0; a < TAU; a += TAU / 16) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 40, 300 + Math.sin(a) * 40);
      ctx.lineTo(cx + Math.cos(a) * 132, 300 + Math.sin(a) * 132);
      ctx.stroke();
    }
  });
}

function paintDecor(ctx: CanvasRenderingContext2D, v: View) {
  // Деревья, кусты и камни рисуем вертикально в экранных координатах
  for (const d of DECOR) {
    const [x, y] = P(v, d.x, d.y);
    const s = d.s * v.k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * s, 16 * s, 6 * s, 0, 0, TAU);
    ctx.fill();
    if (d.kind === 'tree') {
      ctx.fillStyle = '#4b3424';
      ctx.fillRect(x - 3 * s, y - 14 * s, 6 * s, 16 * s);
      for (const [dx, dy, rr, c] of [
        [0, -30, 17, '#1f4a2c'],
        [-8, -22, 12, '#255a33'],
        [8, -24, 12, '#2c6638'],
        [0, -36, 10, '#3a7a44'],
      ] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
        ctx.fill();
      }
    } else if (d.kind === 'bush') {
      for (const [dx, dy, rr, c] of [
        [-6, -6, 8, '#2a5a31'],
        [6, -6, 8, '#2f6637'],
        [0, -11, 8, '#3c7c43'],
      ] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#6e6a60';
      ctx.beginPath();
      ctx.moveTo(x - 12 * s, y);
      ctx.lineTo(x - 8 * s, y - 13 * s);
      ctx.lineTo(x + 4 * s, y - 16 * s);
      ctx.lineTo(x + 12 * s, y - 4 * s);
      ctx.lineTo(x + 10 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8b867a';
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 13 * s);
      ctx.lineTo(x + 4 * s, y - 16 * s);
      ctx.lineTo(x + 2 * s, y - 8 * s);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function getMap(v: View) {
  const key = `${v.cw}x${v.ch}`;
  if (mapCache?.key === key) return mapCache.cv;
  const cv = document.createElement('canvas');
  cv.width = v.cw;
  cv.height = v.ch;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#120f17';
  ctx.fillRect(0, 0, v.cw, v.ch);
  ctx.save();
  worldTransform(ctx, v);
  paintMap(ctx);
  ctx.restore();
  paintDecor(ctx, v);
  mapCache = { key, cv };
  return cv;
}

// ---------- Кадр ----------

const TORCHES: [number, number][] = [
  [140, 200],
  [140, 400],
  [860, 200],
  [860, 400],
];

function drawCore(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, side: number, hpK: number, hit: number, t: number) {
  const [sx, sy] = P(v, x, y);
  const k = v.k;
  const col = SIDE_COLORS[side];
  const pulse = 0.6 + Math.sin(t * 2.5) * 0.15;
  const g = ctx.createRadialGradient(sx, sy - 26 * k, 0, sx, sy - 26 * k, 70 * k);
  g.addColorStop(0, col + 'aa');
  g.addColorStop(1, col + '00');
  ctx.globalAlpha = pulse * (0.4 + hpK * 0.6);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy - 26 * k, 70 * k, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Постамент
  ctx.fillStyle = '#2a2826';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 28 * k, 11 * k, 0, 0, TAU);
  ctx.fill();
  // Кристалл
  const bob = Math.sin(t * 1.6) * 2 * k;
  const top = sy - 62 * k + bob;
  ctx.fillStyle = hit > 0 ? '#ffffff' : col;
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx + 16 * k, sy - 34 * k + bob);
  ctx.lineTo(sx, sy - 8 * k + bob);
  ctx.lineTo(sx - 16 * k, sy - 34 * k + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx - 16 * k, sy - 34 * k + bob);
  ctx.lineTo(sx - 3 * k, sy - 30 * k + bob);
  ctx.closePath();
  ctx.fill();
  // Трещины по мере урона
  if (hpK < 0.75) {
    ctx.strokeStyle = 'rgba(15,10,20,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 4 * k, sy - 50 * k + bob);
    ctx.lineTo(sx + 3 * k, sy - 38 * k + bob);
    ctx.lineTo(sx - 2 * k, sy - 26 * k + bob);
    if (hpK < 0.4) {
      ctx.moveTo(sx + 8 * k, sy - 40 * k + bob);
      ctx.lineTo(sx + 2 * k, sy - 32 * k + bob);
    }
    ctx.stroke();
  }
  // Полоска прочности
  const bw = 64 * k;
  ctx.fillStyle = 'rgba(10,8,14,0.8)';
  ctx.fillRect(sx - bw / 2, sy + 16 * k, bw, 6 * k);
  ctx.fillStyle = col;
  ctx.fillRect(sx - bw / 2, sy + 16 * k, bw * Math.max(0, hpK), 6 * k);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, col: string, h = 4) {
  ctx.fillStyle = 'rgba(10,8,14,0.85)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), h);
}

function drawTower(ctx: CanvasRenderingContext2D, v: View, tw: Tower, vulnerable: boolean, sc: number) {
  const [x, y] = P(v, tw.x, tw.y);
  const col = SIDE_COLORS[tw.side];
  const k = sc;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, 20 * k, 7 * k, 0, 0, TAU);
  ctx.fill();
  if (tw.hp <= 0) {
    // Руины
    ctx.fillStyle = '#5d584e';
    for (const [dx, dy, r] of [
      [-8, -3, 6],
      [5, -5, 7],
      [0, 2, 5],
      [10, 1, 4],
    ])
      ctx.beginPath(), ctx.arc(x + dx * k, y + dy * k, r * k, 0, TAU), ctx.fill();
    return;
  }
  // Каменная башня с флагом стороны
  ctx.fillStyle = tw.flash > 0 ? '#ffffff' : '#77726a';
  ctx.beginPath();
  ctx.moveTo(x - 13 * k, y);
  ctx.lineTo(x - 10 * k, y - 46 * k);
  ctx.lineTo(x + 10 * k, y - 46 * k);
  ctx.lineTo(x + 13 * k, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8e897f';
  ctx.fillRect(x - 13 * k, y - 52 * k, 26 * k, 8 * k);
  ctx.fillStyle = '#5f5a52';
  for (let i = -1; i <= 1; i++) ctx.fillRect(x + (i * 9 - 3) * k, y - 58 * k, 6 * k, 6 * k);
  ctx.fillStyle = col;
  ctx.fillRect(x - 4 * k, y - 38 * k, 8 * k, 16 * k);
  ctx.fillStyle = vulnerable ? col : 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x, y - 66 * k, 5 * k, 0, TAU);
  ctx.fill();
  if (!vulnerable) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - 30 * k, 26 * k, 0, TAU);
    ctx.stroke();
  }
  bar(ctx, x, y - 76 * k, 34 * k, tw.hp / tw.maxHp, col, 3);
}

function drawCreep(ctx: CanvasRenderingContext2D, v: View, c: Creep, t: number, sc: number) {
  const [x, y] = P(v, c.x, c.y);
  const k = sc * 0.8;
  const col = SIDE_COLORS[c.side];
  const bob = c.moving ? Math.abs(Math.sin(t * 12 + c.y)) * 2 * k : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 9 * k, 3.5 * k, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.flash > 0 ? '#ffffff' : col;
  ctx.beginPath();
  ctx.moveTo(x - 8 * k, y - bob);
  ctx.quadraticCurveTo(x - 9 * k, y - 22 * k - bob, x, y - 24 * k - bob);
  ctx.quadraticCurveTo(x + 9 * k, y - 22 * k - bob, x + 8 * k, y - bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#15121b';
  ctx.fillRect(x + (c.face > 0 ? 0 : -5) * k, y - 16 * k - bob, 5 * k, 2.5 * k);
  if (c.swing > 0) {
    ctx.strokeStyle = '#e8e2d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + c.face * 6 * k, y - 10 * k);
    ctx.lineTo(x + c.face * 14 * k, y - 18 * k + (c.swing / 0.25) * 10 * k);
    ctx.stroke();
  }
  if (c.hp < c.maxHp) bar(ctx, x, y - 30 * k - bob, 18 * k, c.hp / c.maxHp, col, 2.5);
}

function drawNeutral(ctx: CanvasRenderingContext2D, v: View, n: Neutral, t: number, sc: number) {
  if (n.respawn > 0) return;
  const [x, y] = P(v, n.x, n.y);
  const big = n.type === 'colossus' ? 2 : n.type === 'spirit' ? 1.6 : 1;
  const k = sc * big;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, 16 * k, 6 * k, 0, 0, TAU);
  ctx.fill();
  const fl = n.flash > 0;
  if (n.type === 'camp') {
    // Лесной зверь
    ctx.fillStyle = fl ? '#fff' : '#6b4a33';
    ctx.beginPath();
    ctx.ellipse(x, y - 10 * k, 14 * k, 10 * k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fl ? '#fff' : '#7d5a3e';
    ctx.beginPath();
    ctx.arc(x + n.face * 12 * k, y - 13 * k, 7 * k, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#efe6d2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + n.face * 16 * k, y - 10 * k);
    ctx.quadraticCurveTo(x + n.face * 21 * k, y - 12 * k, x + n.face * 20 * k, y - 18 * k);
    ctx.stroke();
    ctx.fillStyle = '#1b1420';
    ctx.fillRect(x + n.face * 13 * k - 1, y - 16 * k, 2.5, 2.5);
  } else if (n.type === 'spirit') {
    // Речной дух: парящий светящийся сгусток
    const fy = y - 26 * k + Math.sin(t * 2) * 3 * k;
    const g = ctx.createRadialGradient(x, fy, 0, x, fy, 26 * k);
    g.addColorStop(0, 'rgba(127,230,212,0.8)');
    g.addColorStop(1, 'rgba(127,230,212,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, fy, 26 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fl ? '#fff' : '#bff5ea';
    ctx.beginPath();
    ctx.moveTo(x - 10 * k, fy + 4 * k);
    ctx.quadraticCurveTo(x - 12 * k, fy - 14 * k, x, fy - 16 * k);
    ctx.quadraticCurveTo(x + 12 * k, fy - 14 * k, x + 10 * k, fy + 4 * k);
    for (let i = 0; i < 4; i++) ctx.lineTo(x + (5 - i * 5) * k, fy + (i % 2 ? 4 : 10) * k + Math.sin(t * 5 + i) * 2 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d4a48';
    ctx.fillRect(x - 5 * k, fy - 6 * k, 3 * k, 3 * k);
    ctx.fillRect(x + 2 * k, fy - 6 * k, 3 * k, 3 * k);
  } else {
    // Каменный колосс
    const sw = n.swing > 0 ? (n.swing / 0.25) * 6 * k : 0;
    ctx.fillStyle = fl ? '#fff' : '#8b8272';
    ctx.fillRect(x - 9 * k, y - 10 * k, 7 * k, 10 * k);
    ctx.fillRect(x + 2 * k, y - 10 * k, 7 * k, 10 * k);
    ctx.fillStyle = fl ? '#fff' : '#9c937f';
    ctx.beginPath();
    ctx.roundRect(x - 14 * k, y - 32 * k, 28 * k, 24 * k, 5 * k);
    ctx.fill();
    ctx.fillStyle = fl ? '#fff' : '#a9a08c';
    ctx.beginPath();
    ctx.roundRect(x - 7 * k, y - 42 * k, 14 * k, 11 * k, 3 * k);
    ctx.fill();
    ctx.fillStyle = '#ffb547';
    ctx.fillRect(x - 4 * k, y - 38 * k, 3 * k, 2.5 * k);
    ctx.fillRect(x + 1 * k, y - 38 * k, 3 * k, 2.5 * k);
    ctx.fillStyle = fl ? '#fff' : '#7d7464';
    ctx.beginPath();
    ctx.arc(x - 17 * k, y - 18 * k + sw, 6 * k, 0, TAU);
    ctx.arc(x + 17 * k, y - 18 * k - sw, 6 * k, 0, TAU);
    ctx.fill();
  }
  if (n.hp < n.maxHp) bar(ctx, x, y - (n.type === 'camp' ? 28 : 50) * k, 26 * k, n.hp / n.maxHp, '#e8d28a', 3);
}

function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, p: [number, number], t: number, heroScale: number, dpr: number) {
  const [x, y] = p;
  const col = SIDE_COLORS[u.side];
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = u.hidden > 0 ? 0.35 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 * heroScale, 5.5 * heroScale, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 * heroScale, 5.5 * heroScale, 0, 0, TAU);
  ctx.stroke();
  ctx.scale(heroScale, heroScale);
  drawHero(ctx, u.champ, { t: t + u.homeY, moving: u.moving, swing: u.swing, cast: u.cast, flash: u.flash, face: u.face });
  ctx.restore();
  ctx.globalAlpha = 1;
  const bw = 34 * heroScale;
  const by = y - 60 * heroScale;
  bar(ctx, x, by, bw, u.hp / u.maxHp, u.side === 0 ? '#59e08a' : '#ff6a6a');
  if (u.shield > 0) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(x - bw / 2, by, Math.min(bw, bw * (u.shield / u.maxHp)), 1.5);
  }
  // Уровень героя
  ctx.fillStyle = col;
  ctx.fillRect(x - bw / 2 - 12, by - 3, 11, 10);
  ctx.fillStyle = '#15121b';
  ctx.font = `700 9px "Golos Text", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(u.level), x - bw / 2 - 6.5, by + 5);
  if (u.stun > 0) {
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 10 * heroScale, by - 6 + Math.sin(a) * 3, 2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.font = `600 ${Math.round(Math.max(10, 11 * dpr * 0.6))}px "Golos Text", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(245,240,230,0.9)';
  ctx.fillText(u.player.nick, x, by - 5);
}

function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function drawMatch(ctx: CanvasRenderingContext2D, m: Match, cw: number, ch: number, dpr: number) {
  const s = m.s;
  const v = view(cw, ch);
  const t = s.time;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shake = s.shake > 0 ? s.shake * 30 * v.k : 0;
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.drawImage(getMap(v), 0, 0);

  // Блики на воде
  ctx.fillStyle = 'rgba(200,240,250,0.35)';
  for (let i = 0; i < 10; i++) {
    const y = ((i * 61 + t * 22) % H + H) % H;
    const [x, yy] = P(v, riverX(y) + Math.sin(i * 7) * 18, y);
    ctx.fillRect(x, yy, 6 * v.k, 1.5 * v.k);
  }

  // Факелы у баз
  for (const [tx, ty] of TORCHES) {
    const [x, y] = P(v, tx, ty);
    const f = 0.75 + Math.sin(t * 13 + tx) * 0.12 + Math.sin(t * 7.3 + ty) * 0.1;
    const g = ctx.createRadialGradient(x, y - 20 * v.k, 0, x, y - 20 * v.k, 46 * v.k * f);
    g.addColorStop(0, 'rgba(255,180,80,0.45)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - 20 * v.k, 46 * v.k * f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a2b20';
    ctx.fillRect(x - 2 * v.k, y - 18 * v.k, 4 * v.k, 18 * v.k);
    ctx.fillStyle = '#ffc163';
    ctx.beginPath();
    ctx.ellipse(x, y - 22 * v.k, 4 * v.k, 7 * v.k * f, 0, 0, TAU);
    ctx.fill();
  }

  // Эффекты на земле
  for (const f of s.fx) {
    const a = Math.min(1, f.t / f.life * 1.6);
    const p = 1 - f.t / f.life;
    ctx.globalAlpha = a;
    const [x, y] = P(v, f.x, f.y);
    if (f.kind === 'aoe' || f.kind === 'heal' || f.kind === 'ward' || f.kind === 'slash') {
      const r = f.r! * v.k * (0.5 + p * 0.5);
      ctx.fillStyle = f.color + '30';
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3 * v.k;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (f.kind === 'slash') {
        ctx.lineWidth = 4 * v.k;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.8, r * 0.48, 0, p * 6, p * 6 + 2.4);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  for (const c of s.cores) {
    drawCore(ctx, v, c.x, c.y, c.side, c.hp / CORE_HP, c.hit, t);
    if (!m.vulnerable(c)) {
      // Пока внутренние башни целы, ядро под защитным куполом
      const [x, y] = P(v, c.x, c.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 30 * v.k, 44 * v.k, Math.PI, 0);
      ctx.stroke();
    }
  }

  // Строения, монстры, крипы и герои, отсортированные по высоте на экране
  const heroScale = Math.max(0.75, v.k * 1.25);
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const tw of s.towers) {
    const [, y] = P(v, tw.x, tw.y);
    items.push({ y, draw: () => drawTower(ctx, v, tw, m.vulnerable(tw), heroScale) });
  }
  for (const n of s.neutrals) {
    const [, y] = P(v, n.x, n.y);
    items.push({ y, draw: () => drawNeutral(ctx, v, n, t, heroScale) });
  }
  for (const c of s.creeps) {
    const [, y] = P(v, c.x, c.y);
    items.push({ y, draw: () => drawCreep(ctx, v, c, t, heroScale) });
  }
  for (const u of s.units) {
    if (u.dead > 0) continue;
    const p = P(v, u.x, u.y);
    items.push({ y: p[1], draw: () => drawUnit(ctx, u, p, t, heroScale, dpr) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // Летящие снаряды и тексты поверх героев
  for (const f of s.fx) {
    const p = 1 - f.t / f.life;
    const a: [number, number] = P(v, f.x, f.y);
    if (f.kind === 'tower') {
      const b = P(v, f.x2!, f.y2!);
      const top: [number, number] = [a[0], a[1] - 66 * heroScale];
      const k = Math.min(1, p * 1.5);
      const hx = top[0] + (b[0] - top[0]) * k;
      const hy = top[1] + (b[1] - 20 * heroScale - top[1]) * k;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      line(ctx, top, [hx, hy]);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'rubble') {
      ctx.globalAlpha = f.t / f.life;
      ctx.fillStyle = f.color;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU;
        ctx.fillRect(a[0] + Math.cos(ang) * p * 40, a[1] - 30 * heroScale + Math.sin(ang) * p * 20 + p * p * 30, 4, 4);
      }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'level') {
      ctx.globalAlpha = Math.min(1, (f.t / f.life) * 2);
      ctx.font = `400 ${Math.round(13 * Math.max(1, dpr * 0.7))}px "Russo One", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,14,0.8)';
      const ty = a[1] - 70 * heroScale - p * 20;
      ctx.strokeText(f.text!, a[0], ty);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text!, a[0], ty);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'shot' || f.kind === 'arrow' || f.kind === 'bolt' || f.kind === 'dash' || f.kind === 'hook') {
      const b = P(v, f.x2!, f.y2!);
      const lift = 26 * heroScale;
      const head: [number, number] = [a[0] + (b[0] - a[0]) * Math.min(1, p * 1.6), a[1] - lift + (b[1] - a[1]) * Math.min(1, p * 1.6)];
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = Math.min(1, (f.t / f.life) * 2);
      if (f.kind === 'dash') {
        ctx.lineWidth = 7 * heroScale;
        ctx.globalAlpha *= 0.5;
        line(ctx, [a[0], a[1] - lift], [b[0], b[1] - lift]);
      } else if (f.kind === 'hook') {
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        line(ctx, [a[0], a[1] - lift], [b[0], b[1] - lift]);
        ctx.setLineDash([]);
      } else {
        const tail: [number, number] = [head[0] - (b[0] - a[0]) * 0.12, head[1] - (b[1] - a[1]) * 0.12];
        ctx.lineWidth = f.kind === 'bolt' ? 5 : 2.5;
        line(ctx, tail, head);
        if (f.kind === 'bolt') {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(head[0], head[1], 3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'text') {
      ctx.globalAlpha = Math.min(1, (f.t / f.life) * 2);
      ctx.font = `800 ${Math.round(14 * Math.max(1, dpr * 0.7))}px "Russo One", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,14,0.8)';
      const ty = a[1] - 40 * heroScale - p * 26;
      ctx.strokeText(f.text!, a[0], ty);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text!, a[0], ty);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'death') {
      ctx.globalAlpha = f.t / f.life;
      ctx.fillStyle = '#e8f4ff';
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(a[0] + Math.cos(ang) * p * 26, a[1] - 20 * heroScale - p * 30 + Math.sin(ang) * p * 10, 2.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}
