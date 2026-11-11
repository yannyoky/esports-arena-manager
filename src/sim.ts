// Симуляция матча 5 на 5: три линии, башни, ядра, волны крипов, уровни.
// Герои действуют по своей роли, стратегии команды и тактике игрока (iq).
// Симуляция не зависит от отрисовки, поэтому матч можно мгновенно пропустить.
import { AbilityKind, Champion, POS_ROLES, Player, Pos, Role, Team, champById } from './data';
import { CAMPS, CORE_POS, H, LaneId, OBJECTIVES, W, lanePoint, nearestT, towerT } from './map';
import { Rng } from './rng';
import { BASE_RULES, Patch, Rules, modOf } from './meta';

export { W, H };
export const TICK = 1 / 30;
export const MATCH_TIME = 300;
export const CORE_HP = 3000;
const TOWER_HP = 1100;
const TOWER_RANGE = 165;
const WAVE_EVERY = 22;
const MAX_LEVEL = 12;

export type Strategy = 'lanes' | 'group' | 'pick';
export const STRATEGY_TEXT: Record<Strategy, [string, string]> = {
  lanes: ['Игра от линий', 'Каждый держит свою линию и копит опыт. Команда собирается вместе ближе к концу.'],
  group: ['Командный напор', 'Рано собираемся впятером и сносим башни по одной линии за другой.'],
  pick: ['Охота', 'Ассасин и центр бродят по карте и ловят одиночек. Команда дерётся смелее.'],
};

// Позиция игрока определяет его линию; лес бродит между линиями
export type Slot = Pos;
const laneOf = (slot: Slot): LaneId => (slot === 3 ? 1 : slot === 4 ? 2 : (slot as LaneId));
const laneDist = (lane: LaneId, x: number, y: number) => {
  const [lx, ly] = lanePoint(lane, nearestT(lane, x, y));
  return Math.hypot(lx - x, ly - y);
};

export interface Ent {
  kind: 'hero' | 'creep' | 'tower' | 'core' | 'neutral';
  side: 0 | 1 | 2; // 2 — нейтральные монстры
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  flash: number;
}

type Intent = { kind: 'move'; x: number; y: number } | { kind: 'attack'; target: Ent } | { kind: 'home' };

export interface Unit extends Ent {
  kind: 'hero';
  side: 0 | 1;
  player: Player;
  champ: Champion;
  slot: Slot;
  shield: number;
  dmg: number;
  armor: number;
  atkT: number;
  abT: number;
  stun: number;
  hidden: number;
  dead: number;
  kills: number;
  deaths: number;
  dealt: number;
  healed: number;
  level: number;
  xp: number;
  homeX: number;
  homeY: number;
  retreating: boolean;
  thinkT: number;
  intent: Intent;
  aggro: number; // недавно атаковал героя: башни бьют его первым
  calm: number; // сколько секунд без урона: вне боя здоровье восстанавливается
  face: 1 | -1;
  moving: boolean;
  swing: number;
  cast: number;
  cdK: number; // множитель перезарядки умения из патча
  assists: number;
  gold: number; // заработанное золото: показатель вклада
  heroDmg: number; // урон по героям
  towerDmg: number; // урон по строениям
  hitBy: Record<number, number>; // индекс врага → когда он последний раз бил
  multi: number; // убийств подряд за короткое время
  lastKill: number;
  streak: number; // убийств подряд без смерти
  // Поведение на линии (правила v3): размен ударами и ганки
  trade: number; // сколько ещё длится размен
  tradeCd: number; // пауза до следующего размена
  foe: Unit | null; // цель размена или ганка
  gank: number; // сколько ещё длится ганк
  gankCd: number;
}

export type NeutralType = 'camp' | 'spirit' | 'colossus';
export const NEUTRAL_NAMES: Record<NeutralType, string> = { camp: 'Лесной лагерь', spirit: 'Речной дух', colossus: 'Каменный колосс' };

export interface Neutral extends Ent {
  kind: 'neutral';
  type: NeutralType;
  homeX: number;
  homeY: number;
  dmg: number;
  atkT: number;
  respawn: number; // >0 — время до появления
  target: Unit | null;
  face: 1 | -1;
  swing: number;
}

export interface Creep extends Ent {
  kind: 'creep';
  side: 0 | 1;
  lane: LaneId;
  t: number;
  dmg: number;
  atkT: number;
  face: 1 | -1;
  moving: boolean;
  swing: number;
}

export interface Tower extends Ent {
  kind: 'tower';
  side: 0 | 1;
  lane: LaneId;
  tier: 0 | 1;
  atkT: number;
}

export interface Core extends Ent {
  kind: 'core';
  side: 0 | 1;
  atkT: number;
  hit: number;
  low?: boolean;
}

export type FxKind = 'shot' | 'arrow' | 'bolt' | 'aoe' | 'heal' | 'ward' | 'dash' | 'hook' | 'text' | 'death' | 'slash' | 'tower' | 'rubble' | 'level' | 'spark' | 'beam' | 'gold';

// События матча для комментаторов и баннеров
export type MatchEvent =
  | { kind: 'first'; t: number; killer: Unit | null; victim: Unit; gank?: Unit; solo?: boolean }
  | { kind: 'kill'; t: number; killer: Unit | null; victim: Unit; multi: number; streak: number; shutdown: number; gank?: Unit; solo?: boolean }
  | { kind: 'gank'; t: number; by: Unit; foe: Unit } // только для зрителя: кто пошёл ганкать
  | { kind: 'ace'; t: number; side: 0 | 1 }
  | { kind: 'tower'; t: number; side: 0 | 1; lane: LaneId; tier: 0 | 1 }
  | { kind: 'objective'; t: number; side: 0 | 1; type: NeutralType }
  | { kind: 'core'; t: number; side: 0 | 1 } // ядро стороны side ниже половины
  | { kind: 'late'; t: number };

export interface Fx {
  kind: FxKind;
  ab?: AbilityKind; // эффект конкретного умения
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  color: string;
  t: number;
  life: number;
  text?: string;
}

export interface MatchSetup {
  teams: [Team, Team];
  picks: [string[], string[]];
  seed: number;
  strategies?: [Strategy, Strategy];
  slots?: [Slot[], Slot[]];
  patch?: Patch; // баланс текущего патча: множители героев и награды
  chem?: [number, number]; // сыгранность составов 0–1
  big?: boolean; // плей-офф или Кубок мира: важен характер игроков
  ver?: number; // версия правил матча: старые повторы считаются по старым правилам
}

// Камень, ножницы, бумага: охота ловит линии, линии перерастают напор, напор задавливает охоту
export const COUNTERS: Record<Strategy, Strategy> = { pick: 'lanes', lanes: 'group', group: 'pick' };
export const COUNTER_BONUS = 1.07;

export type FeedItem =
  | { kind: 'kill'; t: number; killer: Unit | null; victim: Unit }
  | { kind: 'tower'; t: number; side: 0 | 1; lane: LaneId }
  | { kind: 'objective'; t: number; side: 0 | 1; type: NeutralType };

export interface MatchState {
  time: number;
  units: Unit[];
  creeps: Creep[];
  towers: Tower[];
  neutrals: Neutral[];
  spirit: [number, number]; // сколько речных духов взяла сторона: урон за каждого задаёт патч
  siege: [number, number]; // время усиления колосса: урон по строениям задаёт патч
  objectives: [number, number]; // взятые духи и колоссы
  goldLine: number[]; // разница золота синих и красных каждые 10 секунд
  events: MatchEvent[];
  lateSaid?: boolean;
  cores: [Core, Core];
  kills: [number, number];
  towersDown: [number, number]; // сколько башен разрушила сторона
  fx: Fx[];
  feed: FeedItem[];
  over: boolean;
  winner: 0 | 1 | -1;
  shake: number;
  nextWave: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function autoStrategy(picks: string[]): Strategy {
  const roles = picks.map((id) => champById(id).role);
  const n = (r: Role) => roles.filter((x) => x === r).length;
  if (n('assassin') >= 1 && n('mage') + n('assassin') >= 2) return 'pick';
  if (n('tank') + n('fighter') >= 2 && n('support') >= 1) return 'group';
  return 'lanes';
}

export class Match {
  s: MatchState;
  rng: Rng;
  setup: MatchSetup;
  strat: [Strategy, Strategy];
  fxOn: boolean;
  R: Rules;

