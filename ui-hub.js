/* CARE frontend: AI & Automation hub (administrators).
   Loaded last, after ui-ops.js. It does not replace any page. It groups the automation pages
   (Workflows, Run history, Recurring issues, AI assistant, Report Studio, Reports library,
   Integrations) under ONE sidebar entry with ONE tab bar, and adds an Overview page with live status.
   The existing pages keep their own code and view names (workflows, ai, studio, libreports, integrations). */
(function () {
  'use strict';
  const E = esc;

  /* tab key = view, or view:subtab for the pages that have sub-tabs (workflows) */
  const TABS = [
    ['aihub', 'Overview'],
    ['workflows:list', 'Workflows'],
    ['workflows:history', 'Run history'],
    ['workflows:insights', 'Recurring issues'],
    ['ai', 'AI assistant'],
    ['chat', 'Chat with apps'],
    ['studio', 'Report Studio'],
    ['libreports', 'Reports library'],
    ['integrations', 'Integrations']
  ];
  const GROUP = ['aihub', 'workflows', 'ai', 'chat', 'studio', 'libreports', 'integrations'];
  const MOVED = ['workflows', 'studio', 'libreports', 'integrations', 'ai'];

  /* ---------- sidebar: five separate entries become one ---------- */
  (function () {
    const old = NAVS.admin || [], keep = n => !n || !MOVED.includes(n[0]), at = old.findIndex(n => n && n[0] === 'workflows');
    const pos = at < 0 ? Math.min(3, old.length) : old.slice(0, at).filter(keep).length;
    NAVS.admin = old.filter(keep);
    NAVS.admin.splice(pos, 0, ['aihub', 'shield', 'AI & Automation']);
  })();

  /* ---------- styles ---------- */
  const css = () => {
    if (document.getElementById('hubcss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="hubcss">
.hub-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}.hub-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hub-act .wfbtn{margin:0}
.hub-head h2{margin-bottom:0}.hub-tabs{display:flex;gap:4px;overflow-x:auto;padding:6px;margin:12px 0 14px;border:1px solid var(--line);border-radius:16px;background:var(--card);scrollbar-width:thin}
.hub-tabs button{flex:none;border:0;background:transparent;color:var(--ink);border-radius:11px;padding:9px 14px;cursor:pointer;font:inherit;font-size:14px;white-space:nowrap;display:inline-flex;gap:8px;align-items:center}
.hub-tabs button:hover{background:var(--in)}.hub-tabs button.on{background:var(--pri);color:#fff}.hub-tabs button:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.hub-tabs .hb{font-style:normal;font-size:11px;font-weight:700;min-width:20px;text-align:center;padding:1px 7px;border-radius:99px;background:var(--in);color:var(--mut)}
.hub-tabs .on .hb{background:#ffffff33;color:#fff}.hub-tabs .hb.bad{background:#c0392b;color:#fff}
.hub-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:14px 0}
.hub-tile{text-align:left;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:16px;padding:14px 16px;cursor:pointer;font:inherit;display:flex;flex-direction:column;gap:4px}
.hub-tile:hover{border-color:var(--pri)}.hub-tile:focus-visible{outline:2px solid var(--pri);outline-offset:2px}.hub-tile b{font-size:16px}.hub-tile small{color:var(--teal);font-weight:600;margin-top:4px}
.hub-al{border:1px solid var(--line);border-left:4px solid #3f8fdc;border-radius:14px;padding:10px 14px;margin:8px 0;background:var(--card);cursor:pointer}.hub-al.high{border-left-color:#c0392b}.hub-al.med{border-left-color:#e29b2d}
.hub-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:14px}
.hub-row{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line)}.hub-row:last-of-type{border:0}.hub-row>span{flex:none;width:18px;text-align:center;font-weight:700}.hub-row div{min-width:0}.hub-row small{display:block;color:var(--mut)}
.hub-more{background:none;border:0;color:var(--teal);cursor:pointer;font:inherit;font-size:14px;padding:8px 0 0}.hub-warn{color:#b9770e;font-weight:600}
</style>`);
  };

  /* ---------- Google status (shared object with the Report Studio page) ---------- */
  const G = window.GSTAT = window.GSTAT || { d: null, t: 0, busy: false };
  async function loadGoogle() {
    if (G.busy || Date.now() - G.t < 20000) return;
    G.busy = true;
    try { const r = await fetch('/api/google/status'); if (r.ok) G.d = await r.json() } catch (e) { /* offline: leave as unknown */ }
    G.busy = false; G.t = Date.now(); if (view === 'aihub') render();
  }

  /* ---------- navigation ---------- */
  window.hubGo = (k, keepFilter) => { const [v, t] = String(k).split(':'); if (t) window.WFT = t; if (v === 'workflows' && t === 'list' && !keepFilter) WFF.st = ''; go(v) };

  const counts = () => {
    const W = S.workflows || [], L = S.wfLogs || [], d = Date.now() - 864e5, l24 = L.filter(x => x.t > d);
    return { W, L, l24, f24: l24.filter(x => !x.success).length, act: W.filter(w => w.active).length, bad: W.filter(w => w.lastStatus === 'error'), I: S.insights || [], R: (S.studio || {}).reports || [] };
  };

  const tabsHtml = () => {
    const c = counts(), cur = view === 'workflows' ? 'workflows:' + (window.WFT || 'list') : view;
    const badge = {
      'workflows:list': c.W.length ? `<em class="hb">${c.act}/${c.W.length}</em>` : '',
      'workflows:history': c.f24 ? `<em class="hb bad" title="Failed in the last 24 hours">${c.f24}</em>` : '',
      'workflows:insights': c.I.length ? `<em class="hb">${c.I.length}</em>` : '',
      libreports: c.R.length ? `<em class="hb">${c.R.length}</em>` : ''
    };
    return `<nav class="hub-tabs" aria-label="AI and automation sections">${TABS.map(([k, l]) => `<button type="button" class="${k === cur ? 'on' : ''}" ${k === cur ? 'aria-current="page"' : ''} onclick="hubGo('${k}')">${E(l)}${badge[k] || ''}</button>`).join('')}</nav>`;
  };

  const headHtml = label => `<div class="hub-head">${head('AI & Automation', E(label))}<div class="hub-act"><button class="btn bp" style="width:auto" onclick="wfNew()">+ New workflow</button><button class="wfbtn" onclick="hubGo('studio')">Generate a report</button></div></div>`;

  /* ---------- Overview page ---------- */
  function overviewV() {
    loadGoogle();
    const c = counts(), st = S.studio || {}, g = G.d;
    const R = c.R.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const gTxt = !g ? 'Checking…' : g.connected ? 'Connected' : g.configured ? 'Not signed in' : 'Setup required';
    const gCls = !g ? 'm' : g.connected ? 'wfok' : 'hub-warn';
    const paused = c.W.length - c.act;
    const alerts = [
      c.bad.length && ['high', `${c.bad.length} workflow${c.bad.length > 1 ? 's' : ''} failed on the last run: ${c.bad.slice(0, 3).map(w => E(w.name)).join(', ')}${c.bad.length > 3 ? ' …' : ''}`, "WFF.st='err';hubGo('workflows:list',1)"],
      c.f24 && !c.bad.length && ['med', `${c.f24} run${c.f24 > 1 ? 's' : ''} failed in the last 24 hours`, "hubGo('workflows:history')"],
      g && !g.connected && ['info', g.configured ? 'Google is set up but nobody has signed in. Docs, Sheets and Drive export are off.' : 'Google Workspace is not set up. Docs, Sheets and Drive export are off.', "hubGo('integrations')"],
      paused > 0 && ['info', `${paused} workflow${paused > 1 ? 's are' : ' is'} paused`, "WFF.st='off';hubGo('workflows:list',1)"]
    ].filter(Boolean);
    const tiles = [
      ['workflows:list', 'Workflows', 'Rules that assign, escalate and notify on their own.', `${c.act} of ${c.W.length} active`],
      ['workflows:history', 'Run history', 'Every automatic run and what it changed.', `${c.l24.length} in the last 24 h`],
      ['workflows:insights', 'Recurring issues', 'Repeat problems that workflows spotted.', `${c.I.length} found`],
      ['ai', 'AI assistant', 'Ask about complaints and staff in plain English.', 'Reads live data'],
      ['chat', 'Chat with apps', 'Charts, tables and forms appear right inside the chat. Email a report by Gmail.', 'MCP apps'],
      ['studio', 'Report Studio', 'Describe a report, get PDF, CSV, Docs or Sheets.', st.ai ? 'AI summaries on' : 'Built-in rules'],
      ['libreports', 'Reports library', 'Every report made by people or workflows.', `${c.R.length} saved`],
      ['integrations', 'Integrations', 'Google Workspace, MCP and the AI provider.', `Google: ${gTxt}`]
    ];
    const runs = c.L.slice(0, 6), recent = R.slice(0, 5);
    return `
<div class="wfkpi">
  <div><b>${c.act}/${c.W.length}</b><small>workflows active</small></div>
  <div><b>${c.l24.length}</b><small>runs in the last 24 h</small></div>
  <div><b class="${c.f24 ? 'wfbad' : ''}">${c.f24}</b><small>failed in the last 24 h</small></div>
  <div><b>${c.R.length}</b><small>reports generated</small></div>
  <div><b class="${st.ai ? 'wfok' : 'm'}" style="font-size:18px">${st.ai ? 'Connected' : 'Not set up'}</b><small>AI provider (optional)</small></div>
  <div><b class="${gCls}" style="font-size:18px">${gTxt}</b><small>Google Workspace</small></div>
</div>
${alerts.length ? `<h3 style="margin:14px 0 2px">Needs attention</h3>${alerts.map(a => `<div class="hub-al ${a[0]}" role="button" tabindex="0" onclick="${a[2]}" onkeydown="if(event.key==='Enter')this.click()"><b>${a[1]}</b> <span class="m">→ open</span></div>`).join('')}` : ''}
<h3 style="margin:14px 0 0">Sections</h3>
<div class="hub-tiles">${tiles.map(t => `<button type="button" class="hub-tile" onclick="hubGo('${t[0]}')"><b>${E(t[1])}</b><span class="m">${E(t[2])}</span><small>${E(t[3])}</small></button>`).join('')}</div>
<div class="hub-two">
  <div class="card"><h3>Latest workflow runs</h3>${runs.length ? runs.map(x => `<div class="hub-row"><span class="${x.success ? 'wfok' : 'wfbad'}" aria-label="${x.success ? 'Succeeded' : 'Failed'}">${x.success ? '✓' : '✕'}</span><div><b>${E(x.wfName)}</b>${x.manual ? ' <small style="display:inline">(manual)</small>' : ''}<small>${ago(x.t)} · ${x.reportId ? E(x.reportId) : (x.matched || 0) + ' matched'}</small></div></div>`).join('') + `<button type="button" class="hub-more" onclick="hubGo('workflows:history')">View all runs →</button>` : '<p class="m">Nothing yet. Runs appear as soon as a workflow fires.</p>'}</div>
  <div class="card"><h3>Latest reports</h3>${recent.length ? recent.map(x => `<div class="hub-row"><span>📄</span><div><b>${E(x.title || x.id)}</b><small>${E(x.typeLabel || x.type || '')} · ${E(x.source || 'Manual')} · ${ago(x.createdAt)}</small></div></div>`).join('') + `<button type="button" class="hub-more" onclick="hubGo('libreports')">Open reports library →</button>` : '<p class="m">No reports yet. Use Report Studio to create one.</p>'}</div>
</div>`;
  }

  /* ---------- render hook ---------- */
  const r0 = window.render;
  window.render = () => {
    const hub = typeof U !== 'undefined' && U && typeof isA === 'function' && isA() && GROUP.includes(view), real = view;
    /* the Overview has no page of its own in the older code: let the cheapest existing page draw the frame */
    if (hub && real === 'aihub') view = 'workflows';
    r0();
    if (!hub) return;
    view = real;
    css(); window.__addCss && window.__addCss();
    const top = document.querySelector('#main .top'); if (!top) return;
    const label = real === 'aihub' ? 'Overview' : (TABS.find(([k]) => k === (real === 'workflows' ? 'workflows:' + (window.WFT || 'list') : real)) || [0, 'AI & Automation'])[1];
    if (real === 'aihub' || (window.__HUBV && window.__HUBV[real])) { while (top.nextSibling) top.nextSibling.remove() }
    else { /* the page's own title is replaced by the hub header */
      const h = top.nextElementSibling;
      if (h && h.children.length === 2 && h.children[0].classList.contains('lab') && h.children[1].tagName === 'H2') h.remove();
    }
    top.insertAdjacentHTML('afterend', headHtml(label) + tabsHtml() + (real === 'aihub' ? overviewV() : window.__HUBV && window.__HUBV[real] ? window.__HUBV[real]() : ''));
    /* sidebar: keep the single AI & Automation entry highlighted on every page of the group */
    const nav = [...document.querySelectorAll('#side .nav')].find(b => (b.getAttribute('onclick') || '').includes("'aihub'"));
    if (nav) { nav.classList.add('on'); const c = counts(), n = c.bad.length || c.f24; if (n) nav.insertAdjacentHTML('beforeend', `<em title="Workflows that need attention">${n}</em>`) }
  };
})();
