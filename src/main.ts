// Экраны игры: штаб, состав, таблица, драфт, расстановка, матч, итоги.
import '@fontsource/russo-one/400.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import './style.css';
import { ABILITY_TEXT, ALL_ROLES, CHAMPIONS, Champion, ROLE_NAMES, Role, SIDE_COLORS, Team, champById } from './data';
import { ORDER, PHASE_NAME, aiChoice, apply, assign, done, newDraft, taken } from './draft';
import { ICON, crest } from './icons';
import {
  Season, TRAINING_NAMES, Training, applyTraining, clearSave, finishWeek, humanFixture, humanTeam, load,
  newSeason, save, standings, teamById, totalWeeks,
} from './league';
import { portrait } from './models';
import { drawMatch } from './render';
import { Rng } from './rng';
import { MATCH_TIME, Match } from './sim';

const app = document.getElementById('app')!;
let season: Season = load() ?? newSeason();
let trainedWeek = 0;
let cleanup: (() => void) | null = null;

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
        <div class="row"><b>${esc(p.nick)}</b><span class="dim">${p.salary} в неделю</span></div>
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
        <span>${c ? c.name : pc ? pc.name : ''}</span></div>`;
    }).join('');
  };

  const banRow = (side: 0 | 1) =>
    Array.from({ length: 3 }, (_, i) => {
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
    const who = st ? `${st.act === 'ban' ? 'Бан' : 'Пик'} ${st.side === 0 ? 'синих' : 'красных'}` : 'Драфт завершён';
    swap(`<div class="screen draft">
      <div class="phase" style="--side:${st ? SIDE_COLORS[st.side] : 'var(--stage)'}">
        <div class="names"><span class="b">${esc(teams[0].tag)}</span><b>${who}</b><span class="r">${esc(teams[1].tag)}</span></div>
        <small>${st ? `${PHASE_NAME(d.step)} · ход ${d.step + 1} из ${ORDER.length}` : ''}${myTurn ? ' · ваш ход' : ''}</small>
        <div class="timer"><i id="tbar" style="transform:scaleX(${myTurn ? left / HUMAN_TIME : 1})"></i></div>
      </div>
      <div class="cols"><div class="col">${slots(0)}</div><div class="col">${slots(1)}</div></div>
      <div class="bans"><div>${banRow(0)}</div>${ICON.ban(16)}<div>${banRow(1)}</div></div>
      <div class="pool-wrap">
        <div class="filters">${(['all', ...ALL_ROLES] as const)
          .map((r) => `<button class="chip ${filter === r ? 'on' : ''}" data-f="${r}">${r === 'all' ? 'Все' : ROLE_NAMES[r]}</button>`)
          .join('')}</div>
        <div class="pool">${list
          .map((c) => {
            const gone = tk.has(c.id);
            return `<button class="hero-btn ${sel === c.id ? 'on' : ''} ${aiHover === c.id ? 'ai' : ''}" data-c="${c.id}" ${gone || !myTurn ? 'disabled' : ''} aria-label="${c.name}">
              ${img(c, gone ? 'gone' : '')}<span>${c.name}</span></button>`;
          })
          .join('')}</div>
        <div class="pick-bar">${
          selC && myTurn
            ? `<div class="info">${img(selC)}<div><b>${selC.name}</b><small>${ROLE_NAMES[selC.role]} · владение ${bestFor(selC)}</small><small>${ABILITY_TEXT[selC.ab]}</small></div></div>
               <button class="cta ${st.act}" id="lock">${st.act === 'ban' ? 'Забанить' : 'Выбрать'}</button>`
            : `<div class="hint">${myTurn ? (st.act === 'ban' ? 'Выберите героя, которого уберёте у соперника' : 'Выберите героя для своей команды') : st ? `${esc(teams[st.side].name)} думают…` : ''}</div>`
        }</div>
      </div></div>`, !first);
    if (first) cleanup = clearAll;
    first = false;
    app.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => (b.onclick = () => ((filter = b.dataset.f as Role | 'all'), render())));
    app.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => (b.onclick = () => ((sel = b.dataset.c!), render())));
    const lock = document.getElementById('lock');
    if (lock) lock.onclick = () => commit(sel!);
  };

  const recommend = () => aiChoice(d, me, opp, rng);

  const commit = (id: string) => {
    clearAll();
    apply(d, id);
    sel = null;
    aiHover = null;
    next();
  };

  const next = () => {
    if (done(d)) return lineup(teams, mySide, d.picks);
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
      const choice = aiChoice(d, opp, me, rng);
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
  let first: number | null = null;
  let shown = false;
  const render = () => {
    swap(`<div class="screen lineup">
      <header class="lineup-head"><h2>Расстановка</h2><p>Нажмите на двух игроков, чтобы поменять их героев.</p></header>
      <div class="lanes">${me.players
        .map((p, i) => {
          const c = champById(mine[i]);
          return `<button class="lane ${first === i ? 'on' : ''}" data-i="${i}">
            ${img(c)}<div><b>${esc(p.nick)}</b><small>${c.name} · ${ROLE_NAMES[c.role]}</small></div>
            <em class="${p.pool[c.role] >= 70 ? 'good' : p.pool[c.role] < 45 ? 'bad' : ''}">${p.pool[c.role]}</em></button>`;
        })
        .join('')}</div>
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
    document.getElementById('go')!.onclick = () => {
      const p: [string[], string[]] = mySide === 0 ? [mine, theirs] : [theirs, mine];
      playMatch(new Match({ teams, picks: p, seed: season.seed + season.week * 977 }));
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
      <div class="sc"><b id="k0">0</b><span id="clock">2:00</span><b id="k1">0</b></div>
      <div class="t r"><b>${esc(b.tag)}</b>${crest(SIDE_COLORS[1], b.tag, 26)}</div>
    </div>
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
    const key = m.s.feed.length + (m.s.feed[0]?.t ?? 0);
    if (key !== feedLen) {
      feedLen = key;
      document.getElementById('feed')!.innerHTML = m.s.feed
        .slice(0, 3)
        .map((k) => {
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
    <p class="dim">Убийства ${s.kills[0]} : ${s.kills[1]}${s.cores[0].hp <= 0 || s.cores[1].hp <= 0 ? ' · ядро разрушено' : ''}</p>
    <div class="mvp-card">${img(mvp.champ)}<div><small>Лучший игрок матча</small><b>${esc(mvp.player.nick)}</b><span>${mvp.champ.name} · ${mvp.kills}/${mvp.deaths}</span></div></div>
    <table class="tbl"><thead><tr><th>Игрок</th><th>У/С</th><th>Урон</th><th>Леч.</th></tr></thead><tbody>${rows}</tbody></table>
    <button class="cta wide" id="cont">Дальше</button></div>`;
  app.appendChild(overlay);
  document.getElementById('cont')!.onclick = () => {
    finishWeek(season, { winner: winner.id, kills: [s.kills[0], s.kills[1]] });
    home();
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(season);
});

home();