  constructor(setup: MatchSetup, fxOn = true) {
    this.setup = setup;
    this.fxOn = fxOn;
    this.rng = new Rng(setup.seed);
    this.R = setup.patch?.rules ?? BASE_RULES;
    this.strat = setup.strategies ?? [autoStrategy(setup.picks[0]), autoStrategy(setup.picks[1])];
    const units: Unit[] = [];
    for (const side of [0, 1] as const) {
      setup.teams[side].players.forEach((p, i) => {
        const c = champById(setup.picks[side][i]);
        // Герой не своей позиции слабее: игрок непривычен к такой роли
        const onPos = POS_ROLES[p.pos].includes(c.role) ? 1 : 0.92;
        // любимый герой даёт прибавку к владению
        const mastery = Math.min(1.05, p.pool[c.role] / 100 + (p.favs?.includes(c.id) ? 0.12 : 0) + (p.prac?.[c.id] ?? 0) * 0.08);
        // форма, настроение и усталость
        const formK = (p.form / 100) * (0.92 + (p.morale ?? 70) / 1250) * (1 - (p.fatigue ?? 0) / 500);
        const leader = setup.teams[side].players.some((x) => x.trait === 'leader');
        const chemK = 0.97 + (setup.chem?.[side] ?? 0.5) * 0.06 + (leader ? 0.015 : 0);
        // характер: звезда бьёт сильнее, в больших матчах решают нервы
        const nerve = setup.big ? (p.trait === 'nervous' ? 0.94 : p.trait === 'calm' ? 1.04 : 1) : 1;
        const starK = p.trait === 'star' ? 1.05 : 1;
        const [cx, cy] = CORE_POS[side];
        const hx = cx + (side === 0 ? 50 : -50);
        const hy = cy - 80 + i * 40;
        const mod = modOf(setup.patch, c.id);
        const maxHp = mod.hp * c.hp * (0.8 + p.def / 250) * (0.9 + mastery * 0.15) * onPos * nerve;
        units.push({
          kind: 'hero', side, player: p, champ: c, slot: setup.slots?.[side]?.[i] ?? p.pos, x: hx, y: hy, hp: maxHp, maxHp, shield: 0, flash: 0,
          dmg: nerve * starK * chemK * mod.dmg * c.dmg * (0.75 + p.atk / 200) * (0.85 + mastery * 0.25) * (0.85 + formK * 0.15) * onPos,
          armor: Math.min(0.4, p.def / 300),
          atkT: this.rng.range(0, 0.5), abT: c.abilityCd * mod.cd * this.rng.range(0.3, 0.8), cdK: mod.cd, streak: 0, assists: 0, gold: 0, heroDmg: 0, towerDmg: 0, hitBy: {}, multi: 0, lastKill: -99,
          stun: 0, hidden: 0, dead: 0, kills: 0, deaths: 0, dealt: 0, healed: 0, level: 1, xp: 0,
          homeX: hx, homeY: hy, retreating: false, calm: 0, thinkT: this.rng.range(0, 0.3), intent: { kind: 'home' }, aggro: 0,
          face: side === 0 ? 1 : -1, moving: false, swing: 0, cast: 0,
          trade: 0, tradeCd: 0, foe: null, gank: 0, gankCd: 0,
        });
      });
    }
    const towers: Tower[] = [];
    for (const side of [0, 1] as const)
      for (const lane of [0, 1, 2] as LaneId[])
        for (const tier of [0, 1] as const) {
          const [x, y] = lanePoint(lane, towerT(side, tier));
          towers.push({ kind: 'tower', side, lane, tier, x, y, hp: TOWER_HP, maxHp: TOWER_HP, atkT: 0, flash: 0 });
        }
    this.s = {
      time: 0, units, creeps: [], towers,
      cores: [
        { kind: 'core', side: 0, x: CORE_POS[0][0], y: CORE_POS[0][1], hp: CORE_HP, maxHp: CORE_HP, hit: 0, flash: 0, atkT: 0 },
        { kind: 'core', side: 1, x: CORE_POS[1][0], y: CORE_POS[1][1], hp: CORE_HP, maxHp: CORE_HP, hit: 0, flash: 0, atkT: 0 },
      ],
      neutrals: [
        ...CAMPS.map(([x, y]) => this.neutral('camp', x, y, 0)),
        this.neutral('spirit', OBJECTIVES.spirit[0], OBJECTIVES.spirit[1], 45),
        this.neutral('colossus', OBJECTIVES.colossus[0], OBJECTIVES.colossus[1], 110),
      ],
      spirit: [0, 0],
      siege: [0, 0],
      objectives: [0, 0],
      goldLine: [0],
      events: [],
      kills: [0, 0], towersDown: [0, 0], fx: [], feed: [], over: false, winner: -1, shake: 0, nextWave: 2,
    };
  }

  private neutral(type: NeutralType, x: number, y: number, respawn: number): Neutral {
    const hp = type === 'camp' ? 650 : type === 'spirit' ? 2600 : 5200;
    return { kind: 'neutral', side: 2, type, x, y, homeX: x, homeY: y, hp: respawn > 0 ? 0 : hp, maxHp: hp, dmg: type === 'camp' ? 28 : type === 'spirit' ? 60 : 95, atkT: 0, respawn, target: null, flash: 0, face: -1, swing: 0 };
  }

  // ---------- Помощники ----------

  private fx(f: Omit<Fx, 'life'>) {
    if (this.fxOn) this.s.fx.push({ ...f, life: f.t });
  }

  private aliveHeroes(side: 0 | 1) {
    return this.s.units.filter((u) => u.side === side && u.dead <= 0);
  }

  // Башня уязвима, если перед ней на линии нет живой внешней башни
  vulnerable(e: Ent): boolean {
    if (e.hp <= 0) return false;
    if (e.kind === 'tower') {
      const t = e as Tower;
      return t.tier === 0 || !this.s.towers.some((o) => o.side === t.side && o.lane === t.lane && o.tier === 0 && o.hp > 0);
    }
    if (e.kind === 'core') return this.s.towers.some((o) => o.side === e.side && o.tier === 1 && o.hp <= 0);
    if (e.kind === 'neutral') return (e as Neutral).respawn <= 0;
    return true;
  }

  private enemyStructures(side: 0 | 1): Ent[] {
    return [...this.s.towers.filter((t) => t.side !== side), this.s.cores[1 - side] as Ent].filter((e) => this.vulnerable(e));
  }

  // Следующая цель на линии: внешняя башня, потом внутренняя, потом ядро
  private laneObjective(side: 0 | 1, lane: LaneId): Ent {
    const foe = (1 - side) as 0 | 1;
    for (const tier of [0, 1] as const) {
      const t = this.s.towers.find((o) => o.side === foe && o.lane === lane && o.tier === tier)!;
      if (t.hp > 0) return t;
    }
    return this.s.cores[foe];
  }

  private ownTower(side: 0 | 1, lane: LaneId): Ent {
    for (const tier of [0, 1] as const) {
      const t = this.s.towers.find((o) => o.side === side && o.lane === lane && o.tier === tier)!;
      if (t.hp > 0) return t;
    }
    return this.s.cores[side];
  }

  private gainXp(h: Unit, xp: number) {
    h.gold += xp;
    if (h.level >= MAX_LEVEL) return;
    h.xp += xp * (this.strat[h.side] === 'lanes' ? this.R.lanesXp : 1); // игра от линий быстрее копит опыт
    while (h.level < MAX_LEVEL && h.xp >= 80 + h.level * 40) {
      h.xp -= 80 + h.level * 40;
      h.level++;
      h.maxHp *= 1.07;
      h.hp = Math.min(h.maxHp, h.hp * 1.07 + h.maxHp * 0.1);
      h.dmg *= 1.07;
      this.fx({ kind: 'level', x: h.x, y: h.y, color: '#ffd166', t: 0.8, text: 'Ур. ' + h.level });
    }
  }

