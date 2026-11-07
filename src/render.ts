// Отрисовка матча на Canvas 2D. Карта рисуется один раз в отдельный холст,
// каждый кадр поверх неё рисуются только герои и эффекты. Не больше 30 кадров/с.
import { SIDE_COLORS } from './data';
import { drawHero } from './models';
import { CAMPS, LANE_PTS, OBJECTIVES, riverX } from './map';
import { CORE_HP, Creep, Fx, H, Match, Neutral, Tower, Unit, W } from './sim';
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

function worldTransform(ctx: CanvasRenderingContext2D, v: View, r = 1) {
  if (v.portrait) ctx.setTransform(0, -v.k * r, v.k * r, 0, v.ox * r, (v.oy + W * v.k) * r);
  else ctx.setTransform(v.k * r, 0, 0, v.k * r, v.ox * r, v.oy * r);
}

// ---------- Карта ----------

let mapCache: { key: string; cv: HTMLCanvasElement } | null = null;
const MAP_RES = 1.5;

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
  while (items.length < 60 && tries++ < 3000) {
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
  // Пятна света и тени на траве
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, W);
    const y = r.range(0, H);
    const rr = r.range(30, 80);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rr);
    const light = r.next() < 0.5;
    gg.addColorStop(0, light ? 'rgba(150,190,100,0.10)' : 'rgba(5,15,8,0.18)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // Пучки травы
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 520; i++) {
    const x = r.range(0, W);
    const y = r.range(0, H);
    ctx.strokeStyle = r.next() < 0.5 ? 'rgba(130,180,90,0.35)' : 'rgba(80,130,70,0.4)';
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 3);
    ctx.lineTo(x, y + 1);
    ctx.lineTo(x + 2, y - 3);
    ctx.stroke();
  }
  // Цветы
  const FLOWERS = ['#f2d36b', '#e88ab5', '#c9b8ff', '#ffffff'];
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = FLOWERS[r.int(0, 3)];
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(r.range(0, W), r.range(0, H), r.range(1, 1.8), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Дорожки из камня
  // Утоптанная земля по краям дорожек
  for (const lane of LANES) {
    ctx.strokeStyle = 'rgba(70,58,40,0.55)';
    ctx.lineWidth = 50;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const [x, y] = lane(t);
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
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

  // Река с бродом: берег, глубина посередине, кувшинки
  ctx.fillStyle = '#3d3a2c';
  ctx.beginPath();
  for (let y = 0; y <= H; y += 10) ctx.lineTo(riverX(y) - 40, y);
  for (let y = H; y >= 0; y -= 10) ctx.lineTo(riverX(y) + 40, y);
  ctx.fill();
  ctx.fillStyle = '#1f4f63';
  ctx.beginPath();
  for (let y = 0; y <= H; y += 10) ctx.lineTo(riverX(y) - 34, y);
  for (let y = H; y >= 0; y -= 10) ctx.lineTo(riverX(y) + 34, y);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,35,50,0.55)';
  ctx.beginPath();
  for (let y = 0; y <= H; y += 10) ctx.lineTo(riverX(y) - 14, y);
  for (let y = H; y >= 0; y -= 10) ctx.lineTo(riverX(y) + 14, y);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const y = r.range(10, H - 10);
    const x = riverX(y) + r.range(-26, 26);
    if (LANES.some((lane) => [0.46, 0.5, 0.54].some((t) => Math.hypot(lane(t)[0] - x, lane(t)[1] - y) < 40))) continue;
    ctx.fillStyle = '#3f7a45';
    ctx.beginPath();
    ctx.arc(x, y, r.range(3, 5), 0.4, TAU - 0.2);
    ctx.lineTo(x, y);
    ctx.fill();
    if (r.next() < 0.3) {
      ctx.fillStyle = '#f3b6cf';
      ctx.beginPath();
      ctx.arc(x + 1, y - 1, 1.6, 0, TAU);
      ctx.fill();
    }
  }
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
    const halo = ctx.createRadialGradient(cx, 300, 100, cx, 300, 200);
    halo.addColorStop(0, SIDE_COLORS[side] + '40');
    halo.addColorStop(1, SIDE_COLORS[side] + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, 300, 200, 0, TAU);
    ctx.fill();
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
      // блик сверху-слева
      ctx.fillStyle = 'rgba(190,230,140,0.18)';
      ctx.beginPath();
      ctx.arc(x - 5 * s, y - 38 * s, 6 * s, 0, TAU);
      ctx.fill();
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
  // карту рисуем в полтора раза крупнее, чтобы при приближении камеры она оставалась чёткой
  const cv = document.createElement('canvas');
  cv.width = Math.round(v.cw * MAP_RES);
  cv.height = Math.round(v.ch * MAP_RES);
  const ctx = cv.getContext('2d')!;
  ctx.scale(MAP_RES, MAP_RES);
  ctx.fillStyle = '#120f17';
  ctx.fillRect(0, 0, v.cw, v.ch);
  ctx.save();
  worldTransform(ctx, v, MAP_RES);
  paintMap(ctx);
  ctx.restore();
  paintDecor(ctx, v);
  // Свет сцены: тёплое пятно в центре и затемнение по краям
  const vg = ctx.createRadialGradient(v.cw / 2, v.ch / 2, Math.min(v.cw, v.ch) * 0.25, v.cw / 2, v.ch / 2, Math.max(v.cw, v.ch) * 0.75);
  vg.addColorStop(0, 'rgba(255,200,120,0.06)');
  vg.addColorStop(1, 'rgba(8,6,12,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, v.cw, v.ch);
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

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawCore(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, side: number, hpK: number, hit: number, t: number) {
  const [sx, sy] = P(v, x, y);
  const k = v.k * 1.1;
  const col = SIDE_COLORS[side];
  const pulse = 0.65 + Math.sin(t * 2.5) * 0.15;
  // сияние вокруг
  ctx.globalAlpha = pulse * (0.4 + hpK * 0.6);
  radialFill(ctx, sx, sy - 34 * k, 80 * k, col + 'aa');
  ctx.globalAlpha = 1;
  // постамент из трёх ступеней
  for (const [w, h, c] of [
    [34, 13, '#2a2622'],
    [27, 10, '#3a3530'],
    [20, 8, '#4a443c'],
  ] as const) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(sx, sy - (34 - w) * 0.5 * k, w * k, h * k, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 7 * k, 20 * k, 8 * k, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // вращающиеся кольца рун
  const bob = Math.sin(t * 1.6) * 2.5 * k;
  const cy = sy - 44 * k + bob;
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = i ? col : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(sx, cy, (24 + i * 6) * k, (7 + i * 2) * k, (i ? -1 : 1) * 0.25, t * (i ? -1.2 : 1.5), t * (i ? -1.2 : 1.5) + 4.2);
    ctx.stroke();
  }
  // кристалл с гранями
  const top = cy - 26 * k;
  const bot = cy + 24 * k;
  const w = 17 * k;
  ctx.fillStyle = hit > 0 ? '#ffffff' : shadeHex(col, -0.25);
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx + w, cy - 4 * k);
  ctx.lineTo(sx, bot);
  ctx.lineTo(sx - w, cy - 4 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hit > 0 ? '#ffffff' : col;
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx + w, cy - 4 * k);
  ctx.lineTo(sx + 2 * k, cy + 2 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx - w, cy - 4 * k);
  ctx.lineTo(sx - 4 * k, cy - 2 * k);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,14,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx + w, cy - 4 * k);
  ctx.lineTo(sx, bot);
  ctx.lineTo(sx - w, cy - 4 * k);
  ctx.closePath();
  ctx.stroke();
  radialFill(ctx, sx, cy - 6 * k, 9 * k, 'rgba(255,255,255,0.8)');
  // трещины по мере урона
  if (hpK < 0.75) {
    ctx.strokeStyle = 'rgba(15,10,20,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx - 4 * k, cy - 16 * k);
    ctx.lineTo(sx + 3 * k, cy - 4 * k);
    ctx.lineTo(sx - 2 * k, cy + 10 * k);
    if (hpK < 0.4) {
      ctx.moveTo(sx + 9 * k, cy - 6 * k);
      ctx.lineTo(sx + 2 * k, cy + 2 * k);
      ctx.moveTo(sx - 10 * k, cy - 4 * k);
      ctx.lineTo(sx - 4 * k, cy + 4 * k);
    }
    ctx.stroke();
  }
  // осколки-спутники
  for (let i = 0; i < 3; i++) {
    const a = t * 0.9 + (i * TAU) / 3;
    const ox = sx + Math.cos(a) * 30 * k;
    const oy = cy + Math.sin(a) * 9 * k - 6 * k;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 4 * k);
    ctx.lineTo(ox + 2.5 * k, oy);
    ctx.lineTo(ox, oy + 4 * k);
    ctx.lineTo(ox - 2.5 * k, oy);
    ctx.fill();
  }
  const bw = 64 * v.k;
  ctx.fillStyle = 'rgba(10,8,14,0.8)';
  ctx.fillRect(sx - bw / 2, sy + 16 * v.k, bw, 6 * v.k);
  ctx.fillStyle = col;
  ctx.fillRect(sx - bw / 2, sy + 16 * v.k, bw * Math.max(0, hpK), 6 * v.k);
}

