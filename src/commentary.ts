// Комментаторы матча: реплики на события и паузы, баннеры на яркие моменты.
// Работает только в интерфейсе и не влияет на симуляцию.
import { Match, MatchEvent, NEUTRAL_NAMES, STRATEGY_TEXT, Unit } from './sim';

export const CASTERS = ['Гром', 'Лиса'] as const;

export interface Line {
  who: 0 | 1; // какой комментатор
  text: string;
  prio: number;
  banner?: string;
  side?: 0 | 1; // цвет баннера
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const nick = (u: Unit) => u.player.nick;
const LANE_IN = ['на верхней линии', 'в центре', 'на нижней линии'];

export class Caster {
  private m: Match;
  private seen = 0;
  private lastLineT = -99; // игровое время последней реплики
  private kills: { t: number; side: 0 | 1 }[] = [];
  private fightSaid = -99;
  private intro = false;
  private lastLead = 0;
  private turn: 0 | 1 = 0;

  constructor(m: Match) {
    this.m = m;
  }

  private tag(side: 0 | 1) {
    return this.m.setup.teams[side].tag;
  }

  private say(text: string, prio: number, extra: Partial<Line> = {}): Line {
    this.turn = (1 - this.turn) as 0 | 1;
    this.lastLineT = this.m.s.time;
    return { who: this.turn, text, prio, ...extra };
  }

  // Новые реплики с прошлого вызова
  poll(): Line[] {
    const s = this.m.s;
    const out: Line[] = [];
    if (!this.intro && s.time > 1) {
      this.intro = true;
      const [a, b] = this.m.strat;
      out.push(this.say(`Начинаем! ${this.tag(0)} играют «${STRATEGY_TEXT[a][0]}», ${this.tag(1)} выбрали «${STRATEGY_TEXT[b][0]}».`, 1));
    }
    for (; this.seen < s.events.length; this.seen++) {
      const l = this.line(s.events[this.seen]);
      if (l) out.push(l);
    }
    // Большая драка: три убийства за шесть секунд
    const recent = this.kills.filter((k) => s.time - k.t < 6);
    if (recent.length >= 3 && s.time - this.fightSaid > 10) {
      this.fightSaid = s.time;
      const a = recent.filter((k) => k.side === 0).length;
      const b = recent.length - a;
      const w = a === b ? null : a > b ? 0 : 1;
      out.push(this.say(w === null ? `Какая драка! Размен ${a}:${b}, никто не уступил.` : `Большая драка выиграна командой ${this.tag(w)}: ${Math.max(a, b)} на ${Math.min(a, b)}!`, 3));
    }
    // Паузы заполняем разбором
    if (!out.length && s.time - this.lastLineT > 16) {
      const l = this.idle();
      if (l) out.push(l);
    }
    return out;
  }

