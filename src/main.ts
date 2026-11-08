// Экраны игры: штаб, состав, таблица, драфт, расстановка, матч, итоги.
import '@fontsource/russo-one/400.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ABILITY_TEXT, ALL_ROLES, CHAMPIONS, pool, Champion, POS_NAMES, POS_ROLES, Player, Pos, ROLE_NAMES, Role, SIDE_COLORS, TRAIT_INFO, Team, champById, ovr, value } from './data';
import { DraftState, ORDER, PHASE_NAME, aiChoice, apply, assign, done, newDraft, taken } from './draft';
import { BASE_RULES, Note, PATCH_EVERY, RULE_INFO, Rules, fmtRule, heroPower, modOf, priority, tier } from './meta';
import { EMBLEMS, ICON, crest } from './icons';
import { ACHIEVEMENTS, ClubEvent, goalNow, goalText, resolveEvent } from './club';
import {
  ACADEMY_COST, ACADEMY_WEEKLY, Deal, Fixture, LEAGUE_WEEKS, ROSTER_MAX, STAFF_INFO, STAFF_MAX, STAGE_NAMES, Season, Stage, StaffRole,
  TRAINING_NAMES, TRAINING_TEXT, Training, acceptChance, asking, setFocus, canTalk, chemistry, chooseSponsor, dropProspect, finishWeek, hireStaff, FAC_INFO, FAC_MAX, Facility, buildFacility, facCost, facUpkeep, ticketIncome,
  exportSave, hasBackup, loadBackup, parseSave, DIFFICULTY, Difficulty,
  humanFixture, humanTeam, load, matchRecord, matchSetup, negotiate, newSeason, openAcademy, owner, potentialText, release, roster,
  save, saveReplay, sell, sellPrice, signingBonus, sponsorText, staffCost, staffSalary, standings, startNextSeason, swapStarter,
  teamById, totalWeeks, transferFee, upfront, humanSeries, addSeriesGame, BEST_OF, winsNeeded,
} from './league';
import { portrait } from './models';
import { CASTERS, Caster, Line } from './commentary';
import { drawMatch } from './render';
import { audioSettings, setAudioMode, setMusic, setVolume, sfx, unlockAudio } from './audio';
import { juiceOpts, juiceTick, timeScale } from './juice';
import { Rng } from './rng';
import { LANE_NAMES } from './map';
import { COUNTERS, MATCH_TIME, Match, NEUTRAL_NAMES, STRATEGY_TEXT, Strategy, autoStrategy } from './sim';

const app = document.getElementById('app')!;
const saved = load();
let season: Season = saved ?? newSeason();
let cleanup: (() => void) | null = null;
let lastDraft: DraftState | null = null; // драфт текущего матча: для статистики меты

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r1 = (n: number) => Math.round(n);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// keep = перерисовка того же экрана: таймеры экрана не трогаем и не анимируем вход
function swap(html: string, keep = false) {
  if (!keep) {
    cleanup?.();
    cleanup = null;
  }
  app.innerHTML = html;
  document.body.classList.remove('in-match');
  if (!keep) app.firstElementChild?.classList.add('enter');
  setAudioMode('menu');
}

// Звук: включается по первому касанию, щелчок на кнопках
document.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if ((e.target as HTMLElement).closest('button')) sfx('click');
});
juiceOpts.motion = !reduced();

// Вибрация на важных событиях матча: в приложении через Haptics, в браузере через vibrate
let vibeOn = (() => {
  try {
    return localStorage.getItem('arena-vibe') !== 'off';
  } catch {
    return true;
  }
})();
function buzz(level: 0 | 1 | 2) {
  if (!vibeOn) return;
  if (Capacitor.isNativePlatform()) Haptics.impact({ style: [ImpactStyle.Light, ImpactStyle.Medium, ImpactStyle.Heavy][level] }).catch(() => {});
  else navigator.vibrate?.([12, 30, 70][level]);
}

function soundSheet() {
  const a = audioSettings();
  const s = sheet(`<h2>Звук</h2>
    <label class="vol"><span>Громкость</span><input type="range" min="0" max="100" value="${Math.round(a.vol * 100)}" id="vol"><b id="volv">${Math.round(a.vol * 100)}%</b></label>
    <label class="tog"><input type="checkbox" id="mus" ${a.music ? 'checked' : ''}><span>Музыка в меню и гул арены</span></label>
    <label class="tog"><input type="checkbox" id="vib" ${vibeOn ? 'checked' : ''}><span>Вибрация в матче: убийства, башни и победа</span></label>
    <p class="hint">Эффекты ударов, умений и реакции толпы звучат всегда, если громкость не на нуле. Звук выключается, когда игра свёрнута.</p>
    <button class="cta wide" id="ok">Готово</button>`);
  const vol = s.el.querySelector<HTMLInputElement>('#vol')!;
  vol.oninput = () => {
    setVolume(+vol.value / 100);
    s.el.querySelector('#volv')!.textContent = vol.value + '%';
    const b = document.getElementById('snd');
    if (b) b.innerHTML = +vol.value ? ICON.sound(18) : ICON.mute(18);
  };
  vol.onchange = () => sfx('hit');
  s.el.querySelector<HTMLInputElement>('#mus')!.onchange = (e) => setMusic((e.target as HTMLInputElement).checked);
  s.el.querySelector<HTMLInputElement>('#vib')!.onchange = (e) => {
    vibeOn = (e.target as HTMLInputElement).checked;
    try {
      localStorage.setItem('arena-vibe', vibeOn ? 'on' : 'off');
    } catch {
      /* без сохранения */
    }
    if (vibeOn) buzz(1);
  };
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
}

// Подсказки новичку: по одной на экран, пока игрок их не закроет
const TIPS: Record<string, string> = {
  home: 'Матч недели: драфт героев, расстановка и игра. Тренировки идут сами.',
  roster: 'Нажмите на игрока: характеристики, герои, контракт.',
  market: 'Свободные агенты подписываются сразу, игроков клубов надо выкупать.',
  club: 'Деньги, персонал, академия и архив матчей.',
  table: 'Топ-4 после 10 недель играют плей-офф, чемпион едет на Кубок мира.',
  meta: 'Патч каждые 3 недели: популярные герои слабеют, забытые усиливаются.',
};
const tipsSeen = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('arena-tips') || '[]'));
  } catch {
    return new Set<string>();
  }
})();
function tipHtml(id: string) {
  if (!TIPS[id] || tipsSeen.has(id)) return '';
  return `<aside class="tip" data-tip="${id}"><span class="tip-i">?</span><p>${TIPS[id]}</p><button class="tip-x" aria-label="Скрыть подсказку">×</button></aside>`;
}
function bindTips() {
  app.querySelectorAll<HTMLElement>('.tip').forEach((el) => {
    el.querySelector<HTMLButtonElement>('.tip-x')!.onclick = () => {
      tipsSeen.add(el.dataset.tip!);
      try {
        localStorage.setItem('arena-tips', JSON.stringify([...tipsSeen]));
      } catch {
        /* без сохранения */
      }
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    };
  });
}

function shell(active: string, body: string) {
  const me = humanTeam(season);
  const tabs: [string, string, string][] = [
    ['home', 'Штаб', ICON.stage()],
    ['roster', 'Состав', ICON.roster()],
    ['market', 'Рынок', ICON.swap()],
    ['club', 'Клуб', ICON.shield()],
    ['table', 'Таблица', ICON.table()],
    ['meta', 'Мета', ICON.meta()],
  ];
  const when = season.finished ? 'Межсезонье' : season.week <= LEAGUE_WEEKS ? `Неделя ${season.week}/${LEAGUE_WEEKS}` : season.week <= LEAGUE_WEEKS + 2 ? 'Плей-офф' : 'Кубок мира';
  swap(`<div class="screen">
    <header class="top">
      <div class="brand">${crest(me.color, me.tag, 30, me.emblem)}<div class="bn"><span>${esc(me.name)}</span><small>Сезон ${season.seasonNo} · ${when}</small></div></div>
      <div class="meta"><span class="money ${season.money < 0 ? 'neg' : ''}">${ICON.coin(16)}${season.money.toLocaleString('ru')}</span><button class="snd" id="snd" aria-label="Звук">${audioSettings().vol > 0 ? ICON.sound(18) : ICON.mute(18)}</button></div>
    </header>
    <main>${tipHtml(active)}${body}</main>
    <nav class="tabs">${tabs
      .map(([id, label, ic]) => `<button data-tab="${id}" class="${active === id ? 'on' : ''}">${ic}<span>${label}</span></button>`)
      .join('')}</nav></div>`);
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab!)));
  document.getElementById('snd')!.onclick = soundSheet;
  bindTips();
}

function go(tab: string) {
  if (tab === 'roster') return rosterScreen();
  if (tab === 'market') return market();
  if (tab === 'club') return club();
  if (tab === 'table') return table();
  if (tab === 'meta') return metaScreen();
  return home();
}

const record = (t: Team) => {
  const st = standings(season).find((x) => x.team.id === t.id);
  return st ? `${st.wins}–${st.losses}` : 'гость';
};

const on = (sel: string, fn: (el: HTMLElement) => void) => app.querySelectorAll<HTMLElement>(sel).forEach((el) => (el.onclick = () => fn(el)));

// ---------- Всплывающие окна ----------

// Переключатель разделов внутри экрана
const segPrev: Record<string, number> = {};
function segTabs(key: string, cur: string, items: [string, string][]) {
  const i = Math.max(0, items.findIndex(([k]) => k === cur));
  const from = segPrev[key] ?? i;
  segPrev[key] = i;
  return `<div class="segtabs" role="tablist" style="--n:${items.length};--i:${i};--from:${from}"><i class="seg-pill"></i>${items
    .map(([k, l]) => `<button role="tab" class="${k === cur ? 'on' : ''}" aria-selected="${k === cur}" data-${key}="${k}">${l}</button>`)
    .join('')}</div>`;
}
function bindSeg(key: string, fn: (v: string) => void) {
  app.querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach((b) => (b.onclick = () => b.classList.contains('on') || fn(b.getAttribute(`data-${key}`)!)));
}
const CHEV = '<svg class="ico chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

