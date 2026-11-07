// Иконки интерфейса: одна толщина линии, рисуются через currentColor.
const svg = (body: string, size = 20) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  save: (s?: number) => svg('<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19h14"/>', s),
  sound: (s?: number) => svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>', s),
  mute: (s?: number) => svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>', s),
  stage: (s?: number) => svg('<path d="M3 20h18"/><path d="M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>', s),
  roster: (s?: number) => svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4-.3 4.4 1.2 5 4.3"/>', s),
  table: (s?: number) => svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8.5 20h7"/>', s),
  coin: (s?: number) => svg('<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.6 0-2.6.8-2.6 2s1 1.6 2.6 2 2.6.9 2.6 2.1-1.1 1.9-2.6 1.9c-1.2 0-2.1-.4-2.6-1.3"/><path d="M12 6.5V8m0 8v1.5"/>', s),
  sword: (s?: number) => svg('<path d="M14.5 4H20v5.5L10 19.5 4.5 14z"/><path d="m7 17-3 3"/><path d="m5.5 13 5.5 5.5"/>', s),
  shield: (s?: number) => svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>', s),
  brain: (s?: number) => svg('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>', s),
  rest: (s?: number) => svg('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', s),
  play: (s?: number) => svg('<path d="M7 5v14l11-7z" fill="currentColor"/>', s),
  fast: (s?: number) => svg('<path d="M4 6v12l8-6z" fill="currentColor"/><path d="M12 6v12l8-6z" fill="currentColor"/>', s),
  skip: (s?: number) => svg('<path d="M5 6v12l9-6z" fill="currentColor"/><path d="M18 6v12"/>', s),
  ban: (s?: number) => svg('<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/>', s),
  swap: (s?: number) => svg('<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>', s),
  tower: (s?: number) => svg('<path d="M7 21V9l-1-5h3v2h2V4h2v2h2V4h3l-1 5v12z"/><path d="M10 21v-4h4v4"/>', s),
  star: (s?: number) => svg('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>', s),
  meta: (s?: number) => svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', s),
  eye: (s?: number) => svg('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', s),
  skull: (s?: number) => svg('<path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.1 3 5.2V19h8v-3.8c1.8-1.1 3-2.8 3-5.2a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r="1.4" fill="currentColor"/><circle cx="14.5" cy="11" r="1.4" fill="currentColor"/>', s),
};

// Герб команды: щит цвета команды с буквой
// Рисунки для герба клуба (0 — первая буква тега)
export const EMBLEMS = [
  '',
  'M20 11.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  'M22.5 10 14 21.5h5.5L17.5 31 26 19h-5.5z',
  'M12 25.5 13.5 14l4 5 2.5-7 2.5 7 4-5 1.5 11.5z',
  'M20 10c3 4 7 6.5 7 11.5a7 7 0 0 1-14 0c0-2.6 1.2-4.2 2.6-5.6.3 2 1.3 3.2 2.6 3.6-.6-3.6.3-6.7 1.8-9.5z',
  'M24.5 10.5 27.5 13.5 18.5 22.5l1.5 1.5-1.8 1.8-1.4-1.4-3.3 3.3-1.6-1.6 3.3-3.3-1.4-1.4 1.8-1.8 1.5 1.5z',
  'M13 13l4.5 3.5L20 11l2.5 5.5L27 13l-1.5 8.5c-1 4.5-3.2 7-5.5 8.5-2.3-1.5-4.5-4-5.5-8.5z',
  'M20 13c5 0 8.5 4.5 9.5 7-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7c1-2.5 4.5-7 9.5-7zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z',
];

export function crest(color: string, tag: string, size = 40, emblem = 0) {
  const mark = EMBLEMS[emblem]
    ? `<path d="${EMBLEMS[emblem]}" fill="#15121b" fill-rule="evenodd"/>`
    : `<text x="20" y="25" text-anchor="middle" font-family="Russo One, system-ui, sans-serif" font-size="14" fill="#15121b">${tag[0]}</text>`;
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 2 5 7v12c0 9 6.5 15.5 15 19 8.5-3.5 15-10 15-19V7z" fill="${color}"/>
    <path d="M20 2 5 7v12c0 9 6.5 15.5 15 19V2z" fill="rgba(0,0,0,.18)"/>
    <path d="M20 5.5 8 9.5v9.5c0 7.2 5 12.6 12 15.6 7-3 12-8.4 12-15.6V9.5z" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>
    ${mark}
  </svg>`;
}