  private shareXp(side: 0 | 1 | 2, x: number, y: number, xp: number, r = 260) {
    if (side === 2) return;
    const near = this.aliveHeroes(side).filter((h) => dist(h, { x, y }) < r);
    for (const h of near) this.gainXp(h, xp / Math.max(1, near.length * 0.7));
  }

  private killHero(victim: Unit, killer: Unit | null) {
    victim.hp = 0;
    victim.dead = (7 + victim.level * 1.8 + this.s.time / 30) * this.R.respawn;
    const bounty = this.R.bounty * Math.min(5, victim.streak); // награда за прерванную серию
    const shutdown = victim.streak;
    victim.streak = 0;
    victim.deaths++;
    victim.shield = 0;
    victim.hidden = 0;
    victim.retreating = false;
    const foe = (1 - victim.side) as 0 | 1;
    this.s.kills[foe]++;
    if (killer) {
      killer.kills++;
      killer.streak++;
      killer.gold += 100;
      killer.multi = this.s.time - killer.lastKill < 6 ? killer.multi + 1 : 1;
      killer.lastKill = this.s.time;
      this.gainXp(killer, (60 + victim.level * 12) * this.R.killXp + bounty);
      this.fx({ kind: 'gold', x: killer.x, y: killer.y, color: '#ffd166', t: 1, text: '+' + Math.round(100 + bounty) });
    }
    const ev = this.s.events;
    // Для комментаторов: удачный ганк и убийство один на один
    const gank = this.s.units.find((a) => a.side === foe && a.gank > 0 && a.foe === victim && a.dead <= 0);
    const helpers = Object.entries(victim.hitBy).filter(([i, t]) => this.s.units[+i] !== killer && this.s.time - t < 8).length;
    const solo = !!killer && !helpers && killer.slot !== 3 && victim.slot !== 3 && this.s.time < 200;
    if (this.s.kills[0] + this.s.kills[1] === 1) ev.push({ kind: 'first', t: this.s.time, killer, victim, gank, solo });
    else ev.push({ kind: 'kill', t: this.s.time, killer, victim, multi: killer?.multi ?? 0, streak: killer?.streak ?? 0, shutdown, gank, solo });
    if (this.s.units.every((u) => u.side !== victim.side || u.dead > 0 || u === victim)) ev.push({ kind: 'ace', t: this.s.time, side: victim.side });
    this.shareXp(foe, victim.x, victim.y, (40 + victim.level * 8) * this.R.killXp + bounty, 320);
    // помощь: все враги, кто бил жертву за последние 8 секунд
    for (const [i, t] of Object.entries(victim.hitBy)) {
      const a = this.s.units[+i];
      if (a !== killer && this.s.time - t < 8) {
        a.assists++;
        a.gold += 50;
      }
    }
    victim.hitBy = {};
    this.s.feed.unshift({ kind: 'kill', t: this.s.time, killer, victim });
    if (this.s.feed.length > 6) this.s.feed.pop();
    this.fx({ kind: 'death', x: victim.x, y: victim.y, color: victim.side === 0 ? '#7fb2ff' : '#ff8a96', t: 1.1 });
  }

  // Урон по любой сущности. src — герой (для статистики и опыта) или null
  private damage(src: Unit | null, dst: Ent, amount: number, crit = false) {
    if (dst.hp <= 0 || !this.vulnerable(dst)) return;
    let dmg = amount * this.rng.range(0.9, 1.1);
    if (src) {
      dmg *= 1 + this.s.spirit[src.side] * this.R.spiritPct;
      // Охота: одиночек без союзников рядом бьём сильнее
      if ((this.setup.ver ?? 1) >= 2 && COUNTERS[this.strat[src.side]] === this.strat[1 - src.side]) dmg *= COUNTER_BONUS;
      if (dst.kind === 'hero' && this.strat[src.side] === 'pick' && !this.s.units.some((o) => o !== dst && o.side === dst.side && o.dead <= 0 && dist(o, dst) < 250)) dmg *= this.R.pickBonus;
      if (dst.kind === 'tower' || dst.kind === 'core') {
        dmg *= 1 + src.level * 0.1; // опытные герои сносят строения быстрее
        if (this.s.time > 210) dmg *= 1.5; // поздняя игра: базы падают быстрее
        if (this.s.siege[src.side] > 0) dmg *= this.R.siegeMult;
      }
    }
    if (dst.kind === 'neutral' && src) (dst as Neutral).target = src;
    if (dst.kind === 'hero') {
      const h = dst as Unit;
      h.calm = 0;
      dmg *= 1 - h.armor;
      if (h.shield > 0) {
        const a = Math.min(h.shield, dmg);
        h.shield -= a;
        dmg -= a;
      }
      if (src) src.aggro = 1.5;
    }
    if ((dst.kind === 'tower' || dst.kind === 'core') && !src) dmg *= 1.5; // крипы хорошо бьют строения
    if (src) {
      src.dealt += dmg;
      if (dst.kind === 'hero') {
        src.heroDmg += dmg;
        this.fx({ kind: 'spark', x: dst.x, y: dst.y, color: crit || amount > src.dmg * 1.5 ? '#ffd166' : '#fff3d6', t: 0.25 });
        (dst as Unit).hitBy[this.s.units.indexOf(src)] = this.s.time;
      } else if (dst.kind === 'tower' || dst.kind === 'core') src.towerDmg += dmg;
    }
    dst.hp -= dmg;
    dst.flash = 0.15;
    if (dst.kind === 'core') (dst as Core).hit = 0.15;
    if (src && dst.kind === 'hero' && (crit || amount > src.dmg * 1.5))
      this.fx({ kind: 'text', x: dst.x, y: dst.y - 30, color: crit ? '#ffd166' : '#fff', t: 0.8, text: String(Math.round(dmg)) });
    if (dst.hp <= 0) this.onDeath(dst, src);
  }

  private onDeath(e: Ent, src: Unit | null) {
    if (e.kind === 'hero') return this.killHero(e as Unit, src);
    e.hp = 0;
    if (e.kind === 'creep') this.shareXp((1 - e.side) as 0 | 1, e.x, e.y, 26);
    if (e.kind === 'neutral') {
      const n = e as Neutral;
      n.target = null;
      n.respawn = n.type === 'camp' ? 40 : n.type === 'spirit' ? 60 : 90;
      if (src) {
        const side = src.side;
        if (n.type === 'camp') this.shareXp(side, n.x, n.y, this.R.campXp, 200);
        else {
          this.shareXp(side, n.x, n.y, n.type === 'spirit' ? this.R.spiritXp : this.R.colossusXp, 400);
          this.s.objectives[side]++;
          if (n.type === 'spirit') this.s.spirit[side] = Math.min(3, this.s.spirit[side] + 1);
          else this.s.siege[side] = this.R.siegeTime;
          this.s.feed.unshift({ kind: 'objective', t: this.s.time, side, type: n.type });
          if (this.s.feed.length > 6) this.s.feed.pop();
          this.fx({ kind: 'level', x: n.x, y: n.y, color: '#ffd166', t: 1.2, text: n.type === 'spirit' ? 'Дух реки' : 'Колосс' });
          this.fx({ kind: 'beam', x: n.x, y: n.y, color: n.type === 'spirit' ? '#7fe6d4' : '#ffc163', t: 1.4 });
          this.s.shake = Math.max(this.s.shake, 0.2);
          this.s.events.push({ kind: 'objective', t: this.s.time, side, type: n.type });
        }
      }
    }
    if (e.kind === 'tower') {
      const t = e as Tower;
      const foe = (1 - t.side) as 0 | 1;
      this.s.towersDown[foe]++;
      this.shareXp(foe, t.x, t.y, this.R.towerXp, 400);
      this.s.feed.unshift({ kind: 'tower', t: this.s.time, side: t.side, lane: t.lane });
      if (this.s.feed.length > 6) this.s.feed.pop();
      this.fx({ kind: 'rubble', x: t.x, y: t.y, color: '#d8cfc0', t: 1.4 });
      this.s.events.push({ kind: 'tower', t: this.s.time, side: t.side, lane: t.lane, tier: t.tier });
      this.s.shake = Math.max(this.s.shake, 0.3);
    }
  }

