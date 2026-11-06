// Геометрия карты: три линии от синей базы к красной, общая для симуляции и отрисовки.
export const W = 1000;
export const H = 600;

export type LaneId = 0 | 1 | 2; // 0 верх, 1 центр, 2 низ
export const LANE_NAMES = ['Верх', 'Центр', 'Низ'] as const;

const laneFn = [
  (t: number) => [120 + t * 760, 300 - Math.sin(t * Math.PI) * 210],
  (t: number) => [120 + t * 760, 300 + Math.sin(t * 6.28) * 18],
  (t: number) => [120 + t * 760, 300 + Math.sin(t * Math.PI) * 210],
];

export const lanePoint = (lane: LaneId, t: number): [number, number] => laneFn[lane](Math.max(0, Math.min(1, t))) as [number, number];

// Готовые точки линий для быстрого поиска ближайшей позиции
const N = 120;
export const LANE_PTS: [number, number][][] = [0, 1, 2].map((l) => Array.from({ length: N + 1 }, (_, i) => lanePoint(l as LaneId, i / N)));

export function nearestT(lane: LaneId, x: number, y: number) {
  const pts = LANE_PTS[lane];
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i <= N; i += 2) {
    const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best / N;
}

export const riverX = (y: number) => 500 + Math.sin(y / 70) * 26;

// Башни: внешняя и внутренняя на каждой линии у каждой стороны
export const TOWER_T = [0.36, 0.17];
export const towerT = (side: 0 | 1, tier: 0 | 1) => (side === 0 ? TOWER_T[tier] : 1 - TOWER_T[tier]);

export const CORE_POS: [number, number][] = [
  [55, 300],
  [945, 300],
];

// Лесные лагеря: по два на половине каждой команды, между линиями
export const CAMPS: [number, number][] = [
  [300, 236],
  [300, 366],
  [700, 236],
  [700, 366],
];

// Нейтральные объекты в реке
export const OBJECTIVES = {
  spirit: [riverX(196), 196] as [number, number],
  colossus: [riverX(404), 404] as [number, number],
};