function sheet(html: string, onClose?: () => void) {
  app.querySelector('.overlay')?.remove();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="sheet"><button class="x" aria-label="Закрыть">×</button>${html}</div>`;
  app.appendChild(o);
  const close = () => {
    o.remove();
    onClose?.();
  };
  o.querySelector<HTMLButtonElement>('.x')!.onclick = close;
  o.onclick = (e) => e.target === o && close();
  return { el: o, close };
}

function toast(text: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Карточка игрока ----------

const findPlayer = (id: string) => {
  for (const t of season.teams) for (const p of roster(t)) if (p.id === id) return p;
  return season.market.find((p) => p.id === id) ?? season.academy.find((p) => p.id === id)!;
};

const mood = (p: Player) => (p.morale >= 75 ? 'довольный' : p.morale >= 45 ? 'спокойный' : 'недовольный');

const POS_SHORT = ['ВЕРХ', 'ЦЕНТР', 'СТРЕЛ', 'ЛЕС', 'ПОДД'];
const ovrTier = (v: number) => (v >= 70 ? 3 : v >= 60 ? 2 : v >= 50 ? 1 : 0);

function playerRow(p: Player, right = '', cls = '') {
  return `<button class="prow ${cls}" data-p="${p.id}">
    <span class="ovr t${ovrTier(ovr(p))}"><b>${r1(ovr(p))}</b><small>${POS_SHORT[p.pos]}</small></span>
    <div class="pmain"><b>${esc(p.nick)}</b><small>${p.age} лет${p.trait ? ` · ${TRAIT_INFO[p.trait].name.toLowerCase()}` : ''}${p.fatigue > 60 ? ' · <i class="warn">устал</i>' : ''}${p.morale < 40 ? ' · <i class="warn">недоволен</i>' : ''}</small></div>
    <div class="favs">${p.favs.map((id) => img(champById(id), 'xs')).join('')}</div>
    ${right}</button>`;
}

function playerInfo(p: Player) {
  const t = owner(season, p);
  const o = ovr(p);
  const big = (label: string, v: number) => `<div class="pst"><small>${label}</small><b>${r1(v)}</b><i><u style="--v:${v}%"></u></i></div>`;
  const meter = (label: string, v: number, bad: boolean) => `<div class="pmeter ${bad ? 'bad' : ''}"><small>${label}</small><i><u style="--v:${v}%"></u></i></div>`;
  return `<div class="pcard">
    <div class="phead">
      <span class="ovr big t${ovrTier(o)}"><b>${r1(o)}</b><small>${POS_SHORT[p.pos]}</small></span>
      <div><b class="pnick">${esc(p.nick)}</b><span class="dim small">${POS_NAMES[p.pos]} · ${p.age} лет · ${t ? esc(t.tag) : season.academy.includes(p) ? 'академия' : 'свободный агент'}</span>
      <span class="dim small">потенциал ${potentialText(season, p)} · стоимость ${value(p).toLocaleString('ru')}</span></div>
    </div>
    ${p.trait ? `<div class="trait"><b>${TRAIT_INFO[p.trait].name}</b><span>${TRAIT_INFO[p.trait].text}</span></div>` : ''}
    <div class="pstats">${big('Атака', p.atk)}${big('Защита', p.def)}${big('Тактика', p.iq)}</div>
    <div class="pmeters">${meter('Форма', p.form, p.form < 60)}${meter('Настроение', p.morale, p.morale < 40)}${meter('Усталость', p.fatigue, p.fatigue > 60)}</div>
    <div class="pfavs">${p.favs.map((id) => `<span>${img(champById(id), 'sm')}<small>${champById(id).name}</small></span>`).join('')}
      <div class="roles">${[...ALL_ROLES].sort((a, b) => p.pool[b] - p.pool[a]).slice(0, 3).map((r) => `<span class="chip">${ROLE_NAMES[r]} ${p.pool[r]}</span>`).join('')}</div></div>
    ${t || season.academy.includes(p) ? `<div class="dim small">Зарплата ${p.salary} в неделю${t?.human ? ` · контракт ещё ${Math.max(0, p.contract)} сез. · ${mood(p)}` : ''}</div>` : ''}
  </div>`;
}

// Переговоры о зарплате и сроке контракта
function talk(p: Player, deal: Deal, back: () => void) {
  const ask = asking(season, p, deal);
  let offer = ask;
  let years = 2;
  const cost = upfront(p, deal);
  const title = { sign: 'Подписать свободного агента', buy: 'Купить игрока', renew: 'Продлить контракт', promote: 'Перевести из академии' }[deal];
  const render = () => {
    const ch = acceptChance(season, p, offer, deal);
    const steps = [0.8, 0.9, 1, 1.1].map((k) => Math.round((ask * k) / 10) * 10);
    s.el.querySelector('.sheet')!.innerHTML = `<button class="x" aria-label="Закрыть">×</button>
      <h2 class="sm">${title}</h2>${playerInfo(p)}
      ${canTalk(season, p) ? `
      <div class="talk">
        <div class="dim small">Просит ${ask} в неделю${cost ? ` · ${deal === 'buy' ? 'трансфер' : 'подъёмные'} ${cost.toLocaleString('ru')} сразу` : ''}</div>
        <h3>Зарплата в неделю</h3>
        <div class="seg">${steps.map((v) => `<button class="chip ${offer === v ? 'on' : ''}" data-o="${v}">${v}</button>`).join('')}</div>
        <h3>Срок контракта</h3>
        <div class="seg">${[1, 2, 3].map((y) => `<button class="chip ${years === y ? 'on' : ''}" data-y="${y}">${y} сез.</button>`).join('')}</div>
        <div class="chance"><i style="--v:${Math.round(ch * 100)}%"></i><span>Шанс согласия ${Math.round(ch * 100)}%</span></div>
        <button class="cta wide" id="offer">Предложить</button>
      </div>` : `<p class="warn">${esc(p.nick)} пока не хочет разговаривать. Попробуйте на следующей неделе.</p>`}`;
    s.el.querySelector<HTMLButtonElement>('.x')!.onclick = s.close;
    s.el.querySelectorAll<HTMLButtonElement>('[data-o]').forEach((b) => (b.onclick = () => ((offer = +b.dataset.o!), render())));
    s.el.querySelectorAll<HTMLButtonElement>('[data-y]').forEach((b) => (b.onclick = () => ((years = +b.dataset.y!), render())));
    const ob = s.el.querySelector<HTMLButtonElement>('#offer');
    if (ob)
      ob.onclick = () => {
        const r = negotiate(season, p, offer, years, deal);
        toast(r.text);
        if (r.ok) s.close();
        else render();
      };
  };
  const s = sheet('', back);
  render();
}

// ---------- Штаб ----------

const TRAIN_ICON: Record<Training, string> = { mix: ICON.star(22), atk: ICON.sword(22), def: ICON.shield(22), iq: ICON.brain(22), rest: ICON.rest(22) };

// План тренировок: выбирается один раз и работает каждую неделю
function trainingBlock() {
  return `<section class="block" id="plan">
      <div class="row"><h3>Тренировки</h3><span class="dim small">каждую неделю сами</span></div>
      <div class="trains">${(Object.keys(TRAINING_NAMES) as Training[])
        .map((t) => `<button class="tchip ${season.focus === t ? 'on' : ''}" data-train="${t}" aria-pressed="${season.focus === t}">${TRAIN_ICON[t]}<span>${TRAINING_SHORT[t]}</span></button>`)
        .join('')}</div>
      <p class="dim small tdesc">${TRAINING_TEXT[season.focus]}</p>
    </section>`;
}
const TRAINING_SHORT: Record<Training, string> = { mix: 'Баланс', atk: 'Атака', def: 'Защита', iq: 'Тактика', rest: 'Отдых' };

function offseason() {
  const me = humanTeam(season);
  const h = season.history[0];
  const exp = roster(me).filter((p) => season.expiring.includes(p.id));
  shell('home', `
    <section class="marquee"><div class="when">Сезон ${h.season} окончен</div><p class="big">${h.place}-е место</p>
      ${h.titles.length ? `<div class="trophies">${h.titles.map((t) => `<span>${ICON.star(16)} ${esc(t)}</span>`).join('')}</div>` : ''}
      <button class="cta" id="next">Начать сезон ${season.seasonNo + 1}</button></section>
    <section class="block"><h3>Межсезонье</h3><p class="dim small">Игроки стали на год старше: молодые выросли, ветераны начали сдавать. Сейчас лучшее время для трансферов.</p>
      ${exp.length ? `<h3>Истекают контракты</h3><p class="dim small">Если не продлить, игрок уйдёт в начале сезона.</p>${exp.map((p) => playerRow(p, `<em class="warn">продлить</em>`)).join('')}` : '<p class="dim small">Все контракты в порядке.</p>'}
    </section>
    ${logCard()}`);
  on('[data-p]', (el) => talk(findPlayer(el.dataset.p!), 'renew', offseason));
  document.getElementById('next')!.onclick = () => {
    startNextSeason(season);
    home();
  };
}

function home() {
  if (season.finished) return offseason();
  const me = humanTeam(season);
  const fx = humanFixture(season);
  const sponsorNote = !season.sponsor
    ? `<button class="block patch-card fresh" id="sp"><div class="pc-top">${ICON.coin(18)}<b>Выберите спонсора</b></div><span class="dim small">Без спонсора клуб теряет доход каждую неделю</span></button>`
    : '';
  let top: string;
  if (fx) {
    const opp = teamById(season, fx.home === me.id ? fx.away : fx.home);
    const ser = humanSeries(season)!;
    const [my, their] = fx.home === me.id ? ser.score : [ser.score[1], ser.score[0]];
    top = `<section class="marquee">
      <div class="when">${season.week <= LEAGUE_WEEKS ? `Неделя ${season.week}` : 'Решающий матч'} · ${STAGE_NAMES[fx.stage]}${ser.bestOf > 1 ? ` · bo${ser.bestOf}` : ''}</div>
      <div class="vs">
        <div class="side">${crest(me.color, me.tag, 64, me.emblem)}<b>${esc(me.tag)}</b><small>${record(me)}</small></div>
        ${ser.games.length ? `<span class="v ser">${my}:${their}</span>` : '<span class="v">VS</span>'}
        <div class="side">${crest(opp.color, opp.tag, 64, opp.emblem)}<b>${esc(opp.tag)}</b><small>${record(opp)}</small></div>
      </div>
      <div class="opp">${esc(opp.name)}${opp.foreign ? ' · зарубежный клуб' : ''}</div>
      ${ser.bestOf > 1 ? `<div class="dim small">Серия до ${ser.need} побед${ser.games.length ? ` · дальше игра ${ser.next}` : ''}</div>` : ''}
      <button class="cta" id="play">${ser.games.length ? `Игра ${ser.next}: драфт` : 'На драфт'}</button>
    </section>`;
  } else {
    top = `<section class="marquee"><div class="when">${season.week <= LEAGUE_WEEKS + 2 ? 'Плей-офф' : 'Кубок мира'}</div>
      <p>Ваша команда на этой неделе не играет. Можно заняться трансферами и посмотреть матчи других.</p>
      <button class="cta" id="skipweek">Завершить неделю</button></section>`;
  }
  // Короткая сводка: место, форма, доверие владельца
  const place = standings(season).findIndex((x) => x.team.human) + 1;
  const form = season.fixtures
    .filter((f) => f.result && (f.home === me.id || f.away === me.id))
    .slice(-5)
    .map((f) => `<i class="${f.result!.winner === me.id ? 'w' : 'l'}"></i>`)
    .join('');
  const strip = `<div class="strip">
    <div><small>Место</small><b>${form ? place : '—'}<em>/${standings(season).length}</em></b></div>
    <div><small>Форма</small><span class="form">${form || '<em>—</em>'}</span></div>
    <div><small>Доверие</small><b>${season.trust}<em>%</em></b></div></div>`;
  const goalsDone = season.goals.filter((g) => goalNow(season, g).ok).length;
  const p = season.meta.patch;
  const n = nextPatchIn();
  const rows = [
    !season.sponsor ? `<button class="qrow hot" id="sp">${ICON.coin(18)}<b>Выберите спонсора</b><span>нет дохода</span>${CHEV}</button>` : '',
    season.goals.length ? `<button class="qrow" id="goals">${ICON.table(18)}<b>Цели владельца</b><span>в норме ${goalsDone} из ${season.goals.length}</span>${CHEV}</button>` : '',
    `<button class="qrow ${season.unseenPatch ? 'hot' : ''}" id="patch">${ICON.meta(18)}<b>${season.unseenPatch ? 'Новый патч ' : 'Патч '}${p.ver}</b><span>${n ? `след. через ${n} нед.` : 'последний'}</span>${CHEV}</button>`,
    `<button class="qrow" id="focus">${TRAIN_ICON[season.focus].replace('width="22" height="22"', 'width="18" height="18"')}<b>Тренировки</b><span>${TRAINING_SHORT[season.focus]}</span>${CHEV}</button>`,
  ].join('');
  shell('home', `${eventsHtml()}${top}${strip}<div class="qlist">${rows}</div>${logCard()}`);
  bindEvents();
  showNewAch();
  showNewHeroes();
  const gl = document.getElementById('goals');
  if (gl) gl.onclick = () => goalsSheet();
  document.getElementById('focus')!.onclick = () => rosterScreen();
  const play = document.getElementById('play');
  if (play) play.onclick = () => draft();
  const sk = document.getElementById('skipweek');
  if (sk)
    sk.onclick = () => weekDone(() => finishWeek(season));
  const sp = document.getElementById('sp');
  if (sp) sp.onclick = () => club();
  document.getElementById('patch')!.onclick = () => {
    metaTab = 'patch';
    metaScreen();
  };
}

// ---------- События клуба, цели и достижения ----------

function eventsHtml() {
  if (!season.events.length) return '';
  return season.events
    .map(
      (e: ClubEvent) => `<section class="block event ${e.kind}" data-ev="${e.id}">
      <div class="ev-top">${e.kind === 'press' ? ICON.meta(18) : ICON.star(18)}<b>${e.title}</b></div>
      <p>${esc(e.text)}</p>
      <div class="ev-ch">${e.choices.map((c, i) => `<button class="ev-b" data-i="${i}"><b>${esc(c.label)}</b><small>${esc(c.hint)}</small></button>`).join('')}</div>
    </section>`,
    )
    .join('');
}

function bindEvents() {
  app.querySelectorAll<HTMLElement>('[data-ev]').forEach((el) =>
    el.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(
      (b) =>
        (b.onclick = () => {
          const txt = resolveEvent(season, el.dataset.ev!, +b.dataset.i!);
          save(season);
          if (txt) toast(txt);
          home();
        }),
    ),
  );
}

function goalsSheet() {
  const s = sheet(`<h2>Цели владельца</h2><p class="dim">За каждую выполненную цель в конце сезона премия и рост доверия.</p>
    ${season.goals.map((x) => {
      const st = goalNow(season, x);
      return `<div class="goal ${st.ok ? 'ok' : ''}"><i>${st.ok ? '✓' : '○'}</i><span>${goalText(x)}<small>${st.now} · премия ${x.reward.toLocaleString('ru')}</small></span></div>`;
    }).join('')}
    <div class="trust"><span class="dim small">Доверие ${season.trust}%</span><i style="--k:${season.trust / 100}"></i></div>
    <button class="chip" id="ach2">${ICON.star(14)} Достижения ${season.achievements.length} из ${ACHIEVEMENTS.length}</button>
    <button class="cta wide" id="ok">Понятно</button>`);
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
  s.el.querySelector<HTMLButtonElement>('#ach2')!.onclick = achSheet;
}

function achSheet() {
  const s = sheet(`<h2>Достижения</h2><div class="achs">${ACHIEVEMENTS.map((a) => {
    const got = season.achievements.includes(a.id);
    return `<div class="ach ${got ? 'got' : ''}"><i>${got ? ICON.star(18) : '?'}</i><div><b>${a.name}</b><small>${a.text}</small></div></div>`;
  }).join('')}</div><button class="cta wide" id="ok">Закрыть</button>`);
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
}

// Большой патч: представляем новых героев
function showNewHeroes() {
  if (!season.newHeroes?.length || app.querySelector('.overlay')) return;
  const ids = season.newHeroes;
  season.newHeroes = [];
  save(season);
  const s = sheet(`<div class="nh"><div class="nh-k">Большой патч ${season.meta.patch.ver}</div><h2>Новые герои</h2>
    ${ids.map((id, i) => {
      const c = champById(id);
      return `<div class="nh-card" style="--d:${i * 120}ms">${img(c)}<div><b>${c.name}</b><small class="nh-role">${c.title} · ${ROLE_NAMES[c.role]}</small><small>${ABILITY_TEXT[c.ab]}</small></div></div>`;
    }).join('')}
    <p class="dim small">Герои уже доступны в драфте и в мете.</p>
    <button class="cta wide" id="ok">Отлично</button></div>`);
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
}

function showNewAch() {
  if (!season.newAch.length) return;
  const ids = season.newAch;
  season.newAch = [];
  save(season);
  ids.forEach((id, i) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) setTimeout(() => {
      toast(`Достижение: «${a.name}»`);
      sfx('level');
    }, 400 + i * 2800);
  });
}

// ---------- Новая игра: свой клуб ----------

const CLUB_COLORS = ['#4f9dff', '#ff5d5d', '#3fd99a', '#ffb84d', '#b07bff', '#ff7ac8', '#5fe0e6', '#e8e4da'];

function newGame(canCancel: boolean) {
  const st = { name: 'Мой клуб', tag: 'МКЛ', color: CLUB_COLORS[0], emblem: 1, difficulty: 'normal' as Difficulty, tutorial: !canCancel, tagTouched: false };
  const autoTag = (n: string) => {
    const w = n.trim().split(/\s+/).filter(Boolean);
    const t = w.length >= 3 ? w.map((x) => x[0]).join('') : w.length === 2 ? w[0].slice(0, 2) + w[1][0] : (w[0] ?? 'КЛБ').slice(0, 3);
    return t.toUpperCase().slice(0, 3);
  };
  const draw = () => {
    swap(`<div class="screen newgame"><main>
      <h1>Новый клуб</h1>
      <div class="ng-preview">${crest(st.color, st.tag || '?', 72, st.emblem)}<div><b>${esc(st.name || 'Без названия')}</b><span>${esc(st.tag)}</span></div></div>
      <label class="fld"><span>Название</span><input id="nm" maxlength="22" value="${esc(st.name)}" autocomplete="off"></label>
      <label class="fld"><span>Тег, 3 буквы</span><input id="tg" maxlength="3" value="${esc(st.tag)}" autocomplete="off"></label>
      <div class="fld"><span>Цвет</span><div class="swatches">${CLUB_COLORS.map((c) => `<button class="sw ${c === st.color ? 'on' : ''}" data-col="${c}" style="--c:${c}" aria-label="Цвет"></button>`).join('')}</div></div>
      <div class="fld"><span>Эмблема</span><div class="emblems">${EMBLEMS.map((_, i) => `<button class="em ${i === st.emblem ? 'on' : ''}" data-em="${i}" aria-label="Эмблема ${i + 1}">${crest(st.color, st.tag || '?', 40, i)}</button>`).join('')}</div></div>
      <div class="fld"><span>Сложность</span><div class="diffs">${(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => `<button class="diff ${d === st.difficulty ? 'on' : ''}" data-d="${d}"><b>${DIFFICULTY[d].name}</b><small>${DIFFICULTY[d].text}</small></button>`).join('')}</div></div>
      <label class="tog"><input type="checkbox" id="tut" ${st.tutorial ? 'checked' : ''}><span>Обучение в первом матче: подсказки в драфте и больше времени на ход</span></label>
      <button class="cta wide" id="start">Основать клуб</button>
      ${canCancel ? '<button class="chip wide" id="cancel">Отмена</button>' : ''}
    </main></div>`);
    const nm = document.getElementById('nm') as HTMLInputElement;
    const tg = document.getElementById('tg') as HTMLInputElement;
    const preview = () => {
      app.querySelector('.ng-preview')!.innerHTML = `${crest(st.color, st.tag || '?', 72, st.emblem)}<div><b>${esc(st.name || 'Без названия')}</b><span>${esc(st.tag)}</span></div>`;
    };
    nm.oninput = () => {
      st.name = nm.value;
      if (!st.tagTouched) tg.value = st.tag = autoTag(nm.value);
      preview();
    };
    tg.oninput = () => {
      st.tagTouched = true;
      st.tag = tg.value.toUpperCase();
      preview();
    };
    on('[data-col]', (b) => ((st.color = b.dataset.col!), draw()));
    on('[data-em]', (b) => ((st.emblem = +b.dataset.em!), draw()));
    on('[data-d]', (b) => ((st.difficulty = b.dataset.d as Difficulty), draw()));
    (document.getElementById('tut') as HTMLInputElement).onchange = (e) => (st.tutorial = (e.target as HTMLInputElement).checked);
    document.getElementById('start')!.onclick = () => {
      const name = st.name.trim();
      const tag = st.tag.trim();
      if (name.length < 2) return toast('Название слишком короткое');
      if (tag.length < 2) return toast('Тег: 2–3 буквы');
      season = newSeason(Date.now() % 1e9, { name, tag, color: st.color, emblem: st.emblem, difficulty: st.difficulty, tutorial: st.tutorial });
      save(season);
      home();
    };
    const c = document.getElementById('cancel');
    if (c) c.onclick = () => club();
  };
  draw();
}

// Через сколько недель следующий патч (null — в этом сезоне больше не будет)
function nextPatchIn() {
  const w = season.week + (PATCH_EVERY - ((season.week - 1) % PATCH_EVERY));
  return w > totalWeeks(season) ? null : w - season.week;
}

function logCard() {
  return `<section class="block news"><h3>Новости</h3><ul class="log">${season.log
    .slice(0, 4)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('')}</ul></section>`;
}

// ---------- Состав ----------

function statBar(label: string, v: number) {
  return `<div class="stat"><span>${label}</span><i><b style="--v:${v}%"></b></i><em>${r1(v)}</em></div>`;
}

function rosterScreen() {
  const me = humanTeam(season);
  const chem = chemistry(me);
  const wage = roster(me).reduce((a, p) => a + p.salary, 0);
  shell('roster', `
    <section class="block">
      <div class="row"><h3>Стартовая пятёрка</h3><span class="dim small">сыгранность ${Math.round(chem * 100)}%</span></div>
      <div class="chem"><i style="--v:${Math.round(chem * 100)}%"></i></div>
      ${me.players.map((p) => playerRow(p, p.contract <= 1 ? '<em class="badge">1 сезон</em>' : '')).join('')}
    </section>
    <section class="block">
      <div class="row"><h3>Запас</h3><span class="dim small">${roster(me).length}/${ROSTER_MAX} игроков</span></div>
      ${me.bench.length ? me.bench.map((p) => playerRow(p)).join('') : '<p class="dim small">Запасных нет. Игроков можно купить на рынке или перевести из академии.</p>'}
    </section>
    ${trainingBlock()}
    <p class="dim small center">Зарплаты состава: ${wage} в неделю</p>`);
  on('[data-p]', (el) => playerSheet(findPlayer(el.dataset.p!)));
  on('[data-train]', (b) => {
    setFocus(season, b.dataset.train as Training);
    rosterScreen();
  });
}

function playerSheet(p: Player) {
  const me = humanTeam(season);
  const starter = me.players.includes(p);
  const swapWith = starter ? me.bench : me.players;
  const s = sheet(`${playerInfo(p)}
    <div class="acts">
      ${swapWith.length ? `<h3>${starter ? 'Посадить в запас вместо' : 'Выпустить в составе вместо'}</h3>
        ${swapWith.map((q) => `<button class="chip" data-sw="${q.id}">${POS_NAMES[q.pos]} · ${esc(q.nick)}</button>`).join(' ')}` : ''}
      <div class="acts-row">
        ${p.contract <= 1 ? '<button class="opt sm" id="renew">Продлить контракт</button>' : ''}
        <button class="opt sm" id="sell">Продать за ${sellPrice(p).toLocaleString('ru')}</button>
        <button class="opt sm" id="rel">Расторгнуть (неустойка ${(p.salary * 4).toLocaleString('ru')})</button>
      </div>
    </div>`, rosterScreen);
  s.el.querySelectorAll<HTMLButtonElement>('[data-sw]').forEach(
    (b) =>
      (b.onclick = () => {
        const q = findPlayer(b.dataset.sw!);
        if (starter) swapStarter(season, p, q);
        else swapStarter(season, q, p);
        s.close();
      }),
  );
  const rn = s.el.querySelector<HTMLButtonElement>('#renew');
  if (rn) rn.onclick = () => talk(p, 'renew', rosterScreen);
  s.el.querySelector<HTMLButtonElement>('#sell')!.onclick = () => {
    toast(sell(season, p));
    s.close();
  };
  s.el.querySelector<HTMLButtonElement>('#rel')!.onclick = () => {
    toast(release(season, p));
    s.close();
  };
}

// ---------- Рынок ----------

let marketTab: 'free' | 'clubs' = 'free';
let marketPos: Pos | -1 = -1;

function market() {
  const me = humanTeam(season);
  const list =
    marketTab === 'free'
      ? season.market
      : season.teams.filter((t) => !t.human && !t.foreign).flatMap((t) => t.players);
  const shown = list.filter((p) => marketPos === -1 || p.pos === marketPos).sort((a, b) => ovr(b) - ovr(a));
  shell('market', `
    ${segTabs('mt', marketTab, [
      ['free', 'Свободные'],
      ['clubs', 'Из клубов'],
    ])}
    <div class="chipscroll">${[-1, 0, 1, 2, 3, 4].map((i) => `<button class="chip ${marketPos === i ? 'on' : ''}" data-mp="${i}">${i < 0 ? 'Все' : POS_NAMES[i]}</button>`).join('')}</div>
    <p class="dim small mnote">${marketTab === 'free' ? 'Цена = подъёмные при подписании, список новый каждую неделю.' : 'Цена = трансфер, клуб отпустит игрока за эту сумму.'} В составе ${roster(me).length}/${ROSTER_MAX}.</p>
    <section class="block">${shown
      .map((p) => {
        const t = owner(season, p);
        const price = marketTab === 'free' ? signingBonus(p) : transferFee(p);
        return playerRow(p, `<em class="price">${t ? `<small>${esc(t.tag)}</small>` : ''}${price.toLocaleString('ru')}</em>`);
      })
      .join('') || '<p class="dim small">Никого нет.</p>'}</section>`);
  bindSeg('mt', (v) => ((marketTab = v as 'free' | 'clubs'), market()));
  on('[data-mp]', (b) => ((marketPos = +b.dataset.mp! as Pos | -1), market()));
  on('[data-p]', (el) => {
    const p = findPlayer(el.dataset.p!);
    talk(p, owner(season, p) ? 'buy' : 'sign', market);
  });
}

// ---------- Клуб: спонсоры, персонал, академия, повторы, история ----------

let clubTab: 'money' | 'staff' | 'academy' | 'archive' = 'money';

function club() {
  const sp = season.sponsor;
  const staff = (Object.keys(STAFF_INFO) as StaffRole[])
    .map((r) => {
      const l = season.staff[r];
      return `<div class="staff">
        <div><b>${STAFF_INFO[r].name}</b><small>${l ? `уровень ${l} · ${staffSalary(l)} в неделю` : 'не нанят'}</small>
        <ul>${STAFF_INFO[r].text.map((t) => `<li>${t}</li>`).join('')}</ul></div>
        ${l < STAFF_MAX ? `<button class="chip on" data-hire="${r}">${l ? 'Повысить' : 'Нанять'} · ${staffCost(l + 1).toLocaleString('ru')}</button>` : '<span class="dim small">максимум</span>'}
      </div>`;
    })
    .join('');
  const facs = (Object.keys(FAC_INFO) as Facility[])
    .map((f) => {
      const l = season.fac[f];
      return `<div class="staff fac">
        <div><b>${FAC_INFO[f].name} <span class="lv">${'●'.repeat(l)}${'○'.repeat(FAC_MAX - l)}</span></b><small>${l ? `уровень ${l} · содержание ${facUpkeep(l)} в неделю` : 'не построено'}</small>
        <ul><li>${FAC_INFO[f].text}</li></ul></div>
        ${l < FAC_MAX ? `<button class="chip on" data-fac="${f}">${l ? 'Улучшить' : 'Построить'} · ${facCost(l + 1).toLocaleString('ru')}</button>` : '<span class="dim small">максимум</span>'}
      </div>`;
    })
    .join('');
  const acad = !season.academyOpen
    ? `<p class="dim small">Академия растит молодых игроков 15–17 лет с высоким потенциалом. Каждый сезон приходят новые. Открытие ${ACADEMY_COST.toLocaleString('ru')}, содержание ${ACADEMY_WEEKLY} в неделю.</p>
       <button class="cta wide" id="acad">Открыть академию</button>`
    : season.academy.length
      ? season.academy.map((p) => playerRow(p, `<em class="dim small">потенциал ${potentialText(season, p)}</em>`)).join('')
      : '<p class="dim small">Пока пусто: новые таланты придут в начале сезона.</p>';
  const tabs = segTabs('ct', clubTab, [
    ['money', 'Деньги'],
    ['staff', 'Персонал'],
    ['academy', 'Академия'],
    ['archive', 'Архив'],
  ]);
  const body: Record<typeof clubTab, string> = {
    money: `<section class="block"><h3>Болельщики</h3>
      <div class="big-num">${season.fans.toLocaleString('ru')}<small>болельщиков · билеты ${ticketIncome(season).toLocaleString('ru')} за неделю с матчем</small></div></section>
      <section class="block"><h3>Спонсор сезона</h3>
      ${sp
        ? `<div class="sponsor on"><b>${esc(sp.name)}</b><small>${sponsorText(sp)}</small></div>`
        : `<p class="warn small">Выберите одного спонсора на весь сезон:</p>${season.offers.map((o) => `<button class="sponsor" data-sp="${o.id}"><b>${esc(o.name)}</b><small>${sponsorText(o)}</small></button>`).join('')}`}
      </section>
      <section class="block"><h3>База клуба</h3>${facs}</section>`,
    staff: `<section class="block">${staff}</section>`,
    academy: `<section class="block">${acad}</section>`,
    archive: `<section class="block"><h3>Повторы матчей</h3>${season.replays.length
      ? season.replays.map((r) => `<button class="prow" data-r="${r.id}"><span class="posl">${ICON.play(14)}</span><div class="pmain"><b>${esc(r.label)}</b></div></button>`).join('')
      : '<p class="dim small">Здесь появятся ваши последние матчи.</p>'}</section>
    <button class="qrow" id="achs">${ICON.star(18)}<b>Достижения</b><span>${season.achievements.length} из ${ACHIEVEMENTS.length}</span>${CHEV}</button>
    <section class="block"><h3>История клуба</h3>${season.history.length
      ? season.history.map((h) => `<div class="row"><span>Сезон ${h.season}</span><span>${h.place}-е место${h.titles.length ? ' · ' + h.titles.length + ' ' + ICON.star(14) : ''}</span></div>`).join('')
      : '<p class="dim small">Первый сезон клуба ещё идёт.</p>'}</section>
    <section class="block"><h3>Сохранение</h3>
      <p class="dim small">Игра сохраняется сама. Файл нужен, чтобы перенести клуб на другое устройство.</p>
      <div class="acts-row"><button class="chip on" id="exp">${ICON.save(16)}Сохранить в файл</button><button class="chip" id="imp">Загрузить из файла</button></div>
      ${hasBackup() ? '<button class="chip" id="bak">Вернуть начало прошлой недели</button>' : ''}
      <button class="chip" id="newg">Начать новую игру</button>
      <input type="file" id="impf" accept=".json,application/json" hidden>
    </section>`,
  };
  shell('club', tabs + `<div class="pane">${body[clubTab]}</div>`);
  bindSeg('ct', (v) => {
    clubTab = v as typeof clubTab;
    club();
  });
  on('[data-sp]', (b) => {
    chooseSponsor(season, season.offers.find((o) => o.id === b.dataset.sp)!);
    club();
  });
  on('[data-fac]', (b) => {
    const err = buildFacility(season, b.dataset.fac as Facility);
    toast(err || 'Построено');
    club();
  });
  on('[data-hire]', (b) => {
    const err = hireStaff(season, b.dataset.hire as StaffRole);
    if (err) toast(err);
    club();
  });
  const ac = document.getElementById('acad');
  if (ac)
    ac.onclick = () => {
      const err = openAcademy(season);
      if (err) toast(err);
      club();
    };
  on('[data-p]', (el) => prospectSheet(findPlayer(el.dataset.p!)));
  if (clubTab !== 'archive') return;
  saveControls();
  document.getElementById('achs')!.onclick = achSheet;
  document.getElementById('newg')!.onclick = () => {
    const c = sheet(`<h2>Начать заново?</h2><p class="dim">Текущий клуб будет удалён. Если хотите вернуться к нему позже, сначала сохраните его в файл.</p><button class="cta wide" id="yes">Создать новый клуб</button>`);
    c.el.querySelector<HTMLButtonElement>('#yes')!.onclick = () => {
      c.close();
      newGame(true);
    };
  };
  on('[data-r]', (el) => {
    const r = season.replays.find((x) => x.id === el.dataset.r)!;
    playMatch(new Match(JSON.parse(JSON.stringify(r.setup))), 'replay');
  });
}

// Экспорт и загрузка сохранения
function saveControls() {
  const replace = (s: typeof season, msg: string) => {
    const c = sheet(`<h2>Заменить текущую игру?</h2><p class="dim">${msg}</p><button class="cta wide" id="yes">Заменить</button>`);
    c.el.querySelector<HTMLButtonElement>('#yes')!.onclick = () => {
      season = s;
      save(season);
      c.close();
      toast('Сохранение загружено');
      home();
    };
  };
  document.getElementById('exp')!.onclick = async () => {
    const text = exportSave(season);
    const name = `arena-manager-s${season.seasonNo}-w${season.week}.json`;
    // В просмотрщике Claude файл отдаётся через его окно сохранения
    const cl = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    if (cl?.use) {
      const dl = (await cl.use('downloads')) as { save: (r: { filename: string; data: string }) => Promise<unknown> } | null;
      if (dl) {
        try {
          await dl.save({ filename: name, data: text });
          toast('Файл сохранения готов');
        } catch (e) {
          if ((e as { code?: string }).code !== 'declined') toast('Не получилось сохранить файл здесь');
        }
        return;
      }
    }
    // В приложении для Android: пишем файл в кэш и открываем меню «Поделиться» (Диск, Telegram, Файлы)
    if (Capacitor.isNativePlatform()) {
      try {
        const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: 'Сохранение Арена Менеджер', files: [uri], dialogTitle: 'Куда сохранить клуб?' });
      } catch (e) {
        if (!/cancel/i.test(String((e as Error)?.message ?? e))) toast('Не получилось сохранить файл');
      }
      return;
    }
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Сохранение Арена Менеджер' });
        return;
      }
    } catch {
      /* отменили или не поддерживается: скачиваем */
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Файл сохранения скачан');
  };
  const input = document.getElementById('impf') as HTMLInputElement;
  document.getElementById('imp')!.onclick = () => input.click();
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const s = parseSave(await f.text());
    input.value = '';
    if (!s) return toast('Не получилось прочитать файл: это не сохранение игры или оно от более новой версии');
    const me = s.teams.find((t) => t.human)!;
    replace(s, `В файле: ${esc(me.name)}, сезон ${s.seasonNo}, неделя ${s.week}. Текущий прогресс будет заменён.`);
  };
  const bak = document.getElementById('bak');
  if (bak)
    bak.onclick = () => {
      const s = loadBackup();
      if (!s) return toast('Резервная копия повреждена');
      replace(s, `Игра вернётся к сезону ${s.seasonNo}, неделе ${s.week}. Всё, что было после, пропадёт.`);
    };
}

function prospectSheet(p: Player) {
  const s = sheet(`${playerInfo(p)}<div class="acts-row">
    <button class="opt sm" id="promo">Перевести в основу</button><button class="opt sm" id="drop">Отчислить</button></div>`, club);
  s.el.querySelector<HTMLButtonElement>('#promo')!.onclick = () => talk(p, 'promote', club);
  s.el.querySelector<HTMLButtonElement>('#drop')!.onclick = () => {
    dropProspect(season, p);
    s.close();
  };
}

// ---------- Таблица и сетка ----------

let tableTab: 'table' | 'bracket' | 'cal' = 'table';

// Календарь сезона: все недели, соперники, результаты, патчи и плей-офф
function calendarHtml() {
  const me = humanTeam(season);
  const total = totalWeeks(season);
  const STAGE_SHORT: Record<Stage, string> = { league: 'Лига', semi: 'Полуфинал плей-офф', final: 'Финал лиги', 'intl-semi': 'Кубок мира · полуфинал', 'intl-final': 'Кубок мира · финал' };
  const stageOfWeek = (w: number): Stage => (w <= LEAGUE_WEEKS ? 'league' : w === LEAGUE_WEEKS + 1 ? 'semi' : w === LEAGUE_WEEKS + 2 ? 'final' : w === LEAGUE_WEEKS + 3 ? 'intl-semi' : 'intl-final');
  const played = season.fixtures.filter((f) => f.result && (f.home === me.id || f.away === me.id));
  const wins = played.filter((f) => f.result!.winner === me.id).length;
  const items: string[] = [];
  for (let w = 1; w <= total; w++) {
    const st = stageOfWeek(w);
    const fs = season.fixtures.filter((f) => f.week === w);
    const mine = fs.find((f) => f.home === me.id || f.away === me.id);
    const now = !season.finished && w === season.week;
    const past = season.finished || w < season.week;
    const patch = (w - 1) % PATCH_EVERY === 0;
    let main: string;
    let res = '';
    let state = '';
    if (mine) {
      const opp = teamById(season, mine.home === me.id ? mine.away : mine.home);
      main = `${crest(opp.color, opp.tag, 26, opp.emblem)}<div><b>${esc(opp.name)}</b><small>${STAGE_SHORT[st]} · ${mine.home === me.id ? 'дома' : 'в гостях'}</small></div>`;
      if (mine.result) {
        const won = mine.result.winner === me.id;
        const raw = mine.result.games ?? mine.result.kills;
        const k = mine.home === me.id ? raw : ([raw[1], raw[0]] as const);
        res = `<span class="cres ${won ? 'w' : 'l'}"><b>${won ? 'Победа' : 'Пораж.'}</b>${k[0]}:${k[1]}</span>`;
        state = won ? 'won' : 'lost';
      } else if (now) res = `<span class="cres next">Сейчас</span>`;
    } else {
      const known = fs.length > 0;
      const why = st === 'league' ? 'Нет матча' : known ? 'Вы не участвуете' : past ? 'Без вашего участия' : st === 'semi' || st === 'final' ? 'Если пройдёте дальше' : 'Только для чемпиона лиги';
      main = `<span class="cnone">${ICON.rest(18)}</span><div><b>${why}</b><small>${STAGE_SHORT[st]}</small></div>`;
      state = 'off';
    }
    const others = fs
      .filter((f) => f !== mine)
      .map((f) => {
        const a = teamById(season, f.home);
        const b = teamById(season, f.away);
        const r = f.result;
        return `<li><span class="${r?.winner === a.id ? 'w' : ''}">${esc(a.tag)}</span><em>${r ? (r.games ?? r.kills).join(':') : '–'}</em><span class="${r?.winner === b.id ? 'w' : ''}">${esc(b.tag)}</span></li>`;
      })
      .join('');
    const head = w === 1 || stageOfWeek(w - 1) !== st && (st === 'semi' || st === 'intl-semi') ? `<li class="csec">${st === 'league' ? 'Регулярный сезон' : st === 'semi' ? 'Плей-офф' : 'Кубок мира'}</li>` : '';
    items.push(`${head}<li class="cw ${state} ${now ? 'now' : ''} ${past && !now ? 'past' : ''}">
      <div class="cwk"><small>нед.</small><b>${w}</b></div>
      <div class="cmain">${main}${patch ? `<span class="cpatch">${ICON.meta(12)}Патч</span>` : ''}</div>${res}
      ${others ? `<details class="cothers"><summary>Другие матчи недели</summary><ul>${others}</ul></details>` : ''}</li>`);
  }
  return `<section class="block"><h3>Календарь · сезон ${season.seasonNo}</h3>
    <p class="dim small">Сыграно ${played.length}, побед ${wins}. Новый патч выходит каждые ${PATCH_EVERY} недели.</p>
    <ol class="cal">${items.join('')}</ol></section>`;
}

function table() {
  const seg = segTabs('tt', tableTab, [
    ['table', 'Таблица'],
    ['bracket', 'Сетка'],
    ['cal', 'Календарь'],
  ]);
  if (tableTab === 'bracket') {
    shell('table', seg + bracketHtml());
    bindTableTabs();
    return;
  }
  if (tableTab === 'cal') {
    shell('table', seg + calendarHtml());
    bindTableTabs();
    app.querySelector('.cw.now')?.scrollIntoView({ block: 'center' });
    return;
  }
  const rows = standings(season)
    .map(
      (s, i) => `<tr class="${s.team.human ? 'me' : ''}"><td>${i + 1}</td><td class="tm">${crest(s.team.color, s.team.tag, 22, s.team.emblem)}${esc(s.team.name)}</td>
      <td>${s.wins}</td><td>${s.losses}</td><td>${s.kd > 0 ? '+' : ''}${s.kd}</td></tr>`,
    )
    .join('');
  shell('table', seg + `<section class="block"><h3>Лига · сезон ${season.seasonNo}</h3><table class="tbl"><thead><tr><th>#</th><th>Команда</th><th>П</th><th>Пр</th><th>±</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="dim small">После ${LEAGUE_WEEKS} недель четыре лучших выходят в плей-офф. Чемпион едет на Кубок мира против зарубежных клубов.</p></section>`);
  bindTableTabs();
}

