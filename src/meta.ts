// Мета и патчи: лига копит статистику героев и матчей, раз в несколько недель
// выходит патч. Он ослабляет героев, которых часто берут и которые много побеждают,
// усиливает забытых и меняет награды за убийства, башни и объекты карты.
import { CHAMPIONS, Role, champById } from './data';
import { Rng } from './rng';
import type { Strategy } from './sim';

export interface Rules {
  killXp: number; // множитель опыта за убийство героя
  bounty: number; // доп. опыт за каждое убийство в серии жертвы
  towerXp: number; // опыт команде за башню
  campXp: number; // опыт за лесной лагерь
  spiritPct: number; // урон за каждого речного духа
  spiritXp: number;
  siegeMult: number; // урон по строениям под осадой колосса
  siegeTime: number; // длительность осады, с
  colossusXp: number;
  respawn: number; // множитель времени возрождения
  lanesXp: number; // бонус опыта стратегии «Игра от линий»
  pickBonus: number; // бонус урона «Охоты» по одиночкам
}

export const BASE_RULES: Rules = {
  killXp: 1,
  bounty: 15,
  towerXp: 120,
  campXp: 70,
  spiritPct: 0.12,
  spiritXp: 120,
  siegeMult: 1.6,
  siegeTime: 60,
  colossusXp: 200,
  respawn: 1,
  lanesXp: 1.25,
  pickBonus: 1.25,
};

// Как правило выглядит в патчноутах и в каких пределах может гулять
type Fmt = 'pct' | 'mult' | 'int' | 'sec';
export const RULE_INFO: Record<keyof Rules, { name: string; fmt: Fmt; min: number; max: number; step: number }> = {
  killXp: { name: 'Опыт за убийство героя', fmt: 'mult', min: 0.7, max: 1.4, step: 0.1 },
  bounty: { name: 'Награда за серию убийств', fmt: 'int', min: 0, max: 40, step: 8 },
  towerXp: { name: 'Опыт за башню', fmt: 'int', min: 70, max: 200, step: 25 },
  campXp: { name: 'Опыт за лесной лагерь', fmt: 'int', min: 40, max: 110, step: 15 },
  spiritPct: { name: 'Речной дух: урон за заряд', fmt: 'pct', min: 0.06, max: 0.18, step: 0.02 },
  spiritXp: { name: 'Речной дух: опыт', fmt: 'int', min: 60, max: 200, step: 30 },
  siegeMult: { name: 'Колосс: урон по строениям', fmt: 'pct', min: 1.3, max: 2, step: 0.15 },
  siegeTime: { name: 'Колосс: длительность осады', fmt: 'sec', min: 40, max: 85, step: 10 },
  colossusXp: { name: 'Колосс: опыт', fmt: 'int', min: 120, max: 300, step: 40 },
  respawn: { name: 'Время возрождения', fmt: 'mult', min: 0.8, max: 1.25, step: 0.08 },
  lanesXp: { name: '«Игра от линий»: бонус опыта', fmt: 'pct', min: 1.05, max: 1.45, step: 0.08 },
  pickBonus: { name: '«Охота»: урон по одиночкам', fmt: 'pct', min: 1.1, max: 1.5, step: 0.08 },
};

export function fmtRule(k: keyof Rules, v: number) {
  const f = RULE_INFO[k].fmt;
  if (f === 'pct') return (k === 'spiritPct' ? '+' + Math.round(v * 100) : '+' + Math.round((v - 1) * 100)) + '%';
  if (f === 'mult') return '×' + v.toFixed(2);
  if (f === 'sec') return Math.round(v) + ' с';
  return String(Math.round(v));
}

export interface HeroMod {
  hp: number;
  dmg: number;
  cd: number; // множитель перезарядки умения: меньше — чаще
}
export const NO_MOD: HeroMod = { hp: 1, dmg: 1, cd: 1 };

export interface Note {
  kind: 'buff' | 'nerf' | 'rule';
  id?: string; // герой
  text: string;
  why: string;
}

export interface Patch {
  ver: string;
  week: number;
  mods: Record<string, HeroMod>;
  rules: Rules;
  notes: Note[];
}

export interface HeroStat {
  picks: number;
  bans: number;
  wins: number;
  order: number; // сумма номеров хода, на котором героя взяли или забанили
}

export interface WindowStat {
  games: number;
  kills: number;
  towers: number;
  cores: number;
  objGames: number; // матчи, где одна команда взяла больше объектов
  objWins: number; // …и победила
  strat: Record<Strategy, [number, number]>; // [победы, игры]
}

