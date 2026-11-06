// Экраны игры: штаб, состав, таблица, драфт, расстановка, матч, итоги.
import '@fontsource/russo-one/400.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import './style.css';
import { ABILITY_TEXT, ALL_ROLES, CHAMPIONS, Champion, POS_NAMES, POS_ROLES, ROLE_NAMES, Role, SIDE_COLORS, Team, champById } from './data';
import { DraftState, ORDER, PHASE_NAME, aiChoice, apply, assign, done, newDraft, taken } from './draft';
import { BASE_RULES, Note, PATCH_EVERY, RULE_INFO, Rules, fmtRule, heroPower, modOf, priority, tier } from './meta';
import { ICON, crest } from './icons';
import {
  Season, TRAINING_NAMES, Training, applyTraining, clearSave, finishWeek, humanFixture, humanTeam, load,
  matchRecord, newSeason, save, standings, teamById, totalWeeks,
} from './league';
import { portrait } from './models';
import { drawMatch } from './render';
import { Rng } from './rng';
import { LANE_NAMES } from './map';
import { MATCH_TIME, Match, NEUTRAL_NAMES, STRATEGY_TEXT, Strategy, autoStrategy } from './sim';

const app = document.getElementById('app')!;
let season: Season = load() ?? newSeason();
let trainedWeek = 0;
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
}

function shell(active: string, body: string) {
  const me = humanTeam(season);
  const tabs: [string, string, string][] = [
    ['home', 'Штаб', ICON.stage()],
    ['roster', 'Состав', ICON.roster()],
    ['table', 'Таблица', ICON.table()],
    ['meta', 'Мета', ICON.meta()],
  ];
  swap(`<div class="screen">
    <header class="top">
      <div class="brand">${crest(me.color, me.tag, 30)}<span>${esc(me.name)}</span></div>
      <div class="meta"><span>Неделя ${season.week}/${totalWeeks(season)}</span><span class="money">${ICON.coin(16)}${season.money.toLocaleString('ru')}</span></div>
    </header>
    <main>${body}</main>
    <nav class="tabs">${tabs
      .map(([id, label, ic]) => `<button data-tab="${id}" class="${active === id ? 'on' : ''}">${ic}<span>${label}</span></button>`)
      .join('')}</nav></div>`);
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab!)));
}

function go(tab: string) {
  if (tab === 'roster') return roster();
  if (tab === 'table') return table();
  if (tab === 'meta') return metaScreen();
  return home();
}

const record = (t: Team) => {
  const st = standings(season).find((x) => x.team.id === t.id)!;
  return `${st.wins}–${st.losses}`;
};

// ---------- Штаб ----------

const TRAIN_ICON: Record<Training, string> = { atk: ICON.sword(22), def: ICON.shield(22), iq: ICON.brain(22), rest: ICON.rest(22) };

