// Жизнь клуба между матчами: события с выбором, пресс-конференции,
// цели владельца на сезон и достижения.
import { Player, ovr, value } from './data';
import { Season, humanTeam, roster, sell, standings } from './league';
import { Rng } from './rng';

// ---------- События ----------

export type EventKind = 'injury' | 'conflict' | 'raise' | 'offer' | 'fans' | 'stream' | 'press' | 'transfer';

export interface ClubEvent {
  id: string;
  kind: EventKind;
  title: string;
  text: string;
  choices: { label: string; hint: string }[];
  pid?: string;
  pid2?: string;
  amount?: number;
  won?: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const find = (s: Season, id?: string) => roster(humanTeam(s)).find((p) => p.id === id);
const fmt = (n: number) => n.toLocaleString('ru');

// Новые события недели: одно случайное и, после матча, вопросы прессы
export function rollEvents(s: Season, rng: Rng, played: boolean, won: boolean) {
  const me = humanTeam(s);
  const all = roster(me);
  const starters = me.players;
  const id = () => 'e' + s.seasonNo + '-' + s.week + '-' + Math.floor(rng.next() * 1e6);
  const leader = starters.some((p) => p.trait === 'leader');
  const out: ClubEvent[] = [];

  // Просьба о трансфере: засидевшийся на скамейке сильный игрок или тот, кто совсем несчастлив
  const minStarter = Math.min(...starters.map((p) => ovr(p)));
  const unhappy = all.find(
    (p) => !p.promise && ((me.bench.includes(p) && (p.benchWeeks ?? 0) >= 3 && ovr(p) >= minStarter - 4) || p.morale < 22),
  );
  if (unhappy && rng.next() < 0.6 && all.length > 5) {
    const bench = me.bench.includes(unhappy);
    out.push({
      id: id(), kind: 'transfer', pid: unhappy.id, title: 'Просьба о трансфере',
      text: bench
        ? `${unhappy.nick} уже ${unhappy.benchWeeks} нед. сидит на скамейке и просит отпустить его туда, где он будет играть.`
        : `${unhappy.nick} несчастлив в клубе и через агента просит о трансфере.`,
      choices: [
        { label: bench ? 'Обещать место в составе' : 'Поговорить и поддержать', hint: bench ? 'Настроение вверх, но если через 3 недели он всё ещё на скамейке, будет хуже' : 'Настроение заметно вверх' },
        { label: 'Выставить на трансфер', hint: 'Игрок уйдёт сразу за рыночную цену' },
        { label: 'Отказать', hint: 'Сильно расстроится, команда это заметит' },
      ],
    });
  }

  const r = rng.next();
  const a = rng.pick(starters);
  const b = rng.pick(starters.filter((p) => p !== a));
  if (played && r < 0.08) {
    a.fatigue = Math.max(a.fatigue, 90);
    out.push({
      id: id(), kind: 'injury', pid: a.id, title: 'Травма',
      text: `${a.nick} потянул запястье на матче. Сейчас он сильно устал и играет хуже.`,
      choices: [
        { label: 'Клиника', hint: '−3 000, восстановится почти сразу' },
        { label: 'Пусть отдыхает', hint: 'Бесплатно, но пару недель будет не в форме' },
      ],
    });
  } else if (r < (leader ? 0.11 : 0.15) && b) {
    out.push({
      id: id(), kind: 'conflict', pid: a.id, pid2: b.id, title: 'Ссора в составе',
      text: `${a.nick} и ${b.nick} поругались после тренировки: каждый считает, что другой его подставляет.`,
      choices: [
        { label: 'Поговорить с обоими', hint: 'Оба немного успокоятся, сыгранность чуть упадёт' },
        { label: `Встать за ${a.nick}`, hint: `${a.nick} доволен, ${b.nick} сильно обижен` },
        { label: 'Оштрафовать обоих', hint: '+1 500 в кассу, оба недовольны' },
      ],
    });
  } else if (r < 0.21) {
    const avg = starters.reduce((x, p) => x + ovr(p), 0) / starters.length;
    const p = all.find((x) => ovr(x) >= avg && x.morale >= 45 && x.contract > 0);
    if (p) {
      const add = Math.round((p.salary * 0.2) / 10) * 10;
      out.push({
        id: id(), kind: 'raise', pid: p.id, amount: add, title: 'Просьба о повышении',
        text: `${p.nick} считает, что заслужил больше, и просит +${fmt(add)} в неделю.`,
        choices: [
          { label: 'Повысить', hint: `+${fmt(add)} к зарплате, настроение сильно вверх` },
          { label: 'Пообещать позже', hint: 'Немного расстроится' },
          { label: 'Отказать', hint: 'Настроение сильно вниз' },
        ],
      });
    }
  } else if (r < 0.26 && all.length > 5) {
    const p = rng.pick(all);
    const price = Math.round((value(p) * 1.3) / 100) * 100;
    out.push({
      id: id(), kind: 'offer', pid: p.id, amount: price, title: 'Предложение о покупке',
      text: `Богатый клуб готов выкупить ${p.nick} за ${fmt(price)}. Это больше рыночной цены.`,
      choices: [
        { label: 'Продать', hint: `+${fmt(price)}, игрок уйдёт сразу` },
        { label: 'Отказать', hint: p.trait === 'star' ? 'Звезда расстроится, что упустил шанс' : 'Игрок рад, что в него верят' },
      ],
    });
  } else if (r < 0.32) {
    out.push({
      id: id(), kind: 'fans', title: 'Встреча с болельщиками',
      text: 'Фан-клуб просит устроить автограф-сессию с командой.',
      choices: [
        { label: 'Устроить', hint: '−1 500, около +350 болельщиков' },
        { label: 'Не сейчас', hint: 'Ничего не изменится' },
      ],
    });
  } else if (r < 0.38) {
    out.push({
      id: id(), kind: 'stream', pid: a.id, title: 'Стримы',
      text: `${a.nick} хочет по вечерам вести трансляции для зрителей.`,
      choices: [
        { label: 'Разрешить', hint: '+200 болельщиков, игрок больше устаёт' },
        { label: 'Запретить', hint: 'Игрок расстроится' },
      ],
    });
  }

  if (played && rng.next() < 0.55)
    out.push(
      won
        ? {
            id: id(), kind: 'press', won, title: 'Пресс-конференция',
            text: 'Журналист: «Уверенная победа. Что скажете болельщикам?»',
            choices: [
              { label: 'Скромно: работаем дальше', hint: 'Команда чуть увереннее, немного новых болельщиков' },
              { label: 'Мы лучшие в лиге!', hint: 'Много новых болельщиков, но поражение в следующем матче ударит больнее' },
              { label: 'Соперник был силён', hint: 'Болельщики ценят уважение, команда сплачивается' },
            ],
          }
        : {
            id: id(), kind: 'press', won, title: 'Пресс-конференция',
            text: 'Журналист: «Обидное поражение. Кто виноват?»',
            choices: [
              { label: 'Это моя ошибка', hint: 'Игроки благодарны, настроение вверх' },
              { label: 'Игроки подвели', hint: 'Настроение команды вниз' },
              { label: 'Всё дело в патче', hint: 'Болельщикам не понравится' },
            ],
          },
    );

  // старые нерешённые события решаются сами, по самому осторожному варианту
  for (const e of s.events) {
    const txt = resolveEvent(s, e.id, e.choices.length - 1, true);
    if (txt) s.log.unshift(`${e.title}: решено без вас. ${txt}`);
  }
  s.events = out;
}

export function resolveEvent(s: Season, id: string, choice: number, auto = false): string {
  const e = s.events.find((x) => x.id === id);
  if (!e) return '';
  s.events = s.events.filter((x) => x !== e);
  const me = humanTeam(s);
  const p = find(s, e.pid);
  const q = find(s, e.pid2);
  const team = me.players;
  let txt = '';
  switch (e.kind) {
    case 'injury':
      if (!p) break;
      if (choice === 0 && s.money >= 3000) {
        s.money -= 3000;
        p.fatigue = 30;
        txt = `${p.nick} прошёл курс в клинике и почти восстановился.`;
      } else {
        p.morale = clamp(p.morale - 5);
        txt = `${p.nick} восстанавливается сам.`;
      }
      break;
    case 'conflict':
      if (!p || !q) break;
      if (choice === 0) {
        p.morale = clamp(p.morale + 4);
        q.morale = clamp(q.morale + 4);
        p.together = Math.max(0, p.together - 2);
        q.together = Math.max(0, q.together - 2);
        txt = 'Разговор помог, но осадок остался.';
      } else if (choice === 1) {
        p.morale = clamp(p.morale + 12);
        q.morale = clamp(q.morale - 18);
        txt = `${p.nick} доволен, ${q.nick} затаил обиду.`;
      } else {
        s.money += 1500;
        p.morale = clamp(p.morale - 10);
        q.morale = clamp(q.morale - 10);
        txt = 'Штраф выплачен, оба недовольны.';
      }
      break;
    case 'raise':
      if (!p) break;
      if (choice === 0) {
        p.salary += e.amount ?? 0;
        p.morale = clamp(p.morale + 15);
        txt = `${p.nick} получил повышение.`;
      } else if (choice === 1) {
        p.morale = clamp(p.morale - 6);
        txt = `${p.nick} ждёт обещанного.`;
      } else {
        p.morale = clamp(p.morale - 20);
        txt = `${p.nick} обиделся на отказ.`;
      }
      break;
    case 'offer':
      if (!p) break;
      if (choice === 0 && !auto && roster(me).length > 5) {
        const msg = sell(s, p);
        if (msg.includes('продан')) {
          // сверх обычной цены покупатель доплачивает
          const extra = (e.amount ?? 0) - Math.round((value(p) * 0.85) / 100) * 100;
          s.money += Math.max(0, extra);
          txt = `${p.nick} продан за ${fmt(e.amount ?? 0)}.`;
        } else txt = msg;
      } else {
        p.morale = clamp(p.morale + (p.trait === 'star' ? -10 : 4));
        txt = `${p.nick} остаётся в клубе.`;
      }
      break;
    case 'fans':
      if (choice === 0 && s.money >= 1500) {
        s.money -= 1500;
        s.fans += 350;
        txt = 'Болельщики в восторге: +350.';
      } else txt = 'Встречу отложили.';
      break;
    case 'stream':
      if (!p) break;
      if (choice === 0) {
        s.fans += 200;
        p.fatigue = Math.min(100, p.fatigue + 12);
        txt = `Стримы ${p.nick} привели 200 новых болельщиков.`;
      } else {
        p.morale = clamp(p.morale - 8);
        txt = `${p.nick} недоволен запретом.`;
      }
      break;
    case 'transfer':
      if (!p) break;
      if (choice === 0) {
        p.morale = clamp(p.morale + 15);
        if (me.bench.includes(p)) p.promise = s.seasonNo * 100 + s.week;
        txt = me.bench.includes(p) ? `${p.nick} ждёт места в составе в ближайшие недели.` : `${p.nick} остаётся и готов работать.`;
      } else if (choice === 1 && !auto && roster(me).length > 5) {
        txt = sell(s, p);
      } else {
        p.morale = clamp(p.morale - 15);
        for (const x of team) if (x !== p) x.together = Math.max(0, x.together - 1);
        txt = `${p.nick} остаётся против воли.`;
      }
      break;
    case 'press':
      if (e.won) {
        if (choice === 0) {
          for (const x of team) x.morale = clamp(x.morale + 3);
          s.fans += 60;
        } else if (choice === 1) {
          for (const x of team) x.morale = clamp(x.morale + 6);
          s.fans += 150;
          if (!auto) s.boast = s.seasonNo * 100 + s.week; // следующий матч проверит эти слова
        } else {
          for (const x of team) x.together += 1;
          s.fans += 90;
        }
      } else if (choice === 0) for (const x of team) x.morale = clamp(x.morale + 5);
      else if (choice === 1) for (const x of team) x.morale = clamp(x.morale - 8);
      else s.fans = Math.max(0, s.fans - 60);
      txt = 'Слова попали в новости.';
      break;
  }
  return txt;
}

// ---------- Цели владельца ----------

export type Goal = { kind: 'place'; n: number; reward: number } | { kind: 'money'; reward: number } | { kind: 'fans'; n: number; reward: number };

export function makeGoals(s: Season): Goal[] {
  const me = humanTeam(s);
  const str = (t: { players: Player[] }) => t.players.reduce((a, p) => a + ovr(p), 0);
  const league = s.teams.filter((t) => !t.foreign);
  const rank = [...league].sort((a, b) => str(b) - str(a)).indexOf(me) + 1;
  const place = rank <= 2 ? 1 : rank <= 4 ? 4 : 5;
  return [
    { kind: 'place', n: place, reward: place === 1 ? 12000 : place === 4 ? 8000 : 6000 },
    { kind: 'money', reward: 5000 },
    { kind: 'fans', n: Math.round((s.fans * 1.25) / 100) * 100, reward: 4000 },
  ];
}

export function goalText(g: Goal) {
  if (g.kind === 'place') return g.n === 1 ? 'Выиграть регулярный сезон' : g.n === 4 ? 'Выйти в плей-офф (топ-4)' : 'Не занять последнее место';
  if (g.kind === 'money') return 'Закончить сезон без долгов';
  return `Собрать ${fmt(g.n)} болельщиков`;
}

// Текущее положение по цели
export function goalNow(s: Season, g: Goal): { now: string; ok: boolean } {
  if (g.kind === 'place') {
    const pl = standings(s).findIndex((x) => x.team.human) + 1;
    return { now: `сейчас ${pl}-е место`, ok: pl <= g.n };
  }
  if (g.kind === 'money') return { now: `баланс ${fmt(s.money)}`, ok: s.money >= 0 };
  return { now: `сейчас ${fmt(s.fans)}`, ok: s.fans >= g.n };
}

// Итог сезона по целям: награды и доверие владельца
export function settleGoals(s: Season) {
  let done = 0;
  for (const g of s.goals) {
    if (!goalNow(s, g).ok) continue;
    done++;
    s.money += g.reward;
  }
  s.trust = Math.max(0, Math.min(100, s.trust + (done - 1.5) * 14));
  s.lastGoals = { done, total: s.goals.length };
  s.log.unshift(`Владелец подвёл итоги: выполнено целей ${done} из ${s.goals.length}. ${done ? 'Премия перечислена.' : 'Владелец разочарован.'}`);
  if (done === s.goals.length) unlock(s, 'goals');
}

// ---------- Достижения ----------

export const ACHIEVEMENTS: { id: string; name: string; text: string }[] = [
  { id: 'first', name: 'Первая победа', text: 'Выиграть первый матч' },
  { id: 'streak5', name: 'Неудержимые', text: 'Пять побед подряд' },
  { id: 'penta', name: 'Пятерное убийство', text: 'Ваш игрок уничтожил всю команду соперника в одиночку' },
  { id: 'rout', name: 'Разгром', text: 'Победить, сделав 25 убийств и больше' },
  { id: 'clean', name: 'Чистая работа', text: 'Победить, потеряв не больше 5 героев' },
  { id: 'league', name: 'Чемпион лиги', text: 'Выиграть финал лиги' },
  { id: 'world', name: 'Лучшие в мире', text: 'Выиграть Кубок мира' },
  { id: 'goals', name: 'Доверие владельца', text: 'Выполнить все цели сезона' },
  { id: 'rich', name: 'Капитал', text: 'Накопить 100 000' },
  { id: 'fans', name: 'Народная команда', text: 'Собрать 10 000 болельщиков' },
  { id: 'young', name: 'Ставка на молодость', text: 'Игрок младше 20 лет с силой 65+ в основном составе' },
  { id: 'veteran', name: 'Династия', text: 'Провести в клубе три сезона' },
];

export function unlock(s: Season, id: string) {
  if (s.achievements.includes(id)) return;
  s.achievements.push(id);
  s.newAch.push(id);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) s.log.unshift(`Достижение: «${a.name}».`);
}

