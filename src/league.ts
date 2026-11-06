// Сезон и клуб: календарь лиги, плей-офф, международный турнир, тренировки,
// развитие игроков, трансферы, персонал, академия, спонсоры, сохранение.
import { Player, Pos, Team, askSalary, makePlayer, makeTeams, ovr, value } from './data';
import { autoDraftFull } from './draft';
import { Match, MatchSetup } from './sim';
import { Meta, MatchRecord, PATCH_EVERY, newMeta, record, releasePatch } from './meta';
import { Rng } from './rng';

export type Training = 'atk' | 'def' | 'iq' | 'rest';

export const TRAINING_NAMES: Record<Training, string> = {
  atk: 'Механика (атака)',
  def: 'Выживание (защита)',
  iq: 'Разбор игр (тактика)',
  rest: 'Отдых (форма)',
};

export type Stage = 'league' | 'semi' | 'final' | 'intl-semi' | 'intl-final';
export const STAGE_NAMES: Record<Stage, string> = {
  league: 'матч лиги',
  semi: 'полуфинал плей-офф',
  final: 'финал лиги',
  'intl-semi': 'полуфинал Кубка мира',
  'intl-final': 'финал Кубка мира',
};

export interface Fixture {
  week: number;
  home: string;
  away: string;
  stage: Stage;
  result?: { winner: string; kills: [number, number] };
}

export type StaffRole = 'analyst' | 'coach' | 'psych';
export const STAFF_INFO: Record<StaffRole, { name: string; text: string[] }> = {
  analyst: {
    name: 'Аналитик',
    text: ['Тренировки дают больше роста', 'Виден потенциал игроков на рынке и в академии'],
  },
  coach: {
    name: 'Тренер по драфту',
    text: ['Советует героя на каждом вашем ходу драфта', 'Сыгранность состава растёт быстрее'],
  },
  psych: {
    name: 'Психолог',
    text: ['Поражения меньше бьют по настроению', 'Усталость проходит быстрее'],
  },
};
export const STAFF_MAX = 3;
export const staffCost = (lvl: number) => 6000 * lvl; // нанять или повысить до уровня lvl
export const staffSalary = (lvl: number) => 400 * lvl;

export interface Sponsor {
  id: string;
  name: string;
  kind: 'fixed' | 'wins' | 'fans';
  base: number;
  perWin: number;
  perFan: number;
}
export const sponsorText = (sp: Sponsor) =>
  sp.kind === 'fixed'
    ? `${sp.base.toLocaleString('ru')} в неделю, без условий`
    : sp.kind === 'wins'
      ? `${sp.base.toLocaleString('ru')} в неделю и ${sp.perWin.toLocaleString('ru')} за каждую победу`
      : `${sp.perFan} за каждого болельщика в неделю`;

export interface Replay {
  id: string;
  label: string;
  setup: MatchSetup;
}

export interface SeasonRecord {
  season: number;
  place: number;
  titles: string[];
}

export interface Season {
  version: 5;
  seed: number;
  seasonNo: number;
  week: number; // 1-based
  trained: number; // неделя последней тренировки
  teams: Team[];
  fixtures: Fixture[];
  money: number;
  log: string[];
  finished: boolean; // межсезонье
  meta: Meta;
  unseenPatch: boolean;
  market: Player[]; // свободные агенты
  academy: Player[];
  academyOpen: boolean;
  staff: Record<StaffRole, number>;
  fans: number;
  sponsor: Sponsor | null;
  offers: Sponsor[];
  titles: string[]; // трофеи текущего сезона
  history: SeasonRecord[];
  replays: Replay[];
  talks: Record<string, number>; // игрок → неделя, когда отказал в переговорах
  expiring: string[]; // у кого закончился контракт (в межсезонье)
}

const SAVE_KEY = 'arena-manager-save-v5';
export const LEAGUE_WEEKS = 10;
export const ROSTER_MAX = 7;
export const ACADEMY_MAX = 4;
export const ACADEMY_COST = 10000;
export const ACADEMY_WEEKLY = 600;