// Турнирная сетка: плей-офф лиги и Кубок мира, счёт серий, ещё не известные места подписаны
function bracketHtml() {
  const tbl = standings(season);
  const slot = (id: string | null, label: string, fx: Fixture | undefined, home: boolean) => {
    const t = id ? teamById(season, id) : null;
    const r = fx?.result;
    const sc = r ? (r.games ? r.games[home ? 0 : 1] : r.winner === id ? 1 : 0) : '';
    const st = r ? (r.winner === id ? 'bwin' : 'blose') : '';
    if (!t) return `<div class="bs tbd"><span class="bc"></span><span class="bn">${label}</span><b></b></div>`;
    return `<div class="bs ${st} ${t.human ? 'me' : ''}">${crest(t.color, t.tag, 20, t.emblem)}<span class="bn">${esc(t.name)}${fx ? '' : `<small>${label}</small>`}</span><b>${sc}</b></div>`;
  };
  const tie = (fx: Fixture | undefined, a: [string | null, string], b: [string | null, string], st: Stage) =>
    `<div class="bx"><small class="bo">bo${BEST_OF[st]}</small>${slot(fx?.home ?? a[0], a[1], fx, true)}${slot(fx?.away ?? b[0], b[1], fx, false)}</div>`;
  const find = (st: Stage) => season.fixtures.filter((f) => f.stage === st);
  const champOf = (st: Stage) => find(st)[0]?.result?.winner;
  const block = (title: string, semis: [Fixture | undefined, [string | null, string], [string | null, string]][], finSt: Stage, semiSt: Stage) => {
    const fin = find(finSt)[0];
    const w = champOf(finSt);
    return `<section class="block"><h3>${title}</h3><div class="bk">
      <div class="bcol"><small>Полуфиналы</small>${semis.map(([f, a, b]) => tie(f, a, b, semiSt)).join('')}</div>
      <div class="bcol fin"><small>Финал</small>${tie(fin, [null, 'Победитель 1'], [null, 'Победитель 2'], finSt)}
        ${w ? `<div class="bchamp">${ICON.star(14)}<span>${esc(teamById(season, w).name)}</span></div>` : ''}</div></div></section>`;
  };
  const semis = find('semi');
  const proj = (i: number): [string | null, string] => [semis.length ? null : tbl[i]?.team.id ?? null, `${i + 1}-е место${semis.length ? '' : ' сейчас'}`];
  const po = block('Плей-офф лиги', [[semis[0], proj(0), proj(3)], [semis[1], proj(1), proj(2)]], 'final', 'semi');
  const ints = find('intl-semi');
  const wc = block('Кубок мира', [[ints[0], [null, 'Чемпион лиги'], [null, 'Зарубежный клуб']], [ints[1], [null, 'Зарубежный клуб'], [null, 'Зарубежный клуб']]], 'intl-final', 'intl-semi');
  return `${po}${wc}<p class="dim small">Полуфиналы до двух побед, финалы до трёх. Пока регулярный сезон идёт, в сетке показаны команды на нужных местах сейчас.</p>`;
}

