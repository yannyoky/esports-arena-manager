// Отрисовка матча на Canvas 2D. Кадры ограничены 30 в секунду,
// чтобы телефон не грелся; при свёрнутой вкладке рисование останавливается.
import { H, Match, W } from './sim';

export function drawMatch(ctx: CanvasRenderingContext2D, m: Match, cw: number, ch: number) {
  const s = m.s;
  // В портретной ориентации поле поворачивается: синие внизу, соперник сверху
  const portrait = ch > cw;
  const scale = portrait ? Math.min(cw / H, ch / W) : Math.min(cw / W, ch / H);
  const ox = (cw - (portrait ? H : W) * scale) / 2;
  const oy = (ch - (portrait ? W : H) * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d0f15';
  ctx.fillRect(0, 0, cw, ch);
  const world = () =>
    portrait ? ctx.setTransform(0, -scale, scale, 0, ox, oy + W * scale) : ctx.setTransform(scale, 0, 0, scale, ox, oy);
  // Текст и полоски рисуем в экранных координатах, чтобы они не поворачивались
  const toScreen = (x: number, y: number) => (portrait ? [ox + y * scale, oy + (W - x) * scale] : [ox + x * scale, oy + y * scale]);
  const screenBar = (x: number, y: number, dy: number, w: number, h: number, k: number, col: string) => {
    const [sx, sy] = toScreen(x, y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bar(ctx, sx - (w * scale) / 2, sy + dy * scale, w * scale, Math.max(3, h * scale), k, col);
    world();
  };
  const screenText = (t: string, x: number, y: number, dy: number, px: number, col: string, bold = false) => {
    const [sx, sy] = toScreen(x, y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col;
    ctx.font = `${bold ? 'bold ' : ''}${Math.max(9, px * scale)}px sans-serif`;
    ctx.fillText(t, sx, sy + dy * scale);
    world();
  };
  world();

  // Поле
  ctx.fillStyle = '#1a2a22';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let x = 100; x < W; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  // Кусты-укрытия для красоты
  ctx.fillStyle = '#15241c';
  for (const [x, y, r] of [
    [330, 140, 50],
    [670, 460, 50],
    [500, 300, 40],
    [330, 470, 40],
    [670, 130, 40],
  ])
    ctx.beginPath(), ctx.arc(x, y, r, 0, Math.PI * 2), ctx.fill();

  // Ядра
  s.cores.forEach((c, i) => {
    const col = m.setup.teams[i].color;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.PI / 4 + s.time * 0.5);
    ctx.fillRect(-22, -22, 44, 44);
    ctx.restore();
    screenBar(c.x, c.y, 38, 80, 8, Math.max(0, c.hp) / 2500, col);
  });

  // Эффекты под юнитами
  for (const f of s.fx) {
    const a = Math.min(1, f.t * 3);
    ctx.globalAlpha = a;
    if (f.kind === 'aoe' || f.kind === 'heal') {
      ctx.strokeStyle = f.color;
      ctx.fillStyle = f.color + '33';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r!, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (f.kind === 'shot' || f.kind === 'dash') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.kind === 'dash' ? 6 : 2.5;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x2!, f.y2!);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Юниты
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const u of s.units) {
    if (u.dead > 0) continue;
    const col = m.setup.teams[u.side].color;
    ctx.fillStyle = '#000a';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + 16, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(u.x, u.y, 17, 0, Math.PI * 2);
    ctx.fill();
    if (u.shield > 0) {
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (u.stun > 0) {
      screenText('★', u.x, u.y, -34, 14, '#ffe066', true);
    }
    screenText(u.champ.glyph, u.x, u.y, 1, 18, '#0d0f15', true);
    screenBar(u.x, u.y, -28, 40, 5, u.hp / u.maxHp, u.side === 0 ? '#5df58a' : '#ff6b6b');
    screenText(u.player.nick, u.x, u.y, 30, 12, '#fff');
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, col: string) {
  ctx.fillStyle = '#000b';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
}
