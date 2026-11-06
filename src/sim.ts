// Симуляция матча 5 на 5. Работает по тикам и не зависит от отрисовки,
// поэтому матч можно смотреть или мгновенно пропустить.
import { Champion, Player, Team, champById } from './data';
import { Rng } from './rng';

export const W = 1000;
export const H = 600;
export const TICK = 1 / 30;
export const MATCH_TIME = 120; // секунд
const CORE_HP = 2500;
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
  armor: number; // доля снижения урона
  atkT: number;
  abT: number;
  stun: number;
  dead: number; // >0 — время до возрождения
  kills: number;
  deaths: number;
  dealt: number;
  healed: number;
  homeX: number;
  homeY: number;
  retreating: boolean;
}

export interface Fx {
  kind: 'shot' | 'aoe' | 'heal' | 'dash' | 'text';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  color: string;
  t: number;
  text?: string;
}

export interface Core {
  x: number;
  y: number;
  hp: number;
}

export interface MatchSetup {
  teams: [Team, Team];
  picks: [string[], string[]]; // id чемпионов по игрокам
  seed: number;
}

export interface MatchState {
  time: number;
  units: Unit[];
  cores: [Core, Core];
  kills: [number, number];
  fx: Fx[];
  feed: string[];
  over: boolean;
  winner: 0 | 1 | -1;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Match {
  s: MatchState;
  rng: Rng;
  setup: MatchSetup;

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    const units: Unit[] = [];
    for (const side of [0, 1] as const) {
      const team = setup.teams[side];
      team.players.forEach((p, i) => {
        const c = champById(setup.picks[side][i]);
        const mastery = p.pool[c.role] / 100; // 0..1
        const formK = p.form / 100;
        const hx = side === 0 ? 90 : W - 90;
        const hy = 160 + i * 70;
        const maxHp = c.hp * (0.8 + p.def / 250) * (0.9 + mastery * 0.15);
        units.push({
          side,
          player: p,
          champ: c,
          x: hx,
          y: hy,
          hp: maxHp,
          maxHp,
          shield: 0,
          dmg: c.dmg * (0.75 + p.atk / 200) * (0.85 + mastery * 0.25) * (0.85 + formK * 0.15),
          armor: Math.min(0.4, p.def / 300),
          atkT: this.rng.range(0, 0.5),
          abT: c.abilityCd * this.rng.range(0.3, 0.8),
          stun: 0,
          dead: 0,
          kills: 0,
          deaths: 0,
          dealt: 0,
          healed: 0,
          homeX: hx,
          homeY: hy,
          retreating: false,
        });
      });
    }
    this.s = {
      time: 0,
      units,
      cores: [
        { x: 50, y: H / 2, hp: CORE_HP },
        { x: W - 50, y: H / 2, hp: CORE_HP },
      ],
      kills: [0, 0],
      fx: [],
      feed: [],
      over: false,
      winner: -1,
    };
  }

  private enemies(u: Unit) {
    return this.s.units.filter((e) => e.side !== u.side && e.dead <= 0);
  }
  private allies(u: Unit) {
    return this.s.units.filter((e) => e.side === u.side && e.dead <= 0);
  }

  private hit(src: Unit, dst: Unit, amount: number) {
    let dmg = amount * (1 - dst.armor) * this.rng.range(0.9, 1.1);
    src.dealt += dmg;
    if (dst.shield > 0) {
      const a = Math.min(dst.shield, dmg);
      dst.shield -= a;
      dmg -= a;
    }
    dst.hp -= dmg;
    if (dst.hp <= 0 && dst.dead <= 0) {
      dst.hp = 0;
      dst.dead = RESPAWN + this.s.time / 30; // поздние смерти дороже
      dst.deaths++;
      dst.shield = 0;
      src.kills++;
      this.s.kills[src.side]++;
      const t = this.setup.teams;
      this.s.feed.unshift(`${t[src.side].tag} ${src.player.nick} ⟶ ${t[dst.side].tag} ${dst.player.nick}`);
      if (this.s.feed.length > 5) this.s.feed.pop();
    }
  }

  private move(u: Unit, tx: number, ty: number, dt: number) {
    const d = dist(u.x, u.y, tx, ty);
    if (d < 1) return;
    const step = Math.min(d, u.champ.speed * dt);
    u.x += ((tx - u.x) / d) * step;
    u.y += ((ty - u.y) / d) * step;
  }

