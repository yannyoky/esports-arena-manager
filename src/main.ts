// Экраны игры: штаб, состав, таблица, драфт, расстановка, матч, итоги.
import '@fontsource/russo-one/400.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import './style.css';
import { ABILITY_TEXT, ALL_ROLES, CHAMPIONS, Champion, POS_NAMES, POS_ROLES, Player, Pos, ROLE_NAMES, Role, SIDE_COLORS, Team, champById, ovr, value } from './data';
import { DraftState, ORDER, PHASE_NAME, aiChoice, apply, assign, done, newDraft, taken } from './draft';
import { BASE_RULES, Note, PATCH_EVERY, RULE_INFO, Rules, fmtRule, heroPower, modOf, priority, tier } from './meta';
import { ICON, crest } from './icons';
import {
  ACADEMY_COST, ACADEMY_WEEKLY, Deal, Fixture, LEAGUE_WEEKS, ROSTER_MAX, STAFF_INFO, STAFF_MAX, STAGE_NAMES, Season, Stage, StaffRole,
  TRAINING_NAMES, TRAINING_TEXT, Training, acceptChance, asking, setFocus, canTalk, chemistry, chooseSponsor, dropProspect, finishWeek, hireStaff,
  exportSave, hasBackup, loadBackup, parseSave,
  humanFixture, humanTeam, load, matchRecord, matchSetup, negotiate, newSeason, openAcademy, owner, potentialText, release, roster,
  save, saveReplay, sell, sellPrice, signingBonus, sponsorText, staffCost, staffSalary, standings, startNextSeason, swapStarter,
  teamById, totalWeeks, transferFee, upfront,
} from './league';
import { portrait } from './models';
import { CASTERS, Caster, Line } from './commentary';
import { drawMatch } from './render';
import { audioSettings, setAudioMode, setMusic, setVolume, sfx, unlockAudio } from './audio';
import { juiceOpts, juiceTick, timeScale } from './juice';
import { Rng } from './rng';
import { LANE_NAMES } from './map';
import { MATCH_TIME, Match, NEUTRAL_NAMES, STRATEGY_TEXT, Strategy, autoStrategy } from './sim';

const app = document.getElementById('app')!;
let season: Season = load() ?? newSeason();
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
  if (!keep) app.firstElementChild?.classList.add('enter');
  setAudioMode('menu');
}

// Звук: включается по первому касанию, щелчок на кнопках
document.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if ((e.target as HTMLElement).closest('button')) sfx('click');
});
juiceOpts.motion = !reduced();