function bindTableTabs() {
  bindSeg('tt', (v) => {
    tableTab = v as typeof tableTab;
    table();
  });
}

// ---------- Мета и патчи ----------

function noteRow(n: Note) {
  const c = n.id ? champById(n.id) : null;
  const mark = n.kind === 'rule' ? (n.why.startsWith('▲') ? 'buff' : 'nerf') : n.kind;
  const why = n.why.replace(/^[▲▼] /, '');
  return `<li class="note ${mark}">${c ? img(c, 'xs') : `<span class="nico">${ICON.meta(16)}</span>`}
    <div><b>${esc(n.text)}</b><small>${esc(why)}</small></div></li>`;
}

let metaTab: 'patch' | 'tiers' | 'stats' | 'rules' = 'patch';
function metaScreen() {
  const m = season.meta;
  const p = m.patch;
  season.unseenPatch = false;
  save(season);
  const n = nextPatchIn();
  const tiers = (['S', 'A', 'B', 'C'] as const)
    .map((t) => {
      const list = pool().filter((c) => tier(m, c.id) === t).sort((a, b) => heroPower(m, b.id) - heroPower(m, a.id));
      return `<div class="tier"><b class="t${t}">${t}</b><div>${list.map((c) => `<span class="th" title="${c.name}">${img(c, 'xs')}</span>`).join('') || '<span class="dim small">—</span>'}</div></div>`;
    })
    .join('');
  const rows = [...pool()]
    .map((c) => ({ c, h: m.heroes[c.id] ?? { picks: 0, bans: 0, wins: 0, order: 0 } }))
    .sort((a, b) => priority(b.h) - priority(a.h))
    .slice(0, 8)
    .map(({ c, h }) => {
      const mod = modOf(p, c.id);
      const tag = mod.hp * mod.dmg / mod.cd;
      return `<tr><td class="tm">${img(c, 'xs')}${c.name}${tag > 1.001 ? ' <i class="up">▲</i>' : tag < 0.999 ? ' <i class="down">▼</i>' : ''}</td>
      <td>${h.picks}</td><td>${h.bans}</td><td>${h.picks ? Math.round((h.wins / h.picks) * 100) + '%' : '–'}</td></tr>`;
    })
    .join('');
  const rules = (Object.keys(RULE_INFO) as (keyof Rules)[])
    .map((k) => {
      const v = p.rules[k];
      const b = BASE_RULES[k];
      const d = Math.abs(v - b) < 1e-6 ? '' : (k === 'respawn' ? v < b : v > b) ? 'up' : 'down';
      return `<tr><td>${RULE_INFO[k].name}</td><td class="${d}">${fmtRule(k, v)}</td></tr>`;
    })
    .join('');
  const hist = m.history
    .slice(1)
    .map((h) => `<details class="hist"><summary>Патч ${h.ver} · неделя ${h.week}</summary><ul class="notes">${h.notes.map(noteRow).join('')}</ul></details>`)
    .join('');
  const tabs = segTabs('mtab', metaTab, [
    ['patch', 'Патч'],
    ['tiers', 'Тиры'],
    ['stats', 'Статистика'],
    ['rules', 'Правила'],
  ]);
  const body: Record<typeof metaTab, string> = {
    patch: `<section class="block patch-head">
      <div class="row"><b>Патч ${p.ver}</b><span class="dim small">неделя ${p.week} · ${n ? `следующий через ${n} нед.` : 'последний в сезоне'}</span></div>
      <ul class="notes">${p.notes.map(noteRow).join('')}</ul>
    </section>
    ${hist ? `<section class="block"><h3>Прошлые патчи</h3>${hist}</section>` : ''}`,
    tiers: `<section class="block"><h3>Тир-лист</h3>${tiers}<p class="dim small">Сила героя на этом патче: изменения и победы в лиге.</p></section>`,
    stats: `<section class="block"><h3>Статистика патча</h3>${m.win.games
      ? `<p class="dim small">Сыграно матчей на этом патче: ${m.win.games}. Самые приоритетные в драфте:</p>
      <table class="tbl"><thead><tr><th>Герой</th><th>Пик</th><th>Бан</th><th>Побед</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="dim small">Статистика появится после первых матчей на этом патче.</p>'}</section>`,
    rules: `<section class="block"><h3>Награды и правила</h3><table class="tbl rules"><tbody>${rules}</tbody></table>
      <p class="dim small">Раз в ${PATCH_EVERY} недели разработчики смотрят на статистику лиги: кого чаще берут и банят, кто побеждает. Сильных ослабляют, забытых усиливают. Большие патчи добавляют новых героев.</p></section>`,
  };
  shell('meta', tabs + `<div class="pane">${body[metaTab]}</div>`);
  bindSeg('mtab', (v) => {
    metaTab = v as typeof metaTab;
    metaScreen();
  });
}