// Проверка после каждой недели
export function checkAchievements(s: Season, played: boolean, won: boolean, kills?: [number, number], mySide?: 0 | 1, bestMulti = 0) {
  const c = s.career;
  if (played) {
    if (won) {
      c.wins++;
      c.streak++;
      c.best = Math.max(c.best, c.streak);
      unlock(s, 'first');
    } else {
      c.losses++;
      c.streak = 0;
    }
    if (c.streak >= 5) unlock(s, 'streak5');
    if (bestMulti >= 5) unlock(s, 'penta');
    if (kills && mySide !== undefined && won) {
      if (kills[mySide] >= 25) unlock(s, 'rout');
      if (kills[1 - mySide] <= 5) unlock(s, 'clean');
    }
  }
  if (s.titles.some((t) => t.startsWith('Чемпион лиги'))) unlock(s, 'league');
  if (s.titles.some((t) => t.startsWith('Обладатель Кубка мира'))) unlock(s, 'world');
  if (s.money >= 100000) unlock(s, 'rich');
  if (s.fans >= 10000) unlock(s, 'fans');
  if (humanTeam(s).players.some((p) => p.age < 20 && ovr(p) >= 65)) unlock(s, 'young');
  if (s.seasonNo >= 3) unlock(s, 'veteran');
}
