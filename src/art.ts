// Уникальные модели героев. Каждый герой нарисован отдельно векторными контурами
// и разбит на части (ноги, тело, голова, руки, плащ), которые анимируются
// поворотом вокруг суставов. Координаты: ноги в (0,0), вверх минус, герой смотрит вправо.
import type { Pose } from './models';

export interface Tf {
  x: number;
  y: number;
  a: number; // поворот предмета
  k?: number; // 1 — предмет не крутится вместе с рукой (щит, посох)
}

export interface Shape {
  d: string;
  fill: string; // 'none' — только линия
  line?: number; // толщина обводки (для линии — толщина самой линии)
  col?: string; // цвет линии
  bare?: boolean; // линия без тёмного контура
  alpha?: number;
  glow?: boolean; // светится
  tf?: Tf;
}

export interface Part {
  at: [number, number]; // сустав
  s: Shape[];
}

export type Attack = 'slash' | 'thrust' | 'bash' | 'aim' | 'staff';

export interface Art {
  legs: 'walk' | 'robe' | 'float';
  atk: Attack;
  backLeg?: Part;
  frontLeg?: Part;
  cape?: Part;
  backArm?: Part;
  body: Part;
  head: Part;
  frontArm: Part;
  aura: string;
  size?: number;
}

// ---------- Помощники для контуров ----------

