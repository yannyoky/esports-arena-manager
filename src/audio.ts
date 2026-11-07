// Звук игры: всё синтезируется в Web Audio, без звуковых файлов.
// Эффекты, гул арены в матче и спокойная музыка в меню.

export type Sfx =
  | 'hit' | 'heavy' | 'shoot' | 'magic' | 'fire' | 'frost' | 'heal' | 'ward' | 'dash' | 'hook' | 'whirl'
  | 'death' | 'tower' | 'towerShot' | 'level' | 'gold' | 'objective' | 'click' | 'cheer' | 'cheerBig' | 'win' | 'lose';

interface Settings {
  vol: number; // 0..1, общая громкость
  music: boolean;
}

const KEY = 'arena-audio';
const settings: Settings = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { vol: typeof s.vol === 'number' ? s.vol : 0.7, music: s.music !== false };
  } catch {
    return { vol: 0.7, music: true };
  }
})();

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let crowdGain: GainNode | null = null;
let noise: AudioBuffer;
let mode: 'menu' | 'match' | 'off' = 'off';
let musicTimer = 0;
let nextBar = 0;
let bar = 0;
const lastPlay: Partial<Record<Sfx, number>> = {};
let voices = 0;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* без сохранения */
  }
}

export const audioSettings = () => ({ ...settings });

export function setVolume(v: number) {
  settings.vol = Math.max(0, Math.min(1, v));
  if (ac) master.gain.setTargetAtTime(settings.vol, ac.currentTime, 0.05);
  persist();
}

export function setMusic(on: boolean) {
  settings.music = on;
  persist();
  if (!ac) return;
  musicBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.2);
}

// Браузер разрешает звук только после касания экрана
export function unlockAudio() {
  if (ac) {
    if (ac.state === 'suspended' && !document.hidden) void ac.resume();
    return;
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  ac = new Ctx();
  master = ac.createGain();
  master.gain.value = settings.vol;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = settings.music ? 1 : 0;
  musicBus.connect(master);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const want = mode;
  mode = 'off';
  setAudioMode(want);
}

// На свёрнутой вкладке звук полностью останавливается
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) void ac.suspend();
  else void ac.resume();
});

// ---------- Кирпичики синтеза ----------

function env(g: GainNode, t: number, peak: number, att: number, dec: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, peak: number, att: number, dec: number, out: AudioNode = sfxBus) {
  const a = ac!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + att + dec);
  env(g, t, peak, att, dec);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + att + dec + 0.05);
  voices++;
  o.onended = () => voices--;
}

function hiss(filter: BiquadFilterType, f0: number, f1: number, q: number, t: number, peak: number, att: number, dec: number, out: AudioNode = sfxBus) {
  const a = ac!;
  const s = a.createBufferSource();
  s.buffer = noise;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + att + dec);
  const g = a.createGain();
  env(g, t, peak, att, dec);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + att + dec + 0.05);
  voices++;
  s.onended = () => voices--;
}

// Минимальный интервал между одинаковыми звуками, чтобы драка не превращалась в шум
const GAP: Partial<Record<Sfx, number>> = { hit: 0.06, heavy: 0.08, shoot: 0.07, towerShot: 0.15, gold: 0.12, level: 0.2, cheer: 0.6, cheerBig: 1 };

