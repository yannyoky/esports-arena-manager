// Экраны игры: штаб, состав, драфт, матч, таблица.
import { CHAMPIONS, ROLE_NAMES, champById } from './data';
import {
  Season, TRAINING_NAMES, Training, applyTraining, autoPicks, clearSave, finishWeek, humanFixture,
  humanTeam, load, newSeason, save, standings, teamById, totalWeeks,
} from './league';
import { Match, MATCH_TIME } from './sim';
import { drawMatch } from './render';
import { Rng } from './rng';

const app = document.getElementById('app')!;
let season: Season = load() ?? newSeason();
let trainedWeek = 0;
let stopMatchLoop: (() => void) | null = null;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r1 = (n: number) => Math.round(n);

function shell(active: string, body: string) {
  const me = humanTeam(season);
  const tabs = [
    ['home', 'Штаб'],
    ['roster', 'Состав'],
    ['table', 'Таблица'],
  ];
  app.innerHTML = `
    <header class="top">
      <div class="brand"><span class="dot" style="background:${me.color}"></span>${esc(me.name)}</div>
      <div class="meta">Неделя ${season.week}/${totalWeeks(season)} · 💰 ${season.money.toLocaleString('ru')}</div>
    </header>
    <main>${body}</main>
    <nav class="tabs">${tabs
      .map(([id, label]) => `<button data-tab="${id}" class="${active === id ? 'on' : ''}">${label}</button>`)
      .join('')}</nav>`;
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab!)));
}

function go(tab: string) {
  stopMatchLoop?.();
  stopMatchLoop = null;
  if (tab === 'roster') return roster();
  if (tab === 'table') return table();
  return home();
}

function home() {
  const me = humanTeam(season);
  const fx = humanFixture(season);
  if (season.finished || !fx) {
    const place = standings(season).findIndex((x) => x.team.human) + 1;
    shell('home', `
      <section class="card hero"><h2>Сезон окончен</h2><p>Ваше место: <b>${place}</b> из ${season.teams.length}.</p>
      <button class="primary" id="newgame">Новый сезон</button></section>
      ${logCard()}`);
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
    <section class="card hero">
      <div class="small">Матч недели</div>
      <div class="vs"><span style="color:${me.color}">${esc(me.tag)}</span> vs <span style="color:${opp.color}">${esc(opp.tag)}</span></div>
      <div class="small">${esc(opp.name)}</div>
      <button class="primary" id="play">${trained ? 'К драфту' : 'Сначала тренировка'}</button>
    </section>
    <section class="card">
      <h3>Тренировка недели ${trained ? '✓' : ''}</h3>
      <div class="grid2">${(Object.keys(TRAINING_NAMES) as Training[])
        .map((t) => `<button class="opt" data-train="${t}" ${trained ? 'disabled' : ''}>${TRAINING_NAMES[t]}</button>`)
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
  document.getElementById('play')!.onclick = () => (trained ? draft() : undefined);
}

function logCard() {
  return `<section class="card"><h3>Новости</h3><ul class="log">${season.log
    .slice(0, 6)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('')}</ul></section>`;
}

function statBar(label: string, v: number) {
  return `<div class="stat"><span>${label}</span><i><b style="width:${v}%"></b></i><em>${r1(v)}</em></div>`;
}

function roster() {
  const me = humanTeam(season);
  shell('roster', me.players
    .map((p) => {
      const best = (Object.keys(p.pool) as (keyof typeof p.pool)[]).sort((a, b) => p.pool[b] - p.pool[a]).slice(0, 2);
      return `<section class="card player">
        <div class="row"><b>${esc(p.nick)}</b><span class="small">Зарплата ${p.salary}/нед</span></div>
        ${statBar('Атака', p.atk)}${statBar('Защита', p.def)}${statBar('Тактика', p.iq)}${statBar('Форма', p.form)}
        <div class="small">Лучшие роли: ${best.map((r) => `${ROLE_NAMES[r]} ${p.pool[r]}`).join(', ')}</div>
      </section>`;
    })
    .join(''));
}

function table() {
  const rows = standings(season)
    .map(
      (s, i) => `<tr class="${s.team.human ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${s.team.color}"></span>${esc(s.team.name)}</td>
      <td>${s.wins}</td><td>${s.losses}</td><td>${s.kd > 0 ? '+' : ''}${s.kd}</td></tr>`,
    )
    .join('');
  shell('table', `<section class="card"><table class="tbl"><thead><tr><th>#</th><th>Команда</th><th>П</th><th>Пр</th><th>±У</th></tr></thead><tbody>${rows}</tbody></table></section>`);
}

// Драфт: выбор чемпиона для каждого игрока. Соперник выбирает сам.
function draft() {
  const me = humanTeam(season);
  const fx = humanFixture(season)!;
  const opp = teamById(season, fx.home === me.id ? fx.away : fx.home);
  const rng = new Rng(season.seed + season.week * 31);
  const oppPicks = autoPicks(opp, rng);
  const myPicks = autoPicks(me, rng, new Set(oppPicks));
  let sel = 0;

  const render = () => {
    const taken = new Set([...oppPicks, ...myPicks]);
    shell('home', `
      <section class="card"><h3>Драфт против ${esc(opp.tag)}</h3>
        <div class="small">Соперник: ${oppPicks.map((id) => champById(id).name).join(', ')}</div></section>
      <section class="card">${me.players
        .map((p, i) => {
          const c = champById(myPicks[i]);
          return `<button class="pickrow ${i === sel ? 'on' : ''}" data-sel="${i}"><b>${esc(p.nick)}</b><span>${c.glyph} ${c.name}</span><em>${ROLE_NAMES[c.role]} · ${p.pool[c.role]}</em></button>`;
        })
        .join('')}</section>
      <section class="card"><h3>Чемпион для ${esc(me.players[sel].nick)}</h3><div class="champs">${CHAMPIONS.map((c) => {
        const mine = myPicks[sel] === c.id;
        const dis = taken.has(c.id) && !mine;
        return `<button class="champ ${mine ? 'on' : ''}" data-champ="${c.id}" ${dis ? 'disabled' : ''}>
          <span class="g">${c.glyph}</span><b>${c.name}</b><em>${ROLE_NAMES[c.role]} · ${me.players[sel].pool[c.role]}</em><small>${c.ability}</small></button>`;
      }).join('')}</div></section>
      <button class="primary wide" id="start">В бой!</button>`);
    app.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) => (b.onclick = () => ((sel = +b.dataset.sel!), render())));
    app.querySelectorAll<HTMLButtonElement>('[data-champ]').forEach(
      (b) =>
        (b.onclick = () => {
          myPicks[sel] = b.dataset.champ!;
          sel = Math.min(4, sel + 1);
          render();
        }),
    );
    document.getElementById('start')!.onclick = () => {
      const home = fx.home === me.id;
      const teams = home ? ([me, opp] as const) : ([opp, me] as const);
      const picks = home ? [myPicks, oppPicks] : [oppPicks, myPicks];
      playMatch(new Match({ teams: [teams[0], teams[1]], picks: [picks[0], picks[1]], seed: season.seed + season.week * 977 }));
    };
  };
  render();
}