// Круговая система: каждая пара команд играет дважды
function schedule(ids: string[]): Fixture[] {
  const n = ids.length;
  const arr = [...ids];
  const rounds: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) rounds.push({ week: r + 1, home: arr[i], away: arr[n - 1 - i], stage: 'league' });
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((f) => ({ ...f, week: f.week + n - 1, home: f.away, away: f.home }));
  return [...rounds, ...second];
}

const usedNicks = (s: Season | null) => {
  const u = new Set<string>();
  if (!s) return u;
  for (const t of s.teams) for (const p of [...t.players, ...t.bench]) u.add(p.nick);
  for (const p of [...s.market, ...s.academy]) u.add(p.nick);
  return u;
};

function makeFreeAgent(rng: Rng, s: Season | null, strong = false) {
  const lvl = strong ? rng.range(52, 66) : rng.range(38, 60);
  const p = makePlayer(rng, lvl, usedNicks(s), rng.int(0, 4) as Pos, rng.int(17, 31));
  p.contract = 0;
  p.together = 0;
  return p;
}

function makeProspect(rng: Rng, s: Season) {
  const p = makePlayer(rng, rng.range(32, 44), usedNicks(s), rng.int(0, 4) as Pos, rng.int(15, 17));
  p.potential = Math.round(rng.range(66, 92));
  p.salary = 150;
  p.contract = 0;
  p.together = 0;
  return p;
}

const SPONSORS: [string, Sponsor['kind']][] = [
  ['ТехноСфера', 'fixed'],
  ['Молния Энерджи', 'wins'],
  ['Пиксель Медиа', 'fans'],
  ['Кофейня «Зерно»', 'fixed'],
  ['Сеть «Гигабайт»', 'wins'],
  ['Стрим-платформа «Эфир»', 'fans'],
];

function makeOffers(s: Season, rng: Rng): Sponsor[] {
  const k = 1 + (s.seasonNo - 1) * 0.15 + s.fans / 20000;
  const pick = (kind: Sponsor['kind']) => {
    const list = SPONSORS.filter((x) => x[1] === kind);
    return rng.pick(list)[0];
  };
  return (['fixed', 'wins', 'fans'] as const).map((kind) => ({
    id: kind + s.seasonNo,
    name: pick(kind),
    kind,
    base: kind === 'fixed' ? Math.round((2500 * k) / 100) * 100 : kind === 'wins' ? Math.round((700 * k) / 100) * 100 : 0,
    perWin: kind === 'wins' ? Math.round((3000 * k) / 100) * 100 : 0,
    perFan: kind === 'fans' ? 0.9 : 0,
  }));
}

export function newSeason(seed = Date.now() % 1e9): Season {
  const rng = new Rng(seed);
  const teams = makeTeams(rng);
  const s: Season = {
    version: 5,
    seed,
    seasonNo: 1,
    week: 1,
    trained: 0,
    teams,
    fixtures: schedule(teams.map((t) => t.id)),
    money: 20000,
    log: ['Добро пожаловать в лигу! Соберите состав и выиграйте сезон.', 'Вышел предсезонный патч 1.0.'],
    finished: false,
    meta: newMeta(seed),
    unseenPatch: true,
    market: [],
    academy: [],
    academyOpen: false,
    staff: { analyst: 0, coach: 0, psych: 0 },
    fans: 2000,
    sponsor: null,
    offers: [],
    titles: [],
    history: [],
    replays: [],
    talks: {},
    expiring: [],
  };
  for (let i = 0; i < 10; i++) s.market.push(makeFreeAgent(rng, s, i < 3));
  s.offers = makeOffers(s, rng);
  return s;
}