const n = (v: number) => Math.round(v * 10) / 10;
const E = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
const Pl = (...pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + 'Z';
const Rr = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}Q${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`;
};
// Торс: плечи шире пояса, мягкие бока
const torso = (top: number, bot: number, wt: number, wb: number) =>
  `M${-wt} ${top}C${-wt - 3} ${top + 8} ${-wb - 1} ${bot - 6} ${-wb} ${bot}L${wb} ${bot}C${wb + 1} ${bot - 6} ${wt + 3} ${top + 8} ${wt} ${top}Q0 ${top - 5} ${-wt} ${top}Z`;
// Мантия до земли
const robe = (top: number, wt: number, wb: number) =>
  `M${-wt} ${top}Q${-wt - 2} ${top + 18} ${-wb} -1Q${-wb / 2} 1 0 0Q${wb / 2} 1 ${wb} -1Q${wt + 2} ${top + 18} ${wt} ${top}Q0 ${top - 4} ${-wt} ${top}Z`;

const sh = (d: string, fill: string, line = 1.4): Shape => ({ d, fill, line });
const flat = (d: string, fill: string, alpha = 1): Shape => ({ d, fill, line: 0, alpha });
const lit = (d: string, fill: string, alpha = 0.85): Shape => ({ d, fill, line: 0, alpha, glow: true });
const ln = (d: string, col: string, w = 1.6, bare = false): Shape => ({ d, fill: 'none', line: w, col, bare });
const held = (tf: Tf, shapes: Shape[]) => shapes.map((s) => ({ ...s, tf }));

function leg(x: number, hip: number, w: number, cloth: string, boot: string, bootH = 5): Part {
  return {
    at: [x, hip],
    s: [
      sh(Pl([x - w / 2, hip], [x + w / 2, hip], [x + w / 2 - 0.6, -bootH + 0.5], [x - w / 2 + 0.6, -bootH + 0.5]), cloth),
      sh(Rr(x - w / 2 - 0.8, -bootH, w + 3.4, bootH, 1.8), boot),
    ],
  };
}

// Рука висит вниз от плеча; кисть в точке (x, y + len + 1.5)
function arm(x: number, y: number, len: number, w: number, sleeve: string, hand: string, items: Shape[] = [], fist = w / 2 + 0.6): Part {
  return {
    at: [x, y],
    s: [
      sh(Pl([x - w / 2, y - 1], [x + w / 2, y - 1], [x + w / 2 - 0.4, y + len], [x - w / 2 + 0.4, y + len]), sleeve),
      ...items,
      sh(E(x, y + len + 1.5, fist), hand),
    ],
  };
}

const eyes = (x: number, y: number, iris = '#1b1420', gap = 3.6, h = 1.9) => [
  flat(E(x, y, 1.4, h), '#f7f3ea'),
  flat(E(x + gap, y, 1.3, h), '#f7f3ea'),
  flat(E(x + 0.45, y + 0.2, 0.85, h * 0.68), iris),
  flat(E(x + gap + 0.45, y + 0.2, 0.8, h * 0.68), iris),
  flat(E(x + 0.8, y - 0.5, 0.35), '#ffffff'),
];
const glowEyes = (x: number, y: number, col: string, gap = 3.6) => [
  lit(E(x, y, 2.4, 1.6), col, 0.55),
  lit(E(x + gap, y, 2.2, 1.6), col, 0.55),
  flat(E(x, y, 1.1, 0.8), '#ffffff'),
  flat(E(x + gap, y, 1, 0.8), '#ffffff'),
];
const brows = (x: number, y: number, col: string, gap = 3.6, tilt = 0.6) => [ln(`M${x - 1.6} ${y - tilt}L${x + 1.4} ${y + tilt}M${x + gap - 1.3} ${y + tilt}L${x + gap + 1.5} ${y - tilt}`, col, 1.1, true)];

// Клинок в своей системе координат: x вдоль лезвия от кисти
const blade = (len: number, w: number, steel: string, hilt: string, grip = '#2a2026'): Shape[] => [
  sh(Rr(-6, -1.3, 8, 2.6, 1), grip, 1),
  sh(Pl([3, -w / 2], [len - 5, -w / 2], [len, 0], [len - 5, w / 2], [3, w / 2]), steel, 1.2),
  flat(Pl([4, -w / 2 + 0.4], [len - 6, -w / 2 + 0.4], [len - 2, -0.2], [4, -0.2]), '#ffffff', 0.45),
  sh(Rr(1, -w / 2 - 2.2, 2.6, w + 4.4, 1), hilt, 1),
  sh(E(-6.5, 0, 1.7), hilt, 1),
];

// ---------- Герои ----------

export const ART: Record<string, Art> = {
  // Гранит: каменный голем-страж, плита-щит, светящиеся руны
  granite: (() => {
    const st = '#8d8778', dk = '#5f5a4f', lt = '#bcb6a6', moss = '#6f9e57', rune = '#ffb547';
    return {
      legs: 'walk', atk: 'bash', size: 1.08, aura: rune,
      backLeg: leg(-5, -16, 8.5, dk, '#4a463e', 6),
      frontLeg: leg(4.5, -16, 8.5, st, '#4a463e', 6),
      backArm: arm(-14, -38, 18, 8.5, dk, '#5a554b', [], 5),
      body: {
        at: [0, -16],
        s: [
          sh('M-15 -40Q-19 -28 -12 -15L12 -15Q19 -28 15 -40Q0 -47 -15 -40Z', st),
          flat('M-12 -38Q-15 -28 -9 -17L-3 -17Q-8 -28 -6 -39Z', lt, 0.6),
          flat('M4 -20L12 -16L14 -26Z', dk, 0.7),
          ln('M-4 -36L0 -29L-3 -23M6 -38L4 -33', '#3e3a33', 1, true),
          lit(Pl([-1, -33], [4, -33], [1.5, -27]), rune),
          lit(Rr(-6, -22, 13, 2, 1), rune, 0.7),
          sh(E(-14, -39, 8, 7), st),
          flat(E(-16, -42, 4, 3), lt, 0.7),
          flat('M-21 -41Q-15 -48 -8 -43Q-14 -44 -21 -39Z', moss),
          sh(E(14, -39, 8, 7), st),
          flat(E(12, -42, 4, 3), lt, 0.7),
          flat(E(17, -34, 3, 1.8), moss, 0.85),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(Rr(-6, -55, 13, 12, 4), st),
          flat(Rr(-5, -54, 5, 4, 2), lt, 0.7),
          flat(Rr(-6, -50, 13, 3.2, 1.2), '#3a362f'),
          ...glowEyes(1.5, -48.4, rune, 3.4),
          flat('M-6 -55Q0 -59 7 -55L7 -53Q0 -56 -6 -53Z', moss, 0.9),
        ],
      },
      frontArm: arm(14, -38, 17, 9, st, '#6a6458', held({ x: 18, y: -24, a: 0, k: 1 }, [
        sh(Rr(-6, -17, 14, 32, 3), '#7a7466', 1.6),
        flat(Rr(-4.5, -15, 4, 28, 2), lt, 0.5),
        ln('M3 -14L5 -6L2 0M-2 8L3 12', '#4a463e', 0.9, true),
        sh(Rr(-2, -6, 8, 11, 1.5), dk, 1),
        lit(E(2, -0.5, 2.6), rune),
      ]), 5),
    };
  })(),

  // Якорь: пузатый моряк, борода, тельняшка, якорь в руке
  anchor: (() => {
    const skin = '#b77a52', steel = '#7c838c';
    return {
      legs: 'walk', atk: 'slash', size: 1.07, aura: '#7fc6ff',
      backLeg: leg(-5, -18, 7, '#2b3a55', '#2a201a'),
      frontLeg: leg(4, -18, 7, '#34466a', '#2a201a'),
      backArm: arm(-14, -38, 17, 7.5, skin, skin),
      body: {
        at: [0, -18],
        s: [
          sh('M-13 -40Q-19 -26 -11 -16L11 -16Q20 -26 13 -40Q0 -45 -13 -40Z', '#ece8de'),
          flat('M-15 -35H15V-32.5H-15ZM-16.5 -29H16.5V-26.5H-16.5ZM-15 -23H15V-20.5H-15Z', '#2f5a8a'),
          flat('M-11 -38Q-15 -28 -9 -18L-6 -18Q-10 -28 -8 -39Z', '#ffffff', 0.35),
          sh('M-13 -40L-6 -41L-8 -17L-12 -17Q-17 -28 -13 -40Z', '#3f5d73'),
          sh('M13 -40L6 -41L8 -17L12 -17Q17 -28 13 -40Z', '#3f5d73'),
          sh(Rr(-13, -20, 26, 4.5, 1.5), '#5a3a22'),
          sh(Rr(-2.5, -20.5, 5, 5.5, 1), '#d9b44a', 1),
          ln('M-10 -41Q0 -36 10 -41', '#c03a32', 2.2),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh(E(1, -48.5, 7.6, 7.4), skin),
          flat(E(-2, -51, 3.5, 2.4), '#ffffff', 0.18),
          sh('M-5 -47Q-7 -37 2 -35Q10 -36 9 -46Q5 -43 2 -44Q-2 -43 -5 -47Z', '#3a2a1e'),
          sh('M-7 -53Q1 -61 9 -53L9.5 -51.5L-7.5 -51.5Z', '#24314a'),
          flat(Rr(-8, -53, 18, 2.6, 1.2), '#1a2234'),
          ...eyes(2.6, -48.6, '#1b2a44', 3.6, 1.6),
          ...brows(2.6, -51, '#3a2a1e'),
          flat(E(9, -46.4, 1.9, 1.5), '#9a5a3a'),
          flat('M-2 -44Q2 -42 6 -44.5Q3 -42 -2 -44Z', '#2a1f18'),
        ],
      },
      frontArm: arm(13, -38, 16, 8.5, skin, skin, [
        flat(E(13.2, -30, 1.8, 2.4), '#2f5a8a', 0.75),
        ln('M13 -20.5V-14', '#9aa0a8', 1.4),
        sh(Rr(11.8, -15, 2.8, 16, 1), steel),
        sh('M5.5 -4Q6 4 13.2 5Q20.5 4 21 -4L18.5 -3Q18 1.5 13.2 2Q8.5 1.5 8 -3Z', steel),
        sh(Pl([4, -5], [7.5, -6.5], [8, -2.5]), steel, 1),
        sh(Pl([22.4, -5], [18.9, -6.5], [18.4, -2.5]), steel, 1),
        sh(Rr(8.5, -13, 9.5, 2.6, 1), steel),
        flat(Rr(12.4, -14, 0.8, 13, 0.4), '#d6dbe0', 0.85),
      ]),
    };
  })(),

  // Хранитель: древесный рыцарь, рога-ветви, щит-лист
  warden: (() => {
    const bark = '#7a5434', dk = '#4e3520', moss = '#5c9a3e', leaf = '#7cc04f', glow = '#c6ff7a';
    return {
      legs: 'walk', atk: 'bash', size: 1.08, aura: glow,
      backLeg: leg(-5, -17, 8, dk, '#3b2818', 5),
      frontLeg: leg(4, -17, 8, bark, '#3b2818', 5),
      backArm: arm(-13, -38, 18, 7.5, dk, dk),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-41, -16, 13, 10), bark),
          ln('M-7 -38Q-9 -28 -6 -18M0 -40V-17M6 -38Q8 -28 5 -18', '#5a3b22', 1.1, true),
          flat('M-12 -38Q-14 -28 -9 -18L-7 -18Q-11 -28 -9 -38Z', '#a37a50', 0.6),
          lit(E(0, -30, 2.3), glow, 0.7),
          sh(E(-12, -40, 7, 4.5), moss),
          sh(E(12, -40, 7, 4.5), moss),
          flat(E(10, -42, 3.5, 1.6), leaf, 0.8),
          sh('M-11 -19Q0 -15 11 -19L10 -16Q0 -12 -10 -16Z', moss, 1.1),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          ln('M-2 -54L-6 -61L-5 -67M-5.6 -61L-11 -63M-5.3 -64.5L-2 -68', '#c9ad7d', 2),
          ln('M4 -54L7 -61L6 -67M6.6 -61L12 -63M6.3 -64.5L9.5 -68', '#d8bf90', 2),
          sh(Rr(-6, -56, 13, 13, 5), bark),
          flat(Rr(-5, -55, 4, 5, 2), '#a37a50', 0.6),
          flat(Rr(-4, -50.5, 11, 3.4, 1.6), '#2a1a10'),
          ...glowEyes(0.8, -48.9, glow, 3.8),
          ln('M-3 -45L0 -44.2L3 -45L6 -44.2', '#3b2818', 0.9, true),
          flat('M-7 -57Q-3 -61 2 -58Q-2 -57 -7 -54Z', leaf),
          flat('M3 -57Q8 -60 10 -55Q6 -56 4 -55Z', moss),
        ],
      },
      frontArm: arm(13, -38, 17, 8, bark, dk, held({ x: 17, y: -23, a: 0, k: 1 }, [
        sh('M0 -17Q12 -8 10 6Q5 14 0 18Q-5 14 -10 6Q-12 -8 0 -17Z', leaf, 1.6),
        flat('M0 -15Q-9 -7 -8 5Q-4 12 0 15Z', '#5ea43b', 0.8),
        ln('M0 -14V16M0 -6L5 -10M0 0L6 -4M0 6L5 3M0 -6L-5 -10M0 0L-6 -4M0 6L-5 3', '#3f7a2c', 1, true),
        lit(E(0, 0, 1.8), glow, 0.6),
      ])),
    };
  })(),

  // Бастион: железный осадный доспех, трубы на спине, клешня
  bastion: (() => {
    const steel = '#66737f', dk = '#3d4651', lt = '#9fb0bf', rust = '#c0702f', hot = '#ffae42';
    return {
      legs: 'walk', atk: 'thrust', size: 1.1, aura: hot,
      backLeg: leg(-6, -17, 9, dk, '#2c333b', 6.5),
      frontLeg: leg(5, -17, 9, steel, '#2c333b', 6.5),
      cape: {
        at: [-10, -42],
        s: [
          sh(Rr(-21, -58, 5.5, 20, 1.5), dk),
          sh(Rr(-14.5, -62, 5.5, 22, 1.5), dk),
          sh(Rr(-22, -60, 7.5, 3.5, 1), rust, 1.1),
          sh(Rr(-15.5, -64, 7.5, 3.5, 1), rust, 1.1),
          flat(E(-18, -66, 3.5, 2.6), '#c9c4bd', 0.35),
          flat(E(-12, -71, 4.5, 3.2), '#c9c4bd', 0.25),
          lit(E(-11.7, -63.5, 1.8, 1), hot, 0.7),
        ],
      },
      backArm: arm(-15, -38, 17, 9.5, dk, '#2c333b', [], 5.2),
      body: {
        at: [0, -17],
        s: [
          sh(Rr(-15, -45, 30, 29, 6), steel, 1.6),
          flat(Rr(-12, -42, 8, 23, 3), lt, 0.45),
          sh(Rr(-9, -40, 18, 12, 3), dk, 1.1),
          lit(E(0, -34, 3.4), hot, 0.9),
          flat(E(0, -34, 1.6), '#fff2c8'),
          flat('M-14 -22H14V-19H-14Z', rust),
          flat('M-11 -22L-8 -19H-5L-8 -22ZM-3 -22L0 -19H3L0 -22ZM5 -22L8 -19H11L8 -22Z', '#2c333b', 0.8),
          flat(E(-11, -27, 0.9) + E(11, -27, 0.9) + E(-11, -41, 0.9) + E(11, -41, 0.9), lt),
          sh(Rr(-21, -48, 12, 10, 3.5), rust, 1.4),
          sh(Rr(9, -48, 12, 10, 3.5), rust, 1.4),
          flat(Rr(-19, -47, 5, 3, 1.5), '#e8a06a', 0.6),
          flat(Rr(11, -47, 5, 3, 1.5), '#e8a06a', 0.6),
        ],
      },
      head: {
        at: [0, -45],
        s: [
          ln('M-3 -56L-5 -64', '#9aa7b3', 1.1),
          lit(E(-5, -64.5, 1.6), '#ff5a3a', 0.9),
          sh(Rr(-6.5, -57, 14, 12, 3.5), steel, 1.5),
          flat(Rr(-5.5, -56, 5, 4, 2), lt, 0.6),
          sh(Rr(-3, -52, 11, 3.6, 1.4), '#1a1e24', 1),
          lit(Rr(-2, -51.4, 9.5, 2.3, 1), hot, 0.95),
        ],
      },
      frontArm: arm(14, -38, 15, 10, steel, dk, held({ x: 14, y: -21.5, a: 1.4 }, [
        sh(Pl([0, -5], [10, -6.5], [15, -2], [10, -3], [1, -1]), lt, 1.2),
        sh(Pl([0, 5], [10, 6.5], [15, 2], [10, 3], [1, 1]), lt, 1.2),
        sh(Pl([2, -1.4], [13, -0.6], [16, 0], [13, 0.6], [2, 1.4]), '#c8d2db', 1.1),
      ]), 6),
    };
  })(),

  // Вихрь: мастер клинка, длинные белые волосы, тёмный плащ, катана
  vortex: (() => {
    const coat = '#2b3d70', coatD = '#1c2748', skin = '#f0c8a0', hair = '#eef1f7', sash = '#c7362b';
    return {
      legs: 'walk', atk: 'slash', aura: '#9fd0ff',
      backLeg: leg(-4, -18, 5.5, '#1c2236', '#121520'),
      frontLeg: leg(3.5, -18, 5.5, '#26304a', '#121520'),
      cape: {
        at: [-6, -26],
        s: [sh('M-7 -27Q-14 -16 -17 -4L-12 -8L-10 -3L-5 -12Q-4 -20 -2 -27Z', coatD)],
      },
      backArm: arm(-8.5, -37, 16, 5, coatD, skin),
      body: {
        at: [0, -18],
        s: [
          sh(torso(-40, -17, 9, 7.5), coat),
          flat('M-7 -38Q-9 -28 -6 -19L-4 -19Q-6 -28 -4 -39Z', '#4a62a8', 0.6),
          sh('M-2 -41L4 -41L6 -33L0 -36Z', '#e8e8f0', 1),
          ln('M1 -36L-1 -19', '#141b33', 0.9, true),
          sh(Pl([-8, -24], [8.5, -25], [8.5, -20.5], [-8, -19.5]), sash, 1.1),
          sh('M-6 -21Q-11 -14 -14 -10L-11 -9Q-8 -14 -4 -20Z', sash, 1),
        ],
      },
      head: {
        at: [0, -41],
        s: [
          sh('M-5 -53Q-14 -50 -22 -40Q-15 -41 -11 -44Q-14 -37 -19 -32Q-9 -36 -5 -43Q-6 -38 -9 -34Q-1 -40 0 -46Z', hair),
          sh(E(1.5, -47.5, 5.8, 6.6), skin),
          sh('M-6 -50Q-5 -58 3 -57Q9 -56 9 -50Q6 -53 3.5 -52Q4 -50 1 -49Q1 -52 -2 -51Q-3 -49 -6 -46Z', hair),
          flat('M-4 -55Q0 -57 4 -56Q0 -55 -3 -53Z', '#ffffff', 0.7),
          ln('M-5.5 -51.5Q2 -55 9 -52', sash, 1.3),
          ln('M-5.5 -51.5L-10 -48', sash, 1.1, true),
          flat(Pl([2, -48.5], [5, -48.8], [4.6, -47.3], [2.2, -47.4]), '#2b3d70'),
          flat(Pl([6, -48.8], [8.6, -48.5], [8.3, -47.3], [6.2, -47.3]), '#2b3d70'),
          ln('M2 -50.2L5 -49.6M6 -49.6L8.6 -50.4', '#c9ced8', 0.9, true),
          ln('M4.5 -44.3H7', '#a07a62', 0.7, true),
        ],
      },
      frontArm: arm(8.5, -37, 16, 5, coat, skin, held({ x: 8.5, y: -19.5, a: 1.1 }, blade(34, 3, '#dfe6ee', '#d4a640'))),
    };
  })(),

  // Уголёк: кузнец войны, огненная борода, очки на лбу, раскалённый молот
  ember: (() => {
    const skin = '#c98658', apron = '#7b4a28', hot = '#ffb347', fire = '#ff6a1f';
    return {
      legs: 'walk', atk: 'slash', size: 1.02, aura: fire,
      backLeg: leg(-5, -16, 7.5, '#3c3430', '#241c18', 5),
      frontLeg: leg(4, -16, 7.5, '#4a403a', '#241c18', 5),
      backArm: arm(-14, -37, 16, 8, skin, skin, [], 5),
      body: {
        at: [0, -16],
        s: [
          sh(torso(-40, -15, 14, 11), skin),
          flat('M-11 -38Q-14 -28 -9 -17L-6 -17Q-10 -28 -8 -38Z', '#e8a878', 0.5),
          sh('M-9 -36H10L12 -13Q0 -10 -12 -13Z', apron),
          flat('M-7 -34H-3L-5 -14H-9Z', '#9a6440', 0.6),
          ln('M-9 -36L-12 -41M10 -36L12 -41', '#4a2c18', 1.4),
          sh(Rr(-12, -20, 25, 3.5, 1), '#3a2618', 1.1),
          sh(Rr(5, -24, 4, 8, 1), '#8a8f97', 0.9),
          flat(E(-3, -27, 3, 2.2) + E(4, -31, 1.6, 1.2), '#3a2618', 0.35),
        ],
      },
      head: {
        at: [0, -41],
        s: [
          sh(E(1, -48, 7, 7), skin),
          flat(E(-1.5, -52, 3.4, 2.2), '#ffffff', 0.25),
          ln('M-6 -51.5Q1 -54 8 -51.5', '#3a2618', 1.5),
          sh(E(1.5, -53, 2.6), '#c99a3e', 1.1),
          sh(E(6.2, -52.6, 2.4), '#c99a3e', 1.1),
          flat(E(1.5, -53, 1.6) + E(6.2, -52.6, 1.4), '#7fd3ff'),
          sh('M-5 -47Q-8 -40 -3 -35Q-1 -31 3 -29Q4 -33 7 -33Q10 -37 9 -45Q6 -42 2 -43Q-2 -42 -5 -47Z', fire),
          lit('M-2 -43Q-3 -38 1 -34Q3 -37 6 -37Q8 -40 7 -43Q4 -41 0 -42Z', hot, 0.9),
          ...eyes(2.8, -48.6, '#2a1a12', 3.6, 1.5),
          ln('M1 -50.6L4.5 -50M6 -50L9 -50.8', '#c84a1a', 1.4, true),
          flat(E(8.8, -46.6, 1.8, 1.4), '#a8603a'),
        ],
      },
      frontArm: arm(13, -37, 16, 8, skin, skin, held({ x: 13, y: -19.5, a: 1.3 }, [
        sh(Rr(-3, -1.4, 24, 2.8, 1), '#6b4a2c', 1.1),
        sh(Rr(18, -7, 10, 14, 2), '#4a4f57', 1.5),
        flat(Rr(19, -6, 3, 12, 1), '#7c838c', 0.8),
        lit(Rr(25.5, -6, 2.6, 12, 1), hot, 0.95),
        lit(E(27, 0, 6), fire, 0.25),
      ]), 5),
    };
  })(),

  // Бивень: степной варвар, рогатый шлем, меховая накидка, копьё с бивнем
  tusk: (() => {
    const skin = '#b07a52', fur = '#8a6a44', furL = '#b8956a', bone = '#efe3c6';
    return {
      legs: 'walk', atk: 'thrust', size: 1.04, aura: '#ffcf6a',
      backLeg: leg(-5, -17, 7, '#5a3a2a', '#3a261a'),
      frontLeg: leg(4, -17, 7, '#6a4632', '#3a261a'),
      cape: {
        at: [-6, -40],
        s: [sh('M-9 -42Q-18 -30 -17 -14L-14 -17L-12 -12L-9 -16L-6 -12L-4 -24Z', fur)],
      },
      backArm: arm(-13, -38, 16, 7, skin, skin),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-41, -16, 12, 9), skin),
          flat('M-10 -39Q-12 -28 -8 -18L-5 -18Q-8 -28 -7 -39Z', '#d49a6c', 0.5),
          ln('M2 -35L8 -31M1.5 -31L7.5 -27', '#b02a22', 1.4, true),
          sh(Rr(-10, -21, 21, 4.5, 1.5), '#5a3a2a', 1.1),
          sh(E(0.5, -18.7, 2.2), '#c9a24a', 1),
          sh('M-14 -44Q-4 -47 6 -43L8 -38L4 -40L2 -36L-2 -39L-5 -35L-8 -39L-12 -36L-14 -40Z', furL),
          flat(E(-6, -42, 4, 1.5), '#d8bc90', 0.7),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(E(1, -48.4, 6.8, 7), skin),
          sh('M-4 -54Q-15 -56 -14 -68Q-10 -60 -2 -58Z', bone),
          sh('M5 -55Q15 -58 14 -69Q11 -60 3 -58Z', bone),
          sh(Rr(-6.5, -58, 14, 7, 3), '#6b6f78'),
          flat(Rr(-5, -57, 6, 2.4, 1.2), '#a7acb6', 0.7),
          sh('M0 -45Q2 -38 5 -40Q8 -38 8 -44Q4 -42 0 -45Z', '#4a3020', 1),
          ...eyes(2.8, -48.6, '#3a2010', 3.4, 1.5),
          ...brows(2.8, -50.6, '#3a2618', 3.4, -0.6),
          flat(Rr(1, -47, 9, 1.2, 0.5), '#b02a22', 0.75),
        ],
      },
      frontArm: arm(12, -38, 16, 7, skin, skin, held({ x: 12, y: -20.5, a: -0.12, k: 1 }, [
        ln('M-18 0H22', '#7a5432', 2.4),
        ln('M17 -1.6L19 1.6M15 -1.6L17 1.6', '#b02a22', 1, true),
        sh('M21 -3Q33 -4 38 1Q31 0.6 21 3Z', bone, 1.3),
        ln('M-18 0L-21 4M-18 0L-22 -2', '#c03a2a', 1, true),
      ])),
    };
  })(),

  // Кирпич: уличный боец, бандана, майка, перемотанные кулаки
  brick: (() => {
    const skin = '#d49a6c', tape = '#f2f0ea', red = '#d33b3b';
    const fistTape = (x: number, y: number) => [ln(`M${x - 4} ${y - 1.4}H${x + 4}M${x - 4} ${y + 1.4}H${x + 4}`, '#c8c4ba', 0.8, true)];
    return {
      legs: 'walk', atk: 'thrust', size: 1.04, aura: '#ff7a5a',
      backLeg: leg(-5, -17, 7, '#4b5a3a', '#2a2a2a'),
      frontLeg: leg(4, -17, 7, '#566744', '#2a2a2a'),
      backArm: arm(-14, -38, 15, 8, skin, tape, [], 5),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-41, -16, 14, 9), skin),
          sh('M-9 -40Q0 -34 9 -40L10 -16H-10Z', '#ece8de'),
          flat('M-8 -38Q-9 -28 -7 -17H-4Q-6 -28 -5 -37Z', '#ffffff', 0.5),
          flat('M2 -33Q6 -30 8 -26L8 -22Q4 -27 1 -30Z', '#c9c2b2', 0.7),
          sh(Rr(-10, -20, 20, 4, 1.4), '#2a2a2a', 1),
          ln('M4 -18Q8 -14 6 -11', '#b8bec6', 1, true),
          sh(E(-13, -39, 6, 5), skin),
          sh(E(13, -39, 6, 5), skin),
          ln('M-16 -40.5L-11 -40.5M-15.5 -38.5L-11.5 -38.5', '#3a4a6a', 0.9, true),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(E(1, -48.5, 6.6, 7), skin),
          sh('M8 -45Q8 -40 2 -40Q-3 -40 -4 -44Q1 -42.5 8 -45Z', '#c48a5c', 0),
          sh('M-6 -51Q1 -58 8 -51.5L8 -50L-6 -49Z', red),
          flat(E(-2, -54, 1.2) + E(3, -55, 1) + E(6, -53, 1), '#ffffff', 0.8),
          sh('M-6 -50L-12 -52L-10 -48L-13 -45L-6 -47Z', red, 1.1),
          ...eyes(3, -48, '#2a1a12', 3.4, 1.4),
          ...brows(3, -50, '#2a1a12', 3.4, -0.7),
          ln('M-0.5 -51L1.5 -46', '#a0604a', 0.8, true),
          ln('M4.5 -43.8H8', '#7a4a32', 0.8, true),
          flat(E(8.6, -46.4, 1.6, 1.3), '#b07a52'),
        ],
      },
      frontArm: arm(14, -38, 15, 8, skin, tape, fistTape(14, -21.5), 5.2),
    };
  })(),

  // Ястреб: лесной лучник, капюшон, плащ из перьев, длинный лук
  hawk: (() => {
    const hood = '#3f6b3a', hoodD = '#2b4a28', leather = '#7a5a3a', skin = '#e0b088', feather = '#8a6440';
    return {
      legs: 'walk', atk: 'aim', aura: '#c8ff9a',
      backLeg: leg(-4, -18, 5.5, '#4a3a2a', '#2a2016'),
      frontLeg: leg(3.5, -18, 5.5, '#5a4632', '#2a2016'),
      cape: {
        at: [-6, -40],
        s: [
          sh(Pl([-12, -48], [-6, -50], [-3, -26], [-8, -24]), leather, 1.2),
          ln('M-10 -48L-13 -54M-8 -49L-9 -55M-6 -49L-5 -54', '#efe8d8', 1.4),
          sh('M-7 -41Q-15 -30 -16 -12Q-13 -15 -12 -11Q-10 -15 -8 -11Q-7 -15 -5 -12Q-4 -22 -2 -30Z', hoodD),
          flat('M-13 -16L-12 -11L-10 -15L-8 -11L-7 -15L-5 -12L-6 -18Z', feather),
        ],
      },
      backArm: arm(-8.5, -37, 15, 5, hoodD, skin),
      body: {
        at: [0, -18],
        s: [
          sh(torso(-40, -17, 9, 7.5), leather),
          sh('M-6 -39H7L6 -16H-5Z', hood, 1.1),
          ln('M-8 -40L7 -20', '#4a321e', 1.6),
          sh(Rr(-8, -21, 16, 3.5, 1), '#4a321e', 1),
          flat(E(0, -19.3, 1.4), '#d8b04a'),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh('M-8 -45Q-10 -58 1 -59Q10 -58 10 -49L8 -43L-6 -41Z', hood),
          sh('M-6 -55Q-13 -54 -16 -48Q-11 -50 -7 -49Z', hood, 1.2),
          sh(E(3.5, -48, 4.8, 5.6), skin, 1.1),
          flat('M-1 -53Q4 -56 9 -52L9 -50.5Q4 -53 -1 -51Z', hoodD),
          ...eyes(3.6, -48.3, '#2a5a2a', 3.2, 1.5),
          ...brows(3.6, -50.4, '#4a3020', 3.2, 0.3),
          flat(Pl([-2, -44], [9, -44], [7, -41], [0, -40.5]), '#2b4a28', 0.95),
          flat(E(0, -58, 2.2, 1.2), '#5c8a52', 0.7),
        ],
      },
      frontArm: arm(8.5, -37, 15, 5, hood, skin, held({ x: 8.5, y: -20.5, a: 0 }, [
        ln('M-17 -2Q-14 6 0 7.5Q14 6 17 -2', '#6b4426', 2.6),
        ln('M-17 -2L17 -2', '#efe8d8', 0.6, true),
        ln('M-4 6.8H4', '#3a2618', 2.6, true),
      ])),
    };
  })(),

  // Перо: небесная охотница с крыльями и золотым луком
  quill: (() => {
    const armor = '#2f8a8f', armorL = '#6ad0cf', skin = '#f2cfa8', hair = '#f2d27a', wing = '#f6f3ec', wingD = '#cdd6e2';
    return {
      legs: 'walk', atk: 'aim', aura: '#fff1a0',
      backLeg: leg(-4, -18, 5, '#2b4f5a', '#6a4a2a'),
      frontLeg: leg(3.5, -18, 5, '#33606c', '#6a4a2a'),
      cape: {
        at: [-3, -37],
        s: [
          sh('M-2 -38Q-16 -62 -32 -62Q-26 -57 -29 -53Q-21 -51 -26 -46Q-18 -45 -21 -40Q-12 -39 -4 -33Z', wingD, 1.3),
          sh('M-1 -37Q-10 -56 -24 -58Q-19 -53 -22 -49Q-15 -47 -18 -42Q-11 -41 -13 -37Q-7 -36 -2 -32Z', wing, 1.3),
          ln('M-5 -40Q-12 -47 -19 -51M-6 -37Q-10 -41 -14 -43', '#c8d0dc', 0.8, true),
        ],
      },
      backArm: arm(-7.5, -37, 15, 4.5, armor, skin),
      body: {
        at: [0, -18],
        s: [
          sh(torso(-40, -18, 8, 6.5), armor),
          sh('M-6 -38Q0 -34 7 -38L6 -28Q0 -25 -5 -28Z', armorL, 1.1),
          flat(E(0.5, -33, 1.6), '#ffe38a'),
          sh(Pl([-8, -21], [-6, -12], [-3, -20], [0, -11], [3, -20], [6, -12], [8, -21]), '#e6dcc4', 1),
          sh(Rr(-8, -23, 16, 3, 1), '#c99a3e', 1),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh('M-4 -53Q-13 -52 -15 -42Q-12 -36 -10 -32Q-11 -40 -6 -46Z', hair),
          sh(E(1.5, -48, 5.8, 6.4), skin),
          sh('M-5 -50Q-4 -57 3 -56Q9 -55 8.5 -50Q5 -53 2 -52Q0 -51 -3 -48Z', hair),
          ln('M-4.5 -52Q2 -55.5 8.5 -52.5', '#e6b94a', 1.2),
          sh('M-4 -53Q-9 -60 -7 -64Q-4 -58 -2 -55Z', wing, 1),
          ...eyes(3, -48, '#2a8a8a', 3.2, 1.9),
          ln('M5 -44.2Q6 -43.6 7 -44.2', '#c0705a', 0.7, true),
          flat(E(2, -45.4, 1.4, 0.8) + E(8.4, -45.4, 0.9, 0.7), '#f2a0a0', 0.45),
        ],
      },
      frontArm: arm(7.5, -37, 15, 4.5, armor, skin, held({ x: 7.5, y: -20.5, a: 0 }, [
        ln('M-18 -3Q-12 2 -4 3.5Q0 7 4 3.5Q12 2 18 -3', '#e6b94a', 2.3),
        ln('M-18 -3L18 -3', '#fff8e0', 0.6, true),
        lit(E(0, 4.6, 1.6), '#fff1a0', 0.9),
      ])),
    };
  })(),

  // Болт: механик в очках, рюкзак с шестерёнкой, тяжёлый арбалет
  bolt: (() => {
    const suit = '#b8742f', leather = '#6a4a30', brass = '#d8a84a', skin = '#e6b98f', steel = '#5a6470';
    const gear = (cx: number, cy: number, r: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? r : r + 2;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      return Pl(...pts);
    };
    return {
      legs: 'walk', atk: 'aim', aura: '#7fe3ff',
      backLeg: leg(-5, -17, 6.5, '#5a4632', '#2a201a'),
      frontLeg: leg(4, -17, 6.5, '#6a5440', '#2a201a'),
      cape: {
        at: [-8, -40],
        s: [
          sh(Rr(-19, -45, 11, 22, 2.5), leather),
          sh(gear(-15, -46, 5), brass, 1.2),
          flat(E(-15, -46, 2), '#5a4632'),
          ln('M-18 -28Q-24 -24 -20 -18', steel, 1.4),
          lit(E(-11, -32, 1.4), '#7fe3ff', 0.8),
        ],
      },
      backArm: arm(-11, -37, 15, 6, suit, leather),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-40, -16, 11, 9), suit),
          flat('M-9 -38Q-11 -28 -7 -18H-4Q-7 -28 -6 -38Z', '#e09a52', 0.55),
          ln('M-10 -40L8 -18', leather, 1.8),
          sh(Rr(-11, -21, 22, 4, 1.2), leather, 1.1),
          sh(Rr(-9, -24, 5, 5, 1), '#8a6440', 1),
          sh(Rr(5, -24, 5, 5, 1), '#8a6440', 1),
          flat(E(2, -31, 1.1), brass),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh(E(1, -48, 6.5, 6.8), skin),
          sh('M-6 -50Q-6 -57 1 -57Q6 -58 9 -53Q5 -55 3 -53Q1 -56 -2 -53Q-4 -54 -6 -48Z', '#5a3a22'),
          ln('M-6 -49.5L1 -49.5', '#3a2618', 1.6),
          sh(E(3.4, -49, 2.8), brass, 1.2),
          sh(E(8, -49, 2.5), brass, 1.2),
          lit(E(3.4, -49, 1.8), '#7fe3ff', 0.95),
          lit(E(8, -49, 1.6), '#7fe3ff', 0.95),
          flat(E(2.8, -49.7, 0.6) + E(7.4, -49.7, 0.5), '#ffffff'),
          ln('M4.5 -44H7.5', '#8a5a40', 0.8, true),
          flat(E(-1, -45, 1.2, 0.8), '#3a2618', 0.3),
        ],
      },
      frontArm: arm(11, -37, 15, 6.5, suit, leather, held({ x: 11, y: -20.5, a: Math.PI / 2 }, [
        sh(Rr(-7, -2.2, 28, 4.4, 1.2), '#7a5432', 1.2),
        ln('M19 -12Q23 0 19 12', steel, 2.4),
        ln('M19 -12L12 0L19 12', '#e6e0d0', 0.6, true),
        ln('M12 0H29', brass, 1.2),
        sh(Pl([29, -1.8], [32, 0], [29, 1.8]), '#c8d2db', 0.8),
        sh(E(1, 0, 3.2), brass, 1),
      ])),
    };
  })(),

  // Аврора: огненная волшебница, волосы-пламя, посох со сферой огня
  aurora: (() => {
    const red = '#a3262f', redD = '#6e1820', gold = '#e8b54a', skin = '#f3cfa8', flame = '#ff7a22', flameL = '#ffd36b';
    return {
      legs: 'robe', atk: 'staff', aura: flame,
      backArm: arm(-8.5, -38, 15, 5, redD, skin),
      body: {
        at: [0, -18],
        s: [
          sh(robe(-41, 9, 15), red),
          flat('M-7 -39Q-10 -20 -12 -2L-8 -1Q-6 -20 -4 -40Z', '#d2464e', 0.5),
          ln('M1 -38L2 -1', gold, 1.4, true),
          ln('M-14 -3Q0 0 14 -3', gold, 1.6, true),
          sh(Rr(-9, -27, 18, 3.5, 1.2), gold, 1),
          lit(E(0.5, -25.2, 1.4), flameL, 0.9),
          sh('M-9 -41Q0 -36 9 -41L8 -36Q0 -32 -8 -36Z', redD, 1.1),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh('M-6 -50Q-17 -52 -15 -62Q-11 -56 -9 -58Q-9 -67 -1 -69Q-2 -63 2 -61Q4 -67 10 -67Q6 -61 9 -55Q3 -52 -6 -46Z', flame),
          lit('M-4 -52Q-11 -55 -10 -60Q-7 -56 -5 -57Q-5 -63 0 -65Q-1 -59 3 -58Q5 -62 8 -62Q5 -58 6 -55Z', flameL, 0.85),
          sh(E(1.5, -48, 5.8, 6.4), skin),
          sh('M-5 -50Q-3 -57 4 -56Q9 -55 8.5 -50Q5 -53 2 -51Q0 -53 -3 -49Z', flame, 1.1),
          ...eyes(3, -48, '#d8661a', 3.2, 1.9),
          ln('M5.2 -44.2Q6.2 -43.4 7.2 -44.2', '#b0503a', 0.7, true),
          flat(E(-3.6, -45.5, 0.9), gold),
        ],
      },
      frontArm: arm(8.5, -38, 15, 5, red, skin, held({ x: 8.5, y: -21.5, a: 0, k: 1 }, [
        ln('M0 18V-22', '#5a3220', 2.2),
        sh('M-4 -22Q-6 -30 0 -33Q-3 -28 0 -25Q3 -28 0 -33Q6 -30 4 -22Z', gold, 1.1),
        lit(E(0, -29, 7), flame, 0.3),
        sh(E(0, -29, 3.8), flame, 1),
        lit(E(-0.6, -29.6, 2.2), flameL, 0.95),
      ])),
    };
  })(),

  // Иней: северный чародей, ледяная корона, белая борода, меховой плащ
  frost: (() => {
    const robeC = '#3a6ea8', robeD = '#264a78', fur = '#eef4fb', beard = '#f4f8ff', crystal = '#a8e6ff', skin = '#e8c7a8';
    return {
      legs: 'robe', atk: 'staff', size: 1.1, aura: crystal,
      cape: {
        at: [-7, -41],
        s: [sh('M-9 -42Q-18 -22 -18 -1L-6 -2Z', robeD)],
      },
      backArm: arm(-9, -38, 16, 5.5, robeD, skin),
      body: {
        at: [0, -18],
        s: [
          sh(robe(-41, 9, 14), robeC),
          flat('M-7 -39Q-10 -20 -11 -2L-8 -1Q-6 -20 -4 -40Z', '#5a92cc', 0.6),
          sh('M-14 -4Q0 -1 14 -4L14 -1Q0 2 -14 -1Z', fur, 1.1),
          ln('M1 -30V-22M-3 -26H5M-2 -29L4 -23M4 -29L-2 -23', crystal, 1, true),
          sh('M-11 -42Q0 -38 11 -42Q12 -37 8 -35Q0 -33 -8 -35Q-12 -37 -11 -42Z', fur, 1.2),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(E(1.5, -49, 5.8, 6.4), skin),
          sh('M-3 -46Q-4 -32 3 -25Q7 -33 9 -46Q5 -43 3 -44Q0 -43 -3 -46Z', beard),
          flat('M0 -42Q2 -34 3 -29Q5 -34 6 -42Z', '#d6e6f6', 0.7),
          sh('M1 -46Q4 -44 8 -46.5Q5 -43 1 -45Z', beard, 0.8),
          ...eyes(3.2, -49, '#3aa0e0', 3.2, 1.4),
          ln('M1.6 -51.2L5 -51.6M6.3 -51.6L9.3 -51', '#ffffff', 1.3, true),
          sh(Pl([-4, -54], [-3, -61], [-1, -55], [1, -64], [3, -55], [5, -61], [7, -54]), crystal, 1.1),
          lit(Pl([0, -55], [1, -62], [2, -55]), '#ffffff', 0.7),
          sh(Rr(-5, -55.5, 13, 2.6, 1), '#c8e8ff', 1),
        ],
      },
      frontArm: arm(9, -38, 16, 5.5, robeC, skin, held({ x: 9, y: -20.5, a: 0, k: 1 }, [
        ln('M0 19V-22', '#cfe6f5', 2),
        lit(E(0, -28, 7), crystal, 0.3),
        sh(Pl([0, -37], [4, -28], [0, -21], [-4, -28]), crystal, 1.2),
        lit(Pl([0, -35], [2, -28], [0, -24]), '#ffffff', 0.8),
        sh(Pl([-4, -24], [-7, -29], [-3, -27]), crystal, 0.9),
      ])),
    };
  })(),

  // Мудрец: старый хранитель книг, огромная шляпа, очки, парящая книга
  sage: (() => {
    const robeC = '#5a3f8a', robeD = '#3d2a63', star = '#ffd86b', beard = '#dedede', skin = '#e8c4a0';
    return {
      legs: 'robe', atk: 'staff', aura: '#c9a0ff',
      backArm: arm(-8.5, -37, 15, 5.5, robeD, skin),
      body: {
        at: [0, -18],
        s: [
          sh(robe(-40, 9, 14), robeC),
          flat('M-7 -38Q-10 -20 -11 -2L-8 -1Q-6 -20 -4 -39Z', '#7a5ab0', 0.6),
          lit(E(-5, -14, 1) + E(6, -8, 1.2) + E(-8, -6, 0.8) + E(3, -18, 0.8), star, 0.8),
          ln('M-9 -23Q0 -20 9 -23', '#c9a04a', 1.4),
          ln('M5 -22L6 -16', '#c9a04a', 1.1, true),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh(E(1.5, -47, 5.8, 6), skin),
          sh('M-4 -45Q-6 -30 3 -21Q9 -30 9 -44Q5 -41 2.5 -42Q-1 -41 -4 -45Z', beard),
          flat('M0 -40Q1 -30 3 -25Q5 -31 6 -40Z', '#bcbcbc', 0.5),
          sh('M0.5 -45Q4 -43 8.5 -45Q5 -42 0.5 -44Z', beard, 0.8),
          flat(E(3, -47.6, 0.8) + E(7, -47.6, 0.7), '#2a1a12'),
          ln(E(3, -47.6, 2) + E(7, -47.6, 1.8) + 'M5 -47.6H5.2', '#c9a04a', 0.8, true),
          ln('M1 -50.2L4.5 -50M5.8 -50L8.8 -50.4', '#ffffff', 1.2, true),
          flat(E(9.2, -45.6, 1.6, 1.2), '#d8a080'),
          sh(E(0.5, -52, 12.5, 2.8), robeD, 1.3),
          sh('M-7 -53Q-3 -66 -13 -77Q4 -72 8 -53Z', robeC, 1.4),
          ln('M-7 -55Q0 -57 8 -55', '#c9a04a', 1.6),
          lit(E(-2, -62, 1.1) + E(2, -58, 0.8) + E(-6, -68, 0.9), star, 0.9),
          lit(E(-13, -77, 1.6), star, 0.9),
        ],
      },
      frontArm: arm(8.5, -37, 15, 5.5, robeC, skin, held({ x: 13, y: -30, a: -0.1, k: 1 }, [
        lit(E(0, -6, 9, 6), '#c9a0ff', 0.25),
        sh('M0 0L-9 -3V-12L0 -9Z', '#f4ead0', 1.1),
        sh('M0 0L9 -3V-12L0 -9Z', '#fff6e0', 1.1),
        ln('M-7 -6L-2 -4.6M-7 -8.4L-2 -7M2 -4.6L7 -6M2 -7L7 -8.4', '#8a6a9a', 0.6, true),
        sh('M-9.6 -2.4L0 0.8L9.6 -2.4L9 -1L0 2L-9 -1Z', '#8a3a2a', 0.9),
        lit(E(0, -14, 1.2) + E(-3, -17, 0.8) + E(3, -16, 0.7), '#c9a0ff', 0.9),
      ])),
    };
  })(),

  // Ива: лесная целительница, волосы из листвы, платье, посох-лоза с цветком
  willow: (() => {
    const dress = '#4f8a3a', dressD = '#36652a', bark = '#7a5636', skin = '#e8d2ae', hair = '#6fbf4a', flower = '#ff9ac2';
    return {
      legs: 'robe', atk: 'staff', aura: '#a8ff9a',
      backArm: arm(-7.5, -37, 15, 4.5, skin, skin),
      body: {
        at: [0, -18],
        s: [
          sh('M-7 -40Q-10 -20 -15 -3L-12 -1L-9 -4L-6 0L-3 -3L0 1L3 -3L6 0L9 -4L12 -1L15 -3Q10 -20 7 -40Q0 -43 -7 -40Z', dress),
          flat('M-6 -38Q-9 -20 -12 -4L-9 -4Q-5 -20 -3 -38Z', '#78b85a', 0.6),
          sh('M-7 -40Q0 -36 7 -40L6 -34Q0 -31 -6 -34Z', dressD, 1),
          ln('M-7 -26Q0 -22 7 -26', bark, 1.3),
          flat(E(0, -24, 1.6), flower),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh('M-5 -53Q-15 -54 -14 -40Q-16 -34 -12 -28Q-9 -36 -8 -32Q-6 -40 -2 -44Z', hair),
          flat('M-10 -44Q-14 -40 -12 -32Q-10 -36 -9 -40Z', '#4f9a32', 0.8),
          sh(E(1.5, -48, 5.6, 6.3), skin),
          sh('M-5 -50Q-6 -58 2 -58Q10 -58 9 -50Q6 -54 3 -52Q1 -55 -1 -51Q-3 -53 -5 -46Z', hair),
          flat('M-2 -57Q1 -61 4 -58Q1 -57 -1 -55Z', '#a8e07a'),
          sh(E(-4, -54, 2.2), flower, 1),
          flat(E(-4, -54, 0.9), '#ffe27a'),
          ...eyes(3, -48, '#2e8a3a', 3.2, 1.9),
          ln('M5 -44.2Q6 -43.6 7 -44.2', '#a0604a', 0.7, true),
          flat(E(2, -45.4, 1.3, 0.8) + E(8.3, -45.4, 0.9, 0.7), '#f29a9a', 0.4),
        ],
      },
      frontArm: arm(7.5, -37, 15, 4.5, skin, skin, held({ x: 7.5, y: -20.5, a: 0, k: 1 }, [
        ln('M0 19Q-1.5 6 0.5 -6Q2 -16 0 -22Q-2 -28 3 -29Q6 -28 5 -25', bark, 2.2),
        ln('M0 6Q-3 4 -5 6M1 -8Q4 -10 6 -8', '#5ea43b', 1.4, true),
        sh(E(1, -31, 2.4) + E(-2.5, -28, 2.4) + E(4.5, -28, 2.4), flower, 1),
        lit(E(1, -29, 1.7), '#ffe27a', 0.95),
        lit(E(1, -29, 6.5), '#a8ff9a', 0.25),
      ])),
    };
  })(),

  // Люмен: светоносец, нимб, бело-золотая мантия, фонарь
  lumen: (() => {
    const robeC = '#f2eee4', gold = '#e2b54a', skin = '#e6c09a', light = '#fff3b0';
    return {
      legs: 'robe', atk: 'staff', aura: light,
      backArm: arm(-8.5, -38, 15, 5.5, '#d8d2c2', skin),
      body: {
        at: [0, -18],
        s: [
          sh(robe(-41, 9, 14), robeC),
          flat('M3 -38Q6 -20 9 -2L13 -2Q9 -20 7 -40Z', '#cfc6b2', 0.7),
          sh('M-3 -40H4L5 -1H-4Z', gold, 1.1),
          lit(E(0.5, -30, 3), light, 0.8),
          ln('M0.5 -35V-25M-4.5 -30H5.5M-3 -33.5L4 -26.5M4 -33.5L-3 -26.5', '#c8902a', 0.7, true),
          ln('M-14 -3Q0 0 14 -3', gold, 1.4, true),
          sh('M-10 -41Q0 -37 10 -41L9 -37Q0 -34 -9 -37Z', gold, 1.1),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          lit(E(0.5, -60, 9, 3.6), light, 0.3),
          ln(E(0.5, -60, 7, 2.2), '#ffe27a', 1.6, true),
          sh(E(1.5, -48.5, 5.8, 6.4), skin),
          sh('M-5 -50Q-5 -57 2 -57Q9 -57 8.5 -51Q5 -54 2 -52.5Q-1 -54 -5 -47Z', '#e8c060'),
          ln('M3 -49.5Q4.4 -48.6 5.8 -49.5M7 -49.5Q8 -48.6 9 -49.5', '#4a3020', 0.8, true),
          ln('M5 -44.8Q6.4 -44 7.6 -44.8', '#a0604a', 0.7, true),
        ],
      },
      frontArm: arm(8.5, -38, 15, 5.5, robeC, skin, held({ x: 8.5, y: -21.5, a: 0, k: 1 }, [
        ln('M0 0V6', '#b8973a', 1, true),
        lit(E(0, 11, 8), light, 0.35),
        sh(Rr(-3.8, 6, 7.6, 10, 1.8), gold, 1.2),
        lit(Rr(-2.4, 7.6, 4.8, 6.8, 1), light, 0.95),
        sh('M-4.4 6L0 3.6L4.4 6Z', gold, 1),
      ])),
    };
  })(),

  // Звон: монах с колоколом на спине, оранжевая ряса, чётки
  chime: (() => {
    const robeC = '#e07a2a', robeD = '#a8551c', skin = '#c98d5e', bell = '#c69a3e';
    return {
      legs: 'walk', atk: 'thrust', aura: '#ffd27a',
      backLeg: leg(-4.5, -17, 7.5, '#e8a050', '#4a3020', 4),
      frontLeg: leg(4, -17, 7.5, '#f0b060', '#4a3020', 4),
      cape: {
        at: [-8, -40],
        s: [
          ln('M-6 -42L-12 -52', '#6a4020', 1.6),
          sh('M-21 -38Q-21 -51 -13 -53Q-5 -52 -4 -39L-2 -35H-23Z', bell, 1.5),
          flat('M-18 -40Q-18 -49 -14 -51Q-16 -46 -15 -39Z', '#f0c870', 0.75),
          sh(Rr(-24, -37, 23, 3, 1.2), '#a87a2a', 1.1),
          ln('M-21 -44Q-13 -42 -5 -44', '#8a6a2a', 0.9, true),
        ],
      },
      backArm: arm(-12, -38, 15, 7, skin, skin),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-40, -16, 12, 9), skin),
          flat('M-10 -38Q-12 -28 -8 -18H-5Q-8 -28 -7 -38Z', '#e0a878', 0.5),
          sh('M-12 -40L-5 -41L11 -18L10 -15L-9 -15Q-13 -28 -12 -40Z', robeC),
          flat('M-10 -38L-6 -39L-7 -17H-9Z', '#f0a050', 0.6),
          sh(Rr(-10, -20, 21, 4, 1.4), robeD, 1.1),
          ln('M-7 -40Q1 -30 9 -40', '#5a2a1a', 1.2, true),
          flat(E(-5, -36, 1.2) + E(-2, -32.6, 1.2) + E(1, -31.4, 1.4) + E(4, -32.6, 1.2) + E(7, -36, 1.2), '#5a2a1a'),
          flat(E(1, -31.4, 0.6), '#d84a2a'),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(E(1.5, -48.5, 6.6, 7), skin),
          flat(E(-1.5, -52.5, 3.4, 2.2), '#ffffff', 0.3),
          flat(E(0, -54.5, 0.7) + E(2.5, -55.2, 0.7) + E(5, -54.8, 0.7), '#5a2a1a'),
          ln('M2 -48.4Q3.5 -47.4 5 -48.4M6.4 -48.4Q7.8 -47.4 9 -48.4', '#3a2010', 0.9, true),
          ln('M5 -44Q6.4 -43.2 7.8 -44', '#7a3a2a', 0.8, true),
          sh(E(-4, -48, 1.6, 2.2), skin, 1),
        ],
      },
      frontArm: arm(12, -38, 15, 7, skin, skin, [ln('M8.6 -24.5H15.4M8.8 -26.5H15.2', robeD, 1.2, true)], 4.4),
    };
  })(),

  // Тень: ночной клинок, маска, рваный плащ, два кинжала
  shade: (() => {
    const cloak = '#2e2640', cloakD = '#1a1424', purple = '#a35cff', mask = '#dcd8e8';
    const dagger = (x: number) => held({ x, y: -20.5, a: 1.0 }, blade(15, 2.6, '#b8b0d8', '#6a4a9a', '#1a1424'));
    return {
      legs: 'walk', atk: 'slash', aura: purple,
      backLeg: leg(-4, -18, 5, '#1e1a2a', '#0f0d16'),
      frontLeg: leg(3.5, -18, 5, '#2a2438', '#0f0d16'),
      cape: {
        at: [-5, -42],
        s: [
          lit(E(-15, -10, 6, 4) + E(-9, -4, 5, 3), purple, 0.18),
          sh('M-6 -43Q-15 -32 -21 -6L-18 -10L-16 -3L-13 -9L-10 -2L-8 -12L-5 -8Q-4 -24 -1 -32Z', cloakD),
        ],
      },
      backArm: arm(-8, -37, 15, 4.5, cloak, cloakD, dagger(-8)),
      body: {
        at: [0, -18],
        s: [
          sh(torso(-40, -17, 8, 6), cloak),
          flat('M-6 -38Q-8 -28 -5 -18H-3Q-5 -28 -4 -38Z', '#4a3e66', 0.6),
          ln('M-8 -38L6 -22M-7 -26L6 -38', '#120e1a', 1.2, true),
          lit(Rr(-7, -22, 14, 1.6, 0.8), purple, 0.8),
          sh(Rr(-7, -21, 14, 3, 1), '#120e1a', 1),
        ],
      },
      head: {
        at: [0, -42],
        s: [
          sh('M-7 -45Q-9 -59 2 -59Q11 -58 9.5 -47L7 -41H-5Z', cloak),
          sh('M-5 -55Q-12 -53 -14 -46Q-10 -49 -6 -48Z', cloak, 1.1),
          sh(E(3.6, -48.5, 4.5, 5), mask, 1.1),
          flat('M-0.5 -46Q4 -44.5 8.1 -46L8 -42Q4 -40.6 0 -42Z', cloakD),
          lit(Pl([1.8, -50], [5, -49.2], [4.8, -48.2], [2, -48.6]), purple, 0.95),
          lit(Pl([6, -49.2], [8.4, -50], [8.2, -48.6], [6.2, -48.2]), purple, 0.95),
          ln('M3.6 -53.4V-51.6', '#8a6aba', 0.8, true),
        ],
      },
      frontArm: arm(8, -37, 15, 4.5, cloak, cloakD, dagger(8)),
    };
  })(),

  // Клык: волк-оборотень, когти, уши, хвост
  fang: (() => {
    const fur = '#7b7f8a', furL = '#b8bcc6', furD = '#4c4f58', vest = '#6a4a30', eye = '#ffd23a';
    const claws = (x: number) =>
      held({ x, y: -20.5, a: 1.2 }, [
        sh('M1 -3Q9 -5 13 -1Q8 -2.4 1 -1Z', '#efe8d8', 0.9),
        sh('M1 -0.8Q10 -1 14 2.4Q8 1.4 1 1Z', '#efe8d8', 0.9),
        sh('M1 1.2Q9 3 12 6Q7 4 1 3Z', '#efe8d8', 0.9),
      ]);
    return {
      legs: 'walk', atk: 'slash', aura: eye,
      backLeg: leg(-5, -17, 6.5, furD, '#2e3036', 4),
      frontLeg: leg(4, -17, 6.5, fur, '#2e3036', 4),
      cape: {
        at: [-8, -20],
        s: [sh('M-7 -23Q-19 -27 -25 -17Q-24 -10 -17 -11Q-21 -16 -9 -18Z', fur), flat('M-25 -17Q-24 -10 -17 -11Q-20 -14 -20 -17Z', furL)],
      },
      backArm: arm(-12, -37, 15, 6, furD, furD, claws(-12)),
      body: {
        at: [0, -17],
        s: [
          sh(torso(-40, -16, 11, 8), fur),
          flat('M-3 -38Q5 -32 3 -20Q0 -26 -3 -30Z', furL, 0.8),
          sh('M-11 -40L-4 -40L-6 -18L-9 -17Q-14 -28 -11 -40Z', vest),
          sh('M11 -40L5 -40L6 -18L9 -17Q14 -28 11 -40Z', vest),
          sh(Rr(-9, -20, 18, 3.6, 1.2), '#3a2618', 1),
          sh('M-11 -43L-6 -38L-3 -42L0 -37L3 -42L6 -38L11 -43Q0 -47 -11 -43Z', furL, 1.1),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(Pl([-4, -53], [-3, -63], [2, -54]), fur, 1.2),
          flat(Pl([-2.6, -54], [-2.4, -60], [0.4, -54.5]), '#e8a0a0', 0.8),
          sh(E(0.5, -48.5, 6.6, 6.6), fur),
          sh(Pl([1.5, -54], [5, -63], [7, -52]), fur, 1.2),
          flat(Pl([3, -54], [5, -60], [6, -53]), '#e8a0a0', 0.8),
          sh('M3 -50Q8 -50 13.5 -47.5Q15 -45 12 -43.5L4 -43Z', furL, 1.3),
          flat(E(13.6, -47.2, 1.6, 1.2), '#1a1a1e'),
          flat(Pl([7, -43.6], [8, -41.8], [9, -43.6]), '#ffffff'),
          flat(Pl([10.5, -43.8], [11.3, -42.2], [12, -43.8]), '#ffffff'),
          lit(E(5, -50.5, 2.4, 1.6), eye, 0.5),
          flat(Pl([3.6, -51.4], [7, -51], [6.4, -49.6], [3.8, -50]), eye),
          flat(E(5.6, -50.4, 0.5, 0.7), '#1a1a1e'),
          ln('M3.4 -52.4L7.4 -51.4', furD, 1.1, true),
          flat('M-6 -46Q-8 -40 -4 -40Q-5 -43 -2 -42Z', furL, 0.8),
        ],
      },
      frontArm: arm(11, -37, 15, 6.5, fur, furD, claws(11)),
    };
  })(),

  // Жнец: полевой призрак-пугало, соломенная шляпа, коса, зелёные глаза
  reaper: (() => {
    const coat = '#4a5a3a', coatD = '#33402a', patch = '#8a6a3a', straw = '#e0c070', sack = '#c8b088', hat = '#a88a4a', eye = '#7dff6a';
    const strawHand = (x: number, y: number) => [ln(`M${x - 2} ${y}L${x - 3} ${y + 5}M${x} ${y}V${y + 6}M${x + 2} ${y}L${x + 3} ${y + 5}`, straw, 1.1)];
    return {
      legs: 'float', atk: 'slash', size: 1.06, aura: eye,
      cape: {
        at: [-6, -40],
        s: [sh('M-8 -41Q-16 -28 -18 -8L-15 -11L-13 -5L-11 -11L-8 -6L-6 -14Z', coatD)],
      },
      backArm: arm(-10, -37, 15, 5, coatD, straw, strawHand(-10, -21), 2.6),
      body: {
        at: [0, -18],
        s: [
          lit(E(0, -3, 9, 3), eye, 0.18),
          sh('M-10 -41Q-12 -24 -12 -10L-9 -4L-7 -9L-4 -2L-1 -8L2 -1L5 -8L8 -3L10 -10Q12 -24 10 -41Q0 -44 -10 -41Z', coat),
          flat('M-8 -39Q-10 -24 -10 -10L-7 -8Q-7 -24 -5 -40Z', '#647a4e', 0.6),
          sh(Rr(2, -33, 6, 6, 1), patch, 1),
          ln('M2.6 -31.6L7.4 -28.4M7.4 -31.6L2.6 -28.4', '#3a2a1a', 0.5, true),
          ln('M-10 -24Q0 -21 10 -24', '#b8984a', 1.6),
          ln('M-6 -42L-8 -46M-2 -42L-2 -47M3 -42L4 -46', straw, 1.2),
        ],
      },
      head: {
        at: [0, -43],
        s: [
          sh(E(1.5, -48, 6.2, 6.8), sack),
          flat(E(-1.5, -50, 2.6, 3.4), '#e0cca4', 0.5),
          ...glowEyes(2.4, -49, eye, 4.2),
          ln('M2 -44.4L3 -43L4 -44.4L5 -43L6 -44.4L7 -43L8 -44.4', '#3a2a1a', 0.7, true),
          ln('M-4 -42L-6 -38M7 -42L9 -38', straw, 1.1),
          sh(E(1.5, -53.5, 12.5, 2.6), hat, 1.3),
          sh('M-5.5 -54Q-5 -62 1.5 -62Q8 -62 8.5 -54Z', hat, 1.3),
          flat('M-5.5 -55.6H8.4V-54H-5.5Z', '#7a3a2a'),
          ln('M-10 -53L-13 -50M11 -53L14 -50.5', straw, 1, true),
        ],
      },
      frontArm: arm(10, -37, 15, 5, coat, straw, [
        ...strawHand(10, -21),
        ...held({ x: 10, y: -20.5, a: 1.1 }, [
          ln('M-14 0H26', '#6a4a2a', 2.2),
          sh('M24 -1Q30 -12 20 -22Q28 -12 21 -1Z', '#aab4b8', 1.3),
          flat('M23.6 -3Q27 -11 21.6 -18Q25 -11 22.4 -3Z', '#e8eef0', 0.7),
        ]),
      ], 2.6),
    };
  })(),
};

// ---------- Отрисовка ----------

const OUT = '#140e1a';
const paths = new Map<string, Path2D>();
const path = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], rot: number, flash: number) {
  for (const s of shapes) {
    const p = path(s.d);
    if (s.tf) {
      ctx.save();
      ctx.translate(s.tf.x, s.tf.y);
      ctx.rotate(s.tf.a - rot * (s.tf.k ?? 0));
    }
    const a = s.alpha ?? 1;
    if (s.fill === 'none') {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!s.bare) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = (s.line ?? 1.6) + 2.2;
        ctx.stroke(p);
      }
      ctx.strokeStyle = flash > 0 ? mix(s.col ?? '#fff', flash) : s.col ?? '#fff';
      ctx.lineWidth = s.line ?? 1.6;
      ctx.globalAlpha = a;
      ctx.stroke(p);
      ctx.globalAlpha = 1;
    } else if (s.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.fillStyle = s.fill;
      ctx.fill(p);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = s.fill;
      ctx.fill(p);
      if (flash > 0 && a > 0.5) {
        ctx.globalAlpha = flash * 0.75;
        ctx.fillStyle = '#ffffff';
        ctx.fill(p);
      }
      ctx.globalAlpha = 1;
      if (s.line) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = OUT;
        ctx.lineWidth = s.line;
        ctx.stroke(p);
      }
    }
    if (s.tf) ctx.restore();
  }
}

// Подмешать белый к цвету линии при получении урона
function mix(hex: string, k: number) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c + (255 - c) * k * 0.75);
  return `rgb(${f(v >> 16)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

function part(ctx: CanvasRenderingContext2D, p: Part | undefined, rot: number, flash: number) {
  if (!p) return;
  if (!rot) return drawShapes(ctx, p.s, 0, flash);
  ctx.save();
  ctx.translate(p.at[0], p.at[1]);
  ctx.rotate(rot);
  ctx.translate(-p.at[0], -p.at[1]);
  drawShapes(ctx, p.s, rot, flash);
  ctx.restore();
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => 1 - (1 - k) * (1 - k);

// Углы руки: 0 — висит вниз, плюс — назад и вверх, минус — вперёд
function armAngles(art: Art, p: Pose, walk: number): [number, number] {
  const idle = -0.2 + Math.sin(p.t * 2) * 0.04;
  let f = idle + walk * 0.3;
  let b = 0.1 - walk * 0.35;
  const swing = p.swing ?? 0;
  if (swing > 0) {
    const a = 1 - swing / 0.25;
    switch (art.atk) {
      case 'slash': // замах за спину и удар сверху вниз с проводкой
        f = a < 0.35 ? lerp(idle, 2.6, ease(a / 0.35)) : a < 0.6 ? lerp(2.6, 5.1, ease((a - 0.35) / 0.25)) : lerp(5.1, Math.PI * 2 + idle, (a - 0.6) / 0.4);
        b = a < 0.35 ? -0.4 : 0.5;
        break;
      case 'thrust':
      case 'bash': {
        const end = art.atk === 'thrust' ? -1.45 : -1.0;
        f = a < 0.35 ? lerp(idle, 0.6, ease(a / 0.35)) : a < 0.55 ? lerp(0.6, end, ease((a - 0.35) / 0.2)) : lerp(end, idle, (a - 0.55) / 0.45);
        b = a < 0.35 ? -0.5 : 0.6;
        break;
      }
      case 'aim': // натянуть и отпустить
        f = a < 0.25 ? lerp(idle, -1.5, ease(a / 0.25)) : a < 0.8 ? -1.5 : lerp(-1.5, idle, (a - 0.8) / 0.2);
        b = a < 0.25 ? lerp(0.1, -1.25, a / 0.25) : a < 0.6 ? -1.25 : a < 0.8 ? -0.6 : lerp(-0.6, 0.1, (a - 0.8) / 0.2);
        break;
      case 'staff':
        f = a < 0.4 ? lerp(idle, -1.4, ease(a / 0.4)) : lerp(-1.4, idle, (a - 0.4) / 0.6);
        b = a < 0.4 ? lerp(0.1, -0.6, a / 0.4) : lerp(-0.6, 0.1, (a - 0.4) / 0.6);
        break;
    }
  }
  const cast = p.cast ?? 0;
  if (cast > 0) {
    const c = cast / 0.35;
    const env = Math.min(1, (1 - c) * 4) * Math.min(1, c * 3);
    f = lerp(f, -2.5, env);
    b = lerp(b, -1.6, env * 0.8);
  }
  return [f, b];
}

export function drawArt(ctx: CanvasRenderingContext2D, art: Art, p: Pose) {
  const face = p.face ?? 1;
  const ph = p.t * 11;
  const walk = p.moving ? Math.sin(ph) : 0;
  const swing = p.swing ?? 0;
  const cast = p.cast ?? 0;
  const flash = Math.min(1, (p.flash ?? 0) / 0.15);
  const breathe = Math.sin(p.t * 2.2) * 0.7;
  const a = swing > 0 ? 1 - swing / 0.25 : 0;
  let lean = swing > 0 ? (a < 0.35 ? -(a / 0.35) * 0.1 : (1 - (a - 0.35) / 0.65) * 0.14) : 0;
  lean += walk * 0.03 + (p.moving ? 0.05 : 0) - flash * 0.1;
  const lift = cast > 0 ? Math.sin((cast / 0.35) * Math.PI) * 3 : 0;
  const hover = art.legs === 'float' ? 3 + Math.sin(p.t * 2.6) * 1.6 : 0;
  const bob = p.moving && art.legs === 'walk' ? Math.abs(Math.cos(ph)) * 1.6 : 0;
  const [fa, ba] = armAngles(art, p, walk);
  const s = (art.size ?? 1) * 0.92;

  ctx.save();
  ctx.scale(face * s, s);
  ctx.translate(0, -lift - hover);
  ctx.rotate(lean);

  if (cast > 0) {
    const r = 30 + (1 - cast / 0.35) * 14;
    const g = ctx.createRadialGradient(0, -30, 2, 0, -30, r);
    g.addColorStop(0, art.aura);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -30, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ноги не подпрыгивают вместе с телом
  if (art.legs === 'walk') {
    part(ctx, art.backLeg, -walk * 0.42, flash);
    part(ctx, art.frontLeg, walk * 0.42, flash);
  }
  ctx.translate(0, breathe * 0.5 - bob);
  const capeRot = Math.sin(p.t * 3.1) * 0.04 + (p.moving ? 0.14 : 0) + walk * 0.04;
  part(ctx, art.cape, capeRot, flash);
  part(ctx, art.backArm, ba, flash);
  if (art.legs === 'robe') {
    // подол мантии слегка качается
    ctx.save();
    ctx.translate(0, -40);
    ctx.transform(1, 0, -walk * 0.06 - (p.moving ? 0.05 : 0), 1, 0, 0);
    ctx.translate(0, 40);
    part(ctx, art.body, 0, flash);
    ctx.restore();
  } else part(ctx, art.body, 0, flash);
  ctx.save();
  ctx.translate(0, breathe * 0.3);
  part(ctx, art.head, Math.sin(p.t * 1.7) * 0.04 + lean * 0.4, flash);
  ctx.restore();
  part(ctx, art.frontArm, fa, flash);
  ctx.restore();
}
