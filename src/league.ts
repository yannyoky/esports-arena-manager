// Сезон: круговой турнир, недельный календарь, тренировки, бюджет, сохранение.
import { ALL_ROLES, CHAMPIONS, Role, Team, makeTeams } from './data';
import { Match } from './sim';
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
  version: 1;
  seed: number;
  week: number; // 1-based
  teams: Team[];
  fixtures: Fixture[];
  money: number;
  log: string[];
  finished: boolean;
}

const SAVE_KEY = 'arena-manager-save-v1';

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
    version: 1,
    seed,
    week: 1,
    teams,
    fixtures: schedule(teams.map((t) => t.id)),
    money: 20000,
    log: ['Добро пожаловать в лигу! Соберите состав и выиграйте сезон.'],
    finished: false,
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
    return s.version === 1 ? s : null;
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

// Компьютер выбирает чемпионов: лучшую роль игрока, без повторов
export function autoPicks(team: Team, rng: Rng, taken: Set<string> = new Set()): string[] {
  const picks: string[] = [];
  const usedRoles = new Map<Role, number>();
  for (const p of team.players) {
    const roles = [...ALL_ROLES].sort((a, b) => p.pool[b] - p.pool[a] + ((usedRoles.get(a) ?? 0) - (usedRoles.get(b) ?? 0)) * 40);
    let pick = '';
    for (const r of roles) {
      const opts = CHAMPIONS.filter((c) => c.role === r && !taken.has(c.id) && !picks.includes(c.id));
      if (opts.length) {
        pick = rng.pick(opts).id;
        usedRoles.set(r, (usedRoles.get(r) ?? 0) + 1);
        break;
      }
    }
    picks.push(pick);
  }
  return picks;
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

// Сыграть остальные матчи недели без показа и перейти к следующей
export function finishWeek(s: Season, humanResult: { winner: string; kills: [number, number] }) {
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
    const hp = autoPicks(home, rng);
    const ap = autoPicks(away, rng, new Set(hp));
    const m = new Match({ teams: [home, away], picks: [hp, ap], seed: Math.floor(rng.next() * 1e9) });
    const st = m.runToEnd();
    f.result = { winner: st.winner === 0 ? home.id : away.id, kills: [st.kills[0], st.kills[1]] };
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
  } else s.week++;
  save(s);
}