  private move(u: Unit | Creep, tx: number, ty: number, dt: number, speed: number) {
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d < 2) return;
    const step = Math.min(d, speed * dt);
    u.x += ((tx - u.x) / d) * step;
    u.y += ((ty - u.y) / d) * step;
    if (Math.abs(tx - u.x) > 2) u.face = tx > u.x ? 1 : -1;
    u.moving = true;
  }

  // Движение вдоль линии: к точке чуть впереди по направлению к цели
  private walkLane(u: Unit | Creep, lane: LaneId, toward: 0 | 1, dt: number, speed: number) {
    const t = nearestT(lane, u.x, u.y);
    const dir = toward === 1 ? 1 : -1;
    const [x, y] = lanePoint(lane, t + dir * 0.05);
    this.move(u, x, y, dt, speed);
  }

  // ---------- Оценка боя ----------

  private power(h: Unit) {
    return (h.hp + h.shield) * (h.dmg / h.champ.atkCd) * (1 + (h.champ.role === 'support' ? 0.3 : 0));
  }

  // Соотношение сил вокруг точки. Башни и ядро добавляют силу своей стороне
  private advantage(side: 0 | 1, x: number, y: number, r = 320) {
    let mine = 1;
    let theirs = 1;
    for (const h of this.s.units) {
      if (h.dead > 0 || Math.hypot(h.x - x, h.y - y) > r) continue;
      if (h.side === side) mine += this.power(h);
      else theirs += this.power(h);
    }
    for (const t of [...this.s.towers, ...this.s.cores]) {
      if (t.hp <= 0 || Math.hypot(t.x - x, t.y - y) > TOWER_RANGE + 30) continue;
      const tp = 1400 * 100;
      if (t.side === side) mine += tp;
      else theirs += tp;
    }
    return mine / theirs;
  }

  // Только герои, без башен: кто сильнее у строения
  private heroAdvantage(side: 0 | 1, x: number, y: number, r = 320) {
    let mine = 1;
    let theirs = 1;
    for (const h of this.s.units) {
      if (h.dead > 0 || Math.hypot(h.x - x, h.y - y) > r) continue;
      if (h.side === side) mine += this.power(h);
      else theirs += this.power(h);
    }
    return mine / theirs;
  }

  // Точка на линии, которую держит герой: за своей волной или у своей башни
  private laneAnchor(u: Unit, lane: LaneId): [number, number] {
    const dir = u.side === 0 ? 1 : -1;
    const myCreeps = this.s.creeps.filter((c) => c.side === u.side && c.lane === lane);
    if (myCreeps.length) {
      const front = myCreeps.reduce((a, c) => (c.t * dir > a * dir ? c.t : a), myCreeps[0].t);
      return lanePoint(lane, front - dir * 0.04);
    }
    const own = this.ownTower(u.side, lane);
    return [own.x, own.y];
  }

  // Цель глубоко под вражеской башней: туда ганкать нельзя
  private deepUnderTower(side: 0 | 1, p: { x: number; y: number }) {
    return this.s.towers.some((t) => t.side !== side && t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < 115) || Math.hypot(this.s.cores[1 - side].x - p.x, this.s.cores[1 - side].y - p.y) < 200;
  }

  private underEnemyTower(side: 0 | 1, p: { x: number; y: number }) {
    return [...this.s.towers, ...this.s.cores].some((t) => t.side !== side && t.hp > 0 && dist(t, p) < TOWER_RANGE + 10);
  }

  private visibleEnemies(u: Unit, r: number) {
    return this.s.units.filter((e) => e.side !== u.side && e.dead <= 0 && e.hidden <= 0 && dist(u, e) < r);
  }