function soundSheet() {
  const a = audioSettings();
  const s = sheet(`<h2>Звук</h2>
    <label class="vol"><span>Громкость</span><input type="range" min="0" max="100" value="${Math.round(a.vol * 100)}" id="vol"><b id="volv">${Math.round(a.vol * 100)}%</b></label>
    <label class="tog"><input type="checkbox" id="mus" ${a.music ? 'checked' : ''}><span>Музыка в меню и гул арены</span></label>
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
  s.el.querySelector<HTMLButtonElement>('#ok')!.onclick = s.close;
}

// Подсказки новичку: по одной на экран, пока игрок их не закроет
const TIPS: Record<string, string> = {
  home: 'Это штаб клуба. Кнопка матча недели ведёт в драфт: команды по очереди банят и выбирают героев. Потом расстановка по линиям и сам матч. Тренировки идут сами по плану из вкладки «Состав».',
  roster: 'Нажмите на игрока, чтобы увидеть характеристики, любимых героев и контракт. Уставшие и недовольные игроки играют хуже. План тренировок меняется в блоке ниже.',
  market: 'Свободных агентов можно подписать сразу, игроков других клубов придётся выкупать. Зарплаты списываются каждую неделю, следите за балансом вверху.',
  club: 'Персонал усиливает команду, спонсор и болельщики приносят деньги, академия растит таланты. Здесь же повторы матчей и сохранение игры в файл.',
  table: 'Лучшие команды лиги после 10 недель выходят в плей-офф, а чемпион едет на Кубок мира.',
  meta: 'Каждые 3 недели выходит патч: самые популярные и сильные герои слабеют, забытые усиливаются. Тиры подскажут, кого брать в драфте.',
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
  return `<aside class="tip" data-tip="${id}"><span class="tip-i">?</span><p>${TIPS[id]}</p><button class="tip-x" aria-label="Понятно">Понятно</button></aside>`;
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
      el.remove();
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
      <div class="brand">${crest(me.color, me.tag, 30)}<span>${esc(me.name)}</span></div>
      <div class="meta"><span>С${season.seasonNo} · ${when}</span><span class="money ${season.money < 0 ? 'neg' : ''}">${ICON.coin(16)}${season.money.toLocaleString('ru')}</span><button class="snd" id="snd" aria-label="Звук">${audioSettings().vol > 0 ? ICON.sound(18) : ICON.mute(18)}</button></div>
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

function playerRow(p: Player, right = '', cls = '') {
  return `<button class="prow ${cls}" data-p="${p.id}">
    <span class="posl">${POS_NAMES[p.pos]}</span>
    <div class="pmain"><b>${esc(p.nick)}</b><small>${p.age} лет · сила ${r1(ovr(p))}${p.fatigue > 60 ? ' · <i class="warn">устал</i>' : ''}${p.morale < 40 ? ' · <i class="warn">недоволен</i>' : ''}</small></div>
    <div class="favs">${p.favs.map((id) => img(champById(id), 'xs')).join('')}</div>
    ${right}</button>`;
}

function playerInfo(p: Player) {
  const t = owner(season, p);
  return `<div class="pcard">
    <div class="row"><b>${esc(p.nick)}</b><span class="pos">${POS_NAMES[p.pos]}</span></div>
    <div class="dim small">${p.age} лет · ${t ? esc(t.name) : season.academy.includes(p) ? 'академия' : 'свободный агент'} · потенциал ${potentialText(season, p)} · стоимость ${value(p).toLocaleString('ru')}</div>
    ${statBar('Атака', p.atk)}${statBar('Защита', p.def)}${statBar('Тактика', p.iq)}${statBar('Форма', p.form)}${statBar('Настроение', p.morale)}${statBar('Усталость', p.fatigue)}
    <div class="favline"><span class="dim small">Любимые герои</span>${p.favs.map((id) => `${img(champById(id), 'xs')}<small>${champById(id).name}</small>`).join('')}</div>
    <div class="roles">${[...ALL_ROLES].sort((a, b) => p.pool[b] - p.pool[a]).slice(0, 3).map((r) => `<span class="chip">${ROLE_NAMES[r]} ${p.pool[r]}</span>`).join('')}</div>
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
      <h3>Тренировки</h3>
      <p class="dim small">Команда тренируется каждую неделю сама. Выберите, на что делать упор.</p>
      <div class="train">${(Object.keys(TRAINING_NAMES) as Training[])
        .map((t) => `<button class="opt ${season.focus === t ? 'on' : ''}" data-train="${t}" aria-pressed="${season.focus === t}">${TRAIN_ICON[t]}<span>${TRAINING_NAMES[t]}</span><small>${TRAINING_TEXT[t]}</small></button>`)
        .join('')}</div>
    </section>`;
}

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
    top = `<section class="marquee">
      <div class="when">${season.week <= LEAGUE_WEEKS ? `Неделя ${season.week}` : 'Решающий матч'} · ${STAGE_NAMES[fx.stage]}</div>
      <div class="vs">
        <div class="side">${crest(me.color, me.tag, 64)}<b>${esc(me.tag)}</b><small>${record(me)}</small></div>
        <span class="v">VS</span>
        <div class="side">${crest(opp.color, opp.tag, 64)}<b>${esc(opp.tag)}</b><small>${record(opp)}</small></div>
      </div>
      <div class="opp">${esc(opp.name)}${opp.foreign ? ' · зарубежный клуб' : ''}</div>
      <button class="cta" id="play">На драфт</button>
    </section>`;
  } else {
    top = `<section class="marquee"><div class="when">${season.week <= LEAGUE_WEEKS + 2 ? 'Плей-офф' : 'Кубок мира'}</div>
      <p>Ваша команда на этой неделе не играет. Можно заняться трансферами и посмотреть матчи других.</p>
      <button class="cta" id="skipweek">Завершить неделю</button></section>`;
  }
  const focus = `<button class="block patch-card" id="focus"><div class="pc-top">${TRAIN_ICON[season.focus]}<b>Тренировки: ${TRAINING_NAMES[season.focus]}</b><span class="dim small">изменить</span></div></button>`;
  shell('home', `${top}${sponsorNote}${patchCard()}${focus}${logCard()}`);
  document.getElementById('focus')!.onclick = () => rosterScreen();
  const play = document.getElementById('play');
  if (play) play.onclick = () => draft();
  const sk = document.getElementById('skipweek');
  if (sk)
    sk.onclick = () => {
      finishWeek(season);
      home();
    };
  const sp = document.getElementById('sp');
  if (sp) sp.onclick = () => club();
  document.getElementById('patch')!.onclick = () => metaScreen();
}

// Через сколько недель следующий патч (null — в этом сезоне больше не будет)
function nextPatchIn() {
  const w = season.week + (PATCH_EVERY - ((season.week - 1) % PATCH_EVERY));
  return w > totalWeeks(season) ? null : w - season.week;
}

function patchCard() {
  const p = season.meta.patch;
  const n = nextPatchIn();
  const fresh = season.unseenPatch;
  const heroes = p.notes.filter((x) => x.id).slice(0, 4).map((x) => img(champById(x.id!), 'xs ' + (x.kind === 'buff' ? 'up' : 'down'))).join('');
  return `<button class="block patch-card ${fresh ? 'fresh' : ''}" id="patch">
    <div class="pc-top">${ICON.meta(18)}<b>${fresh ? 'Новый патч ' + p.ver : 'Патч ' + p.ver}</b><span class="dim small">${n ? `следующий через ${n} нед.` : 'последний в сезоне'}</span></div>
    <div class="pc-heroes">${heroes}<span class="dim small">${p.notes.length} изменений · читать</span></div>
  </button>`;
}

function logCard() {
  return `<section class="block"><h3>Новости</h3><ul class="log">${season.log
    .slice(0, 6)
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
    ${trainingBlock()}
    <section class="block">
      <div class="row"><h3>Стартовая пятёрка</h3><span class="dim small">сыгранность ${Math.round(chem * 100)}%</span></div>
      <div class="chem"><i style="--v:${Math.round(chem * 100)}%"></i></div>
      ${me.players.map((p) => playerRow(p, `<em class="dim small">${p.contract <= 1 ? 'последний сезон' : ''}</em>`)).join('')}
    </section>
    <section class="block">
      <div class="row"><h3>Запас</h3><span class="dim small">${roster(me).length}/${ROSTER_MAX} игроков</span></div>
      ${me.bench.length ? me.bench.map((p) => playerRow(p)).join('') : '<p class="dim small">Запасных нет. Игроков можно купить на рынке или перевести из академии.</p>'}
    </section>
    <p class="dim small center">Зарплаты состава: ${wage} в неделю. Нажмите на игрока, чтобы заменить, продать или продлить контракт.</p>`);
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
    <section class="block">
      <div class="seg">${(['free', 'clubs'] as const).map((k) => `<button class="chip ${marketTab === k ? 'on' : ''}" data-mt="${k}">${k === 'free' ? 'Свободные агенты' : 'Игроки клубов'}</button>`).join('')}</div>
      <div class="seg">${[-1, 0, 1, 2, 3, 4].map((i) => `<button class="chip ${marketPos === i ? 'on' : ''}" data-mp="${i}">${i < 0 ? 'Все' : POS_NAMES[i]}</button>`).join('')}</div>
      <p class="dim small">${marketTab === 'free' ? 'Свободным агентам нужны только подъёмные. Список обновляется каждую неделю.' : 'Клуб отпустит игрока за трансферную сумму.'} В составе ${roster(me).length}/${ROSTER_MAX}.</p>
    </section>
    <section class="block">${shown
      .map((p) => {
        const t = owner(season, p);
        const price = marketTab === 'free' ? signingBonus(p) : transferFee(p);
        return playerRow(p, `<em class="price">${t ? `<small>${esc(t.tag)}</small>` : ''}${price.toLocaleString('ru')}</em>`);
      })
      .join('') || '<p class="dim small">Никого нет.</p>'}</section>`);
  on('[data-mt]', (b) => ((marketTab = b.dataset.mt as 'free' | 'clubs'), market()));
  on('[data-mp]', (b) => ((marketPos = +b.dataset.mp! as Pos | -1), market()));
  on('[data-p]', (el) => {
    const p = findPlayer(el.dataset.p!);
    talk(p, owner(season, p) ? 'buy' : 'sign', market);
  });
}

// ---------- Клуб: спонсоры, персонал, академия, повторы, история ----------

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
  const acad = !season.academyOpen
    ? `<p class="dim small">Академия растит молодых игроков 15–17 лет с высоким потенциалом. Каждый сезон приходят новые. Открытие ${ACADEMY_COST.toLocaleString('ru')}, содержание ${ACADEMY_WEEKLY} в неделю.</p>
       <button class="cta wide" id="acad">Открыть академию</button>`
    : season.academy.length
      ? season.academy.map((p) => playerRow(p, `<em class="dim small">потенциал ${potentialText(season, p)}</em>`)).join('')
      : '<p class="dim small">Пока пусто: новые таланты придут в начале сезона.</p>';
  shell('club', `
    <section class="block"><h3>Спонсор и болельщики</h3>
      <div class="row"><span>Болельщиков</span><b>${season.fans.toLocaleString('ru')}</b></div>
      <p class="dim small">Победы и трофеи приводят новых болельщиков. Каждую неделю с матчем клуб получает за билеты ${Math.round(season.fans * 0.6).toLocaleString('ru')}.</p>
      ${sp
        ? `<div class="sponsor on"><b>${esc(sp.name)}</b><small>${sponsorText(sp)}</small></div>`
        : `<p class="warn small">Выберите спонсора на сезон:</p>${season.offers.map((o) => `<button class="sponsor" data-sp="${o.id}"><b>${esc(o.name)}</b><small>${sponsorText(o)}</small></button>`).join('')}`}
    </section>
    <section class="block"><h3>Персонал</h3>${staff}</section>
    <section class="block"><h3>Академия</h3>${acad}</section>
    <section class="block"><h3>Повторы матчей</h3>${season.replays.length
      ? season.replays.map((r) => `<button class="prow" data-r="${r.id}"><span class="posl">${ICON.play(14)}</span><div class="pmain"><b>${esc(r.label)}</b></div></button>`).join('')
      : '<p class="dim small">Здесь появятся ваши последние матчи.</p>'}</section>
    <section class="block"><h3>Сохранение</h3>
      <p class="dim small">Игра сохраняется сама после каждого действия. Файл сохранения можно перенести на другое устройство или оставить на всякий случай.</p>
      <div class="acts-row"><button class="chip on" id="exp">${ICON.save(16)}Сохранить в файл</button><button class="chip" id="imp">Загрузить из файла</button></div>
      ${hasBackup() ? '<button class="chip" id="bak">Вернуть начало прошлой недели</button>' : ''}
      <input type="file" id="impf" accept=".json,application/json" hidden>
    </section>
    <section class="block"><h3>История клуба</h3>${season.history.length
      ? season.history.map((h) => `<div class="row"><span>Сезон ${h.season}</span><span>${h.place}-е место${h.titles.length ? ' · ' + h.titles.length + ' ' + ICON.star(14) : ''}</span></div>`).join('')
      : '<p class="dim small">Первый сезон клуба ещё идёт.</p>'}</section>`);
  on('[data-sp]', (b) => {
    chooseSponsor(season, season.offers.find((o) => o.id === b.dataset.sp)!);
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
  saveControls();
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

function table() {
  const rows = standings(season)
    .map(
      (s, i) => `<tr class="${s.team.human ? 'me' : ''}"><td>${i + 1}</td><td class="tm">${crest(s.team.color, s.team.tag, 22)}${esc(s.team.name)}</td>
      <td>${s.wins}</td><td>${s.losses}</td><td>${s.kd > 0 ? '+' : ''}${s.kd}</td></tr>`,
    )
    .join('');
  const tie = (f: Fixture) => {
    const a = teamById(season, f.home);
    const b = teamById(season, f.away);
    const w = f.result?.winner;
    const side = (t: Team) => `<div class="bt ${w === t.id ? 'win' : w ? 'lose' : ''} ${t.human ? 'me' : ''}">${crest(t.color, t.tag, 18)}<span>${esc(t.name)}</span></div>`;
    return `<div class="tie">${side(a)}${side(b)}</div>`;
  };
  const stage = (st: Stage, name: string) => {
    const fs = season.fixtures.filter((f) => f.stage === st);
    return fs.length ? `<div class="round"><small>${name}</small>${fs.map(tie).join('')}</div>` : '';
  };
  const po = stage('semi', 'Полуфиналы') + stage('final', 'Финал');
  const intl = stage('intl-semi', 'Полуфиналы') + stage('intl-final', 'Финал');
  shell('table', `<section class="block"><h3>Лига · сезон ${season.seasonNo}</h3><table class="tbl"><thead><tr><th>#</th><th>Команда</th><th>П</th><th>Пр</th><th>±</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="dim small">После ${LEAGUE_WEEKS} недель четыре лучших выходят в плей-офф. Чемпион едет на Кубок мира против зарубежных клубов.</p></section>
    ${po ? `<section class="block"><h3>Плей-офф</h3><div class="bracket">${po}</div></section>` : ''}
    ${intl ? `<section class="block"><h3>Кубок мира</h3><div class="bracket">${intl}</div></section>` : ''}`);
}

// ---------- Мета и патчи ----------

function noteRow(n: Note) {
  const c = n.id ? champById(n.id) : null;
  const mark = n.kind === 'rule' ? (n.why.startsWith('▲') ? 'buff' : 'nerf') : n.kind;
  const why = n.why.replace(/^[▲▼] /, '');
  return `<li class="note ${mark}">${c ? img(c, 'xs') : `<span class="nico">${ICON.meta(16)}</span>`}
    <div><b>${esc(n.text)}</b><small>${esc(why)}</small></div></li>`;
}

function metaScreen() {
  const m = season.meta;
  const p = m.patch;
  season.unseenPatch = false;
  save(season);
  const n = nextPatchIn();
  const tiers = (['S', 'A', 'B', 'C'] as const)
    .map((t) => {
      const list = CHAMPIONS.filter((c) => tier(m, c.id) === t).sort((a, b) => heroPower(m, b.id) - heroPower(m, a.id));
      return `<div class="tier"><b class="t${t}">${t}</b><div>${list.map((c) => `<span class="th" title="${c.name}">${img(c, 'xs')}</span>`).join('') || '<span class="dim small">—</span>'}</div></div>`;
    })
    .join('');
  const rows = [...CHAMPIONS]
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
  shell('meta', `
    <section class="block patch-head">
      <div class="row"><b>Патч ${p.ver}</b><span class="dim small">неделя ${p.week} · ${n ? `следующий через ${n} нед.` : 'последний в сезоне'}</span></div>
      <p class="dim small">Раз в ${PATCH_EVERY} недели разработчики смотрят на статистику лиги: кого чаще берут и банят, кто побеждает. Сильных ослабляют, забытых усиливают, награды за убийства и объекты меняют.</p>
      <ul class="notes">${p.notes.map(noteRow).join('')}</ul>
    </section>
    <section class="block"><h3>Тир-лист</h3>${tiers}</section>
    <section class="block"><h3>Статистика патча</h3>${m.win.games
      ? `<p class="dim small">Сыграно матчей на этом патче: ${m.win.games}. Самые приоритетные в драфте:</p>
      <table class="tbl"><thead><tr><th>Герой</th><th>Пик</th><th>Бан</th><th>Побед</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="dim small">Статистика появится после первых матчей на этом патче.</p>'}</section>
    <section class="block"><h3>Награды и правила</h3><table class="tbl rules"><tbody>${rules}</tbody></table></section>
    ${hist ? `<section class="block"><h3>Прошлые патчи</h3>${hist}</section>` : ''}`);
}

// ---------- Драфт ----------

const img = (c: Champion, cls = '') => `<img class="pt ${cls}" src="${portrait(c)}" alt="">`;

function draft() {
  const me = humanTeam(season);
  const fx = humanFixture(season)!;
  const opp = teamById(season, fx.home === me.id ? fx.away : fx.home);
  const mySide: 0 | 1 = fx.home === me.id ? 0 : 1;
  const teams: [Team, Team] = mySide === 0 ? [me, opp] : [opp, me];
  const rng = new Rng(season.seed + season.week * 31);
  const d = newDraft();
  let sel: string | null = null;
  let filter: Role | 'all' = 'all';
  let timer = 0;
  let aiHover: string | null = null;
  const HUMAN_TIME = 30;
  let left = HUMAN_TIME;

  const bestFor = (c: Champion) => Math.max(...me.players.map((p) => p.pool[c.role]));
  const meta = season.meta;
  const noteOf = (c: Champion) => meta.patch.notes.find((n) => n.id === c.id);
  const favOf = (c: Champion) => me.players.find((p) => p.favs.includes(c.id));
  let tip: string | null = null; // совет тренера по драфту
  const badge = (c: Champion) => {
    const n = noteOf(c);
    const t = tier(meta, c.id);
    return `${t === 'S' ? '<i class="tier-s">S</i>' : ''}${n ? `<i class="pb ${n.kind}">${n.kind === 'buff' ? '▲' : '▼'}</i>` : ''}${favOf(c) ? '<i class="fav">♥</i>' : ''}${tip === c.id ? '<i class="tipl">совет</i>' : ''}`;
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
    const list = CHAMPIONS.filter((c) => filter === 'all' || c.role === filter);
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
            : `<div class="hint">${myTurn ? (st.act === 'ban' ? 'Выберите героя, которого уберёте у соперника' : 'Выберите героя для своей команды') : st ? `${esc(teams[st.side].name)} думают…` : ''}</div>`
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
      tip = season.staff.coach > 0 ? aiChoice(d, me, opp, new Rng(season.seed + d.step * 61 + season.week), meta) : null;
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
      <header class="lineup-head"><h2>Расстановка</h2><p>Каждый игрок стоит на своей позиции. Нажмите на двух игроков, чтобы поменять их героев.</p></header>
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
      <section class="strats"><h3>Стратегия на матч</h3>${(Object.keys(STRATEGY_TEXT) as Strategy[])
        .map((k) => `<button class="strat ${strat === k ? 'on' : ''}" data-s="${k}"><b>${STRATEGY_TEXT[k][0]}</b><small>${STRATEGY_TEXT[k][1]}</small></button>`)
        .join('')}<p class="dim small">Разведка: соперник, скорее всего, выберет «${STRATEGY_TEXT[foeStrat][0]}».</p></section>
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
      playMatch(new Match(matchSetup(season, teams, p, season.seed + season.week * 977 + season.seasonNo * 13, { strategies: st })), 'live');
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

function playMatch(m: Match, mode: 'live' | 'replay') {
  const [a, b] = m.setup.teams;
  swap(`<div class="screen match">
    <div class="bug">
      <div class="t">${crest(SIDE_COLORS[0], a.tag, 26)}<b>${esc(a.tag)}</b></div>
      <div class="sc"><b id="k0">0</b><span id="clock">5:00</span><b id="k1">0</b></div>
      <div class="t r"><b>${esc(b.tag)}</b>${crest(SIDE_COLORS[1], b.tag, 26)}</div>
    </div>
    <div class="objs"><span id="o0"></span><span id="o1"></span></div>
    <div class="field"><canvas id="cv"></canvas><ul class="feed" id="feed"></ul>
      <div class="banner" id="banner" aria-hidden="true"></div>
      <div class="cast" id="cast" aria-live="polite"></div></div>
    <div class="ctrl">
      <button data-speed="1" class="on" aria-label="Скорость 1">${ICON.play(18)}<span>1×</span></button>
      <button data-speed="2" aria-label="Скорость 2">${ICON.fast(18)}<span>2×</span></button>
      <button data-speed="4" aria-label="Скорость 4">${ICON.fast(18)}<span>4×</span></button>
      <button id="cam" class="${autoCam ? 'on' : ''}" aria-label="Камера">${ICON.eye(18)}<span>Камера</span></button>
      <button id="skip" aria-label="К итогам">${ICON.skip(18)}<span>${mode === 'replay' ? 'Выход' : 'Итог'}</span></button>
    </div></div>`);
  setAudioMode('match');
  const cv = document.getElementById('cv') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  let dpr = 1;
  let feedLen = 0;
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
  const hud = () => {
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
      feedLen = key;
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
    } else if (!m.s.over && !running) {
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
    drawMatch(ctx, m, cv.width, cv.height, dpr, autoCam);
    hud();
    if (mode === 'live') result(m);
    else {
      const s = sheet(`<h2>Повтор</h2>${statsHtml(m)}<button class="cta wide" id="cont">Закрыть</button>`, club);
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

// Подробная статистика: K/D/A, золото, урон, лечение и график золота
function statsHtml(m: Match) {
  const s = m.s;
  const score = (u: (typeof s.units)[0]) => u.kills * 3 + u.assists * 1.5 - u.deaths + u.heroDmg / 1500 + u.towerDmg / 2500 + u.healed / 800;
  const mvp = [...s.units].sort((x, y) => score(y) - score(x))[0];
  const k = (n: number) => (n >= 1000 ? (r1(n / 100) / 10).toFixed(1) + 'к' : String(r1(n)));
  const rows = (side: 0 | 1) =>
    s.units
      .filter((u) => u.side === side)
      .map(
        (u) => `<tr class="${u === mvp ? 'mvp' : ''}"><td class="tm"><span class="dot" style="background:${SIDE_COLORS[u.side]}"></span>${img(u.champ, 'xs')}<span class="nk">${esc(u.player.nick)}</span></td>
        <td>${u.kills}/${u.deaths}/${u.assists}</td><td>${k(u.gold)}</td><td>${k(u.heroDmg)}</td><td>${k(u.towerDmg)}</td><td>${u.healed ? k(u.healed) : '–'}</td></tr>`,
      )
      .join('');
  const tot = (side: 0 | 1) => s.units.filter((u) => u.side === side).reduce((a, u) => a + u.gold, 0);
  // график разницы золота
  const line = s.goldLine;
  const max = Math.max(500, ...line.map(Math.abs));
  const W = 300;
  const H = 70;
  const pts = line.map((v, i) => `${((i / Math.max(1, line.length - 1)) * W).toFixed(1)},${(H / 2 - (v / max) * (H / 2 - 4)).toFixed(1)}`).join(' ');
  const [a, b] = m.setup.teams;
  return `<p class="dim">${s.cores[0].hp <= 0 || s.cores[1].hp <= 0 ? 'Ядро разрушено' : 'По истечении времени'} · убийства ${s.kills[0]} : ${s.kills[1]} · башни ${s.towersDown[0]} : ${s.towersDown[1]} · объекты ${s.objectives[0]} : ${s.objectives[1]}</p>
    <div class="mvp-card">${img(mvp.champ)}<div><small>Лучший игрок матча</small><b>${esc(mvp.player.nick)}</b><span>${mvp.champ.name} · ${mvp.kills}/${mvp.deaths}/${mvp.assists}</span></div></div>
    <div class="gold"><div class="row"><small style="color:${SIDE_COLORS[0]}">${esc(a.tag)} ${k(tot(0))}</small><small class="dim">разница золота</small><small style="color:${SIDE_COLORS[1]}">${k(tot(1))} ${esc(b.tag)}</small></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="zero"/><polyline points="${pts}" class="gl"/></svg></div>
    <div class="tbl-wrap"><table class="tbl stats"><thead><tr><th>Игрок</th><th>У/С/П</th><th>Зол.</th><th>Герои</th><th>Строен.</th><th>Леч.</th></tr></thead>
    <tbody>${rows(0)}<tr class="gap"><td colspan="6"></td></tr>${rows(1)}</tbody></table></div>`;
}

function result(m: Match) {
  const me = humanTeam(season);
  const s = m.s;
  const winner = m.setup.teams[s.winner as 0 | 1];
  const won = winner.id === me.id;
  sfx(won ? 'win' : 'lose');
  const fx = humanFixture(season)!;
  const opp = m.setup.teams.find((t) => t.id !== me.id)!;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet">
    <h2 class="${won ? 'win' : 'lose'}">${won ? 'Победа' : 'Поражение'}</h2>
    ${statsHtml(m)}
    <button class="cta wide" id="cont">Дальше</button></div>`;
  app.appendChild(overlay);
  document.getElementById('cont')!.onclick = () => {
    const order = lastDraft?.order;
    const bans: [string[], string[]] = lastDraft ? lastDraft.bans : [[], []];
    saveReplay(season, `С${season.seasonNo}, ${STAGE_NAMES[fx.stage]}: ${won ? 'победа' : 'поражение'} против ${opp.tag} ${s.kills[0]}:${s.kills[1]}`, m.setup);
    finishWeek(season, { winner: winner.id, kills: [s.kills[0], s.kills[1]] }, matchRecord(m, bans, order));
    lastDraft = null;
    home();
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(season);
});
window.addEventListener('pagehide', () => save(season));

home();
