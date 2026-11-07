// Игровые данные: герои, генерация игроков и команд.
import { Rng } from './rng';

export type Role = 'tank' | 'fighter' | 'shooter' | 'mage' | 'support' | 'assassin';

export const ROLE_NAMES: Record<Role, string> = {
  tank: 'Страж',
  fighter: 'Боец',
  shooter: 'Стрелок',
  mage: 'Маг',
  support: 'Поддержка',
  assassin: 'Ассасин',
};

export type AbilityKind =
  | 'bulwark' // щит себе и оглушение вокруг
  | 'hook' // притянуть врага к себе
  | 'whirl' // круговой удар
  | 'leap' // прыжок к цели с ударом по площади
  | 'pierce' // мощный одиночный выстрел
  | 'volley' // залп по трём целям
  | 'fireball' // взрыв по площади
  | 'frost' // ледяной взрыв с заморозкой
  | 'mend' // лечение союзников вокруг
  | 'ward' // щит на союзников вокруг
  | 'dash' // рывок к слабейшему врагу
  | 'vanish'; // уход в тень и критический удар

export const ABILITY_TEXT: Record<AbilityKind, string> = {
  bulwark: 'Каменный щит и оглушение врагов рядом',
  hook: 'Цепью притягивает врага к себе',
  whirl: 'Круговой удар по всем рядом',
  leap: 'Прыжок к цели с ударом по площади',
  pierce: 'Пробивной выстрел, тройной урон',
  volley: 'Залп по трём ближайшим врагам',
  fireball: 'Огненный взрыв по площади',
  frost: 'Ледяной взрыв, замораживает',
  mend: 'Лечит союзников вокруг',
  ward: 'Ставит щиты на союзников вокруг',
  dash: 'Рывок к самому слабому врагу',
  vanish: 'Исчезает в тени и бьёт из засады',
};

export type Body = 'heavy' | 'medium' | 'slim' | 'robe';
export type Weapon = 'shield' | 'hammer' | 'axe' | 'sword' | 'spear' | 'bow' | 'crossbow' | 'staff' | 'orb' | 'book' | 'daggers' | 'scythe' | 'lantern' | 'fist';
export type Head = 'helm' | 'hood' | 'hair' | 'horns' | 'mask' | 'crown' | 'ears' | 'bun';

export interface Look {
  body: Body;
  weapon: Weapon;
  head: Head;
  skin: string;
  cloth: string; // основной цвет одежды
  trim: string; // акцент: металл, свечение
  hair: string;
}

export interface Champion {
  id: string;
  name: string;
  role: Role;
  title: string;
  hp: number;
  dmg: number;
  range: number;
  atkCd: number;
  speed: number;
  abilityCd: number;
  ab: AbilityKind;
  look: Look;
}

const S = { pale: '#f2d3b8', tan: '#d9a77c', brown: '#8d5a3b', dark: '#5b3a29', ash: '#a9b4c2', moss: '#8fae7a', violet: '#b49ad9' };