  private chooseHeroTarget(u: Unit, r: number): Unit | null {
    const smart = u.player.iq / 100;
    let best: Unit | null = null;
    let bs = Infinity;
    const allies = this.aliveHeroes(u.side);
    const guard = u.champ.role === 'tank' || u.champ.role === 'support';
    for (const e of this.visibleEnemies(u, r)) {
      // Оценка цели: близость и здоровье плюс командные соображения.
      // Чем умнее игрок, тем больше он думает о фокусе, защите союзников и добивании.
      let score = dist(u, e) * (1 - smart * 0.5) + (e.hp / e.maxHp) * 220 * smart;
      const focus = allies.filter((a) => a !== u && a.intent.kind === 'attack' && a.intent.target === e).length;
      score -= Math.min(3, focus) * 35 * smart;
      const squishy = e.champ.role === 'shooter' || e.champ.role === 'mage' || e.champ.role === 'support';
      if (squishy) score -= (u.champ.role === 'assassin' ? 70 : 20) * smart;
      if (e.hp < u.dmg * 2.2) score -= 60 * smart;
      if (guard && e.intent.kind === 'attack') {
        const victim = e.intent.target as Unit;
        if (victim.kind === 'hero' && victim.side === u.side && victim !== u && victim.champ.role !== 'tank' && dist(victim, u) < 260) score -= 90 * smart;
      }
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best;
  }

  // ---------- Мышление героя ----------

  private think(u: Unit) {
    const s = this.s;
    const iq = u.player.iq / 100;
    const strat = this.strat[u.side];
    const noise = (1 - iq) * this.rng.range(-0.4, 0.4);
    const homeCore = s.cores[u.side];

    // Отступление: умный игрок уходит раньше, страж держится дольше
    const retreatAt = (u.champ.role === 'tank' ? 0.08 : 0.12) + iq * 0.1;
    if (u.hp < u.maxHp * retreatAt) u.retreating = true;
    // Умный игрок не ждёт последней капли: при меньшинстве рядом уходит раньше
    else if (iq > 0.55 && u.hp < u.maxHp * 0.3 && this.visibleEnemies(u, 300).length && this.advantage(u.side, u.x, u.y) < 0.6) u.retreating = true;
    if (u.retreating) {
      if (u.hp > u.maxHp * 0.92) u.retreating = false;
      else return (u.intent = { kind: 'home' });
    }

    const aggr = (strat === 'pick' ? 0.95 : 1) * (u.champ.role === 'tank' ? 0.9 : 1) * (u.player.trait === 'star' ? 0.88 : 1);
    const deadFoes = s.units.filter((e) => e.side !== u.side && e.dead > 4).length;
    const deadMine = s.units.filter((e) => e.side === u.side && e.dead > 0).length;
    const v2 = (this.setup.ver ?? 1) >= 2;
    const v3 = (this.setup.ver ?? 1) >= 3;
    // v2: один убитый в начале игры ещё не повод всей команде бросать линии
    const numbers = v2 ? deadFoes - deadMine >= 2 || (deadFoes - deadMine >= 1 && s.time > 140) : deadFoes - deadMine >= 1;
    const group = v2
      ? numbers || (strat === 'group' && s.time > 120) || (strat === 'lanes' && s.time > 200) || (strat === 'pick' && s.time > 170)
      : numbers || (strat === 'group' && s.time > 45) || (strat === 'lanes' && s.time > 150) || (strat === 'pick' && s.time > 120);
    const attacking = (e: Unit) => e.intent.kind === 'attack' && e.intent.target === u && dist(u, e) < e.champ.range + 60;

    // v2: лесник доводит начатый лагерь до конца и в начале игры сначала чистит лес
    if (v2 && u.slot === 3 && !group) {
      const threat = this.visibleEnemies(u, 260).some(attacking);
      const it = u.intent;
      const cur = it.kind === 'attack' && it.target.kind === 'neutral' && (it.target as Neutral).type === 'camp' && it.target.hp > 0 ? it.target : null;
      if (cur && !threat) return (u.intent = { kind: 'attack', target: cur });
      if (s.time < 45 && !threat) {
        const camp = this.nextCamp(u, iq);
        if (camp) return (u.intent = { kind: 'attack', target: camp });
      }
    }
    // На линии не гоняемся за врагом через всю карту: держимся своей точки
    const roamer = group || u.slot === 3 || (strat === 'pick' && u.slot === 1 && s.time > 40);
    const anchor = roamer ? null : this.laneAnchor(u, laneOf(u.slot));
    let target = this.chooseHeroTarget(u, 360);
    if (target && anchor && Math.hypot(target.x - anchor[0], target.y - anchor[1]) > 230) target = null;
    if (v2 && target && !attacking(target)) {
      // Линейный герой дерётся только на своей линии, лесник без группы — только рядом с собой
      if (anchor && laneDist(laneOf(u.slot), target.x, target.y) > 120) target = null;
      else if (!anchor && !group && u.slot === 3 && dist(u, target) > 200) target = null;
    }
    if (target) {
      // Силы оцениваем там, где произойдёт драка: между нами и целью
      const mx = (u.x + target.x) / 2;
      const my = (u.y + target.y) / 2;
      const adv = this.advantage(u.side, mx, my) + noise;
      const underTower = this.underEnemyTower(u.side, target);
      const diveOk = adv > 1.9 || target.hp < target.maxHp * 0.18;
      // В драку идём с перевесом, за лёгкой добычей или чтобы ответить тому, кто бьёт нас
      const attacksMe = target.intent.kind === 'attack' && target.intent.target === u && dist(u, target) < target.champ.range + 50;
      const engage = adv >= 1.15 * aggr || target.hp < target.maxHp * 0.35 || attacksMe;
      if (engage && (!underTower || diveOk)) return (u.intent = { kind: 'attack', target });
      // Отходим, только если враг близко и рядом с нами он сильнее
      if (dist(u, target) < 240 && this.advantage(u.side, u.x, u.y) + noise < 0.7 * aggr) {
        const safe = this.ownTower(u.side, laneOf(u.slot));
        return (u.intent = { kind: 'move', x: safe.x + (u.side === 0 ? -30 : 30), y: safe.y });
      }
    }

    // Защита: своё строение атакуют рядом
    for (const t of [...s.towers.filter((o) => o.side === u.side && o.hp > 0), homeCore]) {
      if (dist(u, t) > 520) continue;
      // v2: защищаем строение своей линии (или рядом стоящее) и только от тех, кто его реально бьёт
      const attackers = this.visibleEnemies(u, 2000).filter(
        (e) => dist(e, t) < TOWER_RANGE + 20 && (!v2 || (e.intent.kind === 'attack' && (e.intent.target === t || dist(e.intent.target, t) < TOWER_RANGE))),
      );
      // Чужую линию идём спасать только от группового натиска и не в самом начале
      if (v2 && t.kind === 'tower' && anchor && (t as Tower).lane !== laneOf(u.slot) && (attackers.length < 2 || s.time < 60)) continue;
      if (attackers.length && this.advantage(u.side, t.x, t.y) + noise > 0.7)
        return (u.intent = { kind: 'attack', target: attackers.sort((a, b) => a.hp - b.hp)[0] });
    }

    // Нейтральные объекты: берём, когда у нас перевес или соперника рядом нет
    const obj = this.objectiveFor(u.side);
    if (obj && (u.slot === 3 || u.slot === 4 || u.slot === 1 || dist(u, obj) < (v2 && !group ? 220 : 450)))
      return (u.intent = { kind: 'attack', target: obj });

    // v3: фаза линий как в МОБА — ганки лесника и мидера, размены ударами на линии
    if (v3 && !group) {
      const g = this.gankIntent(u, iq);
      if (g) return (u.intent = g);
      if (anchor) {
        const tr = this.tradeIntent(u, aggr);
        if (tr) return (u.intent = tr);
      }
    }

    // Перевес в числе или стратегия: давим ближайшее строение всей командой
    if (group) return (u.intent = this.groupIntent(u, numbers));

    // Лес и охота: ловим раненых одиночек
    if (u.slot === 3 || (strat === 'pick' && u.slot === 1 && s.time > 40)) {
      const prey = s.units
        .filter((e) => e.side !== u.side && e.dead <= 0 && e.hidden <= 0 && dist(u, e) < 650 && e.hp < e.maxHp * 0.65)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (prey && this.advantage(u.side, prey.x, prey.y, 260) + noise > (strat === 'pick' ? 1.1 : 1.3) && !this.underEnemyTower(u.side, prey))
        return (u.intent = { kind: 'move', x: prey.x, y: prey.y });
      if (u.slot === 3) {
        // Лесник фармит лагеря на своей половине, умный заходит и к сопернику
        const camp = this.nextCamp(u, iq);
        if (camp && !this.visibleEnemies(u, 260).length) return (u.intent = { kind: 'attack', target: camp });
        // Иначе помогает линии, где союзникам хуже всего
        const lane = ([0, 1, 2] as LaneId[]).sort((a, b) => this.laneScore(u.side, a) - this.laneScore(u.side, b))[0];
        return (u.intent = this.laneIntent(u, lane));
      }
    }
    return (u.intent = this.laneIntent(u, laneOf(u.slot)));
  }

  // Ганк: лесник (и мидер) ищет врага, который зашёл далеко на нашу половину или ранен, и идёт его ловить
  private gankIntent(u: Unit, iq: number): Intent | null {
    const s = this.s;
    const t = u.foe;
    if (u.gank > 0 && t && t.dead <= 0 && t.hidden <= 0) {
      const safe = !this.deepUnderTower(u.side, t) || t.hp < t.maxHp * 0.25;
      if (safe && !(u.hp < u.maxHp * 0.35)) return dist(u, t) < u.champ.range + 160 ? { kind: 'attack', target: t } : { kind: 'move', x: t.x, y: t.y };
      u.gank = 0;
    }
    if (u.gank > 0) u.gank = 0;
    if (u.gankCd > 0 || u.hp < u.maxHp * 0.5) return null;
    const jg = u.slot === 3;
    const mid = u.slot === 1;
    if (!(jg && s.time > 30) && !(mid && s.time > 50)) return null;
    // мидер уходит, только когда его линия спокойна
    if (mid && this.visibleEnemies(u, 300).length) return null;
    let best: Unit | null = null;
    let bs = jg ? 0.6 : 1.0;
    for (const e of s.units) {
      if (e.side === u.side || e.dead > 0 || e.hidden > 0 || e.slot === 3) continue;
      const lane = laneOf(e.slot);
      if (mid && lane === 1) continue;
      const d = dist(u, e);
      if (d > (jg ? 720 : 520) || this.deepUnderTower(u.side, e)) continue;
      const t = nearestT(lane, e.x, e.y);
      const over = u.side === 0 ? 0.5 - t : t - 0.5; // >0: враг на нашей половине
      const help = s.units.some((a) => a.side === u.side && a !== u && a.dead <= 0 && laneOf(a.slot) === lane && a.slot !== 3 && dist(a, e) < 320);
      const score = over * 2.5 + (1 - e.hp / e.maxHp) * 1.4 + (help ? 0.5 : 0) - d / 1400 + iq * 0.3 + this.rng.range(-0.15, 0.15);
      if (score > bs) {
        bs = score;
        best = e;
      }
    }
    if (!best) {
      u.gankCd = 3;
      return null;
    }
    u.foe = best;
    u.gank = 11;
    s.events.push({ kind: 'gank', t: s.time, by: u, foe: best });
    u.gankCd = jg ? 20 : 30;
    return { kind: 'move', x: best.x, y: best.y };
  }

  // Размен на линии: короткая атака по сопернику, когда выгодно, потом снова фарм
  private tradeIntent(u: Unit, aggr: number): Intent | null {
    const f = u.foe;
    if (u.trade > 0 && f && f.dead <= 0 && f.hidden <= 0 && dist(u, f) < u.champ.range + 90 && !this.underEnemyTower(u.side, f)) return { kind: 'attack', target: f };
    if (u.tradeCd > 0) return null;
    const lane = laneOf(u.slot);
    const foes = this.visibleEnemies(u, u.champ.range + 80).filter((e) => laneDist(lane, e.x, e.y) < 130 && !this.underEnemyTower(u.side, e));
    if (!foes.length || this.underEnemyTower(u.side, u)) return null;
    const e = foes.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const creeps = this.s.creeps.filter((c) => c.side !== u.side && c.hp > 0 && dist(c, u) < 150).length;
    const style = (u.player.atk - 60) / 120 + (u.player.trait === 'star' ? 0.08 : 0) + (u.champ.role === 'assassin' || u.champ.role === 'fighter' ? 0.08 : u.champ.role === 'support' ? -0.05 : 0);
    const want = u.hp / u.maxHp - e.hp / e.maxHp + style - creeps * 0.04 + (1 - aggr) + this.rng.range(-0.12, 0.12);
    if (want < -0.02) {
      u.tradeCd = 1.5;
      return null;
    }
    u.foe = e;
    u.trade = this.rng.range(1.2, 2.4);
    u.tradeCd = u.trade + this.rng.range(2.5, 5);
    return { kind: 'attack', target: e };
  }

  private nextCamp(u: Unit, iq: number): Neutral | undefined {
    return this.s.neutrals
      .filter((n) => n.type === 'camp' && n.respawn <= 0 && n.hp > 0 && ((n.homeX < 500) === (u.side === 0) || iq > 0.65))
      .sort((a, b) => dist(u, a) - dist(u, b))[0];
  }

  // Стоит ли команде идти на объект прямо сейчас
  private objectiveFor(side: 0 | 1): Neutral | null {
    const s = this.s;
    const mine = this.aliveHeroes(side).filter((h) => !h.retreating);
    const theirs = this.aliveHeroes((1 - side) as 0 | 1);
    if (mine.length < 3) return null;
    for (const n of s.neutrals) {
      if (n.type === 'camp' || n.respawn > 0 || n.hp <= 0) continue;
      if (n.type === 'spirit' && s.spirit[side] >= 3) continue;
      const foesNear = theirs.filter((e) => dist(e, n) < 450).length;
      const hpOk = mine.reduce((a, h) => a + h.hp / h.maxHp, 0) / mine.length > 0.55;
      const more = (this.setup.ver ?? 1) >= 2 ? mine.length - theirs.length >= 2 || (mine.length > theirs.length && foesNear <= 1) : mine.length > theirs.length;
      if ((more && hpOk) || (foesNear === 0 && hpOk && mine.length >= 4)) return n;
      // Соперник уже бьёт объект — идём мешать, если не слабее
      if (n.target && n.target.side !== side && mine.length >= theirs.length) return n;
    }
    return null;
  }

  // Насколько хорошо дела на линии: меньше — хуже
  private laneScore(side: 0 | 1, lane: LaneId) {
    const own = this.ownTower(side, lane);
    return own.hp / own.maxHp + (own.kind === 'core' ? -2 : (own as Tower).tier === 1 ? -1 : 0);
  }

  // Стоять на линии: за своей волной крипов, бить крипов, осаждать башню, когда её «держат» крипы
  private laneIntent(u: Unit, lane: LaneId): Intent {
    const s = this.s;
    const foe = (1 - u.side) as 0 | 1;
    const dir = u.side === 0 ? 1 : -1;
    const myCreeps = s.creeps.filter((c) => c.side === u.side && c.lane === lane && c.hp > 0);
    const front = myCreeps.length ? myCreeps.reduce((a, c) => (c.t * dir > a * dir ? c.t : a), myCreeps[0].t) : null;
    const objective = this.laneObjective(u.side, lane);

    // Осада: крипы у башни, вражеских героев рядом нет
    if (this.vulnerable(objective)) {
      const tanking = myCreeps.filter((c) => dist(c, objective) < TOWER_RANGE).length;
      const defenders = this.visibleEnemies(u, 2000).filter((e) => dist(e, objective) < 300).length;
      if (tanking >= 1 && (defenders === 0 || this.heroAdvantage(u.side, objective.x, objective.y) > 1.4))
        return { kind: 'attack', target: objective };
    }

    // Добиваем вражеских крипов рядом
    const creep = s.creeps
      .filter((c) => c.side === foe && c.hp > 0 && dist(u, c) < 240 && !this.underEnemyTower(u.side, c))
      .sort((a, b) => a.hp - b.hp)[0];
    if (creep) return { kind: 'attack', target: creep };

    // Встаём чуть позади своей волны или у своей башни
    const ranged = u.champ.range > 60;
    let t: number;
    if (front !== null) t = front - dir * (ranged ? 0.06 : 0.025);
    else {
      const own = this.ownTower(u.side, lane);
      t = own.kind === 'core' ? (u.side === 0 ? 0.04 : 0.96) : towerT(u.side, (own as Tower).tier) + dir * 0.02;
    }
    // v3: в начале линии герои выходят к месту встречи волн, а не ждут у своей башни
    if ((this.setup.ver ?? 1) >= 3 && !s.creeps.some((c) => c.side === foe && c.lane === lane && c.hp > 0 && (c.t - 0.5) * dir < 0.08)) {
      const meet = 0.5 - dir * (ranged ? 0.09 : 0.06);
      if ((meet - t) * dir > 0) t = meet;
    }
    const [x, y] = lanePoint(lane, t);
    return { kind: 'move', x: x + (u.player.iq % 7) * 3 - 9, y: y + ((u.player.atk * 3) % 13) - 6 };
  }

  // Линия, на которую команда идёт вместе: где ближайшее к нам вражеское строение
  private rallyLane(side: 0 | 1): LaneId {
    const score = (l: LaneId) => {
      const o = this.laneObjective(side, l);
      return Math.abs(o.x - CORE_POS[side][0]) + (o.hp / o.maxHp) * 200;
    };
    // v2: при равенстве не всегда мид — направление меняется раз в минуту
    const rot = Math.floor(this.s.time / 60 + side) % 3;
    const bias = (l: LaneId) => ((this.setup.ver ?? 1) >= 2 && l === rot ? -60 : 0);
    return ([1, 0, 2] as LaneId[]).sort((a, b) => score(a) + bias(a) - score(b) - bias(b))[0];
  }

  // Командная игра: собираемся на одной линии и сносим строения по очереди.
  // При численном перевесе каждый сразу давит строение своей линии.
  private groupIntent(u: Unit, numbers: boolean): Intent {
    const lane = numbers && u.slot !== 3 ? laneOf(u.slot) : this.rallyLane(u.side);
    const obj = this.laneObjective(u.side, lane);
    const allies = this.aliveHeroes(u.side).filter((h) => !h.retreating);
    const near = allies.filter((h) => dist(h, obj) < 420).length;
    if (numbers || near >= Math.min(3, allies.length) || dist(u, obj) < 300) {
      const creep = this.s.creeps.find((c) => c.side !== u.side && c.hp > 0 && dist(u, c) < 130);
      if (creep) return { kind: 'attack', target: creep };
      if (this.vulnerable(obj)) return { kind: 'attack', target: obj };
    }
    // Ждём своих чуть позади цели
    const t = nearestT(lane, obj.x, obj.y) - (u.side === 0 ? 0.12 : -0.12);
    const [x, y] = lanePoint(lane, t);
    return { kind: 'move', x, y };
  }

  // ---------- Способности ----------

  private foesNear(u: Unit, x: number, y: number, r: number): Ent[] {
    const out: Ent[] = this.s.units.filter((e) => e.side !== u.side && e.dead <= 0 && Math.hypot(e.x - x, e.y - y) < r);
    for (const c of this.s.creeps) if (c.side !== u.side && c.hp > 0 && Math.hypot(c.x - x, c.y - y) < r) out.push(c);
    return out;
  }

  private ability(u: Unit, target: Ent | null): boolean {
    const c = u.champ;
    const col = c.look.trim;
    const heroT = target && target.kind === 'hero' ? (target as Unit) : null;
    const inRange = target && dist(u, target) <= c.range + 40;
    const heroesNear = (r: number) => this.s.units.filter((e) => e.side !== u.side && e.dead <= 0 && dist(u, e) < r);
    switch (c.ab) {
      case 'bulwark': {
        if (!heroesNear(110).length) return false;
        u.shield += u.maxHp * 0.25;
        for (const e of heroesNear(95)) e.stun = 1.2;
        this.fx({ ab: c.ab, kind: 'aoe', x: u.x, y: u.y, r: 95, color: col, t: 0.45 });
        return true;
      }
      case 'hook': {
        if (!heroT || dist(u, heroT) > 260 || this.underEnemyTower(u.side, u)) return false;
        this.fx({ ab: c.ab, kind: 'hook', x: u.x, y: u.y, x2: heroT.x, y2: heroT.y, color: col, t: 0.35 });
        heroT.x = u.x + u.face * 30;
        heroT.y = u.y;
        heroT.stun = 0.8;
        this.damage(u, heroT, u.dmg * 1.5);
        return true;
      }
      case 'whirl': {
        const ns = this.foesNear(u, u.x, u.y, 80);
        if (ns.length < 2 && !ns.some((e) => e.kind === 'hero')) return false;
        for (const e of ns) this.damage(u, e, u.dmg * 1.8);
        this.fx({ ab: c.ab, kind: 'slash', x: u.x, y: u.y, r: 80, color: col, t: 0.35 });
        return true;
      }
      case 'leap': {
        if (!heroT || dist(u, heroT) > 280) return false;
        this.fx({ ab: c.ab, kind: 'dash', x: u.x, y: u.y, x2: heroT.x, y2: heroT.y, color: col, t: 0.3 });
        u.x = heroT.x - u.face * 24;
        u.y = heroT.y;
        for (const e of this.foesNear(u, heroT.x, heroT.y, 70)) this.damage(u, e, u.dmg * 1.7);
        this.fx({ ab: c.ab, kind: 'aoe', x: heroT.x, y: heroT.y, r: 70, color: col, t: 0.35 });
        this.s.shake = Math.max(this.s.shake, 0.15);
        return true;
      }
      case 'pierce': {
        if (!target || !inRange || target.kind === 'creep') return false;
        this.damage(u, target, u.dmg * 3, true);
        this.fx({ ab: c.ab, kind: 'bolt', x: u.x, y: u.y, x2: target.x, y2: target.y, color: col, t: 0.3 });
        return true;
      }
      case 'volley': {
        const ts = this.foesNear(u, u.x, u.y, c.range + 40)
          .filter((e) => !(e.kind === 'hero' && (e as Unit).hidden > 0))
          .sort((a, b) => dist(u, a) - dist(u, b))
          .slice(0, 3);
        if (ts.length < 2) return false;
        for (const e of ts) {
          this.damage(u, e, u.dmg * 1.6);
          this.fx({ ab: c.ab, kind: 'arrow', x: u.x, y: u.y, x2: e.x, y2: e.y, color: col, t: 0.3 });
        }
        return true;
      }
      case 'fireball':
      case 'frost': {
        if (!target || !inRange || target.kind === 'tower' || target.kind === 'core') return false;
        const hits = this.foesNear(u, target.x, target.y, 75);
        if (hits.length < 2 && target.kind !== 'hero') return false;
        const frost = c.ab === 'frost';
        for (const e of hits) {
          this.damage(u, e, u.dmg * (frost ? 1.8 : 2.3));
          if (frost && e.kind === 'hero') (e as Unit).stun = Math.max((e as Unit).stun, 0.9);
        }
        this.fx({ ab: c.ab, kind: 'aoe', x: target.x, y: target.y, r: 75, color: frost ? '#a7e3ff' : '#ff8a3c', t: 0.5 });
        this.s.shake = Math.max(this.s.shake, 0.12);
        return true;
      }
      case 'mend':
      case 'ward': {
        const hurt = this.aliveHeroes(u.side).filter((a) => dist(u, a) < 160 && a.hp < a.maxHp * 0.85);
        if (!hurt.length) return false;
        const k = (0.7 + u.player.iq / 200) * (1 + (u.level - 1) * 0.06);
        for (const a of hurt) {
          if (c.ab === 'mend') {
            const h = Math.min(a.maxHp - a.hp, 170 * k);
            a.hp += h;
            u.healed += h;
            this.fx({ kind: 'text', x: a.x, y: a.y - 30, color: '#8dffb0', t: 0.8, text: '+' + Math.round(h) });
          } else {
            a.shield += 150 * k;
            u.healed += 150 * k;
          }
        }
        this.fx({ ab: c.ab, kind: c.ab === 'mend' ? 'heal' : 'ward', x: u.x, y: u.y, r: 160, color: c.ab === 'mend' ? '#8dffb0' : '#ffe08a', t: 0.6 });
        return true;
      }
      case 'dash':
      case 'vanish': {
        const weak = this.s.units
          .filter((e) => e.side !== u.side && e.dead <= 0 && e.hidden <= 0 && dist(u, e) < 300 && !this.underEnemyTower(u.side, e))
          .sort((a, b) => a.hp - b.hp)[0];
        if (!weak) return false;
        if (c.ab === 'vanish') u.hidden = 1.2;
        this.fx({ ab: c.ab, kind: 'dash', x: u.x, y: u.y, x2: weak.x, y2: weak.y, color: col, t: 0.3 });
        u.face = weak.x > u.x ? 1 : -1;
        u.x = weak.x - u.face * 22;
        u.y = weak.y;
        this.damage(u, weak, u.dmg * 2.6, true);
        return true;
      }
    }
  }

  // ---------- Тик ----------

  private spawnWave() {
    for (const side of [0, 1] as const)
      for (const lane of [0, 1, 2] as LaneId[])
        for (let i = 0; i < 3; i++) {
          const t = side === 0 ? 0.06 - i * 0.015 : 0.94 + i * 0.015;
          const [x, y] = lanePoint(lane, t);
          const k = 1 + this.s.time / 240; // крипы понемногу крепнут
          this.s.creeps.push({ kind: 'creep', side, lane, t, x, y: y + (i - 1) * 8, hp: 320 * k, maxHp: 320 * k, dmg: 22 * k, atkT: 0, flash: 0, face: side === 0 ? 1 : -1, moving: false, swing: 0 });
        }
  }

  private stepCreep(c: Creep, dt: number) {
    const s = this.s;
    c.moving = false;
    c.swing = Math.max(0, c.swing - dt);
    c.flash = Math.max(0, c.flash - dt);
    c.atkT -= dt;
    // Цель: вражеский крип, потом герой, потом строение
    let target: Ent | null = null;
    let bd = 110;
    for (const o of s.creeps)
      if (o.side !== c.side && o.hp > 0) {
        const d = dist(c, o);
        if (d < bd) {
          bd = d;
          target = o;
        }
      }
    if (!target)
      for (const h of s.units)
        if (h.side !== c.side && h.dead <= 0 && h.hidden <= 0) {
          const d = dist(c, h);
          if (d < 90 && d < bd) {
            bd = d;
            target = h;
          }
        }
    if (!target) {
      const obj = this.laneObjective(c.side, c.lane);
      if (dist(c, obj) < 70) target = obj;
    }
    if (target) {
      if (dist(c, target) > 30) this.move(c, target.x, target.y, dt, 62);
      else if (c.atkT <= 0) {
        c.atkT = 1;
        c.swing = 0.25;
        c.face = target.x > c.x ? 1 : -1;
        this.damage(null, target, c.dmg);
      }
    } else this.walkLane(c, c.lane, (1 - c.side) as 0 | 1, dt, 62);
    c.t = nearestT(c.lane, c.x, c.y);
  }

  private stepTower(t: Ent & { atkT: number }, dt: number) {
    t.flash = Math.max(0, t.flash - dt);
    t.atkT -= dt;
    if (t.hp <= 0 || t.atkT > 0) return;
    const s = this.s;
    const inR = (e: Ent) => e.side !== t.side && e.hp > 0 && dist(t, e) < TOWER_RANGE;
    // Сначала тот, кто бьёт наших героев, потом крипы, потом любой герой
    const heroes = s.units.filter((h) => h.dead <= 0 && h.hidden <= 0 && inR(h));
    const target: Ent | undefined = heroes.find((h) => h.aggro > 0) ?? s.creeps.find(inR) ?? heroes[0];
    if (!target) return;
    t.atkT = 1.0;
    const dmg = target.kind === 'hero' ? 95 + s.time * 0.25 : 160;
    if (target.kind === 'hero') this.damage(null, target, dmg);
    else {
      target.hp -= dmg;
      target.flash = 0.15;
      if (target.hp <= 0) this.onDeath(target, null);
    }
    this.fx({ kind: 'tower', x: t.x, y: t.y, x2: target.x, y2: target.y, color: t.side === 0 ? '#9cc7ff' : '#ffa3ac', t: 0.25 });
  }

  private stepNeutral(n: Neutral, dt: number) {
    n.flash = Math.max(0, n.flash - dt);
    n.swing = Math.max(0, n.swing - dt);
    if (n.respawn > 0) {
      n.respawn -= dt;
      if (n.respawn <= 0) {
        n.hp = n.maxHp;
        n.x = n.homeX;
        n.y = n.homeY;
      }
      return;
    }
    n.atkT -= dt;
    const t = n.target;
    const leash = n.type === 'camp' ? 130 : 170;
    if (!t || t.dead > 0 || Math.hypot(t.x - n.homeX, t.y - n.homeY) > leash + 60) {
      // Вернуться домой и восстановиться
      n.target = null;
      const d = Math.hypot(n.homeX - n.x, n.homeY - n.y);
      if (d > 3) {
        n.x += ((n.homeX - n.x) / d) * Math.min(d, 90 * dt);
        n.y += ((n.homeY - n.y) / d) * Math.min(d, 90 * dt);
      }
      n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.1 * dt);
      return;
    }
    const reach = n.type === 'camp' ? 34 : 60;
    const d = dist(n, t);
    n.face = t.x > n.x ? 1 : -1;
    if (d > reach) {
      n.x += ((t.x - n.x) / d) * 70 * dt;
      n.y += ((t.y - n.y) / d) * 70 * dt;
    } else if (n.atkT <= 0) {
      n.atkT = n.type === 'colossus' ? 1.6 : 1.1;
      n.swing = 0.25;
      if (n.type === 'camp') this.damage(null, t, n.dmg);
      else {
        // Большие монстры бьют по площади
        for (const h of this.s.units) if (h.dead <= 0 && dist(h, t) < 70) this.damage(null, h, n.dmg);
        this.fx({ kind: 'aoe', x: t.x, y: t.y, r: 70, color: n.type === 'spirit' ? '#7fe6d4' : '#c9b89a', t: 0.4 });
      }
    }
  }