// ---------- Драфт ----------

const img = (c: Champion, cls = '') => `<img class="pt ${cls}" src="${portrait(c)}" alt="">`;

function draft() {
  const me = humanTeam(season);
  const fx = humanFixture(season)!;
  const opp = teamById(season, fx.home === me.id ? fx.away : fx.home);
  // В серии стороны карты меняются каждую игру
  const gameNo = humanSeries(season)!.next;
  const mySide: 0 | 1 = (fx.home === me.id) === (gameNo % 2 === 1) ? 0 : 1;
  const teams: [Team, Team] = mySide === 0 ? [me, opp] : [opp, me];
  const rng = new Rng(season.seed + season.week * 31 + (gameNo - 1) * 7907);
  const d = newDraft();
  let sel: string | null = null;
  let filter: Role | 'all' = 'all';
  let timer = 0;
  let aiHover: string | null = null;
  const HUMAN_TIME = season.tutorial ? 90 : 30;
  let left = HUMAN_TIME;

  const bestFor = (c: Champion) => Math.max(...me.players.map((p) => p.pool[c.role]));
  const meta = season.meta;
  const noteOf = (c: Champion) => meta.patch.notes.find((n) => n.id === c.id && n.kind !== 'new');
  const isNew = (c: Champion) => meta.patch.notes.some((n) => n.id === c.id && n.kind === 'new');
  const favOf = (c: Champion) => me.players.find((p) => p.favs.includes(c.id));
  let tip: string | null = null; // совет тренера по драфту
  const badge = (c: Champion) => {
    const n = noteOf(c);
    const t = tier(meta, c.id);
    return `${isNew(c) ? '<i class="pb new">NEW</i>' : ''}${t === 'S' ? '<i class="tier-s">S</i>' : ''}${n ? `<i class="pb ${n.kind}">${n.kind === 'buff' ? '▲' : '▼'}</i>` : ''}${favOf(c) ? '<i class="fav">♥</i>' : ''}${tip === c.id ? '<i class="tipl">совет</i>' : ''}`;
  };

  const slots = (side: 0 | 1) => {
    const picks = d.picks[side];
    const st = ORDER[d.step];
    const liveIdx = st && st.act === 'pick' && st.side === side ? picks.length : -1;
    return Array.from({ length: 5 }, (_, i) => {
      const id = picks[i];
      const c = id ? champById(id) : null;
      const preview = i === liveIdx ? (st.side === mySide ? sel : aiHover) : null;
      const pc = preview ? champById(preview) : null;
      return `<div class="slot s${side} ${i === liveIdx ? 'live' : ''} ${c ? 'locked' : ''}">
        ${c ? img(c) : pc ? img(pc, 'ghost') : '<span class="pt empty"></span>'}
        <span>${c ? c.name : pc ? pc.name : i === liveIdx ? 'выбор…' : ''}</span></div>`;
    }).join('');
  };

  const banRow = (side: 0 | 1) =>
    Array.from({ length: 5 }, (_, i) => {
      const id = d.bans[side][i];
      return id ? img(champById(id), 'banned') : `<span class="pt empty sm"></span>`;
    }).join('');

  let first = true;
  const timers = new Set<number>();
  const clearAll = () => {
    clearInterval(timer);
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  };
  const render = () => {
    const st = ORDER[d.step];
    const myTurn = st && st.side === mySide;
    const tk = taken(d);
    const list = pool().filter((c) => filter === 'all' || c.role === filter);
    const selC = sel ? champById(sel) : null;
    const poolEl = app.querySelector('.pool');
    const scroll = poolEl ? poolEl.scrollTop : 0;
    const fEl = app.querySelector('.filters');
    const fScroll = fEl ? fEl.scrollLeft : 0;
    const who = st ? `${st.act === 'ban' ? 'Бан' : 'Пик'} ${st.side === 0 ? 'синих' : 'красных'}` : 'Драфт завершён';
    swap(`<div class="screen draft">
      <div class="phase" style="--side:${st ? SIDE_COLORS[st.side] : 'var(--stage)'}">
        <div class="names"><span class="b">${esc(teams[0].tag)}</span><b>${who}</b><span class="r">${esc(teams[1].tag)}</span></div>
        <small>${st ? `${PHASE_NAME(d.step)} · ход ${d.step + 1} из ${ORDER.length}` : ''}${myTurn ? ' · ваш ход' : ''}</small>
        <div class="timer"><i id="tbar" style="transform:scaleX(${myTurn ? left / HUMAN_TIME : 1})"></i></div>
      </div>
      <div class="teams">${([0, 1] as const)
        .map((sd) => `<div class="trow s${sd}"><div class="picks">${slots(sd)}</div>
          <div class="tbans"><span class="lbl">${ICON.ban(13)} ${sd === mySide ? 'Ваши баны' : 'Баны соперника'}</span>${banRow(sd)}</div></div>`)
        .join('')}</div>
      <div class="pool-wrap">
        <div class="filters">${(['all', ...ALL_ROLES] as const)
          .map((r) => `<button class="chip ${filter === r ? 'on' : ''}" data-f="${r}">${r === 'all' ? 'Все' : ROLE_NAMES[r]}</button>`)
          .join('')}</div>
        <div class="pool">${list
          .map((c) => {
            const gone = tk.has(c.id);
            const by = d.picks[0].includes(c.id) ? 'p0' : d.picks[1].includes(c.id) ? 'p1' : gone ? 'bn' : '';
            return `<button class="hero-btn ${by} ${tip === c.id && myTurn ? 'tip' : ''} ${sel === c.id ? 'on' : ''} ${aiHover === c.id ? 'ai' : ''}" data-c="${c.id}" ${gone || !myTurn ? 'disabled' : ''} aria-label="${c.name}">
              ${img(c, gone ? 'gone' : '')}${gone ? (by === 'bn' ? `<i class="took">${ICON.ban(14)}</i>` : '') : badge(c)}<span>${c.name}</span></button>`;
          })
          .join('')}</div>
        <div class="pick-bar">${
          selC && myTurn
            ? `<div class="info">${img(selC)}<div><b>${selC.name}</b><small>${ROLE_NAMES[selC.role]} · владение ${bestFor(selC)} · тир ${tier(meta, selC.id)}${favOf(selC) ? ` · ♥ ${esc(favOf(selC)!.nick)}` : ''}</small><small>${noteOf(selC) ? `<span class="${noteOf(selC)!.kind === 'buff' ? 'up' : 'down'}">Патч ${meta.patch.ver}: ${noteOf(selC)!.text.split(': ')[1]}</span>` : ABILITY_TEXT[selC.ab]}</small></div></div>
               <button class="cta ${st.act}" id="lock">${st.act === 'ban' ? 'Забанить' : 'Выбрать'}</button>`
            : `<div class="hint">${myTurn
                ? season.tutorial
                  ? st.act === 'ban'
                    ? '<b>Обучение.</b> Бан убирает героя для обеих команд. Уберите сильного героя меты (значок S) или любимого героя соперника. Совет тренера подсвечен.'
                    : '<b>Обучение.</b> Героя получит следующий по очереди игрок. Верху подходят стражи и бойцы, центру маги и ассасины, стрелку стрелки, поддержке поддержка. ♥ значит любимый герой: на нём игрок сильнее.'
                  : st.act === 'ban' ? 'Выберите героя, которого уберёте у соперника' : 'Выберите героя для своей команды'
                : st ? `${esc(teams[st.side].name)} думают…` : ''}</div>`
        }</div>
      </div></div>`, !first);
    if (first) cleanup = clearAll;
    first = false;
    // перерисовка не должна сбрасывать прокрутку списка героев
    app.querySelector('.pool')!.scrollTop = scroll;
    app.querySelector('.filters')!.scrollLeft = fScroll;
    app.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => (b.onclick = () => ((filter = b.dataset.f as Role | 'all'), render())));
    app.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => (b.onclick = () => ((sel = b.dataset.c!), render())));
    const lock = document.getElementById('lock');
    if (lock) lock.onclick = () => commit(sel!);
  };

  const recommend = () => aiChoice(d, me, opp, rng, meta);

  const commit = (id: string) => {
    clearAll();
    apply(d, id);
    sel = null;
    aiHover = null;
    next();
  };

  const next = () => {
    if (done(d)) {
      lastDraft = d;
      return lineup(teams, mySide, d.picks);
    }
    const st = ORDER[d.step];
    if (st.side === mySide) {
      left = HUMAN_TIME;
      tip = season.staff.coach > 0 || season.tutorial ? aiChoice(d, me, opp, new Rng(season.seed + d.step * 61 + season.week), meta) : null;
      render();
      timer = window.setInterval(() => {
        left -= 0.25;
        const bar = document.getElementById('tbar');
        if (bar) bar.style.transform = `scaleX(${Math.max(0, left / HUMAN_TIME)})`;
        if (left <= 0) commit(sel ?? recommend());
      }, 250);
    } else {
      // Соперник «думает»: сначала наводится на героя, потом фиксирует
      const choice = aiChoice(d, opp, me, rng, meta);
      render();
      timers.add(window.setTimeout(() => {
        aiHover = choice;
        render();
      }, reduced() ? 150 : 550));
      timers.add(window.setTimeout(() => commit(choice), reduced() ? 300 : 1150));
    }
  };
  next();
}

