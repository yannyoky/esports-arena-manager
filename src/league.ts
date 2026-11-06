// Сезон: круговой турнир, недельный календарь, тренировки, бюджет, сохранение.
import { Team, makeTeams } from './data';
import { autoDraftFull } from './draft';
import { Match } from './sim';
import { Meta, MatchRecord, PATCH_EVERY, newMeta, record, releasePatch } from './meta';
import { Rng } from './rng';

export type Training = 'atk' | 'def' | 'iq' | 'rest';

export const TRAINING_NAMES: Record<Training, string> = {
  atk: 'Механика (атака)',
  def: 'Выживание (защита)',
  iq: 'Разбор игр (тактика)',
  rest: 'Отдых (форма)',
};

export interface Fixture {
  week: number;
  home: string;
  away: string;
  result?: { winner: string; kills: [number, number] };
}

export interface Season {
  version: 4;
  seed: number;
  week: number; // 1-based
  teams: Team[];
  fixtures: Fixture[];
  money: number;
  log: string[];
  finished: boolean;
  meta: Meta;
  unseenPatch: boolean; // показать патчноуты при входе в штаб
}

const SAVE_KEY = 'arena-manager-save-v4';

// Круговая система: каждая пара команд играет дважды
function schedule(ids: string[]): Fixture[] {
  const n = ids.length;
  const arr = [...ids];
  const rounds: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      rounds.push({ week: r + 1, home: arr[i], away: arr[n - 1 - i] });
    }
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((f) => ({ week: f.week + n - 1, home: f.away, away: f.home }));
  return [...rounds, ...second];
}

export function newSeason(seed = Date.now() % 1e9): Season {
  const rng = new Rng(seed);
  const teams = makeTeams(rng);
  return {
    version: 4,
    seed,
    week: 1,
    teams,
    fixtures: schedule(teams.map((t) => t.id)),
    money: 20000,
    log: ['Добро пожаловать в лигу! Соберите состав и выиграйте сезон.', 'Вышел предсезонный патч 1.0.'],
    finished: false,
    meta: newMeta(seed),
    unseenPatch: true,
  };
}

export const totalWeeks = (s: Season) => Math.max(...s.fixtures.map((f) => f.week));

export function save(s: Season) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — играем без сохранения */
  }
}

export function load(): Season | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Season;
    return s.version === 4 ? s : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export const teamById = (s: Season, id: string) => s.teams.find((t) => t.id === id)!;
export const humanTeam = (s: Season) => s.teams.find((t) => t.human)!;

export function humanFixture(s: Season): Fixture | undefined {
  const h = humanTeam(s).id;
  return s.fixtures.find((f) => f.week === s.week && (f.home === h || f.away === h));
}

export interface Standing {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  kd: number;
}

export function standings(s: Season): Standing[] {
  const table = new Map<string, Standing>();
  for (const t of s.teams) table.set(t.id, { team: t, played: 0, wins: 0, losses: 0, kd: 0 });
  for (const f of s.fixtures) {
    if (!f.result) continue;
    const h = table.get(f.home)!;
    const a = table.get(f.away)!;
    h.played++;
    a.played++;
    h.kd += f.result.kills[0] - f.result.kills[1];
    a.kd += f.result.kills[1] - f.result.kills[0];
    if (f.result.winner === f.home) {
      h.wins++;
      a.losses++;
    } else {
      a.wins++;
      h.losses++;
    }
  }
  return [...table.values()].sort((x, y) => y.wins - x.wins || y.kd - x.kd);
}

export function applyTraining(s: Season, t: Training) {
  const rng = new Rng(s.seed + s.week * 7919);
  for (const p of humanTeam(s).players) {
    if (t === 'rest') {
      p.form = Math.min(100, p.form + 15);
      continue;
    }
    const gain = rng.range(0.5, 2.2) * (p[t] < 70 ? 1.3 : 0.8);
    p[t] = Math.min(99, Math.round((p[t] + gain) * 10) / 10);
    p.form = Math.max(50, p.form - 6);
  }
  // Соперники тоже растут понемногу
  for (const team of s.teams.filter((x) => !x.human))
    for (const p of team.players) {
      const k = rng.pick(['atk', 'def', 'iq'] as const);
      p[k] = Math.min(99, Math.round((p[k] + rng.range(0, 1.2)) * 10) / 10);
    }
  s.log.unshift(`Неделя ${s.week}: тренировка «${TRAINING_NAMES[t]}».`);
}