  step(dt = TICK) {
    const s = this.s;
    if (s.over) return;
    s.time += dt;
    s.shake = Math.max(0, s.shake - dt);
    for (const f of s.fx) f.t -= dt;
    s.fx = s.fx.filter((f) => f.t > 0);
    for (const c of s.cores) {
      c.hit = Math.max(0, c.hit - dt);
      c.flash = Math.max(0, c.flash - dt);
    }

    if (s.time >= s.nextWave) {
      this.spawnWave();
      s.nextWave += WAVE_EVERY;
    }

    for (const u of s.units) {
      u.moving = false;
      u.swing = Math.max(0, u.swing - dt);
      u.flash = Math.max(0, u.flash - dt);
      u.cast = Math.max(0, u.cast - dt);
      u.aggro = Math.max(0, u.aggro - dt);
      if (u.dead > 0) {
        u.dead -= dt;
        if (u.dead <= 0) {
          u.hp = u.maxHp;
          u.x = u.homeX;
          u.y = u.homeY;
          u.retreating = false;
          u.intent = { kind: 'home' };
          this.fx({ kind: 'beam', x: u.x, y: u.y, color: u.side === 0 ? '#7fb2ff' : '#ff8a96', t: 0.8 });
        }
        continue;
      }
      u.atkT -= dt;
      u.abT -= dt;
      u.trade = Math.max(0, u.trade - dt);
      u.tradeCd = Math.max(0, u.tradeCd - dt);
      u.gank = Math.max(0, u.gank - dt);
      u.gankCd = Math.max(0, u.gankCd - dt);
      u.hidden = Math.max(0, u.hidden - dt);
      if (u.stun > 0) {
        u.stun -= dt;
        continue;
      }
      if (dist(u, s.cores[u.side]) < 140) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.2 * dt);
      u.calm += dt;
      if (u.calm > 4) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.025 * dt);