export const totalWeeks = (_s: Season) => LEAGUE_WEEKS + 4;

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
    return s.version === 5 ? s : null;
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
export const roster = (t: Team) => [...t.players, ...t.bench];

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
  for (const t of s.teams.filter((x) => !x.foreign)) table.set(t.id, { team: t, played: 0, wins: 0, losses: 0, kd: 0 });
  for (const f of s.fixtures) {
    if (!f.result || f.stage !== 'league') continue;
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

// Сыгранность: сколько недель игроки стартовой пятёрки провели вместе
export const chemistry = (t: Team) => t.players.reduce((a, p) => a + Math.min(1, p.together / 12), 0) / t.players.length;

// Тренировка: рост зависит от возраста, потолка и аналитика
export function applyTraining(s: Season, t: Training) {
  const rng = new Rng(s.seed + s.week * 7919 + s.seasonNo * 131);
  const me = humanTeam(s);
  for (const p of roster(me)) {
    if (t === 'rest') {
      p.form = Math.min(100, p.form + 15);
      p.fatigue = Math.max(0, p.fatigue - 25);
      continue;
    }
    const room = Math.max(0.15, Math.min(1.3, (p.potential - ovr(p)) / 12));
    const ageK = p.age < 21 ? 1.3 : p.age < 25 ? 1 : p.age < 28 ? 0.75 : 0.5;
    const gain = rng.range(0.5, 2.2) * room * ageK * (1 + s.staff.analyst * 0.2);
    p[t] = Math.min(99, Math.round((p[t] + gain) * 10) / 10);
    p.form = Math.max(50, p.form - 6);
    p.fatigue = Math.min(100, p.fatigue + 8);
  }
  // Соперники тоже растут понемногу
  for (const team of s.teams.filter((x) => !x.human))
    for (const p of team.players) {
      const k = rng.pick(['atk', 'def', 'iq'] as const);
      if (ovr(p) < p.potential) p[k] = Math.min(99, Math.round((p[k] + rng.range(0, 1.2)) * 10) / 10);
    }
  s.trained = s.week;
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

// Настройка матча: снимок составов, чтобы повтор не зависел от будущих изменений
export function matchSetup(s: Season, teams: [Team, Team], picks: [string[], string[]], seed: number, extra: Partial<MatchSetup> = {}): MatchSetup {
  return JSON.parse(
    JSON.stringify({ teams, picks, seed, patch: s.meta.patch, chem: [chemistry(teams[0]), chemistry(teams[1])], ...extra }),
  );
}

// Матч двух компьютерных команд с драфтом по текущей мете
function aiMatch(s: Season, a: Team, b: Team, rng: Rng) {
  const d = autoDraftFull(a, b, rng, s.meta);
  const m = new Match(matchSetup(s, [a, b], d.picks, Math.floor(rng.next() * 1e9)), false);
  m.runToEnd();
  record(s.meta, matchRecord(m, d.bans, d.order));
  return m.s;
}

const SCRIMS = 3; // рейтинговые игры сообщества за неделю: дают мете больше статистики

export function saveReplay(s: Season, label: string, setup: MatchSetup) {
  s.replays.unshift({ id: 'r' + s.seasonNo + '-' + s.week + '-' + s.replays.length, label, setup });
  s.replays = s.replays.slice(0, 5);
}

const PRIZE: Record<Stage, [number, number]> = {
  league: [7000, 3000],
  semi: [12000, 4000],
  final: [30000, 10000],
  'intl-semi': [25000, 8000],
  'intl-final': [60000, 20000],
};

const FOREIGN = [
  { name: 'Синий Шторм', tag: 'ШТМ', color: '#58c7ff' },
  { name: 'Золотые Кони', tag: 'ЗЛК', color: '#ffd84d' },
  { name: 'Тихий Океан', tag: 'ТХО', color: '#4de0d0' },
  { name: 'Гранитный Двор', tag: 'ГРД', color: '#c0b6a8' },
  { name: 'Песчаные Змеи', tag: 'ПСЗ', color: '#e0a060' },
  { name: 'Ледяная Корона', tag: 'ЛДК', color: '#c4e4ff' },
];

const winnerOf = (s: Season, week: number, stage: Stage) =>
  s.fixtures.filter((f) => f.week === week && f.stage === stage).map((f) => f.result!.winner);

// Сыграть остальные матчи недели, подвести финансы и перейти дальше
export function finishWeek(s: Season, humanResult?: { winner: string; kills: [number, number] }, humanRec?: MatchRecord) {
  const rng = new Rng(s.seed + s.week * 104729 + s.seasonNo * 7);
  const me = humanTeam(s);
  if (humanRec) record(s.meta, humanRec);
  const myFx = humanFixture(s);
  for (const f of s.fixtures.filter((x) => x.week === s.week)) {
    if (f.result) continue;
    if (f === myFx && humanResult) {
      f.result = humanResult;
      continue;
    }
    const home = teamById(s, f.home);
    const away = teamById(s, f.away);
    const st = aiMatch(s, home, away, rng);
    f.result = { winner: st.winner === 0 ? home.id : away.id, kills: [st.kills[0], st.kills[1]] };
  }
  const ai = s.teams.filter((t) => !t.human && !t.foreign);
  for (let i = 0; i < SCRIMS; i++) {
    const a = rng.pick(ai);
    const b = rng.pick(ai.filter((t) => t !== a));
    aiMatch(s, a, b, rng);
  }

  // --- Деньги ---
  const played = !!myFx;
  const won = played && myFx!.result!.winner === me.id;
  const prize = played ? PRIZE[myFx!.stage][won ? 0 : 1] : 0;
  // в неделю без матча клуб платит половину
  const half = played ? 1 : 0.5;
  const salaries = Math.round(roster(me).reduce((a, p) => a + p.salary, 0) * half);
  const staff = Math.round((Object.values(s.staff) as number[]).reduce((a, l) => a + staffSalary(l), 0) * half);
  const academy = s.academyOpen ? Math.round((ACADEMY_WEEKLY + s.academy.reduce((a, p) => a + p.salary, 0)) * half) : 0;
  const sp = s.sponsor;
  const sponsor = !sp ? 0 : sp.kind === 'fixed' ? sp.base : sp.kind === 'wins' ? sp.base + (won ? sp.perWin : 0) : Math.round(s.fans * sp.perFan);
  const tickets = played ? Math.round(s.fans * 0.6) : 0;
  s.money += prize + sponsor + tickets - salaries - staff - academy;

  // --- Болельщики ---
  if (played) s.fans = Math.round(won ? s.fans * 1.03 + 60 : s.fans * 0.985);

  // --- Игроки: усталость, настроение, сыгранность ---
  const psy = s.staff.psych;
  for (const p of me.players) {
    if (played) {
      p.fatigue = Math.min(100, p.fatigue + 10);
      p.morale = clamp(p.morale + (won ? 5 : -5 * (1 - psy * 0.25)));
      p.form = Math.max(50, Math.min(100, p.form + (won ? 4 : -3)));
    }
  }
  for (const p of me.bench) p.morale = clamp(p.morale - 2 * (1 - psy * 0.25));
  for (const p of roster(me)) {
    p.fatigue = Math.max(0, p.fatigue - 6 - psy * 2);
    p.together += 1 + s.staff.coach * 0.3;
    // усталость тянет настроение вниз
    if (p.fatigue > 70) p.morale = clamp(p.morale - 3);
  }
  for (const t of s.teams.filter((x) => !x.human)) for (const p of t.players) p.together++;

  // --- Академия ---
  if (s.academyOpen)
    for (const p of s.academy)
      for (const k of ['atk', 'def', 'iq'] as const)
        if (ovr(p) < p.potential) p[k] = Math.min(99, Math.round((p[k] + rng.range(0.2, 0.7) * (1 + s.staff.analyst * 0.15)) * 10) / 10);

  // --- Рынок: кто-то уходит, кто-то приходит ---
  for (let i = 0; i < 2 && s.market.length > 6; i++) s.market.splice(rng.int(0, s.market.length - 1), 1);
  while (s.market.length < 10) s.market.push(makeFreeAgent(rng, s, rng.next() < 0.3));

  const stageTxt = played ? `${STAGE_NAMES[myFx!.stage]}: ${won ? 'победа' : 'поражение'}, призовые ${prize}` : 'без матча';
  s.log.unshift(
    `Неделя ${s.week}: ${stageTxt}. Спонсор +${sponsor}, билеты +${tickets}, зарплаты −${salaries + staff + academy}.`,
  );
  if (s.money < 0) s.log.unshift('Бюджет ушёл в минус! Продайте игрока или сократите персонал.');

  advance(s, rng);
  save(s);
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// Календарь: лига → плей-офф → Кубок мира → межсезонье
function advance(s: Season, rng: Rng) {
  const me = humanTeam(s);
  const w = s.week;
  if (w === LEAGUE_WEEKS) {
    const top = standings(s).slice(0, 4).map((x) => x.team.id);
    s.fixtures.push({ week: w + 1, home: top[0], away: top[3], stage: 'semi' }, { week: w + 1, home: top[1], away: top[2], stage: 'semi' });
    const place = standings(s).findIndex((x) => x.team.human) + 1;
    s.log.unshift(place <= 4 ? `Регулярный сезон окончен: ${place}-е место, вы в плей-офф!` : `Регулярный сезон окончен: ${place}-е место. Плей-офф без вас.`);
  } else if (w === LEAGUE_WEEKS + 1) {
    const [a, b] = winnerOf(s, w, 'semi');
    s.fixtures.push({ week: w + 1, home: a, away: b, stage: 'final' });
  } else if (w === LEAGUE_WEEKS + 2) {
    const champ = winnerOf(s, w, 'final')[0];
    s.fans = Math.round(s.fans * (champ === me.id ? 1.2 : 1));
    if (champ === me.id) s.titles.push(`Чемпион лиги, сезон ${s.seasonNo}`);
    s.log.unshift(`${teamById(s, champ).name} — чемпион лиги!`);
    // Зарубежные клубы на Кубок мира
    s.teams = s.teams.filter((t) => !t.foreign);
    const used = new Set<string>();
    const defs = [...FOREIGN].sort(() => rng.next() - 0.5).slice(0, 3);
    const foreign = defs.map((d, i) => ({
      id: 'f' + s.seasonNo + i,
      ...d,
      human: false,
      foreign: true,
      bench: [],
      players: ([0, 3, 1, 2, 4] as Pos[]).map((pos) => makePlayer(rng, 58 + rng.range(0, 10) + s.seasonNo, used, pos)),
    }));
    s.teams.push(...foreign);
    s.fixtures.push(
      { week: w + 1, home: champ, away: foreign[0].id, stage: 'intl-semi' },
      { week: w + 1, home: foreign[1].id, away: foreign[2].id, stage: 'intl-semi' },
    );
  } else if (w === LEAGUE_WEEKS + 3) {
    const [a, b] = winnerOf(s, w, 'intl-semi');
    s.fixtures.push({ week: w + 1, home: a, away: b, stage: 'intl-final' });
  } else if (w === LEAGUE_WEEKS + 4) {
    const champ = winnerOf(s, w, 'intl-final')[0];
    if (champ === me.id) {
      s.titles.push(`Обладатель Кубка мира, сезон ${s.seasonNo}`);
      s.fans = Math.round(s.fans * 1.4);
    }
    s.log.unshift(`${teamById(s, champ).name} выигрывает Кубок мира!`);
    endSeason(s, rng);
    return;
  }
  s.week++;
  if ((s.week - 1) % PATCH_EVERY === 0) {
    releasePatch(s.meta, s.week, s.seed + s.seasonNo * 999);
    s.unseenPatch = true;
    const p = s.meta.patch;
    const buffs = p.notes.filter((n) => n.kind === 'buff').length;
    const nerfs = p.notes.filter((n) => n.kind === 'nerf').length;
    s.log.unshift(`Вышел патч ${p.ver}: усилено героев ${buffs}, ослаблено ${nerfs}, изменений правил ${p.notes.length - buffs - nerfs}.`);
  }
}

// Межсезонье: возраст, рост и спад, контракты, уход ветеранов
function endSeason(s: Season, rng: Rng) {
  s.finished = true;
  const place = standings(s).findIndex((x) => x.team.human) + 1;
  s.history.unshift({ season: s.seasonNo, place, titles: [...s.titles] });
  s.log.unshift(`Сезон ${s.seasonNo} окончен. Место в лиге: ${place}.`);
  const me = humanTeam(s);
  s.expiring = [];
  const moves: string[] = [];
  for (const t of s.teams.filter((x) => !x.foreign)) {
    for (const p of roster(t)) {
      age(p, rng);
      p.contract--;
      if (t.human && p.contract <= 0) s.expiring.push(p.id);
    }
    if (t.human) continue;
    // Компьютерные клубы: ветераны уходят, на их место берут с рынка
    t.players = t.players.map((p) => {
      const leave = p.age >= 32 || (p.contract <= 0 && rng.next() < 0.35);
      if (!leave) {
        if (p.contract <= 0) p.contract = rng.int(1, 3);
        return p;
      }
      if (p.age < 32) s.market.push({ ...p, contract: 0, together: 0 });
      const cands = s.market.filter((x) => x.pos === p.pos && x.id !== p.id).sort((a, b) => ovr(b) - ovr(a));
      const n = cands[0] ?? makeFreeAgent(rng, s, true);
      s.market = s.market.filter((x) => x !== n);
      n.contract = rng.int(1, 3);
      n.together = 0;
      moves.push(`${p.nick} → ${n.nick} (${t.tag})`);
      return n;
    });
  }
  if (moves.length) s.log.unshift(`Межсезонье: ${moves.length} переходов в лиге. ${moves.slice(0, 3).join(', ')}${moves.length > 3 ? '…' : ''}`);
  for (const p of roster(me)) if (p.age >= 32) s.log.unshift(`${p.nick} (${p.age} лет) думает о завершении карьеры.`);
  for (const p of s.academy) age(p, rng);
  s.offers = makeOffers(s, rng);
}

function age(p: Player, rng: Rng) {
  p.age++;
  const d = p.age <= 21 ? rng.range(1, 4) : p.age <= 25 ? rng.range(0, 1.5) : p.age <= 27 ? rng.range(-0.8, 0.5) : -rng.range(0.8, 2.6);
  for (const k of ['atk', 'def', 'iq'] as const) {
    const cap = d > 0 && ovr(p) >= p.potential ? 0 : d;
    p[k] = Math.max(20, Math.min(99, Math.round((p[k] + cap + rng.range(-0.5, 0.5)) * 10) / 10));
  }
  if (p.age >= 28) p.potential = Math.min(p.potential, Math.round(ovr(p) + 2));
}

// Новый сезон в том же клубе
export function startNextSeason(s: Season) {
  const rng = new Rng(s.seed + s.seasonNo * 4441);
  const me = humanTeam(s);
  // контракты, которые не продлили
  const gone = roster(me).filter((p) => s.expiring.includes(p.id) && p.contract <= 0);
  for (const p of gone) {
    removeFromTeam(me, p);
    s.market.push({ ...p, together: 0 });
    s.log.unshift(`${p.nick} ушёл свободным агентом.`);
  }
  fillStarters(s, me, rng);
  s.expiring = [];
  s.teams = s.teams.filter((t) => !t.foreign);
  s.seasonNo++;
  s.week = 1;
  s.trained = 0;
  s.fixtures = schedule(s.teams.map((t) => t.id));
  s.finished = false;
  s.titles = [];
  s.talks = {};
  s.sponsor = null;
  if (s.academyOpen) for (let i = 0; i < 2 && s.academy.length < ACADEMY_MAX; i++) s.academy.push(makeProspect(rng, s));
  releasePatch(s.meta, 1, s.seed + s.seasonNo * 999);
  s.unseenPatch = true;
  s.log.unshift(`Начался сезон ${s.seasonNo}. Вышел патч ${s.meta.patch.ver}. Выберите спонсора.`);
  save(s);
}

function removeFromTeam(t: Team, p: Player) {
  const i = t.players.indexOf(p);
  if (i >= 0) {
    // на место стартера встаёт запасной той же позиции или любой
    const j = t.bench.findIndex((b) => b.pos === p.pos);
    const sub = j >= 0 ? t.bench.splice(j, 1)[0] : t.bench.shift();
    if (sub) t.players[i] = sub;
    else t.players.splice(i, 1);
  } else t.bench = t.bench.filter((x) => x !== p);
}

// Если стартовой пятёрки не хватает, лига выдаёт дешёвых новичков
function fillStarters(s: Season, t: Team, rng: Rng) {
  while (t.players.length < 5) {
    const need = ([0, 1, 2, 3, 4] as Pos[]).find((pos) => !t.players.some((p) => p.pos === pos)) ?? 0;
    const p = makePlayer(rng, 42, usedNicks(s), need, rng.int(18, 22));
    p.contract = 1;
    p.together = 0;
    t.players.push(p);
    s.log.unshift(`В состав временно взят новичок ${p.nick}.`);
  }
}

// ---------- Трансферы и переговоры ----------

export type Deal = 'sign' | 'buy' | 'renew' | 'promote';

export function owner(s: Season, p: Player): Team | null {
  return s.teams.find((t) => roster(t).includes(p)) ?? null;
}

export const transferFee = (p: Player) => Math.round((value(p) * 1.25) / 100) * 100;
export const signingBonus = (p: Player) => askSalary(p) * 3;
export const sellPrice = (p: Player) => Math.round((value(p) * 0.85) / 100) * 100;

// Что просит игрок: зарплата зависит от силы, настроения и успехов клуба
export function asking(s: Season, p: Player, deal: Deal) {
  let a = askSalary(p);
  if (deal === 'renew') a *= p.morale < 40 ? 1.25 : p.morale > 75 ? 0.92 : 1;
  if (deal === 'promote') a = Math.max(200, Math.round(a * 0.6));
  if (deal === 'buy') a *= 1.1;
  a *= 1 - Math.min(0.1, s.fans / 100000); // в популярный клуб идут охотнее
  return Math.round(a / 10) * 10;
}

// Шанс, что игрок согласится на предложенную зарплату
export function acceptChance(s: Season, p: Player, offer: number, deal: Deal) {
  const r = offer / asking(s, p, deal);
  let c = r >= 1.1 ? 1 : r >= 1 ? 0.9 : r >= 0.9 ? 0.6 : r >= 0.8 ? 0.3 : 0.05;
  if (deal === 'renew') c += (p.morale - 60) / 200;
  return Math.max(0, Math.min(1, c));
}

export const canTalk = (s: Season, p: Player) => s.talks[p.id] !== s.week + s.seasonNo * 100;

export function upfront(p: Player, deal: Deal) {
  return deal === 'sign' ? signingBonus(p) : deal === 'buy' ? transferFee(p) : 0;
}

export function negotiate(s: Season, p: Player, offer: number, years: number, deal: Deal): { ok: boolean; text: string } {
  const me = humanTeam(s);
  const cost = upfront(p, deal);
  if (deal !== 'renew' && roster(me).length >= ROSTER_MAX) return { ok: false, text: `В составе уже ${ROSTER_MAX} игроков. Сначала продайте кого-нибудь.` };
  if (cost > 0 && cost > s.money) return { ok: false, text: 'Не хватает денег.' };
  const rng = new Rng(s.seed + s.week * 17 + p.nick.length * 991 + offer);
  if (rng.next() > acceptChance(s, p, offer, deal)) {
    s.talks[p.id] = s.week + s.seasonNo * 100;
    p.morale = clamp(p.morale - (deal === 'renew' ? 8 : 0));
    save(s);
    return { ok: false, text: `${p.nick} отказался. Вернуться к разговору можно на следующей неделе.` };
  }
  s.money -= cost;
  p.salary = offer;
  p.contract = deal === 'renew' ? Math.max(0, p.contract) + years : years;
  if (deal === 'renew') {
    s.expiring = s.expiring.filter((x) => x !== p.id);
    p.morale = clamp(p.morale + 6);
  } else {
    if (deal === 'sign') s.market = s.market.filter((x) => x !== p);
    if (deal === 'promote') s.academy = s.academy.filter((x) => x !== p);
    if (deal === 'buy') {
      const from = owner(s, p)!;
      // клуб-продавец берёт замену с рынка
      const i = from.players.indexOf(p);
      const cands = s.market.filter((x) => x.pos === p.pos).sort((a, b) => ovr(b) - ovr(a));
      const sub = cands[0] ?? makeFreeAgent(new Rng(s.seed + s.week), s);
      s.market = s.market.filter((x) => x !== sub);
      sub.contract = 2;
      from.players[i] = sub;
      s.log.unshift(`${from.name} продали ${p.nick} за ${cost.toLocaleString('ru')}.`);
    }
    p.together = 0;
    p.morale = clamp(Math.max(p.morale, 70));
    me.bench.push(p);
  }
  save(s);
  return { ok: true, text: deal === 'renew' ? `${p.nick} продлил контракт на ${years} сез.` : `${p.nick} в команде! Он в запасе, его можно выпустить в составе.` };
}

// Продажа: игрока забирает клуб, которому он нужнее всего
export function sell(s: Season, p: Player): string {
  const me = humanTeam(s);
  if (roster(me).length <= 5) return 'Нельзя: в команде должно остаться хотя бы 5 игроков.';
  const price = sellPrice(p);
  const buyers = s.teams.filter((t) => !t.human && !t.foreign);
  const buyer = buyers.sort((a, b) => ovr(a.players.find((x) => x.pos === p.pos) ?? a.players[0]) - ovr(b.players.find((x) => x.pos === p.pos) ?? b.players[0]))[0];
  removeFromTeam(me, p);
  const i = buyer.players.findIndex((x) => x.pos === p.pos);
  const out = buyer.players[i >= 0 ? i : 0];
  buyer.players[i >= 0 ? i : 0] = { ...p, together: 0, contract: 2 };
  s.market.push({ ...out, together: 0, contract: 0 });
  s.money += price;
  s.log.unshift(`${p.nick} продан в «${buyer.name}» за ${price.toLocaleString('ru')}.`);
  save(s);
  return `${p.nick} продан за ${price.toLocaleString('ru')}.`;
}

export function release(s: Season, p: Player): string {
  const me = humanTeam(s);
  if (roster(me).length <= 5) return 'Нельзя: в команде должно остаться хотя бы 5 игроков.';
  const fee = p.salary * 4;
  if (fee > s.money) return 'Не хватает денег на неустойку.';
  s.money -= fee;
  removeFromTeam(me, p);
  s.market.push({ ...p, together: 0, contract: 0, morale: 50 });
  s.log.unshift(`Контракт с ${p.nick} расторгнут, неустойка ${fee}.`);
  save(s);
  return `${p.nick} покинул команду.`;
}

// Поменять стартера и запасного местами
export function swapStarter(s: Season, starter: Player, sub: Player) {
  const me = humanTeam(s);
  const i = me.players.indexOf(starter);
  const j = me.bench.indexOf(sub);
  if (i < 0 || j < 0) return;
  me.players[i] = sub;
  me.bench[j] = starter;
  save(s);
}

// ---------- Персонал, академия, спонсоры ----------

export function hireStaff(s: Season, r: StaffRole): string {
  const lvl = s.staff[r] + 1;
  if (lvl > STAFF_MAX) return 'Уже максимальный уровень.';
  const cost = staffCost(lvl);
  if (cost > s.money) return 'Не хватает денег.';
  s.money -= cost;
  s.staff[r] = lvl;
  s.log.unshift(`${STAFF_INFO[r].name}: теперь уровень ${lvl}.`);
  save(s);
  return '';
}

export function fireStaff(s: Season, r: StaffRole) {
  if (s.staff[r] > 0) s.staff[r]--;
  save(s);
}

export function openAcademy(s: Season): string {
  if (s.academyOpen) return '';
  if (s.money < ACADEMY_COST) return 'Не хватает денег.';
  s.money -= ACADEMY_COST;
  s.academyOpen = true;
  const rng = new Rng(s.seed + s.week * 313);
  for (let i = 0; i < 3; i++) s.academy.push(makeProspect(rng, s));
  s.log.unshift('Открыта академия: в ней три молодых игрока.');
  save(s);
  return '';
}

export function dropProspect(s: Season, p: Player) {
  s.academy = s.academy.filter((x) => x !== p);
  save(s);
}

export function chooseSponsor(s: Season, sp: Sponsor) {
  s.sponsor = sp;
  s.log.unshift(`Подписан спонсор «${sp.name}».`);
  save(s);
}

// Что видно о потенциале: зависит от аналитика
export function potentialText(s: Season, p: Player) {
  const a = s.staff.analyst;
  if (a >= 2) return String(p.potential);
  if (a === 1) return `${Math.max(20, p.potential - 6 - (p.nick.length % 4))}–${Math.min(99, p.potential + 6 - (p.nick.length % 3))}`;
  return '?';
}