function radialFill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.1, r));
  g.addColorStop(0, inner);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fill();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, col: string, h = 4) {
  ctx.fillStyle = 'rgba(10,8,14,0.85)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), h);
}

function drawTower(ctx: CanvasRenderingContext2D, v: View, tw: Tower, vulnerable: boolean, sc: number, t: number) {
  const [x, y] = P(v, tw.x, tw.y);
  const col = SIDE_COLORS[tw.side];
  const k = sc;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(x + 4 * k, y + 1 * k, 22 * k, 8 * k, 0, 0, TAU);
  ctx.fill();
  if (tw.hp <= 0) {
    // руины: обломки и сломанный пень башни
    ctx.fillStyle = '#5d584e';
    ctx.beginPath();
    ctx.moveTo(x - 12 * k, y);
    ctx.lineTo(x - 10 * k, y - 14 * k);
    ctx.lineTo(x - 3 * k, y - 9 * k);
    ctx.lineTo(x + 2 * k, y - 17 * k);
    ctx.lineTo(x + 10 * k, y - 10 * k);
    ctx.lineTo(x + 12 * k, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#77726a';
    for (const [dx, dy, r] of [
      [-16, 1, 4],
      [15, 2, 5],
      [8, 4, 3],
      [-6, 5, 3],
    ])
      ctx.beginPath(), ctx.arc(x + dx * k, y + dy * k, r * k, 0, TAU), ctx.fill();
    return;
  }
  const fl = tw.flash > 0;
  const hpK = tw.hp / tw.maxHp;
  // основание и ствол из камня с градиентом
  const g = ctx.createLinearGradient(x - 14 * k, 0, x + 14 * k, 0);
  g.addColorStop(0, fl ? '#fff' : '#9a958a');
  g.addColorStop(0.5, fl ? '#fff' : '#7d786e');
  g.addColorStop(1, fl ? '#fff' : '#57534b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 15 * k, y);
  ctx.lineTo(x - 11 * k, y - 48 * k);
  ctx.lineTo(x + 11 * k, y - 48 * k);
  ctx.lineTo(x + 15 * k, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(14,10,20,0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // кладка
  ctx.strokeStyle = 'rgba(30,26,22,0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const yy = y - i * 8 * k;
    const half = 15 - i * 0.7;
    ctx.beginPath();
    ctx.moveTo(x - half * k, yy);
    ctx.lineTo(x + half * k, yy);
    for (let j = -1; j <= 1; j++) {
      const bx = x + (j * 7 + (i % 2) * 3.5) * k;
      ctx.moveTo(bx, yy);
      ctx.lineTo(bx, yy + 8 * k);
    }
    ctx.stroke();
  }
  // флаг команды
  const wave = Math.sin(t * 4 + tw.x) * 2 * k;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - 5 * k, y - 40 * k);
  ctx.lineTo(x + 5 * k, y - 40 * k);
  ctx.lineTo(x + 5 * k + wave * 0.3, y - 20 * k);
  ctx.lineTo(x + wave * 0.3, y - 25 * k);
  ctx.lineTo(x - 5 * k + wave * 0.3, y - 20 * k);
  ctx.closePath();
  ctx.fill();
  // площадка с зубцами
  ctx.fillStyle = fl ? '#fff' : '#8e897f';
  ctx.fillRect(x - 15 * k, y - 54 * k, 30 * k, 8 * k);
  ctx.fillStyle = fl ? '#fff' : '#6a655c';
  for (let i = -1; i <= 1; i++) ctx.fillRect(x + (i * 10 - 3.5) * k, y - 61 * k, 7 * k, 7 * k);
  // кристалл-пушка: светится, если башню можно атаковать
  const cy = y - 72 * k + Math.sin(t * 2 + tw.x) * 1.5 * k;
  radialFill(ctx, x, cy, 16 * k, (vulnerable ? col : '#ffffff') + '88');
  ctx.fillStyle = vulnerable ? col : '#d8d4cc';
  ctx.beginPath();
  ctx.moveTo(x, cy - 8 * k);
  ctx.lineTo(x + 5 * k, cy);
  ctx.lineTo(x, cy + 8 * k);
  ctx.lineTo(x - 5 * k, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(x, cy - 8 * k);
  ctx.lineTo(x - 5 * k, cy);
  ctx.lineTo(x - 1 * k, cy);
  ctx.closePath();
  ctx.fill();
  // трещины от урона
  if (hpK < 0.6) {
    ctx.strokeStyle = 'rgba(20,14,10,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 6 * k, y - 44 * k);
    ctx.lineTo(x - 2 * k, y - 34 * k);
    ctx.lineTo(x - 7 * k, y - 26 * k);
    if (hpK < 0.3) {
      ctx.moveTo(x + 8 * k, y - 16 * k);
      ctx.lineTo(x + 3 * k, y - 8 * k);
    }
    ctx.stroke();
  }
  if (!vulnerable) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y - 32 * k, 28 * k, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  bar(ctx, x, y - 86 * k, 34 * k, hpK, col, 3);
}

// Крипы: маленькие солдаты, у каждого третьего лук
function drawCreep(ctx: CanvasRenderingContext2D, v: View, c: Creep, t: number, sc: number) {
  const [x, y] = P(v, c.x, c.y);
  const k = sc * 0.78;
  const col = SIDE_COLORS[c.side];
  const ph = t * 12 + c.y;
  const bob = c.moving ? Math.abs(Math.sin(ph)) * 1.8 * k : 0;
  const archer = Math.round(c.y) % 3 === 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 8 * k, 3 * k, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(c.face, 1);
  const fl = c.flash > 0;
  // ноги
  const st = c.moving ? Math.sin(ph) * 3 * k : 0;
  ctx.strokeStyle = '#2a2430';
  ctx.lineWidth = 2.6 * k;
  ctx.lineCap = 'round';
  line(ctx, [-2 * k, -7 * k], [-2 * k + st, 0]);
  line(ctx, [2 * k, -7 * k], [2 * k - st, 0]);
  // туловище
  ctx.fillStyle = fl ? '#fff' : col;
  ctx.beginPath();
  ctx.roundRect(-5 * k, -16 * k, 10 * k, 10 * k, 3 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14,10,20,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // голова в шлеме
  ctx.fillStyle = fl ? '#fff' : '#b9b3a8';
  ctx.beginPath();
  ctx.arc(0, -20 * k, 5 * k, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#15121b';
  ctx.fillRect(0.5 * k, -21 * k, 4 * k, 1.6 * k);
  // оружие
  const sw = c.swing > 0 ? c.swing / 0.25 : 0;
  if (archer) {
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(4 * k, -12 * k, 6 * k, -1.2, 1.2);
    ctx.stroke();
  } else {
    ctx.save();
    ctx.translate(5 * k, -11 * k);
    ctx.rotate(-0.6 + sw * 1.6);
    ctx.fillStyle = '#dfe3e8';
    ctx.fillRect(-1 * k, -10 * k, 2 * k, 10 * k);
    ctx.restore();
    ctx.fillStyle = shadeHex(col, -0.35);
    ctx.beginPath();
    ctx.arc(-5 * k, -11 * k, 4 * k, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
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
  const f = n.face;
  if (n.type === 'camp') {
    // Лесной кабан: щетина, клыки, дыхание
    const br = Math.sin(t * 3 + n.homeX) * 0.6 * k;
    const sw = n.swing > 0 ? (n.swing / 0.25) * 4 * k : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    ctx.fillStyle = '#3c2a1e';
    for (const lx of [-8, -3, 4, 9]) ctx.fillRect(lx * k, -6 * k, 3 * k, 6 * k);
    const g = ctx.createLinearGradient(0, -22 * k, 0, -2 * k);
    g.addColorStop(0, fl ? '#fff' : '#8a6446');
    g.addColorStop(1, fl ? '#fff' : '#5b3f2b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -11 * k - br, 14 * k, 9 * k + br, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(14,10,20,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // щетина по хребту
    ctx.fillStyle = '#3a271b';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo((-8 + i * 4) * k, -18 * k - br);
      ctx.lineTo((-6 + i * 4) * k, -23 * k - br);
      ctx.lineTo((-4 + i * 4) * k, -18 * k - br);
      ctx.fill();
    }
    // голова
    ctx.fillStyle = fl ? '#fff' : '#7d5a3e';
    ctx.beginPath();
    ctx.ellipse(13 * k + sw, -12 * k, 7 * k, 6 * k, 0.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9a28a';
    ctx.beginPath();
    ctx.ellipse(19 * k + sw, -11 * k, 3 * k, 2.6 * k, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f2ead8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(17 * k + sw, -9 * k);
    ctx.quadraticCurveTo(21 * k + sw, -9 * k, 21 * k + sw, -15 * k);
    ctx.stroke();
    ctx.fillStyle = '#ff6b3c';
    ctx.fillRect(13 * k + sw, -15 * k, 2.2 * k, 2.2 * k);
    ctx.restore();
  } else if (n.type === 'spirit') {
    // Речной дух: светящееся создание с хвостом из капель
    const fy = y - 28 * k + Math.sin(t * 2) * 3 * k;
    radialFill(ctx, x, fy, 34 * k, 'rgba(127,230,212,0.75)');
    for (let i = 0; i < 6; i++) {
      const a = t * 1.5 + i;
      ctx.fillStyle = 'rgba(190,250,240,0.8)';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 18 * k, fy + 12 * k + Math.sin(a * 1.3) * 5 * k + i, 1.8 * k, 0, TAU);
      ctx.fill();
    }
    const bg = ctx.createRadialGradient(x - 3 * k, fy - 8 * k, 1, x, fy, 16 * k);
    bg.addColorStop(0, fl ? '#fff' : '#f0fffb');
    bg.addColorStop(1, fl ? '#fff' : '#7fe6d4');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(x - 11 * k, fy + 4 * k);
    ctx.quadraticCurveTo(x - 13 * k, fy - 15 * k, x, fy - 17 * k);
    ctx.quadraticCurveTo(x + 13 * k, fy - 15 * k, x + 11 * k, fy + 4 * k);
    for (let i = 0; i < 5; i++) ctx.lineTo(x + (8 - i * 4) * k, fy + (i % 2 ? 5 : 12) * k + Math.sin(t * 5 + i) * 2 * k);
    ctx.closePath();
    ctx.fill();
    // уши-плавники
    ctx.fillStyle = '#5fcab8';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 7 * k, fy - 12 * k);
      ctx.quadraticCurveTo(x + s * 16 * k, fy - 22 * k + Math.sin(t * 4) * 2 * k, x + s * 12 * k, fy - 8 * k);
      ctx.fill();
    }
    ctx.fillStyle = '#16403d';
    ctx.beginPath();
    ctx.ellipse(x - 4 * k, fy - 6 * k, 2 * k, 2.6 * k, 0, 0, TAU);
    ctx.ellipse(x + 4 * k, fy - 6 * k, 2 * k, 2.6 * k, 0, 0, TAU);
    ctx.fill();
  } else {
    // Каменный колосс: плиты, мох, светящиеся руны
    const sw = n.swing > 0 ? (n.swing / 0.25) * 8 * k : 0;
    const br = Math.sin(t * 1.4) * 0.8 * k;
    const stone = (c: string) => (fl ? '#fff' : c);
    ctx.fillStyle = stone('#6f6758');
    ctx.fillRect(x - 10 * k, y - 11 * k, 8 * k, 11 * k);
    ctx.fillRect(x + 2 * k, y - 11 * k, 8 * k, 11 * k);
    const g = ctx.createLinearGradient(x - 16 * k, 0, x + 16 * k, 0);
    g.addColorStop(0, stone('#b2a994'));
    g.addColorStop(1, stone('#7d7464'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - 16 * k, y - 34 * k - br, 32 * k, 25 * k, 6 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(14,10,20,0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,130,60,0.8)';
    ctx.beginPath();
    ctx.ellipse(x - 6 * k, y - 33 * k - br, 9 * k, 3 * k, 0, Math.PI, 0);
    ctx.fill();
    // руны на груди
    ctx.strokeStyle = `rgba(255,190,90,${0.6 + Math.sin(t * 3) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 5 * k, y - 26 * k - br);
    ctx.lineTo(x, y - 18 * k - br);
    ctx.lineTo(x + 5 * k, y - 26 * k - br);
    ctx.moveTo(x, y - 18 * k - br);
    ctx.lineTo(x, y - 13 * k - br);
    ctx.stroke();
    // голова
    ctx.fillStyle = stone('#a9a08c');
    ctx.beginPath();
    ctx.roundRect(x - 8 * k, y - 45 * k - br, 16 * k, 12 * k, 3 * k);
    ctx.fill();
    ctx.stroke();
    radialFill(ctx, x, y - 40 * k - br, 9 * k, 'rgba(255,181,71,0.6)');
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(x - 5 * k, y - 41 * k - br, 3.5 * k, 2.5 * k);
    ctx.fillRect(x + 1.5 * k, y - 41 * k - br, 3.5 * k, 2.5 * k);
    // кулаки
    ctx.fillStyle = stone('#8b8272');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(x + s * 17 * k - 6 * k, y - 22 * k + s * sw - br, 12 * k, 12 * k, 3 * k);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (n.hp < n.maxHp) bar(ctx, x, y - (n.type === 'camp' ? 30 : 52) * k, 26 * k, n.hp / n.maxHp, '#e8d28a', 3);
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
  // пыль из-под ног при ходьбе
  if (u.moving) {
    ctx.fillStyle = 'rgba(200,185,150,0.35)';
    for (let i = 0; i < 2; i++) {
      const ph = (t * 3 + i * 0.5 + u.homeY) % 1;
      ctx.globalAlpha = (1 - ph) * (u.hidden > 0 ? 0.35 : 1);
      ctx.beginPath();
      ctx.arc(-u.face * (6 + ph * 10) * heroScale, -ph * 4 * heroScale, (2 + ph * 3) * heroScale, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = u.hidden > 0 ? 0.35 : 1;
  }
  // след удара
  if (u.swing > 0) {
    const k = u.swing / 0.25;
    ctx.strokeStyle = `rgba(255,245,220,${0.6 * k})`;
    ctx.lineWidth = 3 * heroScale;
    ctx.beginPath();
    ctx.ellipse(u.face * 10 * heroScale, -22 * heroScale, 18 * heroScale, 12 * heroScale, 0, u.face > 0 ? -1.4 : Math.PI - 0.6, u.face > 0 ? 0.6 : Math.PI + 1.4);
    ctx.stroke();
  }
  // применение умения: вспышка под ногами
  if (u.cast > 0) {
    const k = u.cast / 0.35;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 34 * heroScale);
    g.addColorStop(0, `rgba(255,230,160,${0.55 * k})`);
    g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * heroScale, 14 * heroScale, 0, 0, TAU);
    ctx.fill();
  }
  // мало здоровья: красная пульсация
  if (u.hp < u.maxHp * 0.25) {
    ctx.strokeStyle = `rgba(255,70,70,${0.35 + Math.sin(t * 9) * 0.25})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * heroScale, 7.5 * heroScale, 0, 0, TAU);
    ctx.stroke();
  }
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


// ---------- Эффекты умений: у каждого свой рисунок ----------

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.1, r));
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fill();
}

function groundRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, w: number) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU);
  ctx.stroke();
}

function drawAbility(ctx: CanvasRenderingContext2D, v: View, f: Fx, hs: number, t: number) {
  const p = 1 - f.t / f.life; // 0 → 1
  const k = f.t / f.life; // 1 → 0
  const [x, y] = P(v, f.x, f.y);
  const [x2, y2] = f.x2 !== undefined ? P(v, f.x2, f.y2!) : [x, y];
  const R = (f.r ?? 60) * v.k;
  const up = 24 * hs;
  ctx.save();
  switch (f.ab) {
    case 'bulwark': {
      // золотой купол и ударная волна
      ctx.globalAlpha = k;
      groundRing(ctx, x, y, R * (0.4 + p * 0.8), f.color, 4 * hs * k);
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(x, y - 4 * hs, 26 * hs, 34 * hs, 0, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - 4 * hs, 26 * hs, 34 * hs, 0, Math.PI, 0);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i + 0.5) * (Math.PI / 5);
        ctx.beginPath();
        ctx.moveTo(x, y - 4 * hs);
        ctx.lineTo(x + Math.cos(a) * 26 * hs, y - 4 * hs + Math.sin(a) * 34 * hs);
        ctx.stroke();
      }
      break;
    }
    case 'hook': {
      // цепь с крюком: летит к цели и возвращается
      const reach = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2;
      const hx = x + (x2 - x) * reach;
      const hy = y - up + (y2 - y) * reach;
      ctx.strokeStyle = '#9aa0a8';
      ctx.lineWidth = 2;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        const cx = x + (hx - x) * q;
        const cy = y - up + (hy - (y - up)) * q;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3, 2, Math.atan2(hy - y, hx - x) + (i % 2) * 1.57, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = '#e8ecf0';
      ctx.lineWidth = 3;
      const ang = Math.atan2(hy - (y - up), hx - x);
      ctx.beginPath();
      ctx.arc(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4, 6 * hs, ang - 1.8, ang + 1.2);
      ctx.stroke();
      break;
    }
    case 'whirl': {
      // три лезвия вращаются вокруг героя
      ctx.globalAlpha = k;
      groundRing(ctx, x, y, R, f.color + '88', 2);
      for (let i = 0; i < 3; i++) {
        const a0 = p * 9 + (i * TAU) / 3;
        ctx.strokeStyle = i === 0 ? '#ffffff' : f.color;
        ctx.lineWidth = (5 - i) * hs;
        ctx.beginPath();
        ctx.ellipse(x, y - 14 * hs, R * 0.85, R * 0.4, 0, a0, a0 + 1.6);
        ctx.stroke();
      }
      break;
    }
    case 'leap': {
      if (f.kind === 'dash') {
        // дуга прыжка с остаточными силуэтами
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * hs;
        ctx.globalAlpha = k * 0.8;
        const mx = (x + x2) / 2;
        const my = Math.min(y, y2) - 70 * hs;
        ctx.beginPath();
        ctx.moveTo(x, y - up);
        ctx.quadraticCurveTo(mx, my, x2, y2 - up);
        ctx.stroke();
        for (let i = 1; i <= 3; i++) {
          const q = i / 4;
          const bx = (1 - q) * (1 - q) * x + 2 * (1 - q) * q * mx + q * q * x2;
          const by = (1 - q) * (1 - q) * (y - up) + 2 * (1 - q) * q * my + q * q * (y2 - up);
          ctx.globalAlpha = k * 0.3 * q;
          radial(ctx, bx, by, 14 * hs, f.color);
        }
      } else {
        // приземление: трещины и пыль
        ctx.globalAlpha = k;
        ctx.strokeStyle = 'rgba(30,22,16,0.8)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.22);
          ctx.lineTo(x + Math.cos(a + 0.2) * R * 0.8, y + Math.sin(a + 0.2) * R * 0.36);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(210,190,150,0.5)';
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * R * p, y + Math.sin(a) * R * 0.45 * p - p * 10, (6 - p * 3) * hs, 0, TAU);
          ctx.fill();
        }
        groundRing(ctx, x, y, R * (0.3 + p * 0.9), f.color, 3 * k);
      }
      break;
    }
    case 'pierce': {
      // мощный луч: светлое ядро, цветной ореол, вспышка на цели
      ctx.globalAlpha = k;
      ctx.lineCap = 'round';
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 12 * hs * k;
      line(ctx, [x, y - up], [x2, y2 - up]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * hs * k;
      line(ctx, [x, y - up], [x2, y2 - up]);
      radial(ctx, x2, y2 - up, 26 * hs * (0.6 + p), '#ffffff');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + p * 2;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x2 + Math.cos(a) * 8 * hs, y2 - up + Math.sin(a) * 8 * hs);
        ctx.lineTo(x2 + Math.cos(a) * (14 + p * 18) * hs, y2 - up + Math.sin(a) * (14 + p * 18) * hs);
        ctx.stroke();
      }
      break;
    }
    case 'volley': {
      // стрелы летят по дуге
      const q = Math.min(1, p * 1.4);
      const mx = (x + x2) / 2;
      const my = Math.min(y, y2) - 50 * hs;
      const bx = (1 - q) * (1 - q) * x + 2 * (1 - q) * q * mx + q * q * x2;
      const by = (1 - q) * (1 - q) * (y - up) + 2 * (1 - q) * q * my + q * q * (y2 - 10 * hs);
      const dx = 2 * (1 - q) * (mx - x) + 2 * q * (x2 - mx);
      const dy = 2 * (1 - q) * (my - (y - up)) + 2 * q * (y2 - 10 * hs - my);
      const a = Math.atan2(dy, dx);
      ctx.translate(bx, by);
      ctx.rotate(a);
      ctx.strokeStyle = '#d8c8a8';
      ctx.lineWidth = 2;
      line(ctx, [-12 * hs, 0], [6 * hs, 0]);
      ctx.fillStyle = '#e8ecf0';
      ctx.beginPath();
      ctx.moveTo(9 * hs, 0);
      ctx.lineTo(4 * hs, -3 * hs);
      ctx.lineTo(4 * hs, 3 * hs);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillRect(-13 * hs, -2.5 * hs, 4 * hs, 5 * hs);
      break;
    }
    case 'fireball': {
      // метеор падает с неба, затем взрыв с языками пламени
      if (p < 0.3) {
        const q = p / 0.3;
        const fx = x + (1 - q) * 60 * hs;
        const fy = y - up - (1 - q) * 120 * hs;
        ctx.strokeStyle = 'rgba(255,140,60,0.6)';
        ctx.lineWidth = 8 * hs;
        ctx.lineCap = 'round';
        line(ctx, [fx + 30 * hs, fy - 60 * hs], [fx, fy]);
        radial(ctx, fx, fy, 16 * hs, '#fff1c2', 'rgba(255,120,40,0)');
      } else {
        const q = (p - 0.3) / 0.7;
        ctx.globalAlpha = 1 - q;
        radial(ctx, x, y - 8 * hs, R * (0.5 + q * 0.6), 'rgba(255,240,180,0.95)', 'rgba(255,90,30,0)');
        ctx.fillStyle = '#ff7a2a';
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + i;
          const r = R * (0.25 + q * 0.7);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45 - q * 26 * hs, (7 - q * 5) * hs, 0, TAU);
          ctx.fill();
        }
        groundRing(ctx, x, y, R * (0.4 + q * 0.8), 'rgba(60,30,20,0.7)', 3);
      }
      break;
    }
    case 'frost': {
      // ледяные шипы вырастают из земли кольцом
      ctx.globalAlpha = Math.min(1, k * 1.6);
      groundRing(ctx, x, y, R, '#d6f3ff', 2);
      radial(ctx, x, y, R * 0.9, 'rgba(170,225,255,0.35)', 'rgba(170,225,255,0)');
      const grow = Math.min(1, p * 4);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.2;
        const sx = x + Math.cos(a) * R * 0.6;
        const sy = y + Math.sin(a) * R * 0.27;
        const h = (16 + (i % 3) * 7) * hs * grow;
        ctx.fillStyle = i % 2 ? '#bfe9ff' : '#e9f8ff';
        ctx.beginPath();
        ctx.moveTo(sx - 4 * hs, sy);
        ctx.lineTo(sx + (i % 2 ? 2 : -2) * hs, sy - h);
        ctx.lineTo(sx + 4 * hs, sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,140,190,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) {
        const a = i * 2.3;
        ctx.fillRect(x + Math.cos(a) * R * 0.8 * ((i * 0.37) % 1), y - 40 * hs * p - (i % 4) * 6 + Math.sin(a) * 10, 2, 2);
      }
      break;
    }
    case 'mend': {
      // зелёные кресты и листья поднимаются вверх
      ctx.globalAlpha = k;
      groundRing(ctx, x, y, R * (0.5 + p * 0.5), '#8dffb0', 2.5);
      radial(ctx, x, y, R * 0.7, 'rgba(120,255,170,0.22)', 'rgba(120,255,170,0)');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const cx = x + Math.cos(a) * R * 0.55;
        const cy = y + Math.sin(a) * R * 0.25 - p * 50 * hs - (i % 3) * 8;
        ctx.fillStyle = i % 2 ? '#b8ffcc' : '#5fe08a';
        const s = 3 * hs;
        ctx.fillRect(cx - s / 2, cy - s * 1.5, s, s * 3);
        ctx.fillRect(cx - s * 1.5, cy - s / 2, s * 3, s);
      }
      break;
    }
    case 'ward': {
      // золотой столб и вращающееся кольцо рун
      ctx.globalAlpha = k;
      const g = ctx.createLinearGradient(0, y - 120 * hs, 0, y);
      g.addColorStop(0, 'rgba(255,230,140,0)');
      g.addColorStop(1, 'rgba(255,230,140,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 16 * hs, y - 120 * hs, 32 * hs, 120 * hs);
      groundRing(ctx, x, y, R * 0.6, '#ffe08a', 2);
      ctx.fillStyle = '#fff3c4';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + t * 3;
        ctx.save();
        ctx.translate(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.27 - 4);
        ctx.rotate(a);
        ctx.fillRect(-2.5, -4, 5, 8);
        ctx.restore();
      }
      break;
    }
    case 'dash':
    case 'vanish': {
      // остаточные силуэты и линии скорости
      for (let i = 0; i < 4; i++) {
        const q = i / 4;
        ctx.globalAlpha = k * (0.15 + q * 0.3);
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.ellipse(x + (x2 - x) * q, y + (y2 - y) * q - up, 8 * hs, 16 * hs, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) line(ctx, [x, y - up + i * 6 * hs], [x + (x2 - x) * 0.9, y2 - up + i * 6 * hs]);
      if (f.ab === 'vanish') {
        ctx.fillStyle = 'rgba(120,90,160,0.55)';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * (8 + p * 18) * hs, y - 14 * hs + Math.sin(a) * (6 + p * 10) * hs - p * 10, (8 - p * 4) * hs, 0, TAU);
          ctx.fill();
        }
      }
      // удар по цели
      if (p > 0.5) {
        ctx.globalAlpha = (1 - p) * 2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        line(ctx, [x2 - 12 * hs, y2 - up - 12 * hs], [x2 + 12 * hs, y2 - up + 12 * hs]);
        line(ctx, [x2 + 12 * hs, y2 - up - 12 * hs], [x2 - 12 * hs, y2 - up + 12 * hs]);
      }
      break;
    }
  }
  ctx.restore();
}