      u.thinkT -= dt;
      if (u.thinkT <= 0) {
        u.thinkT = 0.25;
        this.think(u);
      }

      const it = u.intent;
      const tgt = it.kind === 'attack' ? it.target : null;
      if (u.abT <= 0 && this.ability(u, tgt ?? this.chooseHeroTarget(u, u.champ.range + 60))) {
        u.abT = u.champ.abilityCd * u.cdK;
        u.cast = 0.35;
      }

      if (it.kind === 'home') this.move(u, u.homeX, u.homeY, dt, u.champ.speed);
      else if (it.kind === 'move') this.move(u, it.x, it.y, dt, u.champ.speed);
      else {
        const t = it.target;
        const alive = t.hp > 0 && (t.kind !== 'hero' || ((t as Unit).dead <= 0 && (t as Unit).hidden <= 0));
        if (!alive || !this.vulnerable(t)) {
          u.thinkT = 0;
          continue;
        }
        const reach = u.champ.range + (t.kind === 'tower' || t.kind === 'core' ? 22 : 0);
        u.face = t.x > u.x ? 1 : -1;
        if (dist(u, t) > reach) this.move(u, t.x, t.y, dt, u.champ.speed);
        else if (u.atkT <= 0) {
          u.atkT = u.champ.atkCd;
          u.swing = 0.25;
          this.damage(u, t, u.dmg);
          if (u.champ.range > 60)
            this.fx({ kind: u.champ.role === 'shooter' ? 'arrow' : 'shot', x: u.x, y: u.y, x2: t.x, y2: t.y, color: u.champ.look.trim, t: 0.18 });
        }
      }
    }

    for (const c of s.creeps) if (c.hp > 0) this.stepCreep(c, dt);
    s.creeps = s.creeps.filter((c) => c.hp > 0);
    for (const t of s.towers) this.stepTower(t, dt);
    for (const c of s.cores) this.stepTower(c, dt);
    for (const n of s.neutrals) this.stepNeutral(n, dt);
    s.siege = [Math.max(0, s.siege[0] - dt), Math.max(0, s.siege[1] - dt)];
    for (const c of s.cores) if (!c.low && c.hp < c.maxHp * 0.5) {
      c.low = true;
      s.events.push({ kind: 'core', t: s.time, side: c.side });
    }
    if (!s.lateSaid && s.time > 210) {
      s.lateSaid = true;
      s.events.push({ kind: 'late', t: s.time });
    }
    if (s.time >= s.goldLine.length * 10) {
      const g = (sd: 0 | 1) => s.units.reduce((a, u) => a + (u.side === sd ? u.gold : 0), 0);
      s.goldLine.push(Math.round(g(0) - g(1)));
    }

    if (s.cores[0].hp <= 0 || s.cores[1].hp <= 0) {
      s.over = true;
      s.winner = s.cores[1].hp <= 0 ? 0 : 1;
    } else if (s.time >= MATCH_TIME) {
      s.over = true;
      // По времени: больше разрушенных башен, потом больше убийств, потом прочность ядра
      const [a, b] = s.towersDown;
      if (a !== b) s.winner = a > b ? 0 : 1;
      else if (s.kills[0] !== s.kills[1]) s.winner = s.kills[0] > s.kills[1] ? 0 : 1;
      else s.winner = s.cores[0].hp >= s.cores[1].hp ? 0 : 1;
    }
  }

  runToEnd() {
    while (!this.s.over) this.step();
    return this.s;
  }
}