// ---------- Расстановка: какой игрок на каком герое ----------

function lineup(teams: [Team, Team], mySide: 0 | 1, picks: [string[], string[]]) {
  const me = teams[mySide];
  const mine = assign(me, picks[mySide]);
  const theirs = assign(teams[1 - mySide], picks[1 - mySide]);
  const foeStrat = autoStrategy(theirs);
  let strat: Strategy = autoStrategy(mine);
  let first: number | null = null;
  let shown = false;
  const render = () => {
    swap(`<div class="screen lineup">
      <header class="lineup-head"><h2>Расстановка</h2><p>Нажмите на двух игроков, чтобы поменять их героев.</p></header>
      <div class="lanes">${me.players
        .map((p, i) => {
          const c = champById(mine[i]);
          const onPos = POS_ROLES[p.pos].includes(c.role);
          return `<button class="lane ${first === i ? 'on' : ''}" data-i="${i}">
            <span class="posl">${POS_NAMES[p.pos]}</span>
            ${img(c)}<div><b>${esc(p.nick)}</b><small>${c.name} · ${ROLE_NAMES[c.role]}${p.favs.includes(c.id) ? ' · ♥ любимый' : ''}${onPos ? '' : ' · <i class="warn">не его позиция</i>'}</small></div>
            <em class="${p.pool[c.role] >= 70 ? 'good' : p.pool[c.role] < 45 ? 'bad' : ''}">${p.pool[c.role]}</em></button>`;
        })
        .join('')}</div>
      <section class="strats"><h3>Стратегия на матч</h3>
        <div class="strat-row">${(Object.keys(STRATEGY_TEXT) as Strategy[])
          .map((k) => `<button class="strat ${strat === k ? 'on' : ''} ${COUNTERS[k] === foeStrat ? 'ctr' : ''}" data-s="${k}"><b>${STRATEGY_TEXT[k][0]}</b>${COUNTERS[k] === foeStrat ? '<i>контр</i>' : ''}</button>`)
          .join('')}</div>
        <p class="strat-desc">${STRATEGY_TEXT[strat][1]}</p>
        <p class="scout">${ICON.eye(14)}<span>Разведка: соперник, скорее всего, выберет «${STRATEGY_TEXT[foeStrat][0]}». ${
          COUNTERS[strat] === foeStrat ? `<b class="up">Ваш выбор сильнее против неё.</b>` : COUNTERS[foeStrat] === strat ? `<b class="down">Она сильнее против вашего выбора.</b>` : 'Равный расклад.'
        }</span></p>
        <p class="dim small">Охота бьёт Игру от линий, линии бьют Командный напор, напор бьёт Охоту.</p></section>
      <button class="cta wide" id="go">${ICON.play(18)} Начать матч</button></div>`, shown);
    shown = true;
    app.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.i!;
          if (first === null) first = i;
          else {
            [mine[first], mine[i]] = [mine[i], mine[first]];
            first = null;
          }
          render();
        }),
    );
    app.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => (b.onclick = () => ((strat = b.dataset.s as Strategy), render())));
    document.getElementById('go')!.onclick = () => {
      const p: [string[], string[]] = mySide === 0 ? [mine, theirs] : [theirs, mine];
      const st: [Strategy, Strategy] = mySide === 0 ? [strat, foeStrat] : [foeStrat, strat];
      const ser = humanSeries(season)!;
      const m = new Match(matchSetup(season, teams, p, season.seed + season.week * 977 + season.seasonNo * 13 + (ser.next - 1) * 104729, { strategies: st, big: ser.fx.stage !== 'league' }));
      vsIntro(teams, STAGE_NAMES[ser.fx.stage] + (ser.bestOf > 1 ? ` · игра ${ser.next} · счёт ${ser.score[0]}:${ser.score[1]}` : ''), () => playMatch(m, 'live'));
    };
  };
  render();
}

// ---------- Матч ----------

// Камера в матче: следует за дракой или показывает всю карту
let autoCam = (() => {
  try {
    return localStorage.getItem('arena-cam') !== 'full';
  } catch {
    return true;
  }
})();

let showBoard = (() => {
  try {
    return localStorage.getItem('arena-board') !== 'off';
  } catch {
    return true;
  }
})();

// Табло игроков под полем: две колонки, по строке на игрока
function boardHtml(m: Match) {
  const col = (side: 0 | 1) => {
    const rows = m.s.units
      .map((u, i) => [u, i] as const)
      .filter(([u]) => u.side === side)
      .map(
        ([u, i]) => `<div class="brow" id="br${i}"><span class="bic">${img(u.champ, 'xs')}<i id="bl${i}">1</i><em id="bd${i}"></em></span><span class="bnk">${esc(u.player.nick)}</span><span class="bk" id="bk${i}">0/0/0</span><span class="bgd" id="bg${i}">0</span><i class="bbar" id="bb${i}" style="background:${SIDE_COLORS[side]}"></i></div>`,
      )
      .join('');
    return `<div class="bcol s${side}">${rows}</div>`;
  };
  const head = (side: 0 | 1) => `<span class="bh s${side}"><b style="color:${SIDE_COLORS[side]}">${esc(m.setup.teams[side].tag)}</b>${ICON.coin(12)}<b id="bt${side}">0</b></span>`;
  return `<div class="board" id="board" ${showBoard ? '' : 'hidden'}><div class="bhead">${head(0)}<span class="gdiff sn" id="bdiff">±0</span>${head(1)}</div>${col(0)}${col(1)}</div>`;
}