export function sfx(name: Sfx, vol = 1) {
  if (!ac || ac.state !== 'running' || settings.vol <= 0) return;
  const now = ac.currentTime;
  if (now - (lastPlay[name] ?? -9) < (GAP[name] ?? 0.04)) return;
  if (voices > 28 && name !== 'tower' && name !== 'win' && name !== 'lose') return;
  lastPlay[name] = now;
  const t = now + 0.005;
  const r = 0.9 + Math.random() * 0.2;
  const v = vol;
  switch (name) {
    case 'hit':
      hiss('bandpass', 1800 * r, 900, 1.2, t, 0.22 * v, 0.003, 0.06);
      tone('sine', 150 * r, 60, t, 0.28 * v, 0.003, 0.08);
      break;
    case 'heavy':
      hiss('lowpass', 900, 300, 0.7, t, 0.35 * v, 0.004, 0.14);
      tone('sine', 110 * r, 40, t, 0.45 * v, 0.004, 0.18);
      break;
    case 'shoot':
      hiss('bandpass', 3200 * r, 700, 2, t, 0.14 * v, 0.01, 0.11);
      break;
    case 'magic':
      tone('sine', 900 * r, 280, t, 0.12 * v, 0.01, 0.22);
      tone('triangle', 1350 * r, 420, t, 0.06 * v, 0.01, 0.22);
      break;
    case 'towerShot':
      tone('triangle', 520, 180, t, 0.08 * v, 0.01, 0.2);
      hiss('highpass', 2500, 2500, 0.5, t, 0.04 * v, 0.01, 0.12);
      break;
    case 'fire':
      hiss('lowpass', 1400, 300, 0.8, t, 0.32 * v, 0.03, 0.4);
      tone('sawtooth', 120, 50, t, 0.1 * v, 0.02, 0.35);
      break;
    case 'frost':
      for (let i = 0; i < 4; i++) tone('sine', 1800 + Math.random() * 1400, 1600, t + i * 0.04, 0.05 * v, 0.005, 0.25);
      hiss('highpass', 4000, 6000, 0.5, t, 0.08 * v, 0.02, 0.3);
      break;
    case 'heal':
      [523, 659, 784, 1047].forEach((f, i) => tone('sine', f, f, t + i * 0.06, 0.08 * v, 0.01, 0.25));
      break;
    case 'ward':
      tone('sine', 440, 440, t, 0.1 * v, 0.08, 0.45);
      tone('sine', 660, 660, t, 0.07 * v, 0.08, 0.45);
      tone('sine', 880, 880, t + 0.05, 0.04 * v, 0.08, 0.4);
      break;
    case 'dash':
      hiss('bandpass', 400, 2600, 1.5, t, 0.2 * v, 0.02, 0.16);
      break;
    case 'whirl':
      hiss('bandpass', 700, 2200, 2, t, 0.18 * v, 0.05, 0.12);
      hiss('bandpass', 2200, 700, 2, t + 0.17, 0.18 * v, 0.03, 0.14);
      break;
    case 'hook':
      tone('square', 240, 110, t, 0.06 * v, 0.005, 0.16);
      tone('triangle', 2400, 2000, t + 0.15, 0.06 * v, 0.002, 0.08);
      break;
    case 'death':
      tone('sine', 120, 45, t, 0.4 * v, 0.004, 0.3);
      tone('sawtooth', 320, 80, t, 0.06 * v, 0.01, 0.45);
      break;
    case 'tower':
      hiss('lowpass', 500, 120, 0.7, t, 0.5 * v, 0.02, 1.1);
      tone('sine', 70, 28, t, 0.55 * v, 0.01, 0.7);
      hiss('bandpass', 1800, 600, 1, t + 0.05, 0.12 * v, 0.01, 0.5);
      break;
    case 'level':
      tone('sine', 660, 660, t, 0.09 * v, 0.005, 0.12);
      tone('sine', 990, 990, t + 0.09, 0.09 * v, 0.005, 0.2);
      break;
    case 'gold':
      tone('square', 1320, 1320, t, 0.03 * v, 0.002, 0.05);
      tone('square', 1760, 1760, t + 0.05, 0.03 * v, 0.002, 0.09);
      break;
    case 'objective':
      [110, 165, 220].forEach((f) => {
        const a = ac!;
        const o = a.createOscillator();
        const fl = a.createBiquadFilter();
        const g = a.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        fl.type = 'lowpass';
        fl.frequency.setValueAtTime(300, t);
        fl.frequency.linearRampToValueAtTime(1400, t + 0.3);
        fl.frequency.linearRampToValueAtTime(400, t + 0.9);
        env(g, t, 0.07 * v, 0.12, 0.8);
        o.connect(fl).connect(g).connect(sfxBus);
        o.start(t);
        o.stop(t + 1);
      });
      break;
    case 'click':
      tone('sine', 1200, 900, t, 0.05 * v, 0.002, 0.03);
      break;
    case 'cheer':
      hiss('bandpass', 1100, 900, 0.6, t, 0.14 * v, 0.18, 1.0);
      hiss('bandpass', 2400, 2000, 1.2, t + 0.05, 0.05 * v, 0.2, 0.8);
      break;
    case 'cheerBig':
      hiss('bandpass', 1000, 800, 0.5, t, 0.26 * v, 0.25, 1.9);
      hiss('bandpass', 2600, 2000, 1.2, t + 0.05, 0.1 * v, 0.3, 1.5);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.11, 0.12 * v, 0.01, 0.5));
      sfx('cheerBig', v);
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, t + i * 0.18, 0.1 * v, 0.01, 0.5));
      break;
  }
}