  private line(e: MatchEvent): Line | null {
    const s = this.m.s;
    switch (e.kind) {
      case 'first': {
        this.kills.push({ t: e.t, side: (1 - e.victim.side) as 0 | 1 });
        const k = e.killer ? `${nick(e.killer)} на ${e.killer.champ.name}` : this.tag((1 - e.victim.side) as 0 | 1);
        return this.say(pick([`Первая кровь! ${k} забирает ${nick(e.victim)}.`, `И вот она, первая кровь: ${k} открывает счёт!`]), 4, { banner: 'Первая кровь', side: (1 - e.victim.side) as 0 | 1 });
      }
      case 'kill': {
        const side = (1 - e.victim.side) as 0 | 1;
        this.kills.push({ t: e.t, side });
        const k = e.killer;
        if (k && e.multi >= 2) {
          const names = ['', '', 'Двойное убийство', 'Тройное убийство', 'Четверное убийство', 'Пятерное убийство'];
          const b = names[Math.min(5, e.multi)];
          return this.say(`${b}! ${nick(k)} на ${k.champ.name} просто косит врагов!`, 5 + e.multi, { banner: b, side });
        }
        if (e.shutdown >= 3) return this.say(`${nick(e.victim)} остановлен! Серия из ${e.shutdown} убийств прервана, ${this.tag(side)} забирают награду.`, 5, { banner: 'Серия прервана', side });
        if (k && (e.streak === 3 || e.streak === 5 || e.streak === 7))
          return this.say(
            e.streak === 3 ? `${nick(k)} разогрелся: третье убийство подряд!` : e.streak === 5 ? `${nick(k)} неудержим! Пять убийств без смерти!` : `${nick(k)} творит что-то невероятное, ${e.streak} подряд!`,
            5,
            { banner: e.streak >= 5 ? 'Неудержим' : 'Серия ×3', side },
          );
        if (s.time - this.lastLineT < 5) return null; // обычные убийства не заглушают всё подряд
        return k
          ? this.say(pick([`${nick(k)} ловит ${nick(e.victim)}.`, `${k.champ.name} забирает ${nick(e.victim)}!`, `Минус ${nick(e.victim)}, хорошая работа от ${nick(k)}.`]), 2)
          : this.say(`${nick(e.victim)} падает под башней.`, 2);
      }
      case 'ace':
        return this.say(`Вся пятёрка ${this.tag(e.side)} лежит! Карта открыта для ${this.tag((1 - e.side) as 0 | 1)}!`, 8, { banner: 'Команда стёрта', side: (1 - e.side) as 0 | 1 });
      case 'tower': {
        const att = (1 - e.side) as 0 | 1;
        return e.tier === 1
          ? this.say(`Падает внутренняя башня ${this.tag(e.side)} ${LANE_IN[e.lane]}! Ядро без защиты!`, 6, { banner: 'Ядро открыто', side: att })
          : this.say(pick([`${this.tag(att)} сносят башню ${LANE_IN[e.lane]}.`, `Минус башня у ${this.tag(e.side)}, ${this.tag(att)} давят.`]), 3);
      }
      case 'objective':
        return e.type === 'colossus'
          ? this.say(`${this.tag(e.side)} забирают Каменного колосса! Теперь строения будут таять.`, 6, { banner: NEUTRAL_NAMES.colossus, side: e.side })
          : this.say(`${NEUTRAL_NAMES.spirit} у ${this.tag(e.side)}: заряд ${s.spirit[e.side]} из 3, урон растёт.`, 4);
      case 'core':
        return this.say(`Ядро ${this.tag(e.side)} уже наполовину разрушено! Сейчас всё решится!`, 7);
      case 'late':
        return this.say('Поздняя игра! Строения теперь падают куда быстрее, любая ошибка может стоить матча.', 3);
    }
  }

  private idle(): Line | null {
    const s = this.m.s;
    const lead = s.goldLine[s.goldLine.length - 1] ?? 0;
    const [k0, k1] = s.kills;
    const opts: string[] = [];
    if (Math.abs(lead) > 1500) {
      const w = lead > 0 ? 0 : 1;
      opts.push(`${this.tag(w)} впереди по золоту на ${Math.round(Math.abs(lead) / 100) / 10} тыс.`);
      if (Math.sign(lead) !== Math.sign(this.lastLead) && Math.abs(this.lastLead) > 1500) opts.push(`Вот это камбэк! ${this.tag(w)} перевернули игру по золоту!`);
    } else opts.push('По золоту пока почти равенство, команды присматриваются.');
    if (k0 + k1 > 0) opts.push(`Счёт по убийствам ${k0}:${k1}.`);
    const best = [...s.units].sort((a, b) => b.kills * 2 + b.assists - (a.kills * 2 + a.assists))[0];
    if (best.kills >= 3) opts.push(`${nick(best)} на ${best.champ.name} сегодня в ударе: ${best.kills}/${best.deaths}/${best.assists}.`);
    if (s.time < 60) opts.push('Ранняя стадия: все стоят на своих линиях и копят опыт.');
    const sp = s.neutrals.find((n) => n.type === 'spirit');
    if (sp && sp.respawn <= 0 && sp.hp > 0 && s.time > 45) opts.push('Речной дух свободен. Кто первым пойдёт к реке?');
    this.lastLead = lead;
    return this.say(pick(opts), 1);
  }
}