function playMatch(m: Match, mode: 'live' | 'replay') {
  const [a, b] = m.setup.teams;
  swap(`<div class="screen match">
    <div class="bug">
      <div class="t">${crest(SIDE_COLORS[0], a.tag, 26, a.emblem)}<b>${esc(a.tag)}</b></div>
      <div class="sc"><b id="k0">0</b><span id="clock">5:00</span><b id="k1">0</b></div>
      <div class="t r"><b>${esc(b.tag)}</b>${crest(SIDE_COLORS[1], b.tag, 26, b.emblem)}</div>
    </div>
    <div class="objs"><span id="o0"></span><span id="o1"></span></div>
    <div class="field"><canvas id="cv"></canvas><ul class="feed" id="feed"></ul>
      <div class="banner" id="banner" aria-hidden="true"></div>
      <div class="cast" id="cast" aria-live="polite"></div></div>
    ${boardHtml(m)}
    <div class="ctrl">
      <button id="pz" aria-label="Пауза">${ICON.pause(18)}<span>Пауза</span></button>
      <button data-speed="1" class="on" aria-label="Скорость 1">${ICON.play(18)}<span>1×</span></button>
      <button data-speed="2" aria-label="Скорость 2">${ICON.fast(18)}<span>2×</span></button>
      <button data-speed="4" aria-label="Скорость 4">${ICON.fast(18)}<span>4×</span></button>
      <button id="cam" class="${autoCam ? 'on' : ''}" aria-label="Камера">${ICON.eye(18)}<span>Камера</span></button>
      <button id="brd" class="${showBoard ? 'on' : ''}" aria-label="Табло игроков">${ICON.board(18)}<span>Табло</span></button>
      <button id="skip" aria-label="К итогам">${ICON.skip(18)}<span>${mode === 'replay' ? 'Выход' : 'Итог'}</span></button>
    </div></div>`);
  setAudioMode('match');
  document.body.classList.add('in-match'); // фон меню на время матча выключен
  const cv = document.getElementById('cv') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  let paused = false;
  let dpr = 1;
  let feedLen = 0;
  const mySide = mode === 'live' ? m.setup.teams.findIndex((t) => t.human) : -1;
  // Комментаторы: очередь реплик, каждая держится на экране пару секунд
  const caster = new Caster(m);
  let queue: Line[] = [];
  let lineUntil = 0;
  let bannerUntil = 0;
  const castEl = () => document.getElementById('cast');
  const commentary = (now: number) => {
    for (const l of caster.poll()) {
      if (l.banner) {
        const b = document.getElementById('banner')!;
        b.textContent = l.banner;
        b.style.setProperty('--c', SIDE_COLORS[l.side ?? 0]);
        b.classList.remove('show');
        void b.offsetWidth;
        b.classList.add('show');
        bannerUntil = now + 1800;
      }
      queue.push(l);
    }
    // важное вперёд, лишнее отбрасываем
    queue.sort((a, b) => b.prio - a.prio);
    queue = queue.slice(0, 3);
    if (now > lineUntil && queue.length) {
      const l = queue.shift()!;
      const el = castEl()!;
      el.innerHTML = `<b class="c${l.who}">${CASTERS[l.who]}</b><span>${esc(l.text)}</span>`;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      lineUntil = now + Math.max(2200, l.text.length * 45);
    } else if (now > lineUntil + 2500) castEl()?.classList.remove('show');
    if (now > bannerUntil) document.getElementById('banner')?.classList.remove('show');
  };

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  // Меняем DOM, только когда текст действительно изменился: меньше перерисовок страницы
  const shown: Record<string, string> = {};
  const put = (id: string, v: string, html = false) => {
    if (shown[id] === v) return;
    shown[id] = v;
    const el = document.getElementById(id);
    if (!el) return;
    if (html) el.innerHTML = v;
    else el.textContent = v;
  };
  // Табло: золото и У/С/П каждого игрока, обновляем только изменившиеся ячейки
  const cls: Record<string, string> = {};
  const setCls = (id: string, v: string) => {
    if (cls[id] === v) return;
    cls[id] = v;
    const el = document.getElementById(id);
    if (el) el.className = v;
  };
  const board = () => {
    if (!showBoard) return;
    const us = m.s.units;
    const tot = [0, 0];
    let maxG = 1;
    for (const u of us) {
      tot[u.side] += u.gold;
      maxG = Math.max(maxG, u.gold);
    }
    const lead = [0, 1].map((sd) => us.filter((u) => u.side === sd).reduce((a, u) => (u.gold > a.gold ? u : a)));
    us.forEach((u, i) => {
      put(`bk${i}`, `${u.kills}/${u.deaths}/${u.assists}`);
      put(`bg${i}`, kfmt(u.gold));
      put(`bl${i}`, String(u.level));
      put(`bw${i}`, String(Math.round((u.gold / maxG) * 100)));
      const w = shown[`bw${i}`];
      const bar = document.getElementById(`bb${i}`);
      if (bar && bar.dataset.w !== w) {
        bar.dataset.w = w;
        bar.style.width = w + '%';
      }
      setCls(`br${i}`, `brow${u.dead > 0 ? ' dead' : ''}${lead[u.side] === u && u.gold > 0 ? ' lead' : ''}`);
      put(`bd${i}`, u.dead > 0 ? String(Math.ceil(u.dead)) : '');
    });
    put('bt0', kfmt(tot[0]));
    put('bt1', kfmt(tot[1]));
    const diff = tot[0] - tot[1];
    put('bdiff', diff === 0 ? '±0' : `${diff > 0 ? '◀' : ''} +${kfmt(Math.abs(diff))} ${diff < 0 ? '▶' : ''}`.trim());
    setCls('bdiff', `gdiff s${diff > 0 ? 0 : diff < 0 ? 1 : 'n'}`);
  };
  const hud = () => {
    board();
    put('k0', String(m.s.kills[0]));
    put('k1', String(m.s.kills[1]));
    const left = Math.max(0, MATCH_TIME - m.s.time);
    put('clock', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    for (const sd of [0, 1] as const) {
      const bits = [`${ICON.tower(13)}${m.s.towersDown[sd]}`];
      if (m.s.spirit[sd]) bits.push(`<i class="buff sp">Дух ×${m.s.spirit[sd]}</i>`);
      if (m.s.siege[sd] > 0) bits.push(`<i class="buff cl">Колосс ${Math.ceil(m.s.siege[sd])}</i>`);
      put('o' + sd, bits.join(''), true);
    }
    const key = m.s.feed.length + (m.s.feed[0]?.t ?? 0);
    if (key !== feedLen) {
      const fresh = feedLen !== 0;
      feedLen = key;
      const k0 = m.s.feed[0];
      if (fresh && mySide >= 0 && k0 && m.fxOn) {
        if (k0.kind === 'kill' && k0.victim.side !== mySide) buzz(0);
        else if (k0.kind === 'tower' && k0.side !== mySide) buzz(1);
      }
      document.getElementById('feed')!.innerHTML = m.s.feed
        .slice(0, 3)
        .map((k) => {
          if (k.kind === 'tower') {
            const col = SIDE_COLORS[1 - k.side];
            return `<li style="--c:${col}">${ICON.tower(14)}<span>Башня ${LANE_NAMES[k.lane].toLowerCase()} · ${esc(m.setup.teams[k.side].tag)}</span></li>`;
          }
          if (k.kind === 'objective') {
            const col = SIDE_COLORS[k.side];
            return `<li style="--c:${col}">${ICON.star(14)}<span>${esc(m.setup.teams[k.side].tag)}: ${NEUTRAL_NAMES[k.type]}</span></li>`;
          }
          const col = SIDE_COLORS[k.victim.side === 0 ? 1 : 0];
          const killer = k.killer ? img(k.killer.champ, 'xs') : `<span class="core-ic" style="color:${col}">${ICON.tower(18)}</span>`;
          return `<li style="--c:${col}">${killer}${ICON.sword(12)}${img(k.victim.champ, 'xs dead')}<span>${esc(k.victim.player.nick)}</span></li>`;
        })
        .join('');
    }
  };

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    if (dt < 1 / 31) return;
    last = now;
    juiceTick(m, now, speed);
    acc += Math.min(dt, 0.25) * speed * timeScale(m, now);
    while (acc >= 1 / 30 && !m.s.over) {
      m.step();
      acc -= 1 / 30;
    }
    drawMatch(ctx, m, cv.width, cv.height, dpr, autoCam);
    hud();
    commentary(now);
    if (m.s.over) end();
  };
  raf = requestAnimationFrame(frame);

  // На свёрнутой вкладке ничего не рисуем, чтобы телефон не грелся
  const vis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!m.s.over && !running && !paused) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', vis);

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', vis);
  };
  cleanup = stop;

  const end = () => {
    stop();
    m.fxOn = false;
    m.runToEnd();
    m.s.fx = [];
    if (mySide >= 0 && m.s.winner === mySide) buzz(2);
    drawMatch(ctx, m, cv.width, cv.height, dpr, autoCam);
    hud();
    if (mode === 'live') result(m);
    else {
      const s = sheet(`<h2>Повтор</h2>${matchTabs(m, '')}<div class="sheet-foot"><button class="cta wide" id="cont">Закрыть</button></div>`, club);
      s.el.querySelector('.sheet')!.classList.add('full');
      bindMatchTabs(s.el);
      s.el.querySelector<HTMLButtonElement>('#cont')!.onclick = s.close;
    }
  };

  app.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(
    (btn) =>
      (btn.onclick = () => {
        speed = +btn.dataset.speed!;
        app.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === btn));
      }),
  );
  document.getElementById('skip')!.onclick = end;
  // Пауза: останавливаем и симуляцию, и отрисовку, чтобы телефон отдыхал
  document.getElementById('pz')!.onclick = (e) => {
    const b = e.currentTarget as HTMLElement;
    paused = !paused;
    b.classList.toggle('on', paused);
    b.innerHTML = paused ? `${ICON.play(18)}<span>Дальше</span>` : `${ICON.pause(18)}<span>Пауза</span>`;
    app.querySelector('.field')?.classList.toggle('paused', paused);
    if (paused) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!m.s.over) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.getElementById('brd')!.onclick = (e) => {
    showBoard = !showBoard;
    (e.currentTarget as HTMLElement).classList.toggle('on', showBoard);
    document.getElementById('board')!.hidden = !showBoard;
    resize();
    drawMatch(ctx, m, cv.width, cv.height, dpr, autoCam);
    hud();
    try {
      localStorage.setItem('arena-board', showBoard ? 'on' : 'off');
    } catch {
      /* без сохранения */
    }
  };
  document.getElementById('cam')!.onclick = (e) => {
    autoCam = !autoCam;
    (e.currentTarget as HTMLElement).classList.toggle('on', autoCam);
    try {
      localStorage.setItem('arena-cam', autoCam ? 'auto' : 'full');
    } catch {
      /* без сохранения */
    }
  };
}

// Сводка матча: итог, лучший игрок и график золота
const kfmt = (n: number) => (n >= 1000 ? (r1(n / 100) / 10).toFixed(1) + 'к' : String(r1(n)));
type U = Match['s']['units'][0];
const mvpScore = (u: U) => u.kills * 3 + u.assists * 1.5 - u.deaths + u.heroDmg / 1500 + u.towerDmg / 2500 + u.healed / 800;
const mvpOf = (m: Match) => [...m.s.units].sort((x, y) => mvpScore(y) - mvpScore(x))[0];

function summaryHtml(m: Match) {
  const s = m.s;
  const mvp = mvpOf(m);
  const tot = (side: 0 | 1) => s.units.filter((u) => u.side === side).reduce((a, u) => a + u.gold, 0);
  const line = s.goldLine;
  const max = Math.max(500, ...line.map(Math.abs));
  const W = 300;
  const H = 70;
  const pts = line.map((v, i) => `${((i / Math.max(1, line.length - 1)) * W).toFixed(1)},${(H / 2 - (v / max) * (H / 2 - 4)).toFixed(1)}`).join(' ');
  const [a, b] = m.setup.teams;
  return `<p class="dim">${s.cores[0].hp <= 0 || s.cores[1].hp <= 0 ? 'Ядро разрушено' : 'По истечении времени'} · убийства ${s.kills[0]} : ${s.kills[1]} · башни ${s.towersDown[0]} : ${s.towersDown[1]} · объекты ${s.objectives[0]} : ${s.objectives[1]}</p>
    <div class="mvp-card">${img(mvp.champ)}<div><small>Лучший игрок матча</small><b>${esc(mvp.player.nick)}</b><span>${mvp.champ.name} · ${mvp.kills}/${mvp.deaths}/${mvp.assists}</span></div></div>
    <div class="gold"><div class="row"><small style="color:${SIDE_COLORS[0]}">${esc(a.tag)} ${kfmt(tot(0))}</small><small class="dim">разница золота</small><small style="color:${SIDE_COLORS[1]}">${kfmt(tot(1))} ${esc(b.tag)}</small></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="zero"/><polyline points="${pts}" class="gl"/></svg></div>`;
}