// 20 оригинальных героев. Имена, облик и способности придуманы для этой игры.
export const CHAMPIONS: Champion[] = [
  // Стражи
  { id: 'granite', name: 'Гранит', title: 'Каменный страж', role: 'tank', hp: 1550, dmg: 36, range: 34, atkCd: 1.1, speed: 68, abilityCd: 9, ab: 'bulwark', look: { body: 'heavy', weapon: 'shield', head: 'helm', skin: S.tan, cloth: '#7b8794', trim: '#d8c38a', hair: '#3a3026' } },
  { id: 'anchor', name: 'Якорь', title: 'Портовый громила', role: 'tank', hp: 1450, dmg: 40, range: 36, atkCd: 1.1, speed: 70, abilityCd: 8, ab: 'hook', look: { body: 'heavy', weapon: 'hammer', head: 'hair', skin: S.brown, cloth: '#3f5d73', trim: '#c9a46a', hair: '#1f1a17' } },
  { id: 'warden', name: 'Хранитель', title: 'Страж рощи', role: 'tank', hp: 1500, dmg: 34, range: 34, atkCd: 1.0, speed: 72, abilityCd: 8.5, ab: 'bulwark', look: { body: 'heavy', weapon: 'shield', head: 'horns', skin: S.moss, cloth: '#5e6b3a', trim: '#e2c86f', hair: '#4b3a22' } },
  { id: 'bastion', name: 'Бастион', title: 'Осадная броня', role: 'tank', hp: 1600, dmg: 32, range: 34, atkCd: 1.2, speed: 64, abilityCd: 9, ab: 'hook', look: { body: 'heavy', weapon: 'hammer', head: 'helm', skin: S.pale, cloth: '#8a4b3a', trim: '#e8d6a8', hair: '#6b4a2b' } },
  // Бойцы
  { id: 'vortex', name: 'Вихрь', title: 'Мастер клинка', role: 'fighter', hp: 1050, dmg: 58, range: 38, atkCd: 0.9, speed: 82, abilityCd: 6, ab: 'whirl', look: { body: 'medium', weapon: 'sword', head: 'hair', skin: S.pale, cloth: '#2f6f8f', trim: '#e9eef2', hair: '#e8e2d0' } },
  { id: 'ember', name: 'Уголёк', title: 'Кузнец войны', role: 'fighter', hp: 1000, dmg: 64, range: 38, atkCd: 0.95, speed: 80, abilityCd: 6.5, ab: 'leap', look: { body: 'medium', weapon: 'axe', head: 'hair', skin: S.tan, cloth: '#7a3324', trim: '#ff9a3c', hair: '#b23a1d' } },
  { id: 'tusk', name: 'Бивень', title: 'Степной наездник', role: 'fighter', hp: 1120, dmg: 54, range: 44, atkCd: 1.0, speed: 84, abilityCd: 7, ab: 'leap', look: { body: 'medium', weapon: 'spear', head: 'horns', skin: S.brown, cloth: '#6b5b3a', trim: '#f0e3c0', hair: '#2b211a' } },
  { id: 'brick', name: 'Кирпич', title: 'Уличный боец', role: 'fighter', hp: 1080, dmg: 60, range: 30, atkCd: 0.8, speed: 86, abilityCd: 6, ab: 'whirl', look: { body: 'medium', weapon: 'fist', head: 'bun', skin: S.dark, cloth: '#c4533a', trim: '#f2c14e', hair: '#141110' } },
  // Стрелки
  { id: 'hawk', name: 'Ястреб', title: 'Лесной лучник', role: 'shooter', hp: 720, dmg: 62, range: 190, atkCd: 0.85, speed: 72, abilityCd: 7, ab: 'pierce', look: { body: 'slim', weapon: 'bow', head: 'hood', skin: S.tan, cloth: '#3f6b45', trim: '#d6c48a', hair: '#5a3b22' } },
  { id: 'quill', name: 'Перо', title: 'Небесная охотница', role: 'shooter', hp: 690, dmg: 56, range: 210, atkCd: 0.75, speed: 74, abilityCd: 7, ab: 'volley', look: { body: 'slim', weapon: 'bow', head: 'ears', skin: S.pale, cloth: '#e7e0cf', trim: '#5fb3d9', hair: '#d9a441' } },
  { id: 'bolt', name: 'Болт', title: 'Механик-арбалетчик', role: 'shooter', hp: 760, dmg: 66, range: 180, atkCd: 0.95, speed: 70, abilityCd: 7.5, ab: 'pierce', look: { body: 'slim', weapon: 'crossbow', head: 'mask', skin: S.ash, cloth: '#4d4f5c', trim: '#ffb23f', hair: '#2a2b30' } },
  // Маги
  { id: 'aurora', name: 'Аврора', title: 'Хранительница пламени', role: 'mage', hp: 700, dmg: 48, range: 170, atkCd: 1.2, speed: 70, abilityCd: 7.5, ab: 'fireball', look: { body: 'robe', weapon: 'staff', head: 'hair', skin: S.pale, cloth: '#8c2f39', trim: '#ffb14a', hair: '#f06a3a' } },
  { id: 'frost', name: 'Иней', title: 'Северный чародей', role: 'mage', hp: 740, dmg: 44, range: 165, atkCd: 1.2, speed: 70, abilityCd: 7, ab: 'frost', look: { body: 'robe', weapon: 'orb', head: 'crown', skin: S.ash, cloth: '#2c4a73', trim: '#a7e3ff', hair: '#e6f2ff' } },
  { id: 'sage', name: 'Мудрец', title: 'Хранитель книг', role: 'mage', hp: 720, dmg: 50, range: 175, atkCd: 1.25, speed: 68, abilityCd: 8, ab: 'fireball', look: { body: 'robe', weapon: 'book', head: 'hood', skin: S.violet, cloth: '#4a3566', trim: '#f5d76e', hair: '#d8d0e8' } },
  // Поддержка
  { id: 'willow', name: 'Ива', title: 'Лесная целительница', role: 'support', hp: 760, dmg: 28, range: 150, atkCd: 1.1, speed: 74, abilityCd: 6, ab: 'mend', look: { body: 'robe', weapon: 'staff', head: 'ears', skin: S.moss, cloth: '#5c8a5a', trim: '#f0f5c8', hair: '#3f6b33' } },
  { id: 'lumen', name: 'Люмен', title: 'Светоносец', role: 'support', hp: 800, dmg: 26, range: 140, atkCd: 1.1, speed: 72, abilityCd: 6.5, ab: 'ward', look: { body: 'robe', weapon: 'lantern', head: 'crown', skin: S.tan, cloth: '#e3d7b4', trim: '#ffd25e', hair: '#8a6a3a' } },
  { id: 'chime', name: 'Звон', title: 'Монах-колокол', role: 'support', hp: 820, dmg: 30, range: 130, atkCd: 1.0, speed: 74, abilityCd: 7, ab: 'mend', look: { body: 'medium', weapon: 'orb', head: 'bun', skin: S.brown, cloth: '#c2763a', trim: '#f7e08f', hair: '#1b1512' } },
  // Ассасины
  { id: 'shade', name: 'Тень', title: 'Ночной клинок', role: 'assassin', hp: 780, dmg: 70, range: 32, atkCd: 0.8, speed: 96, abilityCd: 6, ab: 'vanish', look: { body: 'slim', weapon: 'daggers', head: 'hood', skin: S.ash, cloth: '#2d2838', trim: '#b28cff', hair: '#1a1720' } },
  { id: 'fang', name: 'Клык', title: 'Дикий охотник', role: 'assassin', hp: 820, dmg: 66, range: 32, atkCd: 0.8, speed: 94, abilityCd: 6.5, ab: 'dash', look: { body: 'slim', weapon: 'daggers', head: 'ears', skin: S.tan, cloth: '#5a4636', trim: '#e8e1d4', hair: '#9b8a76' } },
  { id: 'reaper', name: 'Жнец', title: 'Полевой призрак', role: 'assassin', hp: 800, dmg: 74, range: 40, atkCd: 0.95, speed: 90, abilityCd: 7, ab: 'dash', look: { body: 'slim', weapon: 'scythe', head: 'mask', skin: S.pale, cloth: '#3b3f36', trim: '#c8e86b', hair: '#d9d6c8' } },
];