export interface Meta {
  patch: Patch;
  heroes: Record<string, HeroStat>;
  win: WindowStat;
  history: { ver: string; week: number; notes: Note[] }[];
}

export const PATCH_EVERY = 3; // недель между патчами

const emptyWindow = (): WindowStat => ({
  games: 0, kills: 0, towers: 0, cores: 0, objGames: 0, objWins: 0,
  strat: { lanes: [0, 0], group: [0, 0], pick: [0, 0] },
});

const emptyHeroes = () => Object.fromEntries(CHAMPIONS.map((c) => [c.id, { picks: 0, bans: 0, wins: 0, order: 0 }]));

export const modOf = (p: Patch | undefined, id: string): HeroMod => p?.mods[id] ?? NO_MOD;

// Итог одного матча для статистики меты
export interface MatchRecord {
  picks: [string[], string[]];
  bans: [string[], string[]];
  order?: Record<string, number>; // номер хода драфта для каждого героя
  winner: 0 | 1;
  kills: number;
  towers: number;
  core: boolean;
  objectives: [number, number];
  strategies: [Strategy, Strategy];
}

export function record(m: Meta, r: MatchRecord) {
  const w = m.win;
  w.games++;
  w.kills += r.kills;
  w.towers += r.towers;
  if (r.core) w.cores++;
  if (r.objectives[0] !== r.objectives[1]) {
    w.objGames++;
    if ((r.objectives[0] > r.objectives[1] ? 0 : 1) === r.winner) w.objWins++;
  }
  for (const side of [0, 1] as const) {
    const st = w.strat[r.strategies[side]];
    st[1]++;
    if (r.winner === side) st[0]++;
    for (const id of r.picks[side]) {
      const h = (m.heroes[id] ??= { picks: 0, bans: 0, wins: 0, order: 0 });
      h.picks++;
      if (r.winner === side) h.wins++;
      h.order += r.order?.[id] ?? 10;
    }
    for (const id of r.bans[side]) {
      const h = (m.heroes[id] ??= { picks: 0, bans: 0, wins: 0, order: 0 });
      h.bans++;
      h.order += r.order?.[id] ?? 10;
    }
  }
}

// Сглаженный винрейт: на малой выборке тянем к 50%
export const winRate = (h: HeroStat) => (h.wins + 3) / (h.picks + 6);
export const seen = (h: HeroStat) => h.picks + h.bans;
// Приоритет в драфте: 1 — берут или банят первым ходом, 0 — последним
export const priority = (h: HeroStat) => (seen(h) ? 1 - h.order / seen(h) / 19 : 0.5);

// «Сила в мете» для ИИ и экрана меты: чем выше, тем опаснее герой
export function heroPower(m: Meta, id: string) {
  const h = m.heroes[id];
  const mod = modOf(m.patch, id);
  const patchK = (mod.hp - 1) * 0.8 + (mod.dmg - 1) + (1 - mod.cd) * 0.6;
  const stat = h && h.picks >= 2 ? (winRate(h) - 0.5) * 1.5 : 0;
  return patchK + stat;
}

// Тир для экрана меты
export function tier(m: Meta, id: string): 'S' | 'A' | 'B' | 'C' {
  const p = heroPower(m, id);
  return p > 0.12 ? 'S' : p > 0.03 ? 'A' : p > -0.06 ? 'B' : 'C';
}

