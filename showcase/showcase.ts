import { CHAMPIONS, ROLE_NAMES, ABILITY_TEXT, makeTeams, SIDE_COLORS } from '../src/data';
import { drawHero, portrait } from '../src/models';
import { drawMatch } from '../src/render';
import { Match } from '../src/sim';
import { autoDraft } from '../src/draft';
import { Rng } from '../src/rng';

// Галерея героев: каждый по кругу показывает покой, шаг, удар и способность
const grid = document.getElementById('heroes')!;
const cards = CHAMPIONS.map((c, i) => {
  const el = document.createElement('figure');
  el.className = 'hero';
  el.innerHTML = `<canvas width="160" height="170"></canvas><figcaption><b>${c.name}</b><span>${ROLE_NAMES[c.role]} · ${c.title}</span><small>${ABILITY_TEXT[c.ab]}</small></figcaption>`;
  grid.appendChild(el);
  return { c, ctx: el.querySelector('canvas')!.getContext('2d')!, off: i * 0.37 };
});

// Живой матч на новой карте
const cv = document.getElementById('arena') as HTMLCanvasElement;
const actx = cv.getContext('2d')!;
let match: Match;
function newMatch(seed: number) {
  const rng = new Rng(seed);
  const teams = makeTeams(rng);
  const picks = autoDraft(teams[0], teams[1], rng);
  match = new Match({ teams: [teams[0], teams[1]], picks, seed });
}
newMatch(7);
let seed = 7;

// Мини-драфт в образцах стилей
const blue = ['granite', 'vortex', 'hawk', 'aurora', 'willow'];
const red = ['anchor', 'ember', 'quill', 'frost', 'shade'];
const bans = ['reaper', 'lumen', 'bolt', 'brick', 'sage', 'fang'];
document.querySelectorAll<HTMLElement>('[data-slots]').forEach((box) => {
  const side = box.dataset.slots === 'blue' ? blue : red;
  box.innerHTML = side.map((id, i) => `<div class="slot ${i === 3 && box.dataset.slots === 'red' ? 'live' : ''}"><img src="${portrait(CHAMPIONS.find((c) => c.id === id)!)}" alt=""><span>${CHAMPIONS.find((c) => c.id === id)!.name}</span></div>`).join('');
});
document.querySelectorAll<HTMLElement>('[data-bans]').forEach((box) => {
  box.innerHTML = bans.map((id) => `<img src="${portrait(CHAMPIONS.find((c) => c.id === id)!)}" alt="">`).join('');
});
document.querySelectorAll<HTMLElement>('[data-pool]').forEach((box) => {
  box.innerHTML = CHAMPIONS.slice(0, 12).map((c) => `<img src="${portrait(c)}" alt="${c.name}" class="${[...blue, ...red, ...bans].includes(c.id) ? 'gone' : ''}">`).join('');
});

let last = performance.now();
let acc = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  if (dt < 1 / 31) return;
  last = now;
  const t = now / 1000;
  for (const { c, ctx, off } of cards) {
    const phase = (t + off) % 6;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 160, 170);
    ctx.translate(80, 150);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(2.6, 2.6);
    drawHero(ctx, c, {
      t: t + off,
      moving: phase > 1.5 && phase < 3,
      swing: phase > 3.2 && phase < 4.2 ? 0.25 - ((phase - 3.2) % 0.5) / 2 : 0,
      cast: phase > 4.6 && phase < 5.2 ? 0.3 : 0,
      face: 1,
    });
  }
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  acc += Math.min(dt, 0.25) * 1.5;
  while (acc >= 1 / 30) { match.step(); acc -= 1 / 30; }
  if (match.s.over) newMatch(++seed);
  drawMatch(actx, match, cv.width, cv.height, dpr);
  document.getElementById('score')!.innerHTML = `<b style="color:${SIDE_COLORS[0]}">${match.s.kills[0]}</b> : <b style="color:${SIDE_COLORS[1]}">${match.s.kills[1]}</b>`;
}
requestAnimationFrame(frame);