// Итог матча для статистики меты
export function matchRecord(m: Match, bans: [string[], string[]], order?: Record<string, number>): MatchRecord {
  const st = m.s;
  return {
    picks: m.setup.picks,
    bans,
    order,
    winner: st.winner === 1 ? 1 : 0,
    kills: st.kills[0] + st.kills[1],
    towers: st.towersDown[0] + st.towersDown[1],
    core: st.cores[0].hp <= 0 || st.cores[1].hp <= 0,
    objectives: [st.objectives[0], st.objectives[1]],
    strategies: [m.strat[0], m.strat[1]],
  };
}

// Матч двух компьютерных команд с драфтом по текущей мете
function aiMatch(s: Season, a: Team, b: Team, rng: Rng) {
  const d = autoDraftFull(a, b, rng, s.meta);
  const m = new Match({ teams: [a, b], picks: d.picks, seed: Math.floor(rng.next() * 1e9), patch: s.meta.patch }, false);
  m.runToEnd();
  record(s.meta, matchRecord(m, d.bans, d.order));
  return m.s;
}

const SCRIMS = 3; // рейтинговые игры сообщества за неделю: дают мете больше статистики

// Сыграть остальные матчи недели без показа и перейти к следующей
export function finishWeek(s: Season, humanResult: { winner: string; kills: [number, number] }, humanRec?: MatchRecord) {
  if (humanRec) record(s.meta, humanRec);
  const rng = new Rng(s.seed + s.week * 104729);
  for (const f of s.fixtures.filter((x) => x.week === s.week)) {
    if (f.result) continue;
    const h = humanTeam(s).id;
    if (f.home === h || f.away === h) {
      f.result = humanResult;
      continue;
    }
    const home = teamById(s, f.home);
    const away = teamById(s, f.away);
    const st = aiMatch(s, home, away, rng);
    f.result = { winner: st.winner === 0 ? home.id : away.id, kills: [st.kills[0], st.kills[1]] };
  }
  const ai = s.teams.filter((t) => !t.human);
  for (let i = 0; i < SCRIMS; i++) {
    const a = rng.pick(ai);
    const b = rng.pick(ai.filter((t) => t !== a));
    aiMatch(s, a, b, rng);
  }
  const me = humanTeam(s);
  const won = humanResult.winner === me.id;
  const prize = won ? 6000 : 1500;
  const salaries = me.players.reduce((a, p) => a + p.salary, 0);
  s.money += prize - salaries;
  for (const p of me.players) p.form = Math.max(50, Math.min(100, p.form + (won ? 4 : -3)));
  s.log.unshift(`Неделя ${s.week}: ${won ? 'победа' : 'поражение'}, призовые ${prize}, зарплаты −${salaries}.`);
  if (s.week >= totalWeeks(s)) {
    s.finished = true;
    const place = standings(s).findIndex((x) => x.team.human) + 1;
    s.log.unshift(`Сезон окончен! Ваше место: ${place}.`);
  } else {
    s.week++;
    if ((s.week - 1) % PATCH_EVERY === 0) {
      releasePatch(s.meta, s.week, s.seed);
      s.unseenPatch = true;
      const p = s.meta.patch;
      const buffs = p.notes.filter((n) => n.kind === 'buff').length;
      const nerfs = p.notes.filter((n) => n.kind === 'nerf').length;
      s.log.unshift(`Вышел патч ${p.ver}: усилено героев ${buffs}, ослаблено ${nerfs}, изменений правил ${p.notes.length - buffs - nerfs}.`);
    }
  }
  save(s);
}
