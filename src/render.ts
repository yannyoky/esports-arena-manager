// Отрисовка матча на Canvas 2D. Карта рисуется один раз в отдельный холст,
// каждый кадр поверх неё рисуются только герои и эффекты. Не больше 30 кадров/с.
import { SIDE_COLORS } from './data';
import { drawHero } from './models';
import { CORE_HP, H, Match, W } from './sim';
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

const LANES = [
  (t: number) => [120 + t * 760, 300 - Math.sin(t * Math.PI) * 210],
  (t: number) => [120 + t * 760, 300 + Math.sin(t * 6.28) * 18],
  (t: number) => [120 + t * 760, 300 + Math.sin(t * Math.PI) * 210],
];

const riverX = (y: number) => 500 + Math.sin(y / 70) * 26;

const DECOR = (() => {
  const r = new Rng(77);
  const items: { kind: 'tree' | 'rock' | 'bush'; x: number; y: number; s: number }[] = [];
  const clear = (x: number, y: number) => {
    if (Math.hypot(x - 55, y - 300) < 170 || Math.hypot(x - 945, y - 300) < 170) return false;
    if (Math.abs(x - riverX(y)) < 50) return false;
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

  drawCore(ctx, v, s.cores[0].x, s.cores[0].y, 0, s.cores[0].hp / CORE_HP, s.cores[0].hit, t);
  drawCore(ctx, v, s.cores[1].x, s.cores[1].y, 1, s.cores[1].hp / CORE_HP, s.cores[1].hit, t);

  // Герои, отсортированные по высоте на экране
  const alive = s.units.filter((u) => u.dead <= 0);
  const heroScale = Math.max(0.75, v.k * 1.25);
  const withPos = alive.map((u) => ({ u, p: P(v, u.x, u.y) })).sort((a, b) => a.p[1] - b.p[1]);
  for (const { u, p } of withPos) {
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
    // Здоровье, щит и ник
    const bw = 34 * heroScale;
    const by = y - 60 * heroScale;
    ctx.fillStyle = 'rgba(10,8,14,0.85)';
    ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = u.side === 0 ? '#59e08a' : '#ff6a6a';
    ctx.fillRect(x - bw / 2, by, bw * (u.hp / u.maxHp), 4);
    if (u.shield > 0) {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(x - bw / 2, by, Math.min(bw, bw * (u.shield / u.maxHp)), 1.5);
    }
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
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,240,230,0.9)';
    ctx.fillText(u.player.nick, x, by - 5);
  }

  // Летящие снаряды и тексты поверх героев
  for (const f of s.fx) {
    const p = 1 - f.t / f.life;
    const a: [number, number] = P(v, f.x, f.y);
    if (f.kind === 'shot' || f.kind === 'arrow' || f.kind === 'bolt' || f.kind === 'dash' || f.kind === 'hook') {
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