  private chooseTarget(u: Unit): Unit | null {
    const es = this.enemies(u);
    if (!es.length) return null;
    const smart = u.player.iq / 100;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const e of es) {
      const d = dist(u.x, u.y, e.x, e.y);
      if (d > 420) continue;
      // Умный игрок охотнее добивает раненых, а не просто ближайших
      const score = d * (1 - smart * 0.5) + (e.hp / e.maxHp) * 200 * smart;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private ability(u: Unit, target: Unit | null) {
    const c = u.champ;
    const color = this.setup.teams[u.side].color;
    switch (c.role) {
      case 'tank': {
        u.shield += u.maxHp * 0.25;
        for (const e of this.enemies(u)) if (dist(u.x, u.y, e.x, e.y) < 90) e.stun = 1.2;
        this.s.fx.push({ kind: 'aoe', x: u.x, y: u.y, r: 90, color, t: 0.4 });
        return true;
      }
      case 'fighter': {
        const near = this.enemies(u).filter((e) => dist(u.x, u.y, e.x, e.y) < 80);
        if (!near.length) return false;
        for (const e of near) this.hit(u, e, u.dmg * 1.8);
        this.s.fx.push({ kind: 'aoe', x: u.x, y: u.y, r: 80, color, t: 0.3 });
        return true;
      }
      case 'shooter': {
        if (!target || dist(u.x, u.y, target.x, target.y) > c.range + 30) return false;
        this.hit(u, target, u.dmg * 3);
        this.s.fx.push({ kind: 'shot', x: u.x, y: u.y, x2: target.x, y2: target.y, color: '#fff3a0', t: 0.25 });
        return true;
      }
      case 'mage': {
        if (!target || dist(u.x, u.y, target.x, target.y) > c.range + 30) return false;
        for (const e of this.enemies(u)) if (dist(target.x, target.y, e.x, e.y) < 75) this.hit(u, e, u.dmg * 2.2);
        this.s.fx.push({ kind: 'aoe', x: target.x, y: target.y, r: 75, color: c.id === 'frost' ? '#9fe6ff' : '#ff9a3c', t: 0.45 });
        return true;
      }
      case 'support': {
        const hurt = this.allies(u).filter((a) => dist(u.x, u.y, a.x, a.y) < 160 && a.hp < a.maxHp * 0.85);
        if (!hurt.length) return false;
        for (const a of hurt) {
          const h = Math.min(a.maxHp - a.hp, 160 * (0.7 + u.player.iq / 200));
          a.hp += h;
          u.healed += h;
        }
        this.s.fx.push({ kind: 'heal', x: u.x, y: u.y, r: 160, color: '#7dffb0', t: 0.5 });
        return true;
      }
      case 'assassin': {
        const weak = this.enemies(u)
          .filter((e) => dist(u.x, u.y, e.x, e.y) < 300)
          .sort((a, b) => a.hp - b.hp)[0];
        if (!weak) return false;
        this.s.fx.push({ kind: 'dash', x: u.x, y: u.y, x2: weak.x, y2: weak.y, color, t: 0.3 });
        u.x = weak.x + (u.side === 0 ? -20 : 20);
        u.y = weak.y;
        this.hit(u, weak, u.dmg * 2.6);
        return true;
      }
    }
  }

  step(dt = TICK) {
    const s = this.s;
    if (s.over) return;
    s.time += dt;
    for (const f of s.fx) f.t -= dt;
    s.fx = s.fx.filter((f) => f.t > 0);

    for (const u of s.units) {
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
      if (u.stun > 0) {
        u.stun -= dt;
        continue;
      }
      // Возле своей базы — лечение
      const home = s.cores[u.side];
      if (dist(u.x, u.y, home.x, home.y) < 120) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15 * dt);

      // Отступление на низком здоровье зависит от тактики игрока
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
      if (u.abT <= 0 && this.ability(u, target)) u.abT = u.champ.abilityCd;

      const enemyCore = s.cores[1 - u.side];
      if (target) {
        const d = dist(u.x, u.y, target.x, target.y);
        if (d > u.champ.range) this.move(u, target.x, target.y, dt);
        else if (u.atkT <= 0) {
          u.atkT = u.champ.atkCd;
          this.hit(u, target, u.dmg);
          if (u.champ.range > 60)
            s.fx.push({ kind: 'shot', x: u.x, y: u.y, x2: target.x, y2: target.y, color: this.setup.teams[u.side].color, t: 0.12 });
        }
      } else {
        const d = dist(u.x, u.y, enemyCore.x, enemyCore.y);
        if (d > u.champ.range + 30) {
          // Держим строй: каждый идёт к ядру по своей линии
          const lane = (u.homeY - H / 2) * Math.min(1, d / 600);
          this.move(u, enemyCore.x, enemyCore.y + lane, dt);
        } else if (u.atkT <= 0) {
          u.atkT = u.champ.atkCd;
          enemyCore.hp -= u.dmg;
        }
      }
    }

    // Ядро отстреливается от врагов рядом
    s.cores.forEach((c, side) => {
      for (const e of s.units) {
        if (e.side !== side && e.dead <= 0 && dist(c.x, c.y, e.x, e.y) < 140) {
          e.hp -= 50 * dt;
          if (e.hp <= 0 && e.dead <= 0) {
            e.hp = 0;
            e.dead = RESPAWN + s.time / 30;
            e.deaths++;
            s.feed.unshift(`Ядро ⟶ ${this.setup.teams[e.side].tag} ${e.player.nick}`);
          }
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
