/* CARE frontend: AI Report Studio, Reports library, Integrations.
   Loaded after app.js. Uses the existing helpers (api, S, head, esc, toast, modal, ago, go, render). */
(function () {
  const css = `<style id="studiocss">
.rp-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}.rp-k>div{border:1px solid var(--line);border-radius:14px;padding:10px 14px;background:var(--card)}.rp-k b{font-size:22px;display:block}.rp-k small{color:var(--mut)}
.rp-box{border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:12px 0;background:var(--in)}.rp-box.ai{border-left:4px solid #7a5be0}.rp-box.data{border-left:4px solid var(--teal)}.rp-box.sug{border-left:4px solid #e29b2d}
.rp-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:99px;background:var(--card);border:1px solid var(--line);color:var(--mut);margin-bottom:6px}
.rp-box ul{margin:6px 0 0;padding-left:18px}.rp-box li{margin:4px 0}.rp-tbl{overflow-x:auto;margin:6px 0 14px}.rp-tbl table{font-size:13px}
.rp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}.rp-bar .btn{width:auto;margin:0}
.st-ok{color:#17734f;font-weight:600}.st-bad{color:#c0392b;font-weight:600}.st-warn{color:#b9770e;font-weight:600}
.rp-step{display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)}.rp-step:last-child{border:0}
.rp-code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:var(--in);border:1px solid var(--line);border-radius:10px;padding:8px 10px;overflow-x:auto;white-space:pre;display:block;margin:6px 0}
.rp-fil{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}.rp-fil label{font-size:12px;color:var(--mut);display:block;margin-bottom:3px}
details.rp-d summary{cursor:pointer;font-weight:600;padding:6px 0}.rp-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--pri);border-radius:50%;animation:rpspin 1s linear infinite;vertical-align:-2px;margin-right:6px}@keyframes rpspin{to{transform:rotate(360deg)}}
</style>`;
  const addCss = window.__addCss = () => { if (typeof wfCss === 'function') wfCss(); if (!document.getElementById('studiocss')) document.head.insertAdjacentHTML('beforeend', css) };
  const E = esc, today = () => new Date().toISOString().slice(0, 10);
  const jget = async u => { try { const r = await fetch(u), j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.error || 'Something went wrong'); return null } return j } catch (e) { toast('Server not reachable'); return null } };
  const fdt = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const optsHtml = (list, sel, first) => (first ? `<option value="">${E(first)}</option>` : '') + list.map(x => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${E(v)}" ${v === sel ? 'selected' : ''}>${E(l)}</option>` }).join('');
  const CATSL = ['Electrical', 'Plumbing', 'Cleanliness', 'Equipment', 'Safety'], PRIL = ['Critical', 'High', 'Medium', 'Low'];
  const BLDS = () => Object.keys(BLD);
  const STATUSES = [['open', 'Open (unresolved)'], ['resolved', 'Resolved'], ['overdue', 'Overdue'], ...['Submitted', 'Under review', 'Assigned', 'Accepted', 'In progress', 'Blocked', 'Awaiting verification', 'Resolved', 'Reopened'].map(x => [x, x])];

  /* ---------- Google status (cached) ---------- */
  const G = window.GSTAT = { d: null, t: 0, busy: false };
  async function loadG(force) { if (G.busy || (!force && G.d && Date.now() - G.t < 20000)) return; G.busy = true; const j = await jget('/api/google/status'); G.busy = false; if (j) { G.d = j; G.t = Date.now(); render() } }
  const gBadge = () => !G.d ? '<span class="m">checking…</span>' : G.d.connected ? `<span class="st-ok">● Connected${G.d.email ? ' as ' + E(G.d.email) : ''}</span>` : G.d.configured ? '<span class="st-warn">● Not connected</span>' : '<span class="st-bad">● Setup required</span>';

  /* ---------- report preview (also used by the library) ---------- */
  function table(t, max = 60) {
    if (!t.rows.length) return '<p class="m">No data for these filters.</p>';
    return `<div class="rp-tbl"><table><thead><tr>${t.cols.map(c => `<th>${E(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, max).map(r => `<tr>${r.map(c => `<td>${E(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${t.rows.length > max ? `<p class="m">Showing ${max} of ${t.rows.length} rows. Export to see everything.</p>` : ''}</div>`;
  }
  function bars(items, unit) { const mx = Math.max(1, ...items.map(i => i[1])); return items.slice(0, 12).map(([k, n]) => `<div class="hs"><div><span>${E(k)}</span><small>${E(n)}${unit ? ' ' + E(unit) : ''}</small></div><i><s style="width:${Math.max(2, n / mx * 100)}%"></s></i></div>`).join('') }
  function repHTML(rep) {
    const f = Object.entries(rep.filters || {}).filter(([, v]) => v);
    return `<div><h2 style="margin:0">${E(rep.title)}</h2><div class="m">${E(rep.period.label)} · generated ${E(new Date(rep.generatedAt).toLocaleString())} by ${E(rep.generatedBy)}</div>
    ${f.length ? `<div class="chips" style="margin-top:8px">${f.map(([k, v]) => `<span class="chip">${E(k)}: ${E(v)}</span>`).join('')}</div>` : ''}
    <div class="rp-k">${rep.kpis.map(k => `<div><b>${E(k[1])}</b><small>${E(k[0])}</small></div>`).join('')}</div>
    ${rep.narrative && rep.narrative.summary ? `<div class="rp-box ai"><span class="rp-tag">AI-GENERATED SUMMARY</span><div>${E(rep.narrative.summary)}</div>${(rep.narrative.recommendations || []).length ? `<ul>${rep.narrative.recommendations.map(x => `<li>${E(x)}</li>`).join('')}</ul>` : ''}<small class="m">Written by an AI model (${E(rep.narrative.model)}) from the figures in this report. Check it before relying on it.</small></div>` : rep.narrative && rep.narrative.error ? `<div class="rp-box"><small class="m">${E(rep.narrative.error)}</small></div>` : ''}
    <div class="rp-box data"><span class="rp-tag">FINDINGS FROM THE DATA</span><ul>${rep.findings.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>
    ${rep.suggestions.length ? `<div class="rp-box sug"><span class="rp-tag">SUGGESTED ACTIONS (RULE-BASED)</span><ul>${rep.suggestions.map(x => `<li>${E(x.text)} <small class="m">Based on: ${E(x.basis)}</small></li>`).join('')}</ul></div>` : ''}
    ${rep.sections.map(s => `<h3 style="margin:18px 0 4px">${E(s.heading)}</h3>${s.note ? `<p class="m">${E(s.note)}</p>` : ''}${s.chart && s.table.rows.length ? bars(s.table.rows.map(r => [r[s.chart.label], +r[s.chart.value] || 0]), s.chart.unit) : ''}${table(s.table)}`).join('')}</div>`;
  }
  const dl = (id, f) => `<a class="btn mt" style="width:auto;text-decoration:none" href="/api/studio/report/${id}/download?fmt=${f}">⬇ ${f.toUpperCase()}</a>`;
  function exportBar(e) {
    const g = G.d, ready = g && g.connected, why = !g ? '' : !g.configured ? 'Google needs setup' : 'Connect Google first';
    const b = (k, label, done) => ready ? `<button class="btn mt" style="width:auto" onclick="gExport('${e.id}','${k}')">${done ? '✓ ' : ''}${label}</button>` : `<button class="btn mt" style="width:auto;opacity:.55" onclick="go('integrations')" title="${E(why)}">${label}</button>`;
    return `<div class="rp-bar">${dl(e.id, 'pdf')}${dl(e.id, 'csv')}<span class="m">|</span>${b('doc', 'Google Doc', e.gdoc)}${b('sheet', 'Google Sheet', e.gsheet)}${b('drive', 'Save to Drive', e.drive)}<button class="btn mt" style="width:auto" onclick="mailOpen('${e.id}')">✉ Email${(e.mails || []).length ? ' (' + e.mails.length + ')' : ''}</button><span class="m" style="font-size:13px">Google: ${gBadge()}${ready ? '' : ' · <a href="#" onclick="go(\'integrations\');return false" style="color:var(--teal)">Integrations</a>'}</span></div>
    ${e.gdoc || e.gsheet || e.drive ? `<div class="m">${[e.gdoc && `<a href="${E(e.gdoc.url)}" target="_blank" rel="noopener" style="color:var(--teal)">Open Google Doc</a>`, e.gsheet && `<a href="${E(e.gsheet.url)}" target="_blank" rel="noopener" style="color:var(--teal)">Open Google Sheet</a>`, e.drive && `<a href="${E(e.drive.folderUrl)}" target="_blank" rel="noopener" style="color:var(--teal)">Open Drive folder</a>`].filter(Boolean).join(' · ')}</div>` : ''}`;
  }
  window.gExport = async (id, k) => { toast('Sending to Google…'); const j = await api('exportGoogle', k === 'drive' ? { id, drive: 1, pdf: 1, csv: 1 } : { id, [k]: 1 }); if (!j) return; if (j.errors && j.errors.length) toast(j.errors[0]); else toast('Done. Links are shown under the buttons.'); if (SR.entry && SR.entry.id === id) SR.entry = j.entry; if (LIBP.entry && LIBP.entry.id === id) { LIBP.entry = j.entry; libModal() } render() };

  /* ---------- AI Report Studio ---------- */
  const SR = window.SR = { prompt: '', f: { type: '', range: 'all', from: '', to: '', cat: '', bld: '', dept: '', pri: '', status: '', as: '' }, ai: false, busy: false, report: null, entry: null, steps: null, reply: '' };
  const spec = () => { const o = {}; Object.entries(SR.f).forEach(([k, v]) => { if (v) o[k] = v }); if (o.from || o.to) delete o.range; return o };
  const over = () => { const f = SR.f, o = {}; if (f.type) o.type = f.type; if (f.from || f.to) { o.from = f.from; o.to = f.to } else if (f.range && f.range !== 'all') o.period = f.range; if (f.cat) o.category = f.cat; if (f.bld) o.building = f.bld; if (f.dept) o.department = f.dept; if (f.pri) o.priority = f.pri; if (f.status) o.status = f.status; if (f.as) o.assigned_to = f.as; return o };
  window.srSet = (k, v) => { SR.f[k] = v; if (k === 'from' || k === 'to') SR.f.range = 'all' };
  window.srEx = t => { SR.prompt = t; render(); setTimeout(() => { const i = $('#srp'); i && i.focus() }, 0) };
  window.srGo = async () => {
    const p = ($('#srp') || {}).value || SR.prompt; SR.prompt = p.trim(); if (SR.busy) return;
    if (!SR.prompt && !SR.f.type) return toast('Describe the report you want, or choose a report type under "Refine".');
    SR.busy = true; SR.steps = null; SR.reply = ''; render();
    const google = /google|drive|sheet|spreadsheet|\bdocs?\b|\bpdf\b|\bcsv\b/i.test(SR.prompt);
    let id = '';
    if (google && SR.prompt) { const j = await api('assist', { prompt: SR.prompt, over: over() }); if (j) { SR.steps = j.steps; SR.reply = j.reply; id = j.reportId } }
    else { const j = await api('genReport', { prompt: SR.prompt, spec: spec(), ai: SR.ai }); if (j) { id = j.id; SR.report = j.report; SR.entry = j.entry } }
    if (google && id) { const j = await jget('/api/studio/report/' + id); if (j) { SR.report = j.report; SR.entry = j.entry } }
    SR.busy = false; render(); loadG(true);
  };
  function studioV() {
    addCss(); loadG(); const M = S.studio || { types: [], ranges: {}, examples: [], reports: [], ai: false }, f = SR.f, staff = (S.staffList || []).map(x => x.name);
    const filt = `<details class="rp-d"><summary>Refine: period, filters and type</summary><div class="rp-fil">
      <div><label>Report type</label><select onchange="srSet('type',this.value)">${optsHtml(M.types.map(t => [t.key, t.label]), f.type, 'Decide from my request')}</select></div>
      <div><label>Period</label><select onchange="srSet('range',this.value)">${optsHtml(Object.entries(M.ranges), f.range)}</select></div>
      <div><label>From (optional)</label><input type="date" value="${E(f.from)}" max="${today()}" onchange="srSet('from',this.value)"></div><div><label>To (optional)</label><input type="date" value="${E(f.to)}" max="${today()}" onchange="srSet('to',this.value)"></div>
      <div><label>Category</label><select onchange="srSet('cat',this.value)">${optsHtml(CATSL, f.cat, 'Any')}</select></div><div><label>Building</label><select onchange="srSet('bld',this.value)">${optsHtml(BLDS(), f.bld, 'Any')}</select></div>
      <div><label>Department</label><select onchange="srSet('dept',this.value)">${optsHtml(CATSL, f.dept, 'Any')}</select></div><div><label>Priority</label><select onchange="srSet('pri',this.value)">${optsHtml(PRIL, f.pri, 'Any')}</select></div>
      <div><label>Status</label><select onchange="srSet('status',this.value)">${optsHtml(STATUSES, f.status, 'Any')}</select></div><div><label>Assigned staff</label><select onchange="srSet('as',this.value)">${optsHtml([...staff, 'Unassigned'], f.as, 'Anyone')}</select></div>
    </div>${M.ai ? `<label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" ${SR.ai ? 'checked' : ''} onchange="SR.ai=this.checked" style="width:auto"> Add an AI-written summary (sends figures and complaint counts to the AI provider)</label>` : '<p class="m" style="margin-top:10px">AI summaries are off: set ANTHROPIC_API_KEY to turn them on. Everything else works without it.</p>'}</details>`;
    const steps = SR.steps ? `<div class="card" style="margin-top:14px"><h3>What the assistant did</h3><p>${E(SR.reply)}</p>${SR.steps.map(s => `<div class="rp-step"><span class="${s.ok ? 'st-ok' : 'st-bad'}">${s.ok ? '✓' : '✕'}</span><div><b>${E(s.tool.replace(/_/g, ' '))}</b>${s.ok ? '' : `<div class="st-bad" style="font-size:13px">${E(s.error)}</div>`}</div></div>`).join('')}</div>` : '';
    const recent = M.reports.slice(0, 5);
    return head('Reports', 'AI Report Studio') + `<div class="card"><p class="m">Describe the report you want in plain English. CARE reads your live complaint data, so every number comes from real records. Mention a <b>Google Doc</b>, <b>Sheet</b> or <b>Drive</b> and CARE creates those too. Google: ${gBadge()}</p>
      <div class="chips">${M.examples.map(x => `<button class="chip" onclick="srEx(this.textContent)">${E(x)}</button>`).join('')}</div>
      <div class="fl" style="margin-top:10px"><input type="text" id="srp" value="${E(SR.prompt)}" maxlength="800" placeholder="e.g. Unresolved plumbing complaints this month, with a Google Sheet saved to Drive" aria-label="Describe the report" oninput="SR.prompt=this.value" onkeydown="if(event.key==='Enter')srGo()"><button class="btn bp mt" style="width:auto" onclick="srGo()" ${SR.busy ? 'disabled' : ''}>${SR.busy ? '<span class="rp-spin"></span>Working…' : 'Generate report'}</button></div>${filt}</div>${steps}
      ${SR.report ? `<div class="card" style="margin-top:14px"><div class="m">Preview. This report is saved in <a href="#" onclick="go('libreports');return false" style="color:var(--teal)">Reports</a> (${E(SR.entry.id)}).</div>${exportBar(SR.entry)}${repHTML(SR.report)}</div>` : ''}
      <div class="card" style="margin-top:14px"><h3>Recent reports</h3>${recent.length ? recent.map(e => `<div class="rp-step"><div style="flex:1"><b>${E(e.title)}</b><div class="m">${E(e.typeLabel)} · ${E(e.period.label)} · ${ago(e.createdAt)}</div></div><button class="wfbtn" onclick="libOpen('${e.id}')">Preview</button></div>`).join('') + `<p><a href="#" onclick="go('libreports');return false" style="color:var(--teal)">Open the report library →</a></p>` : '<p class="m">Nothing yet. Generate your first report above.</p>'}</div>`;
  }

  /* ---------- Reports library ---------- */
  const LB = { q: '', type: '', src: '', from: '', to: '', busy: {}, n: 15, sel: {} }, LIBP = { entry: null, report: null };
  window.lbSet = (k, v) => { LB[k] = v; if (k !== 'n') LB.n = 15; render() };
  const lbShown = () => { const M = S.studio || { reports: [] }, from = LB.from ? Date.parse(LB.from + 'T00:00:00') : 0, to = LB.to ? Date.parse(LB.to + 'T23:59:59') : 9e15, q = LB.q.toLowerCase(); return M.reports.filter(e => (!q || (e.title + ' ' + e.typeLabel + ' ' + e.id + ' ' + e.prompt).toLowerCase().includes(q)) && (!LB.type || e.type === LB.type) && (!LB.src || srcOf(e) === LB.src) && e.createdAt >= from && e.createdAt <= to) };
  window.lbSel = (id, on) => { if (on) LB.sel[id] = 1; else delete LB.sel[id]; render() };
  window.lbAll = on => { lbShown().slice(0, LB.n).forEach(e => { if (on) LB.sel[e.id] = 1; else delete LB.sel[e.id] }); render() };
  window.lbSelClear = () => { LB.sel = {}; render() };
  window.libDelSel = () => libDelete(Object.keys(LB.sel));
  const srcOf = e => /^Workflow/.test(e.source) ? 'Workflow' : /assistant|MCP/i.test(e.source) ? 'Assistant' : 'Manual';
  function libV() {
    addCss(); loadG(); const M = S.studio || { reports: [], types: [] };
    const from = LB.from ? Date.parse(LB.from + 'T00:00:00') : 0, to = LB.to ? Date.parse(LB.to + 'T23:59:59') : 9e15, q = LB.q.toLowerCase();
    const rows = M.reports.filter(e => (!q || (e.title + ' ' + e.typeLabel + ' ' + e.id + ' ' + e.prompt).toLowerCase().includes(q)) && (!LB.type || e.type === LB.type) && (!LB.src || srcOf(e) === LB.src) && e.createdAt >= from && e.createdAt <= to);
    return head('Library', 'Reports') + `<div class="card"><div class="fl"><input type="text" placeholder="Search reports" aria-label="Search reports" value="${E(LB.q)}" onchange="lbSet('q',this.value)"><select aria-label="Report type" onchange="lbSet('type',this.value)">${optsHtml(M.types.map(t => [t.key, t.label]), LB.type, 'All types')}</select>
      <select aria-label="Source" onchange="lbSet('src',this.value)">${optsHtml(['Manual', 'Assistant', 'Workflow'], LB.src, 'All sources')}</select><input type="date" aria-label="Created from" value="${E(LB.from)}" onchange="lbSet('from',this.value)" style="max-width:160px"><input type="date" aria-label="Created to" value="${E(LB.to)}" onchange="lbSet('to',this.value)" style="max-width:160px"></div>
      <div class="m">${rows.length} of ${M.reports.length} reports · Google: ${gBadge()}</div>
      <div class="rp-bar"><button class="wfbtn" onclick="mailCompose()">✉ Compose email</button>${Object.keys(LB.sel).length ? `<b>${Object.keys(LB.sel).length} selected</b><button class="wfbtn d" onclick="libDelSel()">Delete selected</button><button class="wfbtn" onclick="lbSelClear()">Clear selection</button>` : '<span class="m">Tick reports to delete several at once.</span>'}</div></div>
      <div class="card" style="margin-top:14px;padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead><tr><th style="width:34px"><input type="checkbox" style="width:auto" onchange="lbAll(this.checked)" aria-label="Select all shown"></th><th>REPORT</th><th>PERIOD</th><th>CREATED</th><th>STATUS</th><th>SAVED</th><th>ACTIONS</th></tr></thead><tbody>
      ${rows.slice(0, LB.n).map(e => { const busy = LB.busy[e.id]; return `<tr><td><input type="checkbox" style="width:auto" ${LB.sel[e.id] ? 'checked' : ''} onchange="lbSel('${e.id}',this.checked)" aria-label="Select ${E(e.title)}"></td><td><b>${E(e.title)}</b><small>${E(e.id)} · ${E(e.typeLabel)} · ${e.matched} complaint${e.matched === 1 ? '' : 's'}${e.ai ? ' · AI summary' : ''}</small></td><td>${E(e.period.label)}</td><td>${fdt(e.createdAt)}<small>${E(srcOf(e))}${/^Workflow/.test(e.source) ? ': ' + E(e.source.slice(10)) : ''} · ${E(e.createdBy)}</small></td>
        <td>${busy ? '<span class="rp-spin"></span>Generating…' : '<span class="st-ok">● Ready</span>'}</td><td>${e.drive ? `<span class="st-ok">Google Drive</span><small>${e.drive.files.map(f => `<a href="${E(f.url)}" target="_blank" rel="noopener" style="color:var(--teal)">${E(f.kind)}</a>`).join(' · ')}</small>` : e.gdoc || e.gsheet ? `<span class="st-warn">Google (not in Drive folder)</span><small>${[e.gdoc && `<a href="${E(e.gdoc.url)}" target="_blank" rel="noopener" style="color:var(--teal)">Doc</a>`, e.gsheet && `<a href="${E(e.gsheet.url)}" target="_blank" rel="noopener" style="color:var(--teal)">Sheet</a>`].filter(Boolean).join(' · ')}</small>` : 'Saved locally'}</td>
        <td style="white-space:nowrap"><button class="wfbtn" onclick="libOpen('${e.id}')">Preview</button><a class="wfbtn" style="text-decoration:none;display:inline-block" href="/api/studio/report/${e.id}/download?fmt=pdf">PDF</a><a class="wfbtn" style="text-decoration:none;display:inline-block" href="/api/studio/report/${e.id}/download?fmt=csv">CSV</a><button class="wfbtn" onclick="mailOpen('${e.id}')">✉ Email${(e.mails || []).length ? ' (' + e.mails.length + ')' : ''}</button><button class="wfbtn" onclick="libRen('${e.id}')">Rename</button><button class="wfbtn" onclick="libRegen('${e.id}')" ${busy ? 'disabled' : ''}>Regenerate</button><button class="wfbtn d" onclick="libDel('${e.id}')">Delete</button></td></tr>` }).join('') || '<tr><td colspan="7">No reports match. Create one in AI Report Studio.</td></tr>'}</tbody></table></div></div>${rows.length > LB.n ? `<p style="text-align:center"><button class="wfbtn" onclick="lbSet('n',LB.n+15)">Show 15 more (${rows.length - LB.n} not shown)</button></p>` : ''}`;
  }
  function libModal() { const e = LIBP.entry; modal(`<div style="display:flex;justify-content:space-between;gap:10px"><div><div class="lab">${E(e.id)} · ${E(e.typeLabel)}</div></div><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>${exportBar(e)}${repHTML(LIBP.report)}`); const m = document.querySelector('.mod'); m && m.classList.add('wide') }
  window.libOpen = async id => { const j = await jget('/api/studio/report/' + id); if (!j) return; LIBP.entry = j.entry; LIBP.report = j.report; loadG(); libModal() };
  window.libRen = async id => { const e = S.studio.reports.find(x => x.id === id), t = prompt('New name for this report', e.title); if (t === null) return; if (await api('renameReport', { id, title: t })) toast('Renamed.') };
  window.libRegen = async id => { LB.busy[id] = 1; render(); const j = await api('regenReport', { id }); delete LB.busy[id]; render(); if (j) toast('Report regenerated with current data.') };
  window.libDel = id => libDelete([id]);
  function libDelete(ids) {
    const list = ids.map(i => S.studio.reports.find(x => x.id === i)).filter(Boolean); if (!list.length) return;
    const gf = list.some(e => e.gdoc || e.gsheet || e.drive), one = list.length === 1;
    modal(`<div style="display:flex;justify-content:space-between;gap:10px"><h2 style="margin:0">Delete ${one ? '“' + E(list[0].title) + '”' : list.length + ' reports'}?</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div><p>${one ? 'It is' : 'They are'} removed from the CARE library. This cannot be undone.</p>${gf ? `<label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0"><input type="checkbox" id="dg" style="width:auto;margin-top:3px"><span>Also move the Google Doc, Sheet and Drive files made for ${one ? 'it' : 'them'} to the Google Drive trash <span class="m">(you can restore them from Drive for 30 days)</span></span></label>` : ''}<div class="rp-bar"><button class="btn mt" style="width:auto;background:#c0392b;color:#fff" onclick="libDelGo('${list.map(e => e.id).join(',')}')">Delete</button><button class="btn mt" style="width:auto" onclick="closeM()">Cancel</button></div>`);
  }
  window.libDelGo = async ids => { const g = !!(document.getElementById('dg') || {}).checked; closeM(); const j = await api('deleteReports', { ids: ids.split(','), trashGoogle: g }); if (!j) return; LB.sel = {}; toast(j.deleted + ' deleted' + (j.trashed ? ', ' + j.trashed + ' Google file' + (j.trashed === 1 ? '' : 's') + ' moved to the Drive trash' : '') + '.'); if (j.warnings && j.warnings[0]) setTimeout(() => toast(j.warnings[0]), 2200) };

  /* ---------- Gmail: email a report or any file ---------- */
  const MX = { files: [], id: '' }, MAXF = 1.9e6;
  const fsize = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  window.mailOpen = async id => { MX.files = []; MX.id = id || ''; if (!G.d) await loadG(true); mailModal() };
  window.mailCompose = () => mailOpen('');
  function mailModal() {
    const g = G.d || {}, e = MX.id ? (S.studio.reports.find(x => x.id === MX.id) || (LIBP.entry && LIBP.entry.id === MX.id && LIBP.entry) || (SR.entry && SR.entry.id === MX.id && SR.entry)) : null, ready = !!g.canEmail;
    const ck = (i, t, on) => `<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="${i}" style="width:auto" ${on ? 'checked' : ''}> ${t}</label>`;
    modal(`<div style="display:flex;justify-content:space-between;gap:10px"><div><div class="lab">Gmail</div><h2 style="margin:0">${e ? 'Email “' + E(e.title) + '”' : 'Email a document'}</h2></div><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
      ${ready ? `<p class="m">Sent from <b>${E(g.email)}</b></p>` : `<div class="rp-box sug">${!g.configured ? 'Google is not set up yet.' : !g.connected ? 'Google is not connected.' : 'CARE needs permission to send email: disconnect Google and connect it again, keeping the email box ticked.'} <a href="#" onclick="closeM();go('integrations');return false" style="color:var(--teal)">Open Integrations</a></div>`}
      <label class="l" for="m_to">To <span class="m">(separate several addresses with commas)</span></label><input type="text" id="m_to" placeholder="name@gmail.com" autocomplete="off">
      <label class="l" for="m_cc">Cc (optional)</label><input type="text" id="m_cc" autocomplete="off">
      <label class="l" for="m_sj">Subject</label><input type="text" id="m_sj" maxlength="150" placeholder="${e ? E(e.title) + ' (CARE report)' : 'Document from CARE'}">
      <label class="l" for="m_ms">Message</label><textarea id="m_ms" rows="3" maxlength="3000"></textarea>
      ${e ? ck('m_pdf', 'Attach the report as PDF', 1) + ck('m_csv', 'Attach the data as CSV', 0) + ck('m_lk', 'Include links to its Google Doc, Sheet and Drive folder (if any)', 1) + ck('m_sh', 'Also let the recipients view the Google Doc and Sheet <span class="m">(they need a Google account)</span>', 0) : ''}
      <label class="l" for="m_fl">${e ? 'Attach other files' : 'Attach files'} from your computer <span class="m">(up to ${fsize(MAXF)} in total)</span></label><input type="file" id="m_fl" multiple onchange="mailPick(this)"><div id="m_files"></div>
      <div class="rp-bar"><button class="btn bp mt" style="width:auto" id="m_go" ${ready ? '' : 'disabled'} onclick="mailSend()">Send email</button><button class="btn mt" style="width:auto" onclick="closeM()">Cancel</button><span id="m_st" class="m"></span></div>
      ${e && (e.mails || []).length ? `<div class="lab" style="margin-top:12px">Already sent</div>${e.mails.map(m => `<div class="rp-step"><div style="flex:1">${E((m.to || []).concat(m.cc || []).join(', '))}<div class="m">${ago(m.t)} · ${E(m.by)} · ${E(m.subject)}</div></div><button class="wfbtn d" onclick="mailDel('${e.id}','${m.id}')">Delete record</button></div>`).join('')}<p class="m">Deleting a record only removes it from this list. The email stays in Gmail.</p>` : ''}`);
  }
  const mailFiles = () => { const el = document.getElementById('m_files'); if (el) el.innerHTML = MX.files.map((f, i) => `<div class="rp-step"><span style="flex:1">📎 ${E(f.name)} <span class="m">${fsize(f.size)}</span></span><button class="wfbtn d" style="margin:0" onclick="mailRm(${i})" aria-label="Remove ${E(f.name)}">✕</button></div>`).join('') };
  window.mailRm = i => { MX.files.splice(i, 1); mailFiles() };
  window.mailPick = async input => {
    const add = [...input.files]; input.value = '';
    for (const f of add) {
      if (MX.files.reduce((n, x) => n + x.size, 0) + f.size > MAXF) { toast(`"${f.name}" is too big. Attach up to ${fsize(MAXF)} in total.`); continue }
      const data = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ok(''); r.readAsDataURL(f) });
      if (data) MX.files.push({ name: f.name, type: f.type, size: f.size, data }); else toast(`Could not read "${f.name}".`);
    }
    mailFiles();
  };
  window.mailSend = async () => {
    const v = i => (document.getElementById(i) || {}).value || '', c = i => !!(document.getElementById(i) || {}).checked, go = document.getElementById('m_go');
    if (!v('m_to').trim()) return toast('Enter at least one email address.');
    go.disabled = true; $('#m_st').textContent = 'Sending…';
    const base = { to: v('m_to'), cc: v('m_cc'), subject: v('m_sj'), message: v('m_ms'), files: MX.files.map(f => ({ name: f.name, type: f.type, data: f.data })) };
    const j = MX.id ? await api('emailReport', { id: MX.id, ...base, pdf: c('m_pdf'), csv: c('m_csv'), links: c('m_lk'), share: c('m_sh') }) : await api('emailFiles', base);
    if (!j) { go.disabled = false; const s = $('#m_st'); if (s) s.textContent = ''; return }
    closeM(); toast('Email sent to ' + j.to.concat(j.cc).join(', ') + '.'); (j.warnings || []).forEach((w, i) => setTimeout(() => toast(w), 2200 * (i + 1)));
    if (j.entry) { const i = S.studio.reports.findIndex(x => x.id === j.entry.id); if (i >= 0) S.studio.reports[i] = j.entry; if (SR.entry && SR.entry.id === j.entry.id) SR.entry = j.entry; if (LIBP.entry && LIBP.entry.id === j.entry.id) LIBP.entry = j.entry }
  };
  window.mailDel = async (id, mid) => {
    if (!confirm('Remove this record from the list? The email itself stays in Gmail.')) return; const j = await api('deleteMail', { id, mailId: mid }); if (!j) return;
    const i = S.studio.reports.findIndex(x => x.id === id); if (i >= 0) S.studio.reports[i] = j.entry; if (SR.entry && SR.entry.id === id) SR.entry = j.entry; if (LIBP.entry && LIBP.entry.id === id) LIBP.entry = j.entry; toast('Record removed.'); mailModal();
  };

  /* ---------- Integrations ---------- */
  const IN = { tokShow: false };
  const copy = t => { navigator.clipboard ? navigator.clipboard.writeText(t).then(() => toast('Copied.'), () => toast('Copy failed.')) : toast('Select the text and copy it.') };
  window.cpy = id => copy(document.getElementById(id).textContent);
  window.gConnect = () => { location.href = '/api/google/connect' };
  window.gDisc = async () => { if (confirm('Disconnect Google? Reports already in Google Drive stay there.') && await api('googleDisconnect', {})) { toast('Google disconnected.'); loadG(true) } };
  window.mcpRot = async () => { if (confirm('Create a new MCP token? Anything using the old one stops working.') && await api('mcpRotate', {})) toast('New token created.') };
  window.mcpTog = () => { IN.tokShow = !IN.tokShow; render() };
  function intV() {
    addCss(); loadG(); const g = G.d, M = S.mcp || { token: '', tools: [] }, St = S.studio || {}, origin = location.origin, tok = IN.tokShow ? M.token : '••••••••••••••••••••';
    const desktop = JSON.stringify({ mcpServers: { care: { command: 'node', args: ['/full/path/to/care/mcp-stdio.js'], env: { CARE_URL: origin, CARE_MCP_TOKEN: M.token || '<token>' } } } }, null, 2);
    return head('Setup', 'Integrations') + `
    <div class="card"><div class="wfh"><div><h3 style="margin:0">Google Workspace (Docs, Sheets, Drive)</h3><div class="m">Creates Google Docs and Sheets from reports and saves files into a "CARE Reports" Drive folder.</div></div><div>${gBadge()}</div></div>
      ${g && g.lastError ? `<p class="st-bad">${E(g.lastError)}</p>` : ''}
      ${g && g.connected ? `<p class="m">Connected${g.email ? ' as <b>' + E(g.email) + '</b>' : ''} · ${g.folder ? `Drive folder: <a href="${E(g.folderUrl)}" target="_blank" rel="noopener" style="color:var(--teal)">${E(g.folder)}</a>` : 'the Drive folder is created on first save'}</p><button class="wfbtn d" onclick="gDisc()">Disconnect</button>`
      : g && g.configured ? '<p>Credentials are set. Sign in with the Google account that should own the files.</p><button class="btn bp" style="width:auto" onclick="gConnect()">Connect Google</button>'
      : `<div class="rp-box sug"><b>Setup required.</b> CARE has no Google credentials yet. Nothing is faked: Google buttons stay disabled until this is done (about 10 minutes, once).</div>`}
      ${g && !g.connected ? `<details class="rp-d" ${g.configured ? '' : 'open'}><summary>How to set it up</summary><ol style="line-height:1.7"><li>Open <b>console.cloud.google.com</b>, create a project, then enable the <b>Google Docs API</b>, <b>Google Sheets API</b>, <b>Google Drive API</b> and <b>Gmail API</b>.</li><li><b>OAuth consent screen</b>: choose External, add your own Google account as a test user.</li><li><b>Credentials → Create OAuth client ID → Web application</b>. Under "Authorised redirect URIs" add exactly:<span class="rp-code" id="ruri">${E(g.redirectUri)}</span><button class="wfbtn" onclick="cpy('ruri')">Copy</button></li><li>Start CARE with the two values Google gives you:<span class="rp-code">GOOGLE_CLIENT_ID=xxxx GOOGLE_CLIENT_SECRET=yyyy node server.js</span>On a host (Render, Railway…) add them as environment variables, and set <b>PUBLIC_URL</b> to your site address.</li><li>Come back here and click <b>Connect Google</b>.</li></ol><p class="m">CARE only asks for access to files it creates (the "drive.file" scope) plus Docs and Sheets editing.</p></details>` : ''}
    </div>
    <div class="card" style="margin-top:14px"><div class="wfh"><div><h3 style="margin:0">Gmail (share reports by email)</h3><div class="m">Email a report as PDF or CSV, with links to its Google Doc and Sheet, or any file from your computer, to anyone. Messages are sent from the connected Google account.</div></div><div>${!g ? '<span class="m">checking…</span>' : g.canEmail ? '<span class="st-ok">● Ready</span>' : g.connected ? '<span class="st-warn">● Reconnect needed</span>' : '<span class="st-bad">● Google not connected</span>'}</div></div>
      ${g && g.canEmail ? `<p class="m">Sending as <b>${E(g.email)}</b> · up to ${g.mailLimit} emails per hour${g.allowedDomains && g.allowedDomains.length ? ' · only to ' + E(g.allowedDomains.join(', ')) : ''}.</p><button class="wfbtn p" onclick="mailCompose()">✉ Compose email</button>` : g && g.connected ? '<p>Google is connected but CARE cannot send email yet. Use <b>Disconnect</b> above, then <b>Connect Google</b> again and keep the email permission ticked. Also turn on the <b>Gmail API</b> in your Google Cloud project.</p>' : '<p class="m">Connect Google above first, and turn on the <b>Gmail API</b> in your Google Cloud project.</p>'}
      <details class="rp-d"><summary>Optional safety settings</summary><p class="m">Start CARE with <b>GMAIL_ALLOWED_DOMAINS=college.edu,gmail.com</b> to limit who can receive email, and <b>GMAIL_MAX_PER_HOUR=30</b> to set the hourly limit. The assistant never sends mail by itself: it opens a form and a person presses Send.</p></details></div>
    <div class="card" style="margin-top:14px"><div class="wfh"><div><h3 style="margin:0">MCP server (Model Context Protocol)</h3><div class="m">Lets AI apps use CARE's data and report tools, and show charts, tables and forms inside the chat (MCP Apps). The Report Studio assistant and "Chat with apps" use the same tools.</div></div><div><span class="st-ok">● Running</span></div></div>
      <p class="m" style="margin-bottom:2px">Endpoint</p><span class="rp-code" id="mcpu">${E(origin)}/mcp</span><button class="wfbtn" onclick="cpy('mcpu')">Copy</button>
      <p class="m" style="margin-bottom:2px">Access token <small>(acts as an administrator: keep it secret)</small></p><span class="rp-code" id="mcpt">${E(tok)}</span><button class="wfbtn" onclick="mcpTog()">${IN.tokShow ? 'Hide' : 'Show'}</button> ${IN.tokShow ? '<button class="wfbtn" onclick="cpy(\'mcpt\')">Copy</button>' : ''}${M.tokenFromEnv ? '' : '<button class="wfbtn d" onclick="mcpRot()">New token</button>'}
      <details class="rp-d"><summary>Connect an AI app</summary><p class="m">Apps that start MCP servers as commands (for example Claude Desktop): add this to their config, using the real path to <b>mcp-stdio.js</b>. No packages needed (Node 18+).</p><span class="rp-code">${E(desktop)}</span><p class="m">Apps and SDKs that connect over HTTP: POST JSON-RPC to the endpoint with header <b>Authorization: Bearer &lt;token&gt;</b>. An internet-facing deployment should use HTTPS.</p></details>
      <details class="rp-d"><summary>${M.tools.length} tools available</summary>${M.tools.map(t => `<div class="rp-step"><b style="min-width:230px">${E(t.name)}</b><span class="m">${E(t.description)}</span></div>`).join('')}</details></div>
    <div class="card" style="margin-top:14px"><div class="wfh"><div><h3 style="margin:0">AI provider (optional)</h3><div class="m">Adds AI-written summaries and lets the assistant plan multi-step requests.</div></div><div>${St.ai ? `<span class="st-ok">● Connected</span>` : '<span class="st-warn">● Not configured</span>'}</div></div>
      <p class="m">${St.ai ? `Model: <b>${E(St.aiModel)}</b>. When you tick "AI-written summary", report figures and complaint titles are sent to the provider. Reporter names are never sent.` : 'Without it, CARE still builds every report from your data and understands the example requests using built-in rules. To turn it on, start CARE with <b>ANTHROPIC_API_KEY=your-key</b>.'}</p></div>
    <div class="card" style="margin-top:14px"><div class="wfh"><div><h3 style="margin:0">Workflow Automation</h3><div class="m">Workflows can generate reports and send them to Google (actions "Generate report", "Create Google Doc/Sheet", "Save to Drive").</div></div><div><span class="st-ok">● Running</span></div></div><button class="wfbtn" onclick="go('workflows')">Open Workflow Automation →</button></div>`;
  }

  /* ---------- registration (render hook + navigation) ---------- */
  window.__MY = window.__MY || {}; Object.assign(window.__MY, { studio: studioV, libreports: libV, integrations: intV });
  if (location.hash === '#integrations') setTimeout(() => { if (typeof U !== 'undefined' && U && isA()) go('integrations') }, 1500);
})();
