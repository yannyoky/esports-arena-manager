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

export interface Player {
  id: string;
  nick: string;
  atk: number;
  def: number;
  iq: number;
  form: number;
  pool: Record<Role, number>;
  salary: number;
}

export interface Team {
  id: string;
  name: string;
  tag: string;
  color: string;
  players: Player[];
  human: boolean;
}

const NICK_A = ['Нова', 'Рекс', 'Зефир', 'Кайто', 'Флин', 'Мира', 'Орбит', 'Пиксель', 'Сайфер', 'Тор', 'Ульф', 'Вега', 'Гекс', 'Дрейк', 'Эхо', 'Йоль', 'Квант', 'Люкс', 'Неон', 'Опал', 'Призм', 'Руна', 'Синк', 'Тайга', 'Фокс', 'Хаки', 'Цирк', 'Шторм', 'Юки', 'Ярс', 'Бриз', 'Вольт', 'Глинт', 'Дюна', 'Жук', 'Зоркий'];
const NICK_B = ['', '', '', 'X', '7', 'Pro', 'Jr', 'One', '99', 'Z'];

export function makePlayer(rng: Rng, level: number, used: Set<string>): Player {
  let nick = '';
  do nick = rng.pick(NICK_A) + rng.pick(NICK_B);
  while (used.has(nick));
  used.add(nick);
  const stat = () => Math.round(Math.max(20, Math.min(95, level + rng.range(-14, 14))));
  const pool = {} as Record<Role, number>;
  const main = rng.pick(ALL_ROLES);
  for (const r of ALL_ROLES) pool[r] = Math.round(rng.range(20, 60));
  pool[main] = Math.round(rng.range(70, 95));
  const p: Player = { id: 'p' + Math.floor(rng.next() * 1e9).toString(36), nick, atk: stat(), def: stat(), iq: stat(), form: 85, pool, salary: 0 };
  p.salary = Math.round((p.atk + p.def + p.iq) / 3) * 10;
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

export function makeTeams(rng: Rng): Team[] {
  const used = new Set<string>();
  return TEAM_DEFS.map((d, i) => ({
    id: 't' + i,
    name: d.name,
    tag: d.tag,
    color: d.color,
    human: i === 0,
    players: Array.from({ length: 5 }, () => makePlayer(rng, i === 0 ? 52 : 46 + rng.range(0, 16), used)),
  }));
}

// Стороны карты: у первой команды синяя сторона, у второй красная
export const SIDE_COLORS = ['#3d8bff', '#ff4d5e'] as const;