// ---------- Фон: гул арены и музыка меню ----------

function startCrowd() {
  const a = ac!;
  const s = a.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 650;
  f.Q.value = 0.4;
  crowdGain = a.createGain();
  crowdGain.gain.setValueAtTime(0.0001, a.currentTime);
  crowdGain.gain.exponentialRampToValueAtTime(0.035, a.currentTime + 1.5);
  s.connect(f).connect(crowdGain).connect(musicBus);
  s.start();
  (crowdGain as GainNode & { src?: AudioBufferSourceNode }).src = s;
}

function stopCrowd() {
  if (!crowdGain || !ac) return;
  const g = crowdGain as GainNode & { src?: AudioBufferSourceNode };
  g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.3);
  g.src?.stop(ac.currentTime + 1.5);
  crowdGain = null;
}

// Толпа оживляется на ярких моментах
export function crowdSwell(k: number) {
  if (!crowdGain || !ac) return;
  const t = ac.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
  crowdGain.gain.linearRampToValueAtTime(0.035 + 0.06 * k, t + 0.2);
  crowdGain.gain.linearRampToValueAtTime(0.035, t + 2.2);
}

// Am – F – C – G, мягкие аккорды и перебор
const PROG = [
  [220, 261.6, 329.6],
  [174.6, 220, 261.6],
  [196, 261.6, 329.6],
  [196, 246.9, 293.7],
];
const BAR = 2.4;

function scheduleMusic() {
  if (!ac || mode !== 'menu') return;
  while (nextBar < ac.currentTime + 1) {
    const ch = PROG[bar % PROG.length];
    const t = nextBar;
    for (const f of ch) {
      const o = ac.createOscillator();
      const fl = ac.createBiquadFilter();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      fl.type = 'lowpass';
      fl.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.022, t + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.3);
      o.connect(fl).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + BAR + 0.4);
    }
    // перебор: восемь нот на такт
    const notes = [ch[0] * 2, ch[1] * 2, ch[2] * 2, ch[1] * 2, ch[0] * 4, ch[2] * 2, ch[1] * 2, ch[2] * 2];
    notes.forEach((f, i) => {
      if (bar % 8 >= 6 && i % 2) return;
      tone('sine', f, f, t + (i * BAR) / 8, 0.025, 0.01, 0.4, musicBus);
    });
    tone('sine', ch[0] / 2, ch[0] / 2, t, 0.05, 0.02, 1.2, musicBus);
    nextBar += BAR;
    bar++;
  }
}

export function setAudioMode(next: 'menu' | 'match' | 'off') {
  if (next === mode) return;
  const prev = mode;
  mode = next;
  if (!ac) return;
  if (prev === 'match') stopCrowd();
  clearInterval(musicTimer);
  if (next === 'menu') {
    nextBar = ac.currentTime + 0.1;
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, 400);
  } else if (next === 'match') startCrowd();
}
