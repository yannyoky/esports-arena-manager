// «Сочность» матча: встряска камеры, стоп-кадр, лёгкий наезд камеры и звуки.
// Только интерфейс: симуляция и повторы от этого не зависят.
import { crowdSwell, sfx, Sfx } from './audio';
import type { Fx, Match } from './sim';

interface Juice {
  trauma: number; // 0..1, встряска = trauma²
  punch: number; // наезд камеры
  freezeUntil: number; // стоп-кадр (реальное время, мс)
  slowUntil: number; // замедление
  ev: number; // сколько событий уже разобрано
  seen: WeakSet<Fx>;
  last: number;
}

const store = new WeakMap<Match, Juice>();
export const juiceOpts = { motion: true };

export function juiceOf(m: Match): Juice {
  let j = store.get(m);
  if (!j) {
    j = { trauma: 0, punch: 0, freezeUntil: 0, slowUntil: 0, ev: 0, seen: new WeakSet(), last: 0 };
    store.set(m, j);
  }
  return j;
}

// Сила отклика по важности события
function impact(j: Juice, now: number, trauma: number, freezeMs: number, punch: number) {
  if (!juiceOpts.motion) return;
  j.trauma = Math.min(1, j.trauma + trauma);
  j.freezeUntil = Math.max(j.freezeUntil, now + freezeMs);
  j.punch = Math.min(0.08, j.punch + punch);
}

const AB_SOUND: Record<string, Sfx> = {
  bulwark: 'ward', hook: 'hook', whirl: 'whirl', leap: 'heavy', pierce: 'shoot', volley: 'shoot',
  fireball: 'fire', frost: 'frost', mend: 'heal', ward: 'ward', vanish: 'dash', dash: 'dash',
};

// Вызывается каждый кадр: разбирает новые события и эффекты
export function juiceTick(m: Match, now: number, speed: number) {
  const j = juiceOf(m);
  const dt = j.last ? Math.min(0.1, (now - j.last) / 1000) : 0;
  j.last = now;
  j.trauma = Math.max(0, j.trauma - dt * 1.4);
  j.punch = Math.max(0, j.punch - dt * 0.12);
  if (m.s.shake > 0 && juiceOpts.motion) j.trauma = Math.max(j.trauma, Math.min(0.6, m.s.shake * 1.6));
  const fast = speed >= 4 ? 0.5 : 1; // на ускорении стоп-кадры короче

  const ev = m.s.events;
  for (; j.ev < ev.length; j.ev++) {
    const e = ev[j.ev];
    switch (e.kind) {
      case 'first':
        impact(j, now, 0.35, 90 * fast, 0.03);
        sfx('cheer');
        crowdSwell(0.7);
        break;
      case 'kill':
        if (e.multi >= 2) {
          impact(j, now, 0.3 + e.multi * 0.08, (90 + e.multi * 25) * fast, 0.04);
          sfx('cheerBig');
          crowdSwell(1);
        } else if (e.killer) {
          impact(j, now, 0.22, 65 * fast, 0.02);
          if (e.shutdown >= 3 || e.streak >= 3) {
            sfx('cheer');
            crowdSwell(0.6);
          }
        }
        break;
      case 'ace':
        impact(j, now, 0.5, 120 * fast, 0.05);
        if (juiceOpts.motion) j.slowUntil = now + 900;
        sfx('cheerBig');
        crowdSwell(1);
        break;
      case 'tower':
        impact(j, now, e.tier === 1 ? 0.6 : 0.45, 110 * fast, 0.03);
        sfx('tower');
        sfx('cheer', 0.8);
        crowdSwell(0.8);
        break;
      case 'objective':
        impact(j, now, 0.35, 80 * fast, 0.02);
        sfx('objective');
        crowdSwell(0.6);
        break;
      case 'core':
        impact(j, now, 0.3, 0, 0.02);
        crowdSwell(0.9);
        break;
    }
  }

  for (const f of m.s.fx) {
    if (j.seen.has(f)) continue;
    j.seen.add(f);
    if (f.ab) {
      sfx(AB_SOUND[f.ab] ?? 'magic');
      continue;
    }
    switch (f.kind) {
      case 'spark':
        sfx(f.color === '#ffd166' ? 'heavy' : 'hit', 0.8);
        break;
      case 'arrow':
        sfx('shoot', 0.6);
        break;
      case 'shot':
        sfx('magic', 0.5);
        break;
      case 'tower':
        sfx('towerShot', 0.7);
        break;
      case 'death':
        sfx('death');
        break;
      case 'level':
        sfx('level');
        break;
      case 'gold':
        sfx('gold');
        break;
    }
  }
}

// Плавная встряска: сумма синусов вместо случайного дрожания
export function shakeOffset(m: Match, k: number): [number, number, number] {
  const j = juiceOf(m);
  if (j.trauma <= 0) return [0, 0, 0];
  const s = j.trauma * j.trauma;
  const t = j.last / 1000;
  const nx = Math.sin(t * 47) * 0.6 + Math.sin(t * 89 + 1.3) * 0.4;
  const ny = Math.sin(t * 53 + 2.1) * 0.6 + Math.sin(t * 97 + 0.4) * 0.4;
  const nr = Math.sin(t * 41 + 3.7);
  return [nx * s * 14 * k, ny * s * 10 * k, nr * s * 0.02];
}

export const punchOf = (m: Match) => juiceOf(m).punch;

// Множитель скорости симуляции: 0 во время стоп-кадра, меньше 1 в замедлении
export function timeScale(m: Match, now: number) {
  const j = juiceOf(m);
  if (now < j.freezeUntil) return 0;
  if (now < j.slowUntil) return 0.35;
  return 1;
}