// ---------- Камера: плавно приближается к драке и следует за действием ----------

interface Cam {
  x: number;
  y: number;
  z: number;
}
const cams = new WeakMap<Match, Cam>();

function updateCam(m: Match, v: View, auto: boolean): Cam {
  const full = { x: v.cw / 2, y: v.ch / 2, z: 1 };
  let cam = cams.get(m);
  if (!cam) {
    cam = { ...full };
    cams.set(m, cam);
  }
  let target = full;
  if (auto) {
    const alive = m.s.units.filter((u) => u.dead <= 0);
    const hot = alive.filter((u) => u.calm < 1.5);
    const group = hot.length >= 2 ? hot : alive;
    if (group.length) {
      const pts = group.map((u) => P(v, u.x, u.y));
      const minX = Math.min(...pts.map((p) => p[0]));
      const maxX = Math.max(...pts.map((p) => p[0]));
      const minY = Math.min(...pts.map((p) => p[1]));
      const maxY = Math.max(...pts.map((p) => p[1]));
      const pad = 120 * v.k;
      const z = Math.max(1, Math.min(1.7, Math.min(v.cw / (maxX - minX + pad * 2), v.ch / (maxY - minY + pad * 2))));
      target = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 - 20 * v.k, z: hot.length >= 2 ? z : Math.min(z, 1.25) };
    }
  }
  cam.z += (target.z - cam.z) * 0.05;
  cam.x += (target.x - cam.x) * 0.08;
  cam.y += (target.y - cam.y) * 0.08;
  // не показываем пустоту за краем карты
  const hw = v.cw / 2 / cam.z;
  const hh = v.ch / 2 / cam.z;
  cam.x = Math.max(hw, Math.min(v.cw - hw, cam.x));
  cam.y = Math.max(hh, Math.min(v.ch - hh, cam.y));
  return cam;
}