function playMatch(m: Match) {
  const [a, b] = m.setup.teams;
  app.innerHTML = `
    <div class="match">
      <div class="score"><span style="color:${a.color}">${esc(a.tag)}</span><b id="k0">0</b><span id="clock">2:00</span><b id="k1">0</b><span style="color:${b.color}">${esc(b.tag)}</span></div>
      <canvas id="cv"></canvas>
      <ul class="feed" id="feed"></ul>
      <div class="ctrl"><button data-speed="1">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button><button id="skip">Итог ⏭</button></div>
    </div>`;
  const cv = document.getElementById('cv') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = r.width * dpr;
    cv.height = r.height * dpr;
  };
  resize();
  window.addEventListener('resize', resize);

  const hud = () => {
    document.getElementById('k0')!.textContent = String(m.s.kills[0]);
    document.getElementById('k1')!.textContent = String(m.s.kills[1]);
    const left = Math.max(0, MATCH_TIME - m.s.time);
    document.getElementById('clock')!.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    document.getElementById('feed')!.innerHTML = m.s.feed.slice(0, 3).map((f) => `<li>${esc(f)}</li>`).join('');
  };

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    if (dt < 1 / 31) return; // не чаще 30 кадров в секунду
    last = now;
    acc += Math.min(dt, 0.25) * speed;
    while (acc >= 1 / 30 && !m.s.over) {
      m.step();
      acc -= 1 / 30;
    }
    drawMatch(ctx, m, cv.width, cv.height);
    hud();
    if (m.s.over) end();
  };
  raf = requestAnimationFrame(frame);

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
  stopMatchLoop = stop;

  const end = () => {
    stop();
    m.runToEnd();
    drawMatch(ctx, m, cv.width, cv.height);
    hud();
    result(m);
  };

  app.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => (btn.onclick = () => (speed = +btn.dataset.speed!)));
  document.getElementById('skip')!.onclick = end;
}

function result(m: Match) {
  const me = humanTeam(season);
  const s = m.s;
  const winner = m.setup.teams[s.winner as 0 | 1];
  const won = winner.id === me.id;
  const rows = s.units
    .map(
      (u) => `<tr><td><span class="dot" style="background:${m.setup.teams[u.side].color}"></span>${esc(u.player.nick)}</td><td>${u.champ.glyph} ${u.champ.name}</td>
      <td>${u.kills}/${u.deaths}</td><td>${r1(u.dealt)}</td><td>${r1(u.healed)}</td></tr>`,
    )
    .join('');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="card">
    <h2 class="${won ? 'win' : 'lose'}">${won ? 'Победа!' : 'Поражение'}</h2>
    <div class="small">Счёт по убийствам ${s.kills[0]} : ${s.kills[1]}${s.cores[0].hp <= 0 || s.cores[1].hp <= 0 ? ' · ядро разрушено' : ''}</div>
    <table class="tbl"><thead><tr><th>Игрок</th><th>Чемпион</th><th>У/С</th><th>Урон</th><th>Леч.</th></tr></thead><tbody>${rows}</tbody></table>
    <button class="primary wide" id="cont">Дальше</button></div>`;
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