export const champById = (id: string) => CHAMPIONS.find((c) => c.id === id)!;
export const ALL_ROLES: Role[] = ['tank', 'fighter', 'shooter', 'mage', 'support', 'assassin'];

// Позиция игрока в команде: 0 верх, 1 центр, 2 стрелок, 3 лес, 4 поддержка
export type Pos = 0 | 1 | 2 | 3 | 4;
export const POS_NAMES = ['Верх', 'Центр', 'Стрелок', 'Лес', 'Поддержка'] as const;
// Какие роли героев подходят позиции
export const POS_ROLES: Record<Pos, Role[]> = {
  0: ['tank', 'fighter'],
  1: ['mage', 'assassin'],
  2: ['shooter'],
  3: ['assassin', 'fighter'],
  4: ['support', 'tank'],
};

export interface Player {
  id: string;
  nick: string;
  pos: Pos;
  atk: number;
  def: number;
  iq: number;
  form: number;
  pool: Record<Role, number>;
  salary: number;
  age: number;
  potential: number; // потолок среднего навыка
  morale: number; // 0–100: настроение, влияет на игру
  fatigue: number; // 0–100: усталость, снижает силу
  contract: number; // сколько сезонов осталось по контракту (включая текущий)
  together: number; // недель в этой команде: из этого растёт химия
  favs: string[]; // любимые герои: на них игрок сильнее
  trait?: Trait; // характер
}

// Характер игрока: влияет на матчи, тренировки и настроение команды
export type Trait = 'leader' | 'star' | 'grinder' | 'nervous' | 'calm';
export const TRAITS: Trait[] = ['leader', 'star', 'grinder', 'nervous', 'calm'];
export const TRAIT_INFO: Record<Trait, { name: string; text: string }> = {
  leader: { name: 'Лидер', text: 'Команда быстрее сыгрывается и легче переносит поражения' },
  star: { name: 'Звезда', text: 'Бьёт сильнее и рискует ради убийств, просит зарплату выше' },
  grinder: { name: 'Трудяга', text: 'Растёт на тренировках заметно быстрее' },
  nervous: { name: 'Нервный', text: 'Слабее в плей-офф и на Кубке мира' },
  calm: { name: 'Хладнокровный', text: 'Сильнее в плей-офф и на Кубке мира' },
};
// Характер по id: для старых сохранений, без случайных чисел
export const traitFor = (id: string): Trait => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TRAITS[h % TRAITS.length];
};

export const ovr = (p: Player) => (p.atk + p.def + p.iq) / 3;

export interface Team {
  id: string;
  name: string;
  tag: string;
  color: string;
  players: Player[]; // стартовая пятёрка, по позициям
  bench: Player[]; // запасные
  human: boolean;
  emblem?: number; // рисунок на гербе
  foreign?: boolean; // зарубежный клуб, только на международном турнире
}

