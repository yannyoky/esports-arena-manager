// Драфт по турнирной схеме: две фазы банов и две фазы пиков.
// Синяя сторона (0) выбирает первой, красная (1) получает два пика подряд.
import { CHAMPIONS, Champion, POS_ROLES, Role, Team, ALL_ROLES } from './data';
import { Rng } from './rng';
import { Meta, heroPower } from './meta';

export type Act = 'ban' | 'pick';
export interface Step {
  side: 0 | 1;
  act: Act;
}

const seq = (s: string): Step[] =>
  s.split(' ').map((t) => ({ side: (t[1] === 'B' ? 0 : 1) as 0 | 1, act: t[0] === 'b' ? 'ban' : 'pick' }));

// b = бан, p = пик; B = синие, R = красные
export const ORDER: Step[] = seq('bB bR bB bR bB bR pB pR pR pB pB pR bR bB bR bB pR pB pB pR');

export const PHASE_NAME = (i: number) => {
  if (i < 6) return 'Первые баны';
  if (i < 12) return 'Первые пики';
  if (i < 16) return 'Вторые баны';
  return 'Последние пики';
};

export interface DraftState {
  step: number;
  bans: [string[], string[]];
  picks: [string[], string[]];
  order: Record<string, number>; // на каком ходу взят или забанен герой
}

export const newDraft = (): DraftState => ({ step: 0, bans: [[], []], picks: [[], []], order: {} });

export const taken = (d: DraftState) => new Set([...d.bans[0], ...d.bans[1], ...d.picks[0], ...d.picks[1]]);
export const done = (d: DraftState) => d.step >= ORDER.length;

export function apply(d: DraftState, id: string) {
  const st = ORDER[d.step];
  (st.act === 'ban' ? d.bans : d.picks)[st.side].push(id);
  d.order[id] = d.step;
  d.step++;
}

// Насколько команда сильна на герое: лучший игрок этой роли
const teamFit = (team: Team, c: Champion) => Math.max(...team.players.map((p) => p.pool[c.role] + (p.favs?.includes(c.id) ? 12 : 0)));

// Роли, нужные позициям команды, которые ещё не закрыты героями
const missingRoles = (team: Team, picks: string[]) => {
  const roles = picks.map((id) => CHAMPIONS.find((c) => c.id === id)!.role);
  const open = team.players.filter((p) => {
    const i = roles.findIndex((r) => POS_ROLES[p.pos].includes(r));
    if (i >= 0) {
      roles.splice(i, 1);
      return false;
    }
    return true;
  });
  const need = new Set<Role>();
  for (const p of open) for (const r of POS_ROLES[p.pos]) need.add(r);
  return ALL_ROLES.filter((r) => need.has(r));
};

// Компьютерный капитан: банит сильных для соперника, пикает под свой состав
// Капитан следит за метой: усиленных героев берёт и банит охотнее, ослабленных обходит
export function aiChoice(d: DraftState, me: Team, foe: Team, rng: Rng, meta?: Meta): string {
  const st = ORDER[d.step];
  const free = CHAMPIONS.filter((c) => !taken(d).has(c.id));
  const pw = (c: Champion) => (meta ? heroPower(meta, c.id) * 110 : 0);
  const score = (c: Champion) => {
    if (st.act === 'ban') return teamFit(foe, c) + pw(c) + rng.range(0, 25);
    const need = missingRoles(me, d.picks[st.side]);
    const roleBonus = need.includes(c.role) ? 30 : -25;
    // Без поддержки и стража состав разваливается: подтягиваем их к середине драфта
    const core: Role[] = ['tank', 'support'];
    const coreBonus = core.includes(c.role) && need.includes(c.role) && d.picks[st.side].length >= 2 ? 15 : 0;
    return teamFit(me, c) + roleBonus + coreBonus + pw(c) + rng.range(0, 20);
  };
  return free.sort((a, b) => score(b) - score(a))[0].id;
}

// Раздать выбранных героев игрокам так, чтобы сумма владения была максимальной
export function assign(team: Team, picks: string[]): string[] {
  const champs = picks.map((id) => CHAMPIONS.find((c) => c.id === id)!);
  let best: number[] = [0, 1, 2, 3, 4];
  let bestScore = -1;
  const perm = (arr: number[], k: number) => {
    if (k === arr.length) {
      const s = arr.reduce((acc, ci, pi) => {
        const pl = team.players[pi];
        const fit = POS_ROLES[pl.pos].includes(champs[ci].role) ? 25 : 0;
        return acc + pl.pool[champs[ci].role] + fit + (pl.favs?.includes(champs[ci].id) ? 12 : 0);
      }, 0);
      if (s > bestScore) {
        bestScore = s;
        best = [...arr];
      }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm([0, 1, 2, 3, 4], 0);
  return best.map((ci) => picks[ci]);
}

// Полный драфт без участия человека (матчи других команд)
export function autoDraftFull(a: Team, b: Team, rng: Rng, meta?: Meta) {
  const d = newDraft();
  while (!done(d)) {
    const side = ORDER[d.step].side;
    apply(d, aiChoice(d, side === 0 ? a : b, side === 0 ? b : a, rng, meta));
  }
  return { picks: [assign(a, d.picks[0]), assign(b, d.picks[1])] as [string[], string[]], bans: d.bans, order: d.order };
}

export const autoDraft = (a: Team, b: Team, rng: Rng, meta?: Meta) => autoDraftFull(a, b, rng, meta).picks;