const pctTxt = (v: number) => (v > 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%';
const STAT_NAME = { hp: 'здоровье', dmg: 'урон', cd: 'перезарядка умения' } as const;

// Какую характеристику крутить: у каждой роли своё «лицо»
const STAT_BY_ROLE: Record<Role, (keyof HeroMod)[]> = {
  tank: ['hp', 'cd'],
  fighter: ['dmg', 'hp'],
  assassin: ['dmg', 'cd'],
  mage: ['dmg', 'cd'],
  shooter: ['dmg', 'hp'],
  support: ['cd', 'hp'],
};

function changeHero(mods: Record<string, HeroMod>, id: string, buff: boolean, rng: Rng, why: string): Note {
  const c = champById(id);
  const stat = rng.pick(STAT_BY_ROLE[c.role]);
  const size = Math.round(rng.range(6, 11)) / 100;
  const cur = { ...(mods[id] ?? NO_MOD) };
  // для перезарядки усиление — это уменьшение
  const delta = stat === 'cd' ? (buff ? -size : size) : buff ? size : -size;
  cur[stat] = Math.min(1.3, Math.max(0.72, Math.round((cur[stat] + delta) * 100) / 100));
  mods[id] = cur;
  return { kind: buff ? 'buff' : 'nerf', id, text: `${c.name}: ${STAT_NAME[stat]} ${pctTxt(delta)}`, why };
}

// Причина и направление для каждого правила по статистике окна
function ruleWishes(w: WindowStat, r: Rules): { k: keyof Rules; dir: 1 | -1; urge: number; why: string }[] {
  const out: { k: keyof Rules; dir: 1 | -1; urge: number; why: string }[] = [];
  if (!w.games) return out;
  const kills = w.kills / w.games;
  const towers = w.towers / w.games;
  const cores = w.cores / w.games;
  if (kills > 58) {
    out.push({ k: 'killXp', dir: -1, urge: (kills - 58) / 12, why: `много драк: ${Math.round(kills)} убийств за матч` });
    out.push({ k: 'respawn', dir: -1, urge: (kills - 58) / 16, why: 'смерть стоит слишком дорого' });
  }
  if (kills < 46) {
    out.push({ k: 'killXp', dir: 1, urge: (46 - kills) / 10, why: `мало драк: ${Math.round(kills)} убийств за матч` });
    out.push({ k: 'bounty', dir: 1, urge: (46 - kills) / 12, why: 'серии убийств почти не наказываются' });
  }
  if (towers < 5) out.push({ k: 'towerXp', dir: 1, urge: (5 - towers) / 1.5, why: `башни стоят слишком долго: ${towers.toFixed(1)} за матч` });
  if (towers > 6.5) out.push({ k: 'towerXp', dir: -1, urge: (towers - 6.5) / 1.5, why: `башни падают слишком быстро: ${towers.toFixed(1)} за матч` });
  if (cores < 0.25) {
    out.push({ k: 'siegeMult', dir: 1, urge: (0.25 - cores) * 5, why: `ядро разрушают лишь в ${Math.round(cores * 100)}% матчей` });
    out.push({ k: 'respawn', dir: 1, urge: (0.25 - cores) * 4, why: 'после выигранной драки не успевают дожать' });
  }
  if (cores > 0.45) out.push({ k: 'siegeMult', dir: -1, urge: (cores - 0.45) * 5, why: `ядро падает в ${Math.round(cores * 100)}% матчей` });
  if (w.objGames >= 4) {
    const ow = w.objWins / w.objGames;
    if (ow > 0.85) {
      const why = `кто взял больше объектов, побеждает в ${Math.round(ow * 100)}% матчей`;
      out.push({ k: 'spiritPct', dir: -1, urge: (ow - 0.85) * 5, why });
      out.push({ k: 'siegeTime', dir: -1, urge: (ow - 0.85) * 4, why });
    }
    if (ow < 0.6) {
      out.push({ k: 'spiritXp', dir: 1, urge: (0.6 - ow) * 5, why: `объекты почти не влияют на исход (${Math.round(ow * 100)}%)` });
      out.push({ k: 'colossusXp', dir: 1, urge: (0.6 - ow) * 4, why: 'за колосса мало дерутся' });
    }
  }
  const sr = (s: Strategy) => (w.strat[s][1] >= 4 ? w.strat[s][0] / w.strat[s][1] : 0.5);
  const lanes = sr('lanes');
  const pick = sr('pick');
  if (lanes < 0.45) out.push({ k: 'lanesXp', dir: 1, urge: (0.45 - lanes) * 6, why: `«Игра от линий» побеждает лишь в ${Math.round(lanes * 100)}% матчей` });
  if (lanes > 0.58) out.push({ k: 'lanesXp', dir: -1, urge: (lanes - 0.58) * 6, why: `«Игра от линий» побеждает в ${Math.round(lanes * 100)}% матчей` });
  if (pick < 0.45) out.push({ k: 'pickBonus', dir: 1, urge: (0.45 - pick) * 6, why: `«Охота» побеждает лишь в ${Math.round(pick * 100)}% матчей` });
  if (pick > 0.58) out.push({ k: 'pickBonus', dir: -1, urge: (pick - 0.58) * 6, why: `«Охота» побеждает в ${Math.round(pick * 100)}% матчей` });
  // упираться в границы бессмысленно
  return out.filter((x) => {
    const i = RULE_INFO[x.k];
    return x.dir > 0 ? r[x.k] < i.max - 1e-6 : r[x.k] > i.min + 1e-6;
  });
}

// Встряска ради разнообразия: разработчики двигают что-то и без жалоб игроков
const SHAKE_WHY = ['разработчики хотят освежить стиль игры', 'ради разнообразия стратегий', 'эксперимент этого патча'];

export function makePatch(prev: Patch | null, m: Meta | null, week: number, rng: Rng, n: number): Patch {
  const mods: Record<string, HeroMod> = JSON.parse(JSON.stringify(prev?.mods ?? {}));
  const rules: Rules = { ...(prev?.rules ?? BASE_RULES) };
  const notes: Note[] = [];

  // --- Герои ---
  if (m && m.win.games > 0) {
    const scored = CHAMPIONS.map((c) => {
      const h = m.heroes[c.id] ?? { picks: 0, bans: 0, wins: 0, order: 0 };
      const wr = winRate(h);
      const pr = priority(h);
      const banRate = h.bans / Math.max(1, m.win.games);
      return { c, h, wr, pr, score: (wr - 0.5) * 2.2 + (pr - 0.5) * 0.8 + (banRate - 0.5) * 0.4 };
    }).sort((a, b) => b.score - a.score);
    const why = (x: (typeof scored)[0]) =>
      `винрейт ${Math.round((x.h.wins / Math.max(1, x.h.picks)) * 100)}% в ${x.h.picks} играх, ${x.h.bans} банов` + (x.pr > 0.62 ? ', берут в первых ходах' : x.pr < 0.38 ? ', берут в последнюю очередь' : '');
    for (const x of scored.slice(0, 3)) if (x.score > 0.1) notes.push(changeHero(mods, x.c.id, false, rng, why(x)));
    for (const x of scored.slice(-3).reverse()) if (x.score < -0.1) notes.push(changeHero(mods, x.c.id, true, rng, why(x)));
  } else {
    // Предсезонный патч: несколько случайных правок, чтобы сезоны отличались
    const pool = [...CHAMPIONS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.slice(0, 2).forEach((c) => notes.push(changeHero(mods, c.id, true, rng, 'предсезонная доработка')));
    pool.slice(2, 4).forEach((c) => notes.push(changeHero(mods, c.id, false, rng, 'предсезонная доработка')));
  }

  // --- Правила и награды ---
  const wishes = m ? ruleWishes(m.win, rules) : [];
  wishes.forEach((x) => (x.urge += rng.range(0, 0.4)));
  wishes.sort((a, b) => b.urge - a.urge);
  const changed = new Set<keyof Rules>();
  for (const x of wishes) {
    if (changed.size >= 2 || changed.has(x.k)) continue;
    notes.push(changeRule(rules, x.k, x.dir, x.why));
    changed.add(x.k);
  }
  // Ещё одна «встряска», чтобы мета не застывала
  const keys = (Object.keys(RULE_INFO) as (keyof Rules)[]).filter((k) => !changed.has(k));
  const k = rng.pick(keys);
  const i = RULE_INFO[k];
  const dir: 1 | -1 = rules[k] >= i.max - 1e-6 ? -1 : rules[k] <= i.min + 1e-6 ? 1 : rng.next() < 0.5 ? 1 : -1;
  notes.push(changeRule(rules, k, dir, rng.pick(SHAKE_WHY)));

  return { ver: `1.${n}`, week, mods, rules, notes };
}

function changeRule(r: Rules, k: keyof Rules, dir: 1 | -1, why: string): Note {
  const i = RULE_INFO[k];
  const was = r[k];
  r[k] = Math.min(i.max, Math.max(i.min, Math.round((was + dir * i.step) * 100) / 100));
  // «Хорошо для игрока» — больше наград и бонусов; для возрождения — наоборот
  const good = k === 'respawn' ? r[k] < was : r[k] > was;
  return { kind: 'rule', text: `${i.name}: ${fmtRule(k, was)} → ${fmtRule(k, r[k])}`, why: (good ? '▲ ' : '▼ ') + why };
}

export function newMeta(seed: number): Meta {
  const patch = makePatch(null, null, 1, new Rng(seed ^ 0x5eed), 0);
  return { patch, heroes: emptyHeroes(), win: emptyWindow(), history: [{ ver: patch.ver, week: 1, notes: patch.notes }] };
}

// Выпустить новый патч по статистике окна и начать новое окно
export function releasePatch(m: Meta, week: number, seed: number) {
  const n = m.history.length;
  const patch = makePatch(m.patch, m, week, new Rng(seed + week * 7121), n);
  m.patch = patch;
  m.history.unshift({ ver: patch.ver, week, notes: patch.notes });
  m.heroes = emptyHeroes();
  m.win = emptyWindow();
}
