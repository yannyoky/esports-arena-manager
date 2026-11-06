// Симуляция матча 5 на 5. Работает по тикам и не зависит от отрисовки,
// поэтому матч можно смотреть или мгновенно пропустить.
import { Champion, Player, Team, champById } from './data';
import { Rng } from './rng';

export const W = 1000;
export const H = 600;
export const TICK = 1 / 30;
export const MATCH_TIME = 120;
export const CORE_HP = 2500;
const RESPAWN = 6;

export interface Unit {
  side: 0 | 1;
  player: Player;
  champ: Champion;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  dmg: number;
  armor: number;
  atkT: number;
  abT: number;
  stun: number;
  hidden: number; // невидимость: враги не выбирают целью
  dead: number;
  kills: number;
  deaths: number;
  dealt: number;
  healed: number;
  homeX: number;
  homeY: number;
  retreating: boolean;
  // Только для анимации, на исход не влияет
  face: 1 | -1;
  moving: boolean;
  swing: number; // >0 — идёт удар
  flash: number; // >0 — получил урон
  cast: number; // >0 — применяет способность
}

export type FxKind = 'shot' | 'arrow' | 'bolt' | 'aoe' | 'heal' | 'ward' | 'dash' | 'hook' | 'text' | 'death' | 'slash';