const NICK_A = ['Нова', 'Рекс', 'Зефир', 'Кайто', 'Флин', 'Мира', 'Орбит', 'Пиксель', 'Сайфер', 'Тор', 'Ульф', 'Вега', 'Гекс', 'Дрейк', 'Эхо', 'Йоль', 'Квант', 'Люкс', 'Неон', 'Опал', 'Призм', 'Руна', 'Синк', 'Тайга', 'Фокс', 'Хаки', 'Цирк', 'Шторм', 'Юки', 'Ярс', 'Бриз', 'Вольт', 'Глинт', 'Дюна', 'Жук', 'Зоркий'];
const NICK_B = ['', '', '', 'X', '7', 'Pro', 'Jr', 'One', '99', 'Z', 'Ace', 'GG', '2', 'Max', 'Kid', 'Neo'];

export function makePlayer(rng: Rng, level: number, used: Set<string>, pos: Pos = rng.int(0, 4) as Pos, age = rng.int(18, 28)): Player {
  let nick = '';
  let tries = 0;
  do nick = rng.pick(NICK_A) + rng.pick(NICK_B);
  while (used.has(nick) && ++tries < 40);
  used.add(nick);
  const stat = () => Math.round(Math.max(20, Math.min(95, level + rng.range(-14, 14))));
  const pool = {} as Record<Role, number>;
  for (const r of ALL_ROLES) pool[r] = Math.round(rng.range(20, 55));
  const [main, second] = POS_ROLES[pos];
  pool[main] = Math.round(rng.range(70, 95));
  if (second) pool[second] = Math.round(rng.range(50, 80));
  // любимые герои — из ролей своей позиции
  const mine = CHAMPIONS.filter((c) => POS_ROLES[pos].includes(c.role));
  const favs: string[] = [];
  while (favs.length < 2) {
    const c = rng.pick(mine);
    if (!favs.includes(c.id)) favs.push(c.id);
  }
  const p: Player = {
    id: 'p' + Math.floor(rng.next() * 1e9).toString(36), nick, pos, atk: stat(), def: stat(), iq: stat(), form: 85, pool, salary: 0,
    age, potential: 0, morale: 70, fatigue: 0, contract: rng.int(1, 3), together: rng.int(0, 20), favs,
  };
  const o = ovr(p);
  // молодые растут сильнее, ветераны уже у потолка
  p.potential = Math.min(97, Math.round(o + (age < 21 ? rng.range(12, 30) : age < 24 ? rng.range(5, 16) : rng.range(0, 6))));
  p.trait = rng.pick(TRAITS);
  p.salary = askSalary(p);
  return p;
}

const TEAM_DEFS = [
  { name: 'Северный Ветер', tag: 'СВТ', color: '#4f9dff' },
  { name: 'Красные Лисы', tag: 'КЛС', color: '#ff5d5d' },
  { name: 'Ночная Смена', tag: 'НСМ', color: '#b07bff' },
  { name: 'Стальной Улей', tag: 'СТУ', color: '#ffb84d' },
  { name: 'Изумрудный Клан', tag: 'ИЗК', color: '#3fd99a' },
  { name: 'Белые Совы', tag: 'БСВ', color: '#e8e4da' },
];

// Сколько игрок хочет получать в неделю
export function askSalary(p: Player) {
  const o = ovr(p);
  return Math.round((o * 10 * (1 + Math.max(0, o - 55) / 45) * (p.trait === 'star' ? 1.15 : 1)) / 10) * 10;
}

// Рыночная стоимость: сила, возраст и потенциал
export function value(p: Player) {
  const o = ovr(p);
  const ageK = p.age < 21 ? 1.35 : p.age < 25 ? 1.15 : p.age < 28 ? 1 : 0.7;
  const potK = 1 + Math.max(0, p.potential - o) / 60;
  return Math.round((Math.max(5, o - 30) ** 2 * 12 * ageK * potK) / 100) * 100;
}

export function makeTeams(rng: Rng, aiBonus = 0): Team[] {
  const used = new Set<string>();
  return TEAM_DEFS.map((d, i) => ({
    id: 't' + i,
    name: d.name,
    tag: d.tag,
    color: d.color,
    human: i === 0,
    bench: [],
    players: ([0, 3, 1, 2, 4] as Pos[]).map((pos) => makePlayer(rng, i === 0 ? 52 : 46 + aiBonus + rng.range(0, 16), used, pos)),
  }));
}

// Стороны карты: у первой команды синяя сторона, у второй красная
export const SIDE_COLORS = ['#3d8bff', '#ff4d5e'] as const;
