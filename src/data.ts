// Игровые данные: чемпионы, генерация игроков и команд.
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

export interface Champion {
  id: string;
  name: string;
  role: Role;
  glyph: string; // символ на поле
  hp: number;
  dmg: number;
  range: number;
  atkCd: number; // секунды между атаками
  speed: number; // единиц в секунду
  abilityCd: number;
  ability: string; // описание для UI
}

// Оригинальные чемпионы. Названия и способности придуманы для этой игры.
export const CHAMPIONS: Champion[] = [
  { id: 'granite', name: 'Гранит', role: 'tank', glyph: '◆', hp: 1500, dmg: 38, range: 34, atkCd: 1.1, speed: 70, abilityCd: 9, ability: 'Щит из камня и оглушение рядом' },
  { id: 'warden', name: 'Хранитель', role: 'tank', glyph: '▣', hp: 1400, dmg: 34, range: 34, atkCd: 1.0, speed: 74, abilityCd: 8, ability: 'Щит из камня и оглушение рядом' },
  { id: 'vortex', name: 'Вихрь', role: 'fighter', glyph: '✦', hp: 1050, dmg: 58, range: 36, atkCd: 0.9, speed: 82, abilityCd: 6, ability: 'Круговой удар по всем рядом' },
  { id: 'ember', name: 'Уголёк', role: 'fighter', glyph: '✹', hp: 980, dmg: 64, range: 36, atkCd: 0.95, speed: 84, abilityCd: 6.5, ability: 'Круговой удар по всем рядом' },
  { id: 'hawk', name: 'Ястреб', role: 'shooter', glyph: '➶', hp: 720, dmg: 62, range: 190, atkCd: 0.85, speed: 72, abilityCd: 7, ability: 'Пробивной выстрел x3 урона' },
  { id: 'quill', name: 'Перо', role: 'shooter', glyph: '➹', hp: 690, dmg: 56, range: 210, atkCd: 0.75, speed: 74, abilityCd: 7, ability: 'Пробивной выстрел x3 урона' },
  { id: 'aurora', name: 'Аврора', role: 'mage', glyph: '✺', hp: 700, dmg: 48, range: 170, atkCd: 1.2, speed: 70, abilityCd: 7.5, ability: 'Огненный шар по площади' },
  { id: 'frost', name: 'Иней', role: 'mage', glyph: '❄', hp: 740, dmg: 44, range: 165, atkCd: 1.2, speed: 70, abilityCd: 7, ability: 'Огненный шар по площади' },
  { id: 'willow', name: 'Ива', role: 'support', glyph: '✚', hp: 760, dmg: 28, range: 150, atkCd: 1.1, speed: 74, abilityCd: 6, ability: 'Лечит союзников вокруг' },
  { id: 'lumen', name: 'Люмен', role: 'support', glyph: '☀', hp: 800, dmg: 26, range: 140, atkCd: 1.1, speed: 72, abilityCd: 6.5, ability: 'Лечит союзников вокруг' },
  { id: 'shade', name: 'Тень', role: 'assassin', glyph: '☾', hp: 780, dmg: 70, range: 32, atkCd: 0.8, speed: 96, abilityCd: 6, ability: 'Рывок к слабейшему врагу, крит' },
  { id: 'fang', name: 'Клык', role: 'assassin', glyph: '⚔', hp: 820, dmg: 66, range: 32, atkCd: 0.8, speed: 94, abilityCd: 6.5, ability: 'Рывок к слабейшему врагу, крит' },
];

export const champById = (id: string) => CHAMPIONS.find((c) => c.id === id)!;

export interface Player {
  id: string;
  nick: string;
  atk: number; // 1..100, урон
  def: number; // 1..100, живучесть
  iq: number; // 1..100, решения в бою
  form: number; // 50..100, усталость/настрой
  pool: Record<Role, number>; // владение ролями 0..100
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

const ROLES: Role[] = ['tank', 'fighter', 'shooter', 'mage', 'support', 'assassin'];

export function makePlayer(rng: Rng, level: number, used: Set<string>): Player {
  let nick = '';
  do {
    nick = rng.pick(NICK_A) + rng.pick(NICK_B);
  } while (used.has(nick));
  used.add(nick);
  const stat = () => Math.round(Math.max(20, Math.min(95, level + rng.range(-14, 14))));
  const pool = {} as Record<Role, number>;
  const main = rng.pick(ROLES);
  for (const r of ROLES) pool[r] = Math.round(rng.range(20, 60));
  pool[main] = Math.round(rng.range(70, 95));
  const p: Player = { id: 'p' + Math.floor(rng.next() * 1e9).toString(36), nick, atk: stat(), def: stat(), iq: stat(), form: 85, pool, salary: 0 };
  p.salary = Math.round((p.atk + p.def + p.iq) / 3) * 10;
  return p;
}

const TEAM_DEFS = [
  { name: 'Северный Ветер', tag: 'СВТ', color: '#4fa3ff' },
  { name: 'Красные Лисы', tag: 'КЛС', color: '#ff5d5d' },
  { name: 'Ночная Смена', tag: 'НСМ', color: '#b07bff' },
  { name: 'Стальной Улей', tag: 'СТУ', color: '#ffb84d' },
  { name: 'Изумрудный Клан', tag: 'ИЗК', color: '#3fd99a' },
  { name: 'Белые Совы', tag: 'БСВ', color: '#e8e8f0' },
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

export const ALL_ROLES = ROLES;