// Полная статистика: отдельная таблица на каждую команду, широкая, с прокруткой вбок
function statsHtml(m: Match) {
  const s = m.s;
  const mvp = mvpOf(m);
  const maxOf = (f: (u: U) => number) => Math.max(1, ...s.units.map(f));
  const top = { gold: maxOf((u) => u.gold), dmg: maxOf((u) => u.heroDmg), tw: maxOf((u) => u.towerDmg), heal: maxOf((u) => u.healed) };
  const cell = (v: number, mx: number, side: number) =>
    `<td class="num"><span>${v ? kfmt(v) : '–'}</span><i class="bar" style="width:${Math.round((v / mx) * 100)}%;background:${SIDE_COLORS[side]}"></i></td>`;
  const team = (side: 0 | 1) => {
    const t = m.setup.teams[side];
    const us = s.units.filter((u) => u.side === side);
    const gold = us.reduce((a, u) => a + u.gold, 0);
    const won = s.winner === side;
    const rows = us
      .map(
        (u) => `<tr class="${u === mvp ? 'mvp' : ''}"><td class="pl">${img(u.champ, 'xs')}<div><b>${esc(u.player.nick)}${u === mvp ? ' <i class="mvp-b">MVP</i>' : ''}</b><small>${u.champ.name} · ур. ${u.level}</small></div></td>
        <td class="kda"><b>${u.kills}</b>/<b class="d">${u.deaths}</b>/<b>${u.assists}</b></td>${cell(u.gold, top.gold, side)}${cell(u.heroDmg, top.dmg, side)}${cell(u.towerDmg, top.tw, side)}${cell(u.healed, top.heal, side)}</tr>`,
      )
      .join('');
    return `<div class="st-team"><div class="st-head" style="--c:${SIDE_COLORS[side]}">${crest(SIDE_COLORS[side], t.tag, 22, t.emblem)}<b>${esc(t.name)}</b><span>${won ? 'победа' : 'поражение'} · ${s.kills[side]} убийств · ${kfmt(gold)} золота</span></div>
      <div class="tbl-wrap"><table class="tbl stats"><thead><tr><th>Игрок</th><th>У/С/П</th><th>Золото</th><th>Урон по героям</th><th>По строениям</th><th>Лечение</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  return `${team(0)}${team(1)}`;
}

// Итоги в две вкладки: «Разбор» и «Статистика»
function matchTabs(m: Match, review: string) {
  return `${segTabs('rt', 'sum', [
    ['sum', 'Разбор'],
    ['stats', 'Статистика'],
  ]).replace('class="segtabs"', 'class="segtabs rtabs"')}
    <div class="rpane" data-p="sum">${summaryHtml(m)}${review}</div>
    <div class="rpane" data-p="stats" hidden>${statsHtml(m)}</div>`;
}

function bindMatchTabs(root: HTMLElement) {
  const sh = root.querySelector<HTMLElement>('.sheet')!;
  root.querySelectorAll<HTMLButtonElement>('[data-rt]').forEach(
    (b) =>
      (b.onclick = () => {
        root.querySelectorAll('[data-rt]').forEach((x) => x.classList.toggle('on', x === b));
        root.querySelector<HTMLElement>('.segtabs')?.style.setProperty('--i', b.dataset.rt === 'sum' ? '0' : '1');
        root.querySelectorAll<HTMLElement>('.rpane').forEach((p) => (p.hidden = p.dataset.p !== b.dataset.rt));
        sh.scrollTop = 0;
      }),
  );
}

// Разбор тренера: ключевые моменты матча и советы на следующий драфт
function reviewHtml(m: Match, my: 0 | 1) {
  const s = m.s;
  const foe = (1 - my) as 0 | 1;
  const tm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const tag = (sd: number) => esc(m.setup.teams[sd].tag);
  const moments: [number, string][] = [];
  for (const e of s.events) {
    if (e.kind === 'first') moments.push([e.t, `Первая кровь за ${tag(1 - e.victim.side)}: ${esc(e.victim.player.nick)} пал${e.killer ? ` от ${esc(e.killer.player.nick)}` : ''}`]);
    else if (e.kind === 'kill' && e.multi >= 3 && e.killer) moments.push([e.t, `${esc(e.killer.player.nick)} делает ${e.multi === 3 ? 'тройное' : e.multi === 4 ? 'четверное' : 'пятерное'} убийство`]);
    else if (e.kind === 'ace') moments.push([e.t, `Вся команда ${tag(e.side)} уничтожена`]);
    else if (e.kind === 'tower' && e.tier === 1) moments.push([e.t, `${tag(1 - e.side)} вскрывают базу: пала внутренняя башня`]);
    else if (e.kind === 'objective' && e.type === 'colossus') moments.push([e.t, `${tag(e.side)} забирают Колосса`]);
  }
  // самый резкий поворот по золоту за 30 секунд
  const g = s.goldLine;
  let best = 0;
  let at = 0;
  for (let i = 3; i < g.length; i++) {
    const d = (g[i] - g[i - 3]) * (my === 0 ? 1 : -1);
    if (Math.abs(d) > Math.abs(best)) {
      best = d;
      at = i;
    }
  }
  if (Math.abs(best) > 1200) moments.push([at * 10, `${best > 0 ? 'Вы' : 'Соперник'} выиграли отрезок игры: +${(Math.abs(best) / 1000).toFixed(1)}к золота за полминуты`]);
  moments.sort((a, b) => a[0] - b[0]);
  const top = moments.slice(0, 4);

  const score = (u: (typeof s.units)[0]) => u.kills * 2 + u.assists - u.deaths * 1.5;
  const enemies = s.units.filter((u) => u.side === foe).sort((a, b) => score(b) - score(a));
  const mine = s.units.filter((u) => u.side === my).sort((a, b) => score(a) - score(b));
  const tips: string[] = [];
  const threat = enemies[0];
  if (threat && score(threat) >= 6) tips.push(`Опаснее всех был ${esc(threat.player.nick)} на ${threat.champ.name} (${threat.kills}/${threat.deaths}/${threat.assists}). В следующий раз подумайте о бане.`);
  const weak = mine[0];
  if (weak && score(weak) < 0) {
    const off = !POS_ROLES[weak.player.pos].includes(weak.champ.role);
    const low = weak.player.pool[weak.champ.role] < 60;
    tips.push(`Слабее всех сыграл ${esc(weak.player.nick)} на ${weak.champ.name}${off ? ': этот герой не для его позиции' : low ? ': он плохо владеет этой ролью' : ''}.`);
  }
  if (s.objectives[foe] >= s.objectives[my] + 2) tips.push('Соперник чаще забирал речного духа и колосса. Командный напор поможет держать объекты.');
  const tired = m.setup.teams[my].players.filter((p) => p.fatigue > 60).length;
  if (tired >= 2) tips.push('Игроки устали. Неделя отдыха в плане тренировок вернёт форму.');
  if (!tips.length) tips.push(s.winner === my ? 'Хорошая игра, менять ничего не нужно.' : 'Близкий матч. Попробуйте другую стратегию на расстановке.');
  return `<section class="review"><h3>Разбор тренера</h3>
    ${top.length ? `<ul class="moments">${top.map(([t, x]) => `<li><time>${tm(t)}</time><span>${x}</span></li>`).join('')}</ul>` : ''}
    <ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></section>`;
}

function result(m: Match) {
  const me = humanTeam(season);
  const s = m.s;
  const winner = m.setup.teams[s.winner as 0 | 1];
  const won = winner.id === me.id;
  sfx(won ? 'win' : 'lose');
  const ser = humanSeries(season)!;
  const fx = ser.fx;
  const opp = m.setup.teams.find((t) => t.id !== me.id)!;
  const homeFirst = m.setup.teams[0].id === fx.home;
  const kills: [number, number] = homeFirst ? [s.kills[0], s.kills[1]] : [s.kills[1], s.kills[0]];
  // Счёт серии с учётом этой игры (хозяева, гости) и с вашей стороны
  const sc: [number, number] = [ser.score[0] + (winner.id === fx.home ? 1 : 0), ser.score[1] + (winner.id === fx.away ? 1 : 0)];
  const meHome = fx.home === me.id;
  const [my, their] = meHome ? sc : [sc[1], sc[0]];
  const over = ser.bestOf === 1 || Math.max(...sc) >= ser.need;
  const title = ser.bestOf === 1 ? (won ? 'Победа' : 'Поражение') : over ? (my > their ? 'Серия выиграна' : 'Серия проиграна') : won ? `Победа в игре ${ser.next}` : `Поражение в игре ${ser.next}`;
  const scoreLine = ser.bestOf > 1
    ? `<div class="ser-score"><span>${crest(me.color, me.tag, 28, me.emblem)}<b>${esc(me.tag)}</b></span><b class="n">${my}<i>:</i>${their}</b><span><b>${esc(opp.tag)}</b>${crest(opp.color, opp.tag, 28, opp.emblem)}</span><small>${STAGE_NAMES[fx.stage]} · до ${ser.need} побед</small></div>`
    : '';
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet full">
    <h2 class="${(over ? my > their : won) ? 'win' : 'lose'}">${title}</h2>${scoreLine}
    ${matchTabs(m, reviewHtml(m, m.setup.teams[0].id === me.id ? 0 : 1))}
    <div class="sheet-foot"><button class="cta wide" id="cont">${over ? 'Дальше' : `К игре ${ser.next + 1}`}</button></div></div>`;
  app.appendChild(overlay);
  bindMatchTabs(overlay);
  document.getElementById('cont')!.onclick = () => {
    const order = lastDraft?.order;
    const bans: [string[], string[]] = lastDraft ? lastDraft.bans : [[], []];
    const gameTxt = ser.bestOf > 1 ? `игра ${ser.next}, ` : '';
    saveReplay(season, `С${season.seasonNo}, ${STAGE_NAMES[fx.stage]}: ${gameTxt}${won ? 'победа' : 'поражение'} против ${opp.tag} ${s.kills[0]}:${s.kills[1]}`, m.setup);
    const mine = m.setup.teams[0].id === me.id ? 0 : 1;
    const bestMulti = s.events.reduce((a, e) => (e.kind === 'kill' && e.killer?.side === mine ? Math.max(a, e.multi) : a), 0);
    const rec = matchRecord(m, bans, order);
    const res = addSeriesGame(season, { winner: winner.id, kills }, rec);
    lastDraft = null;
    overlay.remove();
    if (!res) return draft(); // следующая игра серии
    weekDone(() => finishWeek(season, res, rec, bestMulti));
  };
}

// Завершить неделю и показать итоги тура: все матчи и как изменилась таблица
function weekDone(run: () => void) {
  const week = season.week;
  const before = standings(season).map((x) => x.team.id);
  run();
  const fxs = season.fixtures.filter((f) => f.week === week && f.result);
  home();
  if (fxs.length) roundSheet(week, fxs, before);
}

function roundSheet(week: number, fxs: Fixture[], before: string[]) {
  const me = humanTeam(season);
  const league = fxs[0].stage === 'league';
  const row = (f: Fixture) => {
    const h = teamById(season, f.home);
    const a = teamById(season, f.away);
    const r = f.result!;
    const sc = r.games ? `${r.games[0]}:${r.games[1]}` : `${r.kills[0]}:${r.kills[1]}`;
    const mine = h.id === me.id || a.id === me.id;
    return `<div class="rr ${mine ? 'me' : ''}">
      <span class="rt ${r.winner === h.id ? 'w' : ''}">${crest(h.color, h.tag, 22, h.emblem)}<b>${esc(h.tag)}</b></span>
      <span class="rs">${sc}<small>${r.games ? 'серия' : 'убийства'}</small></span>
      <span class="rt r ${r.winner === a.id ? 'w' : ''}"><b>${esc(a.tag)}</b>${crest(a.color, a.tag, 22, a.emblem)}</span></div>`;
  };
  const table = league
    ? `<h3>Таблица</h3><div class="rtab">${standings(season)
        .map((x, i) => {
          const was = before.indexOf(x.team.id);
          const d = week > 1 ? was - i : 0;
          return `<div class="${x.team.human ? 'me' : ''}"><span class="pl">${i + 1}</span><b>${esc(x.team.name)}</b><span class="dl ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' + d : d < 0 ? '▼' + -d : ''}</span><span>${x.wins}–${x.losses}</span></div>`;
        })
        .join('')}</div>`
    : '';
  const s = sheet(`<h2>Итоги тура</h2><p class="dim small">${league ? `Неделя ${week}` : STAGE_NAMES[fxs[0].stage][0].toUpperCase() + STAGE_NAMES[fxs[0].stage].slice(1)}</p>
    <div class="rlist">${fxs.map(row).join('')}</div>${table}
    <button class="cta wide" id="ok">Понятно</button>`);
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(season);
});
window.addEventListener('pagehide', () => save(season));

// ---------- Заставки ----------

// Заставка перед матчем: гербы съезжаются, VS, название стадии. Касание пропускает.
function vsIntro(teams: [Team, Team], stage: string, then: () => void) {
  if (reduced()) return then();
  const [a, b] = teams;
  const o = document.createElement('div');
  o.className = 'vsi';
  o.innerHTML = `<div class="vsi-half l" style="--c:${SIDE_COLORS[0]}">${crest(SIDE_COLORS[0], a.tag, 96, a.emblem)}<b>${esc(a.name)}</b></div>
    <div class="vsi-half r" style="--c:${SIDE_COLORS[1]}">${crest(SIDE_COLORS[1], b.tag, 96, b.emblem)}<b>${esc(b.name)}</b></div>
    <div class="vsi-mid"><span class="vsi-vs">VS</span><small>${esc(stage[0].toUpperCase() + stage.slice(1))}</small></div>`;
  app.appendChild(o);
  sfx('cheer', 0.8);
  setTimeout(() => sfx('heavy'), 420);
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    o.classList.add('out');
    setTimeout(() => {
      o.remove();
      then();
    }, 260);
  };
  o.onclick = go;
  setTimeout(go, 2300);
}

// Титульный экран: живая сцена, лого, герои, продолжить или новая карьера
function title() {
  const pool = ['hawk', 'granite', 'aurora', 'shade', 'ember'].map((id) => champById(id));
  const me = saved ? humanTeam(season) : null;
  const when = me ? (season.finished ? 'межсезонье' : `неделя ${season.week} из ${totalWeeks(season)}`) : '';
  swap(`<div class="screen title-screen">
    <div class="ts-beams" aria-hidden="true"><i></i><i></i></div>
    <div class="ts-logo"><span class="ts-a">АРЕНА</span><span class="ts-m">МЕНЕДЖЕР</span><small>киберспортивный клуб в ваших руках</small></div>
    <div class="ts-heroes" aria-hidden="true">${pool.map((c, i) => `<span style="--i:${i}">${img(c)}</span>`).join('')}</div>
    <div class="ts-menu">
      ${me ? `<button class="ts-card" id="cont">${crest(me.color, me.tag, 40, me.emblem)}<div><b>${esc(me.name)}</b><small>Сезон ${season.seasonNo} · ${when}</small></div><span class="ts-play">${ICON.play(18)}</span></button>` : ''}
      <button class="cta wide" id="${me ? 'cont2' : 'new'}">${me ? 'Продолжить' : 'Новая карьера'}</button>
      <div class="ts-row">${me ? '<button class="chip" id="new">Новая карьера</button>' : ''}<button class="chip" id="tsnd">${ICON.sound(14)} Звук</button></div>
    </div></div>`);
  const cont = () => {
    sfx('click');
    home();
  };
  document.getElementById('cont')?.addEventListener('click', cont);
  document.getElementById('cont2')?.addEventListener('click', cont);
  document.getElementById('new')!.onclick = () => {
    if (!me) return newGame(false);
    const c = sheet(`<h2>Новая карьера?</h2><p class="dim">Текущий клуб будет удалён. Чтобы вернуться к нему позже, сначала сохраните его в файл во вкладке «Клуб».</p><button class="cta wide" id="yes">Создать новый клуб</button>`);
    c.el.querySelector<HTMLButtonElement>('#yes')!.onclick = () => {
      c.close();
      newGame(true);
    };
  };
  document.getElementById('tsnd')!.onclick = soundSheet;
}

// Живой фон меню: лучи прожекторов и пылинки в свете. Только transform и opacity.
(function ambient() {
  const bg = document.createElement('div');
  bg.id = 'bg';
  bg.setAttribute('aria-hidden', 'true');
  let dust = '';
  for (let i = 0; i < 14; i++) {
    const x = (i * 37) % 100;
    dust += `<i style="left:${x}%;--d:${8 + ((i * 7) % 9)}s;--w:${-((i * 13) % 17)}s;--s:${0.5 + ((i * 3) % 5) / 5}"></i>`;
  }
  bg.innerHTML = `<div class="beam b1"></div><div class="beam b2"></div><div class="dust">${dust}</div>`;
  document.body.prepend(bg);
})();

title();