export function drawMatch(ctx: CanvasRenderingContext2D, m: Match, cw: number, ch: number, dpr: number, autoCam = false) {
  const s = m.s;
  const v = view(cw, ch);
  const t = s.time;
  const cam = updateCam(m, v, autoCam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120f17';
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(cam.z, 0, 0, cam.z, cw / 2 - cam.z * cam.x, ch / 2 - cam.z * cam.y);
  const shake = s.shake > 0 ? s.shake * 30 * v.k : 0;
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.drawImage(getMap(v), 0, 0, cw, ch);

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

  // Светлячки и пыльца над картой: живой фон без лишней нагрузки
  for (let i = 0; i < 18; i++) {
    const wx = (i * 137 + Math.sin(t * 0.3 + i) * 40 + 1000) % 1000;
    const wy = (i * 89 + Math.cos(t * 0.25 + i * 2) * 30 + 600) % 600;
    const [x, y] = P(v, wx, wy);
    const a = 0.25 + 0.25 * Math.sin(t * 2 + i * 1.7);
    ctx.fillStyle = `rgba(255,230,150,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * Math.max(1, v.k), 0, TAU);
    ctx.fill();
  }

  // Эффекты на земле
  for (const f of s.fx) {
    if (f.ab) continue;
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
    items.push({ y, draw: () => drawTower(ctx, v, tw, m.vulnerable(tw), heroScale, t) });
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
    if (f.ab) {
      drawAbility(ctx, v, f, heroScale, t);
      continue;
    }
    const p = 1 - f.t / f.life;
    const a: [number, number] = P(v, f.x, f.y);
    if (f.kind === 'tower') {
      const b = P(v, f.x2!, f.y2!);
      const top: [number, number] = [a[0], a[1] - 72 * heroScale];
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
      // кольцо по земле, искры и душа, улетающая вверх
      const k = f.t / f.life;
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3 * heroScale * k;
      ctx.beginPath();
      ctx.ellipse(a[0], a[1], 10 + p * 46 * heroScale, (10 + p * 46 * heroScale) * 0.45, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = f.color;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU + i;
        const r = p * (22 + (i % 3) * 10) * heroScale;
        ctx.beginPath();
        ctx.arc(a[0] + Math.cos(ang) * r, a[1] - 22 * heroScale + Math.sin(ang) * r * 0.6 + p * p * 18, 2.6 * k + 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = k * 0.7;
      const g = ctx.createRadialGradient(a[0], a[1] - 30 * heroScale - p * 50, 0, a[0], a[1] - 30 * heroScale - p * 50, 14 * heroScale);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(a[0], a[1] - 30 * heroScale - p * 50, 14 * heroScale, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'spark') {
      // искры от удара
      const k = f.t / f.life;
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.6;
      const cy = a[1] - 24 * heroScale;
      const seed = (f.x * 7 + f.y * 13) % 6;
      for (let i = 0; i < 4; i++) {
        const ang = seed + i * 1.6;
        const r0 = 3 + p * 6;
        const r1 = 6 + p * 14;
        ctx.beginPath();
        ctx.moveTo(a[0] + Math.cos(ang) * r0 * heroScale, cy + Math.sin(ang) * r0 * heroScale);
        ctx.lineTo(a[0] + Math.cos(ang) * r1 * heroScale, cy + Math.sin(ang) * r1 * heroScale);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'beam') {
      // столб света: возрождение или взятый объект
      const k = f.t / f.life;
      const w = 18 * heroScale * (0.6 + k * 0.4);
      const g = ctx.createLinearGradient(0, a[1] - 140 * heroScale, 0, a[1]);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, f.color);
      ctx.globalAlpha = k * 0.75;
      ctx.fillStyle = g;
      ctx.fillRect(a[0] - w / 2, a[1] - 140 * heroScale, w, 140 * heroScale);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(a[0], a[1], w * (1 + p * 2), w * (1 + p * 2) * 0.4, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'gold') {
      ctx.globalAlpha = Math.min(1, (f.t / f.life) * 2);
      ctx.font = `700 ${Math.round(12 * Math.max(1, dpr * 0.7))}px "Golos Text", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,14,0.8)';
      const ty = a[1] - 56 * heroScale - p * 22;
      ctx.strokeText(f.text!, a[0], ty);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text!, a[0], ty);
      ctx.globalAlpha = 1;
    }
  }
}