export interface Fx {
  kind: FxKind;
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

export interface Core {
  x: number;
  y: number;
  hp: number;
  hit: number;
}

export interface MatchSetup {
  teams: [Team, Team];
  picks: [string[], string[]];
  seed: number;
}

export interface Kill {
  t: number;
  killer: Unit | null;
  victim: Unit;
}

export interface MatchState {
  time: number;
  units: Unit[];
  cores: [Core, Core];
  kills: [number, number];
  fx: Fx[];
  feed: Kill[];
  over: boolean;
  winner: 0 | 1 | -1;
  shake: number;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Match {
  s: MatchState;
  rng: Rng;
  setup: MatchSetup;
  fxOn: boolean; // при пропуске матча эффекты не нужны

  constructor(setup: MatchSetup, fxOn = true) {
    this.setup = setup;
    this.fxOn = fxOn;
    this.rng = new Rng(setup.seed);
    const units: Unit[] = [];
    for (const side of [0, 1] as const) {
      setup.teams[side].players.forEach((p, i) => {
        const c = champById(setup.picks[side][i]);
        const mastery = p.pool[c.role] / 100;
        const formK = p.form / 100;
        const hx = side === 0 ? 110 : W - 110;
        const hy = 170 + i * 65;
        const maxHp = c.hp * (0.8 + p.def / 250) * (0.9 + mastery * 0.15);
        units.push({
          side, player: p, champ: c, x: hx, y: hy, hp: maxHp, maxHp, shield: 0,
          dmg: c.dmg * (0.75 + p.atk / 200) * (0.85 + mastery * 0.25) * (0.85 + formK * 0.15),
          armor: Math.min(0.4, p.def / 300),
          atkT: this.rng.range(0, 0.5), abT: c.abilityCd * this.rng.range(0.3, 0.8),
          stun: 0, hidden: 0, dead: 0, kills: 0, deaths: 0, dealt: 0, healed: 0,
          homeX: hx, homeY: hy, retreating: false,
          face: side === 0 ? 1 : -1, moving: false, swing: 0, flash: 0, cast: 0,
        });
      });
    }
    this.s = {
      time: 0, units,
      cores: [
        { x: 55, y: H / 2, hp: CORE_HP, hit: 0 },
        { x: W - 55, y: H / 2, hp: CORE_HP, hit: 0 },
      ],
      kills: [0, 0], fx: [], feed: [], over: false, winner: -1, shake: 0,
    };
  }

  private fx(f: Omit<Fx, 'life'>) {
    if (this.fxOn) this.s.fx.push({ ...f, life: f.t });
  }

  private enemies(u: Unit) {
    return this.s.units.filter((e) => e.side !== u.side && e.dead <= 0);
  }
  private allies(u: Unit) {
    return this.s.units.filter((e) => e.side === u.side && e.dead <= 0);
  }

  private die(victim: Unit, killer: Unit | null) {
    victim.hp = 0;
    victim.dead = RESPAWN + this.s.time / 30; // поздние смерти дороже
    victim.deaths++;
    victim.shield = 0;
    victim.hidden = 0;
    if (killer) {
      killer.kills++;
      this.s.kills[killer.side]++;
    }
    this.s.feed.unshift({ t: this.s.time, killer, victim });
    if (this.s.feed.length > 6) this.s.feed.pop();
    this.fx({ kind: 'death', x: victim.x, y: victim.y, color: '#fff', t: 0.9 });
  }

  private hit(src: Unit, dst: Unit, amount: number, crit = false) {
    let dmg = amount * (1 - dst.armor) * this.rng.range(0.9, 1.1);
    src.dealt += dmg;
    if (dst.shield > 0) {
      const a = Math.min(dst.shield, dmg);
      dst.shield -= a;
      dmg -= a;
    }
    dst.hp -= dmg;
    dst.flash = 0.15;
    if (crit || amount > src.dmg * 1.5)
      this.fx({ kind: 'text', x: dst.x, y: dst.y - 30, color: crit ? '#ffd166' : '#fff', t: 0.8, text: String(Math.round(dmg)) });
    if (dst.hp <= 0 && dst.dead <= 0) this.die(dst, src);
  }

  private move(u: Unit, tx: number, ty: number, dt: number, k = 1) {
    const d = dist(u.x, u.y, tx, ty);
    if (d < 1) return;
    const step = Math.min(d, u.champ.speed * k * dt);
    u.x += ((tx - u.x) / d) * step;
    u.y += ((ty - u.y) / d) * step;
    if (Math.abs(tx - u.x) > 2) u.face = tx > u.x ? 1 : -1;
    u.moving = true;
  }

  private chooseTarget(u: Unit): Unit | null {
    const smart = u.player.iq / 100;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies(u)) {
      if (e.hidden > 0) continue;
      const d = dist(u.x, u.y, e.x, e.y);
      if (d > 420) continue;
      const score = d * (1 - smart * 0.5) + (e.hp / e.maxHp) * 200 * smart;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private near(u: Unit, x: number, y: number, r: number) {
    return this.enemies(u).filter((e) => dist(x, y, e.x, e.y) < r);
  }

  private ability(u: Unit, target: Unit | null): boolean {
    const c = u.champ;
    const col = c.look.trim;
    const inRange = target && dist(u.x, u.y, target.x, target.y) <= c.range + 40;
    switch (c.ab) {
      case 'bulwark': {
        if (!this.near(u, u.x, u.y, 110).length) return false;
        u.shield += u.maxHp * 0.25;
        for (const e of this.near(u, u.x, u.y, 90)) e.stun = 1.2;
        this.fx({ kind: 'aoe', x: u.x, y: u.y, r: 90, color: col, t: 0.45 });
        return true;
      }
      case 'hook': {
        if (!target || dist(u.x, u.y, target.x, target.y) > 260) return false;
        this.fx({ kind: 'hook', x: u.x, y: u.y, x2: target.x, y2: target.y, color: col, t: 0.35 });
        target.x = u.x + u.face * 30;
        target.y = u.y;
        target.stun = 0.8;
        this.hit(u, target, u.dmg * 1.5);
        return true;
      }
      case 'whirl': {
        const ns = this.near(u, u.x, u.y, 80);
        if (!ns.length) return false;
        for (const e of ns) this.hit(u, e, u.dmg * 1.8);
        this.fx({ kind: 'slash', x: u.x, y: u.y, r: 80, color: col, t: 0.35 });
        return true;
      }
      case 'leap': {
        if (!target || dist(u.x, u.y, target.x, target.y) > 280) return false;
        this.fx({ kind: 'dash', x: u.x, y: u.y, x2: target.x, y2: target.y, color: col, t: 0.3 });
        u.x = target.x - u.face * 24;
        u.y = target.y;
        for (const e of this.near(u, target.x, target.y, 70)) this.hit(u, e, u.dmg * 1.7);
        this.fx({ kind: 'aoe', x: target.x, y: target.y, r: 70, color: col, t: 0.35 });
        this.s.shake = Math.max(this.s.shake, 0.15);
        return true;
      }
      case 'pierce': {
        if (!target || !inRange) return false;
        this.hit(u, target, u.dmg * 3, true);
        this.fx({ kind: 'bolt', x: u.x, y: u.y, x2: target.x, y2: target.y, color: col, t: 0.3 });
        return true;
      }
      case 'volley': {
        const ts = this.enemies(u)
          .filter((e) => e.hidden <= 0 && dist(u.x, u.y, e.x, e.y) < c.range + 40)
          .sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))
          .slice(0, 3);
        if (!ts.length) return false;
        for (const e of ts) {
          this.hit(u, e, u.dmg * 1.6);
          this.fx({ kind: 'arrow', x: u.x, y: u.y, x2: e.x, y2: e.y, color: col, t: 0.3 });
        }
        return true;
      }
      case 'fireball':
      case 'frost': {
        if (!target || !inRange) return false;
        const frost = c.ab === 'frost';
        for (const e of this.near(u, target.x, target.y, 75)) {
          this.hit(u, e, u.dmg * (frost ? 1.8 : 2.3));
          if (frost) e.stun = Math.max(e.stun, 0.9);
        }
        this.fx({ kind: 'aoe', x: target.x, y: target.y, r: 75, color: frost ? '#a7e3ff' : '#ff8a3c', t: 0.5 });
        this.s.shake = Math.max(this.s.shake, 0.12);
        return true;
      }
      case 'mend':
      case 'ward': {
        const hurt = this.allies(u).filter((a) => dist(u.x, u.y, a.x, a.y) < 160 && a.hp < a.maxHp * 0.85);
        if (!hurt.length) return false;
        const k = 0.7 + u.player.iq / 200;
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
        this.fx({ kind: c.ab === 'mend' ? 'heal' : 'ward', x: u.x, y: u.y, r: 160, color: c.ab === 'mend' ? '#8dffb0' : '#ffe08a', t: 0.6 });
        return true;
      }
      case 'dash':
      case 'vanish': {
        const weak = this.enemies(u)
          .filter((e) => e.hidden <= 0 && dist(u.x, u.y, e.x, e.y) < 300)
          .sort((a, b) => a.hp - b.hp)[0];
        if (!weak) return false;
        if (c.ab === 'vanish') u.hidden = 1.2;
        this.fx({ kind: 'dash', x: u.x, y: u.y, x2: weak.x, y2: weak.y, color: col, t: 0.3 });
        u.face = weak.x > u.x ? 1 : -1;
        u.x = weak.x - u.face * 22;
        u.y = weak.y;
        this.hit(u, weak, u.dmg * 2.6, true);
        return true;
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
    for (const c of s.cores) c.hit = Math.max(0, c.hit - dt);

    for (const u of s.units) {
      u.moving = false;
      u.swing = Math.max(0, u.swing - dt);
      u.flash = Math.max(0, u.flash - dt);
      u.cast = Math.max(0, u.cast - dt);
      if (u.dead > 0) {
        u.dead -= dt;
        if (u.dead <= 0) {
          u.hp = u.maxHp;
          u.x = u.homeX;
          u.y = u.homeY;
          u.retreating = false;
        }
        continue;
      }
      u.atkT -= dt;
      u.abT -= dt;
      u.hidden = Math.max(0, u.hidden - dt);
      if (u.stun > 0) {
        u.stun -= dt;
        continue;
      }
      const home = s.cores[u.side];
      if (dist(u.x, u.y, home.x, home.y) < 130) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15 * dt);

      const retreatAt = 0.12 + (u.player.iq / 100) * 0.18;
      if (u.champ.role !== 'tank' && u.hp < u.maxHp * retreatAt) u.retreating = true;
      if (u.retreating) {
        if (u.hp > u.maxHp * 0.9) u.retreating = false;
        else {
          this.move(u, u.homeX, u.homeY, dt);
          continue;
        }
      }

      const target = this.chooseTarget(u);
      if (u.abT <= 0 && this.ability(u, target)) {
        u.abT = u.champ.abilityCd;
        u.cast = 0.35;
      }

      const enemyCore = s.cores[1 - u.side];
      if (target && target.dead <= 0) {
        const d = dist(u.x, u.y, target.x, target.y);
        u.face = target.x > u.x ? 1 : -1;
        if (d > u.champ.range) this.move(u, target.x, target.y, dt);
        else if (u.atkT <= 0) {
          u.atkT = u.champ.atkCd;
          u.swing = 0.25;
          this.hit(u, target, u.dmg);
          if (u.champ.range > 60)
            this.fx({ kind: u.champ.role === 'shooter' ? 'arrow' : 'shot', x: u.x, y: u.y, x2: target.x, y2: target.y, color: u.champ.look.trim, t: 0.18 });
        }
      } else {
        const d = dist(u.x, u.y, enemyCore.x, enemyCore.y);
        if (d > u.champ.range + 35) {
          const lane = (u.homeY - H / 2) * Math.min(1, d / 600);
          this.move(u, enemyCore.x, enemyCore.y + lane, dt);
        } else if (u.atkT <= 0) {
          u.atkT = u.champ.atkCd;
          u.swing = 0.25;
          u.face = enemyCore.x > u.x ? 1 : -1;
          enemyCore.hp -= u.dmg;
          enemyCore.hit = 0.15;
        }
      }
    }

    // Ядро отстреливается от врагов рядом
    s.cores.forEach((c, side) => {
      for (const e of s.units) {
        if (e.side !== side && e.dead <= 0 && dist(c.x, c.y, e.x, e.y) < 140) {
          e.hp -= 50 * dt;
          if (e.hp <= 0 && e.dead <= 0) this.die(e, null);
        }
      }
    });

    if (s.cores[0].hp <= 0 || s.cores[1].hp <= 0) {
      s.over = true;
      s.winner = s.cores[1].hp <= 0 ? 0 : 1;
    } else if (s.time >= MATCH_TIME) {
      s.over = true;
      if (s.kills[0] !== s.kills[1]) s.winner = s.kills[0] > s.kills[1] ? 0 : 1;
      else s.winner = s.cores[0].hp >= s.cores[1].hp ? 0 : 1;
    }
  }

  runToEnd() {
    while (!this.s.over) this.step();
    return this.s;
  }
}