function home() {
  const me = humanTeam(season);
  const fx = humanFixture(season);
  if (season.finished || !fx) {
    const place = standings(season).findIndex((x) => x.team.human) + 1;
    shell('home', `
      <section class="marquee"><h2>Сезон окончен</h2><p class="big">${place}-е место</p>
      <button class="cta" id="newgame">Новый сезон</button></section>${logCard()}`);
    document.getElementById('newgame')!.onclick = () => {
      clearSave();
      season = newSeason();
      save(season);
      home();
    };
    return;
  }
  const opp = teamById(season, fx.home === me.id ? fx.away : fx.home);
  const trained = trainedWeek === season.week;
  shell('home', `
    <section class="marquee">
      <div class="when">Неделя ${season.week} · матч лиги</div>
      <div class="vs">
        <div class="side">${crest(me.color, me.tag, 64)}<b>${esc(me.tag)}</b><small>${record(me)}</small></div>
        <span class="v">VS</span>
        <div class="side">${crest(opp.color, opp.tag, 64)}<b>${esc(opp.tag)}</b><small>${record(opp)}</small></div>
      </div>
      <div class="opp">${esc(opp.name)}</div>
      <button class="cta" id="play" ${trained ? '' : 'disabled'}>${trained ? 'На драфт' : 'Сначала проведите тренировку'}</button>
    </section>
    ${patchCard()}
    <section class="block">
      <h3>Тренировка недели</h3>
      <div class="train">${(Object.keys(TRAINING_NAMES) as Training[])
        .map((t) => `<button class="opt" data-train="${t}" ${trained ? 'disabled' : ''}>${TRAIN_ICON[t]}<span>${TRAINING_NAMES[t]}</span></button>`)
        .join('')}</div>
    </section>
    ${logCard()}`);
  app.querySelectorAll<HTMLButtonElement>('[data-train]').forEach(
    (b) =>
      (b.onclick = () => {
        applyTraining(season, b.dataset.train as Training);
        trainedWeek = season.week;
        save(season);
        home();
      }),
  );
  document.getElementById('play')!.onclick = () => trained && draft();
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
    .slice(0, 5)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('')}</ul></section>`;
}

// ---------- Состав и таблица ----------

function statBar(label: string, v: number) {
  return `<div class="stat"><span>${label}</span><i><b style="--v:${v}%"></b></i><em>${r1(v)}</em></div>`;
}

function roster() {
  const me = humanTeam(season);
  shell('roster', me.players
    .map((p) => {
      const best = [...ALL_ROLES].sort((a, b) => p.pool[b] - p.pool[a]).slice(0, 2);
      return `<section class="block player">
        <div class="row"><b>${esc(p.nick)}</b><span class="pos">${POS_NAMES[p.pos]}</span></div>
        <div class="dim small">Зарплата ${p.salary} в неделю · лучше всего: ${POS_ROLES[p.pos].map((r) => ROLE_NAMES[r]).join(', ')}</div>
        ${statBar('Атака', p.atk)}${statBar('Защита', p.def)}${statBar('Тактика', p.iq)}${statBar('Форма', p.form)}
        <div class="roles">${best.map((r) => `<span class="chip">${ROLE_NAMES[r]} ${p.pool[r]}</span>`).join('')}</div>
      </section>`;
    })
    .join(''));
}

function table() {
  const rows = standings(season)
    .map(
      (s, i) => `<tr class="${s.team.human ? 'me' : ''}"><td>${i + 1}</td><td class="tm">${crest(s.team.color, s.team.tag, 22)}${esc(s.team.name)}</td>
      <td>${s.wins}</td><td>${s.losses}</td><td>${s.kd > 0 ? '+' : ''}${s.kd}</td></tr>`,
    )
    .join('');
  shell('table', `<section class="block"><table class="tbl"><thead><tr><th>#</th><th>Команда</th><th>П</th><th>Пр</th><th>±</th></tr></thead><tbody>${rows}</tbody></table></section>`);
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
  const badge = (c: Champion) => {
    const n = noteOf(c);
    const t = tier(meta, c.id);
    return `${t === 'S' ? '<i class="tier-s">S</i>' : ''}${n ? `<i class="pb ${n.kind}">${n.kind === 'buff' ? '▲' : '▼'}</i>` : ''}`;
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
            return `<button class="hero-btn ${by} ${sel === c.id ? 'on' : ''} ${aiHover === c.id ? 'ai' : ''}" data-c="${c.id}" ${gone || !myTurn ? 'disabled' : ''} aria-label="${c.name}">
              ${img(c, gone ? 'gone' : '')}${gone ? (by === 'bn' ? `<i class="took">${ICON.ban(14)}</i>` : '') : badge(c)}<span>${c.name}</span></button>`;
          })
          .join('')}</div>
        <div class="pick-bar">${
          selC && myTurn
            ? `<div class="info">${img(selC)}<div><b>${selC.name}</b><small>${ROLE_NAMES[selC.role]} · владение ${bestFor(selC)} · тир ${tier(meta, selC.id)}</small><small>${noteOf(selC) ? `<span class="${noteOf(selC)!.kind === 'buff' ? 'up' : 'down'}">Патч ${meta.patch.ver}: ${noteOf(selC)!.text.split(': ')[1]}</span>` : ABILITY_TEXT[selC.ab]}</small></div></div>
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
            ${img(c)}<div><b>${esc(p.nick)}</b><small>${c.name} · ${ROLE_NAMES[c.role]}${onPos ? '' : ' · <i class="warn">не его позиция</i>'}</small></div>
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
      playMatch(new Match({ teams, picks: p, strategies: st, seed: season.seed + season.week * 977, patch: season.meta.patch }));
    };
  };
  render();
}

// ---------- Матч ----------

function playMatch(m: Match) {
  const [a, b] = m.setup.teams;
  swap(`<div class="screen match">
    <div class="bug">
      <div class="t">${crest(SIDE_COLORS[0], a.tag, 26)}<b>${esc(a.tag)}</b></div>
      <div class="sc"><b id="k0">0</b><span id="clock">5:00</span><b id="k1">0</b></div>
      <div class="t r"><b>${esc(b.tag)}</b>${crest(SIDE_COLORS[1], b.tag, 26)}</div>
    </div>
    <div class="objs"><span id="o0"></span><span id="o1"></span></div>
    <div class="field"><canvas id="cv"></canvas><ul class="feed" id="feed"></ul></div>
    <div class="ctrl">
      <button data-speed="1" class="on" aria-label="Скорость 1">${ICON.play(18)}<span>1×</span></button>
      <button data-speed="2" aria-label="Скорость 2">${ICON.fast(18)}<span>2×</span></button>
      <button data-speed="4" aria-label="Скорость 4">${ICON.fast(18)}<span>4×</span></button>
      <button id="skip" aria-label="К итогам">${ICON.skip(18)}<span>Итог</span></button>
    </div></div>`);
  const cv = document.getElementById('cv') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  let dpr = 1;
  let feedLen = 0;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const hud = () => {
    document.getElementById('k0')!.textContent = String(m.s.kills[0]);
    document.getElementById('k1')!.textContent = String(m.s.kills[1]);
    const left = Math.max(0, MATCH_TIME - m.s.time);
    document.getElementById('clock')!.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    for (const sd of [0, 1] as const) {
      const bits = [`${ICON.tower(13)}${m.s.towersDown[sd]}`];
      if (m.s.spirit[sd]) bits.push(`<i class="buff sp">Дух ×${m.s.spirit[sd]}</i>`);
      if (m.s.siege[sd] > 0) bits.push(`<i class="buff cl">Колосс ${Math.ceil(m.s.siege[sd])}</i>`);
      document.getElementById('o' + sd)!.innerHTML = bits.join('');
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
          const killer = k.killer ? img(k.killer.champ, 'xs') : `<span class="core-ic" style="background:${col}"></span>`;
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
    acc += Math.min(dt, 0.25) * speed;
    while (acc >= 1 / 30 && !m.s.over) {
      m.step();
      acc -= 1 / 30;
    }
    drawMatch(ctx, m, cv.width, cv.height, dpr);
    hud();
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
    drawMatch(ctx, m, cv.width, cv.height, dpr);
    hud();
    result(m);
  };

  app.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(
    (btn) =>
      (btn.onclick = () => {
        speed = +btn.dataset.speed!;
        app.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === btn));
      }),
  );
  document.getElementById('skip')!.onclick = end;
}

function result(m: Match) {
  const me = humanTeam(season);
  const s = m.s;
  const winner = m.setup.teams[s.winner as 0 | 1];
  const won = winner.id === me.id;
  const score = (u: (typeof s.units)[0]) => u.kills * 3 - u.deaths + u.dealt / 1500 + u.healed / 800;
  const mvp = [...s.units].sort((x, y) => score(y) - score(x))[0];
  const rows = s.units
    .map(
      (u) => `<tr class="${u === mvp ? 'mvp' : ''}"><td class="tm"><span class="dot" style="background:${SIDE_COLORS[u.side]}"></span>${img(u.champ, 'xs')}${esc(u.player.nick)}</td>
      <td>${u.kills}/${u.deaths}</td><td>${(r1(u.dealt / 100) / 10).toFixed(1)}к</td><td>${u.healed ? (r1(u.healed / 100) / 10).toFixed(1) + 'к' : '–'}</td></tr>`,
    )
    .join('');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet">
    <h2 class="${won ? 'win' : 'lose'}">${won ? 'Победа' : 'Поражение'}</h2>
    <p class="dim">${s.cores[0].hp <= 0 || s.cores[1].hp <= 0 ? 'Ядро разрушено' : 'По истечении времени'} · убийства ${s.kills[0]} : ${s.kills[1]} · башни ${s.towersDown[0]} : ${s.towersDown[1]}</p>
    <div class="mvp-card">${img(mvp.champ)}<div><small>Лучший игрок матча</small><b>${esc(mvp.player.nick)}</b><span>${mvp.champ.name} · ${mvp.kills}/${mvp.deaths}</span></div></div>
    <table class="tbl"><thead><tr><th>Игрок</th><th>У/С</th><th>Урон</th><th>Леч.</th></tr></thead><tbody>${rows}</tbody></table>
    <button class="cta wide" id="cont">Дальше</button></div>`;
  app.appendChild(overlay);
  document.getElementById('cont')!.onclick = () => {
    const order = lastDraft?.order;
    const bans: [string[], string[]] = lastDraft ? lastDraft.bans : [[], []];
    finishWeek(season, { winner: winner.id, kills: [s.kills[0], s.kills[1]] }, matchRecord(m, bans, order));
    lastDraft = null;
    home();
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(season);
});

home();
