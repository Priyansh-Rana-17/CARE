/* CARE add-on (loaded last). It adds only these things to the existing design, for every role:
   1) the slim white sidebar with the "Response team online" card,
   2) three summary cards at the top of each role's own dashboard:
        student / staff member: Your impact, Campus health, Community (drawn by ui-home.js, same look)
        administrator:          Open complaints, Resolution, Emergencies
        maintenance:            My tasks, Completed, Awaiting verification
        responder:              Active alerts, Response time, Resolved
   3) the illuminating CARE logo (the hero seal and the sidebar logo glow and pulse).
   Nothing else in the design, the pages or the features is changed. */
(function () {
  'use strict';
  if (window.__RD) return; window.__RD = 1;

  const font = document.createElement('link');
  font.rel = 'stylesheet'; font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(font);

  const CSS = `
/* ---------- 1) slim white sidebar ---------- */
html body .app{grid-template-columns:228px minmax(0,1fr)}
html body .side{font-family:'Plus Jakarta Sans',Outfit,system-ui,sans-serif;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:20px;padding:16px 10px 10px;gap:2px;overflow-y:auto}
html body .side .brand{padding:2px 8px 16px;gap:10px}
html body .side .logo{width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,#6a5be0,#4338b8);color:#fff}
html body .side .logo svg{stroke:#fff;width:18px;height:18px}
html body .side .brand b{color:var(--ink);font-size:15px;font-weight:600;letter-spacing:.16em}
html body .side .brand small{color:var(--mut);opacity:1;font-size:11.5px}
html body .side .nav{display:flex;align-items:center;width:100%;text-align:left;gap:10px;color:var(--ink);background:transparent;border:1px solid transparent;border-radius:11px;padding:9px 12px;font-size:13.5px;font-weight:400;opacity:.85}
html body .side .nav svg{width:17px!important;height:17px!important;stroke-width:1.6}
html body .side .nav:hover{background:var(--in);opacity:1}
html body .side .nav.on{background:rgba(91,79,216,.08);border-color:rgba(91,79,216,.16);color:#5b4fd8;opacity:1;font-weight:500}
html body .side .nav i{color:inherit}
html body .side .nav em{margin-left:auto;font-style:normal;font-size:11px;font-weight:600;min-width:20px;text-align:center;padding:1px 7px;border-radius:99px;background:var(--card);color:#5b4fd8;border:1px solid var(--line)}
html body .side .me{background:transparent;color:var(--ink);border-top:1px solid var(--line);border-radius:0;padding:10px 6px 2px;margin-top:4px;font-size:13px}
html body .side .me small{color:var(--mut);font-size:11px}
html body .side .av{background:#e9e6fb;color:#4b3fb5;font-weight:600;font-size:12px}
.rd-team{display:flex;gap:10px;align-items:center;margin:6px 2px 0;padding:9px 12px;border-radius:12px;background:rgba(18,181,160,.08);border:1px solid rgba(18,181,160,.14);font-family:'Plus Jakarta Sans',Outfit,system-ui,sans-serif}
.rd-team i{flex:none;width:8px;height:8px;border-radius:50%;background:#1fbf8f;box-shadow:0 0 0 3px rgba(31,191,143,.18)}
.rd-team b{display:block;font-size:12.5px;font-weight:500}.rd-team small{color:var(--mut);font-size:11px}
/* ---------- 2) slim stat cards ---------- */
.rd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px;font-family:'Plus Jakarta Sans',Outfit,system-ui,sans-serif}
.rd-sc{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 18px;border-radius:16px;background:var(--card);border:1px solid var(--line)}
.rd-sc small{display:block;color:var(--mut);font-size:11.5px;font-weight:400}
.rd-sc .n{display:block;font-size:22px;font-weight:400;letter-spacing:-.02em;line-height:1.15;margin:3px 0 1px}
.rd-sc .up{color:#12a37f;font-weight:500}.rd-sc .w{color:#b9770e;font-weight:500}
.rd-bars{display:flex;align-items:flex-end;gap:4px;height:42px}
.rd-bars i{width:9px;border-radius:3px;background:linear-gradient(180deg,#b9b1f5,#8f84ee)}.rd-bars i.z{opacity:.3}
.rd-ring{position:relative;width:56px;height:56px;flex:none}.rd-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.rd-ring span{position:absolute;inset:0;display:grid;place-content:center;text-align:center;font-weight:500;font-size:13px}
.rd-ring small{display:none}
/* ---------- 3) illuminating CARE logo (the existing seal on the hero) ---------- */
html body .hero .seal{animation:rdSeal 3.2s ease-in-out infinite alternate}
html body .hero .seal::before,html body .hero .seal::after{content:"";position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.4);animation:rdRipple 3.4s ease-out infinite;pointer-events:none}
html body .hero .seal::after{animation-delay:1.7s}
html body .hero .seal svg{animation:rdSvg 3.2s ease-in-out infinite alternate}
@keyframes rdSeal{from{opacity:.55;box-shadow:0 0 0 38px #ffffff08,0 0 24px rgba(111,227,207,.15);text-shadow:0 0 6px rgba(255,255,255,.2)}to{opacity:1;box-shadow:0 0 0 38px #ffffff12,0 0 60px rgba(143,240,221,.45),0 0 120px rgba(255,255,255,.2);text-shadow:0 0 14px #fff,0 0 30px #6fe3cf}}
@keyframes rdSvg{from{filter:drop-shadow(0 0 2px rgba(255,255,255,.35))}to{filter:drop-shadow(0 0 10px #fff) drop-shadow(0 0 18px #6fe3cf)}}
@keyframes rdRipple{0%{transform:scale(.8);opacity:.8}100%{transform:scale(1.5);opacity:0}}
@media(prefers-reduced-motion:reduce){html body .hero .seal,html body .hero .seal::before,html body .hero .seal::after,html body .hero .seal svg{animation:none!important}}
html body .side .logo{animation:rdLogo 3s ease-in-out infinite alternate}
@keyframes rdLogo{from{box-shadow:0 0 0 0 rgba(106,91,224,.0),0 0 8px rgba(106,91,224,.25)}to{box-shadow:0 0 0 4px rgba(106,91,224,.12),0 0 22px rgba(140,125,255,.75)}}
@media(prefers-reduced-motion:reduce){html body .side .logo{animation:none!important}}
/* ---------- phones and tablets ---------- */
@media(max-width:900px){
 html body .app{grid-template-columns:1fr}
 html body .side{padding:6px;overflow-x:auto;overflow-y:hidden;border-radius:16px}
 html body .side .nav{width:auto;white-space:nowrap;padding:9px 12px}
 .rd-team{display:none}.rd-stats{grid-template-columns:1fr}
}`;
  const st = document.createElement('style'); st.id = 'rdcss'; st.textContent = CSS; document.head.appendChild(st);

  /* "Response team online" card above the profile in the sidebar */
  function team() {
    const side = document.getElementById('side'), me = side && side.querySelector('.me'); if (!me || side.querySelector('.rd-team')) return;
    const a = S.stats && S.stats.avg;
    me.insertAdjacentHTML('beforebegin', `<div class="rd-team"><i></i><div><b>Response team online</b><small>${a ? 'Average fix · ' + a + ' h' : 'Staff on call'}</small></div></div>`);
  }

  /* ---------- role dashboards: three summary cards, all counted from live data ---------- */
  const DAY = 864e5, day0 = t => new Date(t).setHours(0, 0, 0, 0);
  const week = ts => { const today = day0(Date.now()), c = Array(7).fill(0); ts.forEach(t => { if (!t) return; const i = 6 - Math.round((today - day0(t)) / DAY); if (i >= 0 && i < 7) c[i]++ }); return c };
  const bars = a => { const m = Math.max(1, ...a); return `<div class="rd-bars" aria-hidden="true">${a.map(c => c ? `<i style="height:${28 + c / m * 72}%"></i>` : '<i class="z" style="height:16%"></i>').join('')}</div>` };
  const ring = p => { const C = 2 * Math.PI * 44; return `<div class="rd-ring" role="img" aria-label="${p}%"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(18,181,160,.18)" stroke-width="7"/><circle cx="50" cy="50" r="44" fill="none" stroke="#1fbfa8" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * p / 100).toFixed(1)} ${C.toFixed(1)}"/></svg><span>${p}%</span></div>` };
  const card = (t, v, s, vis, cls) => `<div class="rd-sc"><div><small>${t}</small><b class="n">${v}</b><small class="${cls || ''}">${s}</small></div>${vis || ''}</div>`;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 100;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function dashboard() {
    const role = S.role, R = S.reports || [], SO = S.sos || [], me = U.name;
    if (role === 'admin' && view === 'overview' && S.stats) {
      const st = S.stats, wk = (S.A && S.A.wk) || [], act = SO.filter(x => x.status !== 'Resolved').length, p = pct(st.resolved, st.total);
      return [card('Open complaints', st.open, `${st.overdue} overdue · ${st.awaiting} unassigned`, bars(wk.slice(-7)), st.overdue ? 'w' : 'up'),
        card('Resolution', p >= 70 ? 'On track' : p >= 40 ? 'Doing okay' : 'Needs attention', st.avg ? `average fix ${st.avg} h` : `${st.resolved} of ${st.total} resolved`, ring(p), 'up'),
        card('Emergencies', act ? plural(act, 'active alert') : 'All clear', `${SO.length - act} resolved · ${SO.length} in total`, '', act ? 'w' : 'up')].join('');
    }
    if (role === 'maintenance' && view === 'staffws') {
      const mine = R.filter(r => r.as === me), op = mine.filter(r => !['Resolved', 'Withdrawn'].includes(r.status)), done = mine.filter(r => r.status === 'Resolved'), od = op.filter(r => r.due && r.due < Date.now()).length, aw = mine.filter(r => r.status === 'Awaiting verification').length;
      return [card('My tasks', op.length, od ? `${od} overdue` : 'none overdue', bars(week(done.map(r => r.resolved || r.upd))), od ? 'w' : 'up'),
        card('Completed', plural(done.length, 'job'), `${pct(done.length, mine.length)}% of everything assigned`, ring(pct(done.length, mine.length)), 'up'),
        card('Awaiting verification', aw, aw ? 'waiting for the reporter to confirm' : 'nothing waiting', '', aw ? 'w' : 'up')].join('');
    }
    if (role === 'responder' && view === 'sos') {
      const act = SO.filter(x => x.status !== 'Resolved').length, resd = SO.filter(x => x.status === 'Resolved').length;
      const ms = SO.map(x => { const a = (x.tl || []).find(e => e[0] === 'Acknowledged'); return a ? (a[1] - x.t) / 6e4 : null }).filter(v => v !== null && v >= 0);
      const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null;
      return [card('Active alerts', act, act ? 'need a response now' : 'all clear', bars(week(SO.map(x => x.t))), act ? 'w' : 'up'),
        card('Response time', avg === null ? '—' : `${avg} min`, avg === null ? 'no acknowledged alerts yet' : `average over ${plural(ms.length, 'alert')}`, '', 'up'),
        card('Resolved', plural(resd, 'alert'), `${pct(resd, SO.length)}% of all alerts`, ring(pct(resd, SO.length)), 'up')].join('');
    }
    return '';
  }

  function decorate() {
    if (typeof U === 'undefined' || !U) return;
    const main = document.getElementById('main'); if (!main) return;
    team();
    if (main.querySelector('.rd-stats') || main.querySelector('.hm-cards')) return;
    const html = dashboard(); if (!html) return;
    const top = main.querySelector('.top'); if (!top) return;
    const h = top.nextElementSibling, at = h && h.classList.contains('sh') ? h : top;
    at.insertAdjacentHTML('afterend', `<div class="rd-stats" role="group" aria-label="Summary">${html}</div>`);
  }

  const r0 = window.render;
  window.render = function () { const out = r0.apply(this, arguments); try { decorate() } catch (e) { console.error('CARE add-on:', e) } return out };
  try { if (typeof U !== 'undefined' && U && document.querySelector('#main .top')) decorate() } catch (e) { }
})();
