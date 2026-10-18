/* CARE frontend: Analytics, Intelligence, Staff Workspace, Inventory, verification, navigation.
   Loaded after app.js and ui-studio.js. */
(function () {
  const E = esc, MY = window.__MY = window.__MY || {};
  const CATSL = ['Electrical', 'Plumbing', 'Cleanliness', 'Equipment', 'Safety'], PORD = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const jg = async u => { try { const r = await fetch(u), j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.error || 'Something went wrong'); return null } return j } catch (e) { toast('Server not reachable'); return null } };
  const css = () => { window.__addCss && window.__addCss(); if (document.getElementById('opscss')) return; document.head.insertAdjacentHTML('beforeend', `<style id="opscss">
.tk{display:flex;flex-direction:column;gap:8px}.tk h3{margin:0}.tk .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tkg{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-top:14px}
.pb{height:8px;background:var(--in);border-radius:99px;overflow:hidden}.pb s{display:block;height:100%;background:linear-gradient(90deg,#0b8d7d,#5b4fc9);border-radius:99px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.tabs button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:8px 14px;cursor:pointer;font-size:14px}.tabs .on{background:var(--pri);color:#fff;border-color:var(--pri)}
.side{overflow-y:auto;scrollbar-width:thin}.side>*{flex-shrink:0}.hm td{text-align:center;font-variant-numeric:tabular-nums}.hm th{font-size:12px}.ph{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}.ph img{width:100%;border-radius:12px;border:1px solid var(--line)}
.lv-high{border-left:4px solid #c0392b}.lv-medium{border-left:4px solid #e29b2d}.lv-info{border-left:4px solid #3f8fdc}.low{color:#c0392b;font-weight:700}
</style>`) };
  const isOpen = r => !['Resolved', 'Withdrawn'].includes(r.status) && !['duplicate', 'fake'].includes(r.mod);
  const dueTxt = r => { const d = r.due - Date.now(), h = Math.abs(d) / 36e5, t = h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days'; return d < 0 ? `<span class="st-bad">Overdue by ${t}</span>` : `Due in ${t}` };
  const shrinkImg = f => new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(f); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .8)) }; im.onerror = no; im.src = u });
  const kp = (a) => `<div class="rp-k">${a.map(x => `<div><b class="${x[2] || ''}">${E(x[1])}</b><small>${E(x[0])}</small></div>`).join('')}</div>`;
  const tbl = (cols, rows) => `<div class="rp-tbl"><table><thead><tr>${cols.map(c => `<th>${E(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="m">Nothing to show.</td></tr>`}</tbody></table></div>`;
  const hs = (items, click, unit) => { const mx = Math.max(1, ...items.map(i => i[1])); return items.map(([k, n]) => `<div class="hs" ${click ? `style="cursor:pointer" onclick="${click}('${E(k).replace(/'/g, '')}')" title="Click to filter"` : ''}><div><span>${E(k)}</span><small>${n}${unit || ''}</small></div><i><s style="width:${Math.max(2, n / mx * 100)}%"></s></i></div>`).join('') || '<p class="m">No data yet.</p>' };
  const card = (t, body, sub) => `<div class="card"><h3>${t}</h3>${sub ? `<div class="m">${sub}</div>` : ''}${body}</div>`;

  /* ================= Analytics ================= */
  const AN = { d: null, busy: false, f: { from: '', to: '', cat: '', bld: '' } };
  async function anLoad() { AN.busy = true; const q = new URLSearchParams(Object.entries(AN.f).filter(([, v]) => v)), j = await jg('/api/analytics?' + q); AN.busy = false; if (j) AN.d = j; render() }
  window.anSet = (k, v) => { AN.f[k] = AN.f[k] === v && (k === 'cat' || k === 'bld') ? '' : v; AN.d = null; anLoad() };
  window.anReset = () => { AN.f = { from: '', to: '', cat: '', bld: '' }; AN.d = null; anLoad() };
  function monthsSvg(m) {
    const W = 560, H = 190, pad = 28, mx = Math.max(1, ...m.map(x => x.total)), bw = (W - pad * 2) / m.length, T = 'fill:currentColor;stroke:none';
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:640px;height:auto;stroke:none;fill:none" role="img" aria-label="Complaints per month">${m.map((x, i) => { const h = x.total / mx * (H - 60), h2 = x.resolved / mx * (H - 60), X = pad + i * bw + bw * .15, w = bw * .7; return `<g><title>${E(x.label)}: ${x.total} reported, ${x.resolved} resolved, ${x.critical} critical</title><rect x="${X}" y="${H - 30 - h}" width="${w}" height="${Math.max(h, 1)}" rx="5" style="fill:#0b8d7d;stroke:none"/><rect x="${X + w * .25}" y="${H - 30 - h2}" width="${w * .5}" height="${Math.max(h2, 0)}" rx="3" style="fill:#5b4fc9;stroke:none"/><text x="${X + w / 2}" y="${H - 34 - h}" text-anchor="middle" font-size="12" style="${T}">${x.total}</text><text x="${X + w / 2}" y="${H - 12}" text-anchor="middle" font-size="11" style="${T};opacity:.7">${E(x.label)}</text></g>` }).join('')}</svg><div class="m"><span style="color:#0b8d7d">■</span> reported &nbsp; <span style="color:#5b4fc9">■</span> resolved</div>`;
  }
  function heat(h) { const mx = Math.max(1, ...h.cells.flat()); return `<div class="rp-tbl"><table class="hm"><thead><tr><th></th>${h.cats.map(c => `<th>${E(c)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${h.blds.map((b, i) => `<tr><td style="text-align:left"><b>${E(b)}</b></td>${h.cells[i].map((n, j) => `<td title="${E(b)} · ${E(h.cats[j])}: ${n}" style="${n ? `background:rgba(11,141,125,${(.12 + .75 * n / mx).toFixed(2)});font-weight:600` : 'opacity:.4'}">${n || '·'}</td>`).join('')}<td><b>${h.cells[i].reduce((a, b) => a + b, 0)}</b></td></tr>`).join('')}</tbody></table></div><div class="m">Darker = more complaints. This uses building and category (CARE has no GPS coordinates for rooms).</div>` }
  function analyticsV() {
    css(); if (!AN.d && !AN.busy) anLoad(); const d = AN.d, f = AN.f;
    const bar = `<div class="card"><div class="fl" style="margin:0"><div><label class="m">From</label><input type="date" value="${E(f.from)}" onchange="anSet('from',this.value)"></div><div><label class="m">To</label><input type="date" value="${E(f.to)}" onchange="anSet('to',this.value)"></div>
      <div><label class="m">Category</label><select onchange="anSet('cat',this.value)"><option value="">All</option>${CATSL.map(c => `<option ${c === f.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label class="m">Building</label><select onchange="anSet('bld',this.value)"><option value="">All</option>${Object.keys(BLD).map(c => `<option ${c === f.bld ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <button class="wfbtn" onclick="anReset()">Reset</button><button class="wfbtn" onclick="AN_refresh()">Refresh</button></div><div class="m" style="margin-top:6px">Tip: click a bar in "by category" or "by building" to filter the whole page.</div></div>`;
    if (!d) return head('Insights', 'Campus analytics') + bar + `<div class="card"><span class="rp-spin"></span>Loading real complaint data…</div>`;
    const k = d.kpis;
    return head('Insights', 'Campus analytics') + bar + kp([['Total complaints', k.total], ['Open', k.open], ['Resolved', k.resolved], ['Overdue', k.overdue, k.overdue ? 'st-bad' : ''], ['Critical (open)', k.criticalOpen, k.criticalOpen ? 'st-bad' : ''], ['Avg hours to resolve', k.avgRes ?? 'n/a'], ['Resolved within deadline', k.sla == null ? 'n/a' : k.sla + '%'], ['Unassigned', k.unassigned]]) +
      `<div class="g2">${card('Complaints by category', hs(d.byCat, 'anSet.bind(null,\'cat\')'))}${card('Complaints by building', hs(d.byBld, 'anSet.bind(null,\'bld\')'))}</div>` +
      `<div class="g2">${card('Monthly trend', monthsSvg(d.months), 'Last 6 months (respects category and building filters)')}${card('Staff workload', d.people.length ? tbl(['Staff', 'Team', 'Open', 'Overdue', 'Done'], d.people.map(p => [E(p.name), E(p.team), `<b>${p.open}</b>`, p.overdue ? `<span class="st-bad">${p.overdue}</span>` : 0, p.done])) : '<p class="m">No staff yet.</p>', 'Open tasks right now')}</div>` +
      card('Department comparison', tbl(['Department', 'Team', 'Complaints', 'Open', 'Overdue', 'Avg hours', 'Within deadline'], d.dept.map(x => [E(x.cat), E(x.team), x.total, x.open, x.overdue ? `<span class="st-bad">${x.overdue}</span>` : 0, x.avgRes ?? '–', x.sla == null ? '–' : x.sla + '%']))) +
      `<div class="g2" style="margin-top:14px">${card('Resolution performance', tbl(['Priority', 'Resolved', 'Avg hours', 'Within deadline'], d.resolution.map(x => [E(x.pri), x.n, x.avg ?? '–', x.sla == null ? '–' : x.sla + '%'])) + (d.resolution.length ? '' : '<p class="m">Nothing resolved yet in this selection.</p>'), 'Only complaints that were resolved')}${card('Recurring issues', d.recurring.length ? tbl(['Building', 'Category', 'Complaints (90 days)', 'Open'], d.recurring.map(x => [E(x.bld), E(x.cat), x.count, x.open])) : '<p class="m">No repeat problems detected.</p>', 'Same building and category two or more times')}</div>` +
      `<div style="margin-top:14px">${card('Campus heatmap', heat(d.heat))}</div>` +
      `<div class="g2" style="margin-top:14px">${card('Priority mix', hs(d.byPri.filter(x => x[1]), null))}${card('Satisfaction', `<div class="tel">${d.rating ? d.rating + ' / 5' : 'n/a'}</div><div class="m">${d.ratings} rating${d.ratings === 1 ? '' : 's'} from students after resolution</div>`)}</div>`;
  }
  window.AN_refresh = () => { AN.d = null; anLoad() };

  /* ================= Intelligence ================= */
  const IT = { d: null, busy: false, test: null };
  async function itLoad() { IT.busy = true; const j = await jg('/api/intel'); IT.busy = false; if (j) IT.d = j; render() }
  window.itTest = async () => { const t = ($('#itt') || {}).value || ''; if (t.trim().length < 5) return toast('Type a sample complaint first.'); IT.test = await jg('/api/suggest?text=' + encodeURIComponent(t)); IT.tt = t; render() };
  window.itGroup = async ids => { const t = prompt('Name this incident', ''); if (t === null) return; if (await api('groupIncident', { ids: ids.split(','), title: t })) { toast('Grouped. The individual complaints are kept.'); IT.d = null; itLoad() } };
  window.itUngroup = async id => { if (confirm('Remove this incident grouping? The complaints are kept.') && await api('ungroupIncident', { id })) { IT.d = null; itLoad() } };
  const lvl = { high: 'Needs attention', medium: 'Should do', info: 'For your information' };
  function intelV() {
    css(); if (!IT.d && !IT.busy) itLoad(); const d = IT.d;
    const head0 = head('AI insights', 'Complaint intelligence') + `<div class="card"><p class="m" style="margin:0">Two kinds of statements appear here. <span class="rp-tag">DATA</span> is counted from real complaint records. <span class="rp-tag">SUGGESTION</span> is a rule-based recommendation built on that data. Nothing here is guessed from outside CARE.</p><button class="wfbtn" onclick="IT.d=null;itLoad()">Refresh</button></div>`;
    if (!d) return head0 + `<div class="card" style="margin-top:14px"><span class="rp-spin"></span>Analysing complaint history…</div>`;
    const recs = d.recs.length ? d.recs.map(r => `<div class="rp-box lv-${r.level}"><span class="rp-tag">SUGGESTION · ${E(lvl[r.level])}</span><div><b>${E(r.text)}</b></div><small class="m">Data: ${E(r.evidence)}</small></div>`).join('') : '<p class="m">Nothing needs attention right now.</p>';
    const dups = d.dups.length ? d.dups.map(g => `<div class="rp-box data"><span class="rp-tag">DATA · ${g.ids.length} similar open complaints · ${g.score}% text match</span><div>${g.ids.map(id => `<button class="chip" onclick="detail('${id}')">${E(id)}</button>`).join(' ')}</div><div class="m">${E(g.bld)} · ${E(g.rooms.join(', '))} · ${E(g.cats.join(', '))}${g.shared.length ? ' · shared words: ' + E(g.shared.join(', ')) : ''}</div><ul>${g.titles.map(t => `<li>${E(t)}</li>`).join('')}</ul>
      ${g.incident ? `<span class="st-ok">Already grouped as ${E(g.incident)}</span>` : `<span class="rp-tag">SUGGESTION</span> Treat these as one incident (each complaint is kept) <button class="wfbtn p" onclick="itGroup('${g.ids.join(',')}')">Group as one incident</button>`}</div>`).join('') : '<p class="m">No duplicate-looking complaints are open.</p>';
    const inc = d.incidents.length ? tbl(['Incident', 'Title', 'Complaints', 'Still open', ''], d.incidents.map(i => [E(i.id), E(i.title), i.ids.map(x => `<a href="#" onclick="detail('${x}');return false" style="color:var(--teal)">${E(x)}</a>`).join(', '), i.open, `<button class="wfbtn d" onclick="itUngroup('${i.id}')">Remove grouping</button>`])) : '';
    const root = d.root.length ? d.root.map(x => `<div class="rp-box data"><span class="rp-tag">DATA</span><div><b>${E(x.cat)} in ${E(x.bld)}</b>: ${x.count} complaints in 90 days, ${x.open} still open</div><div class="m">${E(x.evidence)}</div>${hs(x.rooms, null, ' complaints')}<div class="rp-box sug" style="margin:8px 0 0"><span class="rp-tag">SUGGESTION · possible common causes and inspections</span><ul>${x.inspect.map(i => `<li>${E(i)}</li>`).join('')}</ul></div></div>`).join('') : '<p class="m">No building has three or more complaints of the same kind in the last 90 days.</p>';
    const pr = d.predict.length ? tbl(['Location', 'Category', 'Complaints', 'Avg days between', 'Last reported', 'Next expected', 'Trend (30 d)', ''], d.predict.map(x => [`${E(x.bld)} · ${E(x.room)}`, E(x.cat), x.count, x.avgGapDays, ago(x.lastAt), new Date(x.nextAt).toLocaleDateString(), `${E(x.trend)} (${x.recent} vs ${x.prior})`, x.overdueForInspection ? '<span class="st-warn">Inspect soon</span>' : ''])) + '<p class="m">An estimate from how often the same problem was reported at the same place. It is not sensor data. Use it to decide where to inspect first.</p>' : '<p class="m">Needs a location with 3 or more complaints of the same kind.</p>';
    return head0 + `<div style="margin-top:14px">${card('Recommendations', recs)}</div><div style="margin-top:14px">${card('Possible duplicate complaints', dups + inc, 'Same building, similar wording, still open')}</div><div style="margin-top:14px">${card('Root-cause analysis', root)}</div><div style="margin-top:14px">${card('Predictive maintenance', pr, 'Assets and locations that may need inspection')}</div>
      <div style="margin-top:14px">${card('Try smart categorisation', `<textarea id="itt" rows="2" placeholder="Type a complaint, e.g. water dripping from the ceiling pipe">${E(IT.tt || '')}</textarea><br><button class="wfbtn" onclick="itTest()">Suggest category, priority and team</button>${IT.test ? (IT.test.cat ? `<div class="rp-box sug"><span class="rp-tag">SUGGESTION</span> <b>${E(IT.test.cat)}</b> · ${E(IT.test.pri)} priority · ${E(IT.test.staff || '')} <small class="m">(${IT.test.confidence}% match on: ${E(IT.test.why.join(', '))})</small>${IT.test.note ? `<div class="m">${E(IT.test.note)}</div>` : ''}</div>` : `<p class="m">${E(IT.test.note)}</p>`) : ''}`, 'Students see this hint while writing a report')}</div>`;
  }

  /* ================= Staff workspace ================= */
  const SW = { tab: 'todo', staff: '' };
  const TODO = ['Submitted', 'Under review', 'Assigned', 'Accepted', 'Reopened', 'Blocked'];
  window.swTab = t => { SW.tab = t; render() };
  window.stk = async (id, op, extra) => { const j = await api('staffTask', { id, op, ...(extra || {}) }); if (j && $('#layer').innerHTML) taskModal(id); return j };
  function taskCard(r) {
    const can = TODO.includes(r.status), startable = ['Assigned', 'Accepted', 'Blocked', 'Reopened', 'Submitted', 'Under review'].includes(r.status);
    return `<div class="card tk"><div class="row" style="justify-content:space-between"><b onclick="taskModal('${r.id}')" style="cursor:pointer">${E(r.title)}</b><span class="p-${r.pri}">${r.pri}</span></div>
      <div class="m">${E(r.id)} · ${E(r.cat)} · ${E(r.bld)}, ${E(r.room)}</div><div class="row">${pill(r.status)}${r.reassignReq ? ' <span class="pill Reopened">Reassignment requested</span>' : ''}</div><div class="m">${isOpen(r) ? dueTxt(r) : 'Closed'}</div>
      <div class="pb" title="${r.progress}% done"><s style="width:${r.progress || 0}%"></s></div><div class="row">${r.status === 'Assigned' || r.status === 'Submitted' || r.status === 'Under review' || r.status === 'Reopened' ? `<button class="wfbtn p" onclick="stk('${r.id}','accept')">Accept</button>` : ''}${startable && r.status !== 'Assigned' || r.status === 'Assigned' ? `<button class="wfbtn" onclick="stk('${r.id}','start')">Start work</button>` : ''}<button class="wfbtn" onclick="taskModal('${r.id}')">Open</button></div></div>`;
  }
  function staffV() {
    css(); const me = S.reports, op = me.filter(isOpen), wk = Date.now() - 7 * 864e5, done = me.filter(r => r.status === 'Resolved'), recent = done.filter(r => (r.resolved || 0) > wk), tt = done.filter(r => r.resolved && r.created);
    const avg = tt.length ? Math.round(tt.reduce((s, r) => s + r.resolved - r.created, 0) / tt.length / 36e5 * 10) / 10 : null;
    const sets = { todo: me.filter(r => TODO.includes(r.status)), prog: me.filter(r => r.status === 'In progress'), verify: me.filter(r => r.status === 'Awaiting verification'), over: op.filter(r => r.overdue), done };
    const names = { todo: 'To do', prog: 'In progress', verify: 'Awaiting verification', over: 'Overdue', done: 'Completed' };
    const list = sets[SW.tab].slice().sort((a, b) => (b.overdue - a.overdue) || PORD[a.pri] - PORD[b.pri] || a.due - b.due);
    return head('My work', 'Staff Workspace') + kp([['Open tasks', op.length], ['In progress', sets.prog.length], ['Overdue', sets.over.length, sets.over.length ? 'st-bad' : ''], ['Awaiting verification', sets.verify.length], ['Completed this week', recent.length], ['Avg hours to finish', avg ?? 'n/a']]) +
      `<div class="tabs">${Object.keys(names).map(k => `<button class="${SW.tab === k ? 'on' : ''}" onclick="swTab('${k}')">${names[k]} (${sets[k].length})</button>`).join('')}</div>` + (list.length ? `<div class="tkg">${list.map(taskCard).join('')}</div>` : `<div class="card m">Nothing here. ${SW.tab === 'todo' ? 'New tasks assigned to you will appear in this tab.' : ''}</div>`);
  }
  function taskModal(id) {
    const r = S.reports.find(x => x.id === id); if (!r) return; css();
    const photos = [r.photo && ['Reported photo', `/api/photo/${r.id}`], r.before && ['Before the work', `/api/photo/${r.id}?before=1`], r.after && ['After the fix', `/api/photo/${r.id}?after=1`]].filter(Boolean), items = (S.inv && S.inv.items) || [], isadm = isA(), closed = !isOpen(r), wait = r.status === 'Awaiting verification';
    modal(`<div style="display:flex;justify-content:space-between"><div><div class="lab">${E(r.id)} · ${E(r.cat)}</div><h2>${E(r.title)}</h2></div><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
      <div>${pill(r.status)} <span class="p-${r.pri}">${r.pri} priority</span> ${isOpen(r) ? dueTxt(r) : ''}</div><p class="m">${E(r.bld)} · ${E(r.room)} · assigned to ${E(r.as)}</p><p>${E(r.desc || '')}</p>
      ${photos.length ? `<div class="ph">${photos.map(p => `<div><small class="m">${p[0]}</small><img src="${p[1]}" alt="${p[0]}"></div>`).join('')}</div>` : ''}
      ${r.reassignReq ? `<div class="rp-box sug">Reassignment requested: ${E(r.reassignReq.reason)}</div>` : ''}
      ${closed ? '' : wait ? '<div class="rp-box">Waiting for the reporter to confirm the fix. You can still add notes.</div>' : `
      <div class="lab">Progress</div><div class="row" style="display:flex;gap:10px;align-items:center"><input type="range" id="tkp" min="0" max="100" step="5" value="${r.progress || 0}" oninput="$('#tkpv').textContent=this.value+'%'" style="flex:1"><b id="tkpv">${r.progress || 0}%</b><button class="wfbtn" onclick="stk('${r.id}','progress',{value:$('#tkp').value,text:$('#tkn').value})">Save</button></div>
      <div class="chips">${TODO.includes(r.status) && r.status !== 'Blocked' && r.status !== 'Accepted' ? `<button class="chip" onclick="stk('${r.id}','accept')">Accept task</button>` : ''}<button class="chip" onclick="stk('${r.id}','start')">${r.status === 'In progress' ? 'In progress ✓' : 'Start work'}</button><button class="chip" onclick="const w=prompt('What is blocking the work?');w&&stk('${r.id}','block',{text:w})">Mark as blocked</button></div>`}
      <div class="lab">Work notes</div>${(r.comments || []).length ? `<div class="tl">${r.comments.map(c => `<div><b>${E(c.text)}</b><div class="m">${E(c.who)} · ${ago(c.t)}${c.kind === 'completion' ? ' · completion note' : c.kind === 'blocked' ? ' · blocked' : ''}</div></div>`).join('')}</div>` : '<p class="m">No notes yet.</p>'}
      <textarea id="tkn" rows="2" placeholder="Add a work note (visible to the reporter and administrators)"></textarea><button class="wfbtn" onclick="const t=$('#tkn').value;t.trim()&&stk('${r.id}','comment',{text:t})">Add note</button>
      ${closed ? '' : `<div class="lab">Photos</div><div class="g2"><div><label class="l">Before the work</label><input type="file" accept="image/*" onchange="tkPhoto('${r.id}','beforePhoto',this)"></div><div><label class="l">After the fix</label><input type="file" accept="image/*" onchange="tkPhoto('${r.id}','afterPhoto',this)"></div></div>
      <div class="lab">Parts used</div>${(r.parts || []).map(p => `<p class="m" style="margin:2px 0">• ${p.qty} ${E(p.unit)} ${E(p.name)}${isadm ? ' · ' + (S.inv ? E(S.inv.currency) : '') + p.cost : ''}</p>`).join('')}
      <div class="fl" style="margin-bottom:0"><select id="tku" aria-label="Part">${items.map(i => `<option value="${E(i.id)}" ${i.qty < 1 ? 'disabled' : ''}>${E(i.name)} (${i.qty} ${E(i.unit)} in stock)</option>`).join('')}</select><input type="number" id="tkq" min="1" value="1" style="max-width:90px" aria-label="Quantity"><button class="wfbtn" onclick="tkPart('${r.id}')">Record use</button></div>
      ${wait ? '' : `<div class="lab">Finish</div><textarea id="tkc" rows="2" placeholder="What did you do? (required to complete)"></textarea><button class="btn bp" onclick="tkDone('${r.id}')">Mark as completed (the reporter will verify)</button>
      <div class="lab">Need to hand this over?</div><div class="fl" style="margin-bottom:0"><input type="text" id="tkr" placeholder="Reason for reassignment" maxlength="400"><button class="wfbtn" onclick="const t=$('#tkr').value;t.trim()&&stk('${r.id}','reassign',{text:t})">Request reassignment</button></div>`}`}
      <div class="lab">Timeline</div><div class="tl">${r.hist.map(h => `<div><b>${E(h[0])}</b><div class="m">${ago(h[1])}${h[2] ? ' · ' + E(h[2]) : ''}</div></div>`).join('')}</div>`);
    const m = document.querySelector('.mod'); m && m.classList.add('wide');
  }
  window.taskModal = taskModal;
  window.tkDone = id => { const t = ($('#tkc') || {}).value || ''; if (t.trim().length < 5) return toast('Describe what was done first.'); stk(id, 'complete', { text: t }) };
  window.tkPart = async id => { const item = $('#tku').value, qty = +$('#tkq').value; if (await api('usePart', { id, item, qty })) { toast('Part recorded.'); taskModal(id) } };
  window.tkPhoto = async (id, act, inp) => { const f = inp.files[0]; if (!f) return; try { const photo = await shrinkImg(f); if (await api(act, { id, photo })) { toast('Photo added.'); taskModal(id) } } catch (e) { toast('Could not read that image.') } };

  /* ---- admin team view ---- */
  window.swStaff = v => { SW.staff = v; render() };
  window.reassignTo = async id => { const v = $('#rs' + id).value; if (v && await api('update', { id, as: v })) toast('Reassigned.') };
  function teamV() {
    css(); const all = S.reports.filter(r => !['duplicate', 'fake'].includes(r.mod)), op = all.filter(isOpen), staff = S.staffList || [], req = op.filter(r => r.reassignReq), un = op.filter(r => r.as === 'Unassigned');
    const rows = staff.map(s => { const m = all.filter(r => r.as === s.name), o = m.filter(isOpen), d = m.filter(r => r.status === 'Resolved'), tt = d.filter(r => r.resolved), a = tt.length ? Math.round(tt.reduce((x, r) => x + r.resolved - r.created, 0) / tt.length / 36e5 * 10) / 10 : '–', pc = m.length ? Math.round(100 * d.length / m.length) : 0;
      return [`<a href="#" onclick="swStaff('${E(s.name)}');return false" style="color:var(--teal)"><b>${E(s.name)}</b></a>`, E(s.team), o.length, o.filter(r => r.status === 'In progress').length, o.filter(r => r.overdue).length ? `<span class="st-bad">${o.filter(r => r.overdue).length}</span>` : 0, o.filter(r => r.status === 'Awaiting verification').length, d.length, a, `<div class="pb" style="min-width:90px" title="${pc}% completed"><s style="width:${pc}%"></s></div>`] });
    const sel = id => `<select id="rs${id}" aria-label="Assign to"><option value="">Choose staff</option>${staff.map(s => `<option>${E(s.name)}</option>`).join('')}</select>`;
    const shown = op.filter(r => !SW.staff || r.as === SW.staff);
    return head('Teams', 'Staff Workspace') + kp([['Open complaints', op.length], ['In progress', op.filter(r => r.status === 'In progress').length], ['Awaiting verification', op.filter(r => r.status === 'Awaiting verification').length], ['Overdue', op.filter(r => r.overdue).length, op.filter(r => r.overdue).length ? 'st-bad' : ''], ['Unassigned', un.length, un.length ? 'st-warn' : ''], ['Completion rate', all.length ? Math.round(100 * all.filter(r => r.status === 'Resolved').length / all.length) + '%' : 'n/a']]) +
      (req.length ? card('Reassignment requests', tbl(['Complaint', 'Asked by', 'Reason', 'Reassign to'], req.map(r => [`<a href="#" onclick="detail('${r.id}');return false" style="color:var(--teal)">${E(r.id)}</a> ${E(r.title)}`, E(r.reassignReq.by), E(r.reassignReq.reason), `${sel(r.id)} <button class="wfbtn p" onclick="reassignTo('${r.id}')">Reassign</button>`]))) + '<div style="height:14px"></div>' : '') +
      card('Teams', tbl(['Staff', 'Team', 'Open', 'In progress', 'Overdue', 'Awaiting verification', 'Completed', 'Avg hours', 'Completion'], rows), 'Click a name to filter the task list') + '<div style="height:14px"></div>' +
      (un.length ? card('Not yet assigned', tbl(['Complaint', 'Category', 'Priority', 'Assign to'], un.slice(0, 15).map(r => [`<a href="#" onclick="detail('${r.id}');return false" style="color:var(--teal)">${E(r.id)}</a> ${E(r.title)}`, E(r.cat), `<span class="p-${r.pri}">${r.pri}</span>`, `${sel(r.id)} <button class="wfbtn p" onclick="reassignTo('${r.id}')">Assign</button>`]))) + '<div style="height:14px"></div>' : '') +
      `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 22px"><h3 style="margin:0">Active tasks${SW.staff ? ' · ' + E(SW.staff) : ''}</h3>${SW.staff ? '<a href="#" onclick="swStaff(\'\');return false" style="color:var(--teal)">Show everyone</a>' : ''}</div><div style="overflow-x:auto">${shown.length ? tbl2(shown) : '<p class="m" style="padding:0 22px 18px">No open tasks.</p>'}</div></div>`;
  }

  /* ================= Inventory ================= */
  const cur = () => (S.inv && S.inv.currency) || '';
  const money = n => cur() + (Math.round(n * 100) / 100).toLocaleString();
  const IV = { q: '' };
  window.itemModal = id => { const it = (S.inv.items.find(x => x.id === id)) || { name: '', unit: 'pcs', qty: 0, min: 5, cost: 0, cat: '', loc: '' }; modal(`<div style="display:flex;justify-content:space-between"><h2>${id ? 'Edit item' : 'Add stock item'}</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
    <div class="g2"><div><label class="l">Name</label><input type="text" id="ivn" value="${E(it.name)}" maxlength="60"></div><div><label class="l">Unit</label><input type="text" id="ivu" value="${E(it.unit)}" maxlength="12"></div></div>
    <div class="g2">${id ? '' : `<div><label class="l">Starting quantity</label><input type="number" id="ivq" min="0" value="${it.qty}"></div>`}<div><label class="l">Low-stock alert at</label><input type="number" id="ivm" min="0" value="${it.min}"></div></div>
    <div class="g2"><div><label class="l">Unit cost (${E(cur())})</label><input type="number" id="ivc" min="0" step="any" value="${it.cost}"></div><div><label class="l">Used for</label><select id="ivt"><option value="">General</option>${CATSL.map(c => `<option ${c === it.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <label class="l">Stored at</label><input type="text" id="ivl" value="${E(it.loc || '')}" maxlength="60"><br><br><button class="btn bp" onclick="itemSave('${id || ''}')">Save</button>`) };
  window.itemSave = async id => { const g = i => ($(i) || {}).value, j = await api('invSave', { id: id || undefined, name: g('#ivn'), unit: g('#ivu'), qty: g('#ivq'), min: g('#ivm'), cost: g('#ivc'), cat: g('#ivt'), loc: g('#ivl') }); if (j) { closeM(); toast('Saved.') } };
  window.itemAdj = async id => { const it = S.inv.items.find(x => x.id === id), v = prompt(`Add to stock of ${it.name}. Use a negative number to remove (current: ${it.qty} ${it.unit}).`, '10'); if (v === null) return; const reason = +v > 0 ? 'Restock' : prompt('Reason for removing stock', 'Damaged or lost') || 'Adjustment'; if (await api('invAdjust', { id, delta: +v, reason })) toast('Stock updated.') };
  window.itemDel = async id => { const it = S.inv.items.find(x => x.id === id); if (confirm(`Delete ${it.name} from the stock list?`) && await api('invDelete', { id })) toast('Deleted.') };
  window.woModal = id => { const w = (S.inv.orders.find(x => x.id === id)) || {}, staff = S.staffList || []; modal(`<div style="display:flex;justify-content:space-between"><h2>${id ? 'Edit work order' : 'New work order'}</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
    <label class="l">What needs doing</label><input type="text" id="wot" value="${E(w.title || '')}" maxlength="100"><div class="g2"><div><label class="l">Equipment / asset</label><input type="text" id="woa" value="${E(w.asset || '')}" maxlength="80" placeholder="e.g. Water pump P1"></div><div><label class="l">Assign to</label><select id="wos"><option value="">Not assigned</option>${staff.map(s => `<option ${s.name === w.assignedTo ? 'selected' : ''}>${E(s.name)}</option>`).join('')}</select></div></div>
    <div class="g2"><div><label class="l">Building</label><select id="wob"><option value="">–</option>${Object.keys(BLD).map(b => `<option ${b === w.bld ? 'selected' : ''}>${b}</option>`).join('')}</select></div><div><label class="l">Room / place</label><input type="text" id="wor" value="${E(w.room || '')}" maxlength="40"></div></div>
    <div class="g2"><div><label class="l">Due date</label><input type="date" id="wod" value="${w.due ? new Date(w.due).toISOString().slice(0, 10) : ''}"></div><div><label class="l">Linked complaint (optional)</label><input type="text" id="wol" value="${E(w.reportId || '')}" placeholder="CARE-1003"></div></div>
    <label class="l">Notes</label><textarea id="won" rows="2">${E(w.notes || '')}</textarea><br><br><button class="btn bp" onclick="woSave('${id || ''}')">Save work order</button>`) };
  window.woSave = async id => { const g = i => ($(i) || {}).value, j = await api('woSave', { id: id || undefined, title: g('#wot'), asset: g('#woa'), assignedTo: g('#wos'), bld: g('#wob'), room: g('#wor'), due: g('#wod'), reportId: g('#wol'), notes: g('#won') }); if (j) { closeM(); toast('Work order saved.') } };
  window.woSt = async (id, status) => { let cost; if (status === 'Done') { const c = prompt(`Repair cost in ${cur()} (labour and other costs; parts used on complaints are counted separately). Leave 0 if none.`, '0'); if (c === null) return render(); cost = c } if (await api('woStatus', { id, status, cost })) toast('Updated.') };
  window.woDel = async id => { if (confirm('Delete this work order?') && await api('woDelete', { id })) toast('Deleted.') };
  function woTable(orders, adm) { return tbl(['Work order', 'Asset / place', 'Assigned to', 'Due', 'Status', 'Cost', ''], orders.map(w => [`<b>${E(w.title)}</b><br><small class="m">${E(w.id)}${w.reportId ? ' · ' + E(w.reportId) : ''}</small>`, E([w.asset, w.bld, w.room].filter(Boolean).join(' · ') || '–'), E(w.assignedTo || '–'), w.due ? new Date(w.due).toLocaleDateString() : '–', `<select class="as" aria-label="Status" onchange="woSt('${w.id}',this.value)">${['Open', 'In progress', 'Done', 'Cancelled'].map(s => `<option ${s === w.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`, w.cost ? money(w.cost) : '–', adm ? `<button class="wfbtn" onclick="woModal('${w.id}')">Edit</button><button class="wfbtn d" onclick="woDel('${w.id}')">✕</button>` : ''])) }
  function inventoryV() {
    css(); const I = S.inv || { items: [], moves: [], orders: [] }, adm = isA(), low = I.items.filter(i => i.qty <= i.min);
    const stock = tbl(['Item', 'Used for', 'In stock', 'Alert at', 'Unit cost', ''], I.items.filter(i => !IV.q || i.name.toLowerCase().includes(IV.q.toLowerCase())).map(i => [`<b>${E(i.name)}</b>${i.loc ? `<br><small class="m">${E(i.loc)}</small>` : ''}`, E(i.cat || 'General'), `<span class="${i.qty <= i.min ? 'low' : ''}">${i.qty} ${E(i.unit)}${i.qty <= i.min ? ' · LOW' : ''}</span>`, i.min, i.cost != null ? money(i.cost) : '–', adm ? `<button class="wfbtn" onclick="itemAdj('${i.id}')">+ / − Stock</button><button class="wfbtn" onclick="itemModal('${i.id}')">Edit</button><button class="wfbtn d" onclick="itemDel('${i.id}')">✕</button>` : '']));
    let h = head(adm ? 'Operations' : 'Store', adm ? 'Inventory & maintenance' : 'Parts & work orders');
    if (low.length) h += `<div class="rp-box lv-high" style="margin-top:14px"><span class="rp-tag">LOW STOCK</span> ${low.map(i => `<b>${E(i.name)}</b> (${i.qty} ${E(i.unit)} left)`).join(', ')}</div>`;
    if (adm) {
      const parts = S.reports.flatMap(r => (r.parts || []).map(p => ({ ...p, rid: r.id, t: p.t }))), pm = parts.filter(p => p.t > Date.now() - 30 * 864e5), done = I.orders.filter(w => w.status === 'Done'), wm = done.filter(w => (w.done || 0) > Date.now() - 30 * 864e5);
      const assets = {}; done.filter(w => w.asset).forEach(w => (assets[w.asset] = assets[w.asset] || []).push(w));
      h += kp([['Items in stock', I.items.length], ['Low-stock items', low.length, low.length ? 'st-bad' : ''], ['Parts cost (30 days)', money(pm.reduce((s, p) => s + p.cost, 0))], ['Work order costs (30 days)', money(wm.reduce((s, w) => s + (w.cost || 0), 0))], ['Open work orders', I.orders.filter(w => ['Open', 'In progress'].includes(w.status)).length]]);
      h += `<div class="card"><div class="wfh"><h3 style="margin:0">Stock</h3><div><input type="text" placeholder="Search stock" aria-label="Search stock" value="${E(IV.q)}" onchange="IV.q=this.value;render()" style="width:200px"> <button class="wfbtn p" onclick="itemModal('')">+ Add item</button></div></div>${stock}</div>`;
      h += `<div class="card" style="margin-top:14px"><div class="wfh"><h3 style="margin:0">Maintenance work orders</h3><button class="wfbtn p" onclick="woModal('')">+ New work order</button></div>${I.orders.length ? woTable(I.orders, true) : '<p class="m">No work orders yet. Use them for planned maintenance such as servicing a pump or a generator.</p>'}</div>`;
      h += `<div class="g2" style="margin-top:14px">${card('Equipment maintenance history', Object.keys(assets).length ? Object.entries(assets).map(([a, l]) => `<p style="margin:8px 0"><b>${E(a)}</b> · ${l.length} job${l.length > 1 ? 's' : ''} · ${money(l.reduce((s, w) => s + (w.cost || 0), 0))}<br>${l.slice(0, 4).map(w => `<small class="m">${new Date(w.done).toLocaleDateString()}: ${E(w.title)}${w.cost ? ' (' + money(w.cost) + ')' : ''}</small>`).join('<br>')}</p>`).join('') : '<p class="m">Completed work orders with an asset name build this history.</p>')}${card('Stock movements', tbl(['When', 'Item', 'Change', 'Reason'], I.moves.slice(0, 15).map(m => [ago(m.t), E(m.name), `<b class="${m.delta < 0 ? 'st-warn' : 'st-ok'}">${m.delta > 0 ? '+' : ''}${m.delta}</b>`, E(m.reason + (m.by ? ' · ' + m.by : ''))])))}</div>`;
    } else {
      h += `<div class="card" style="margin-top:14px"><h3>Stock available</h3>${tbl(['Item', 'In stock'], I.items.map(i => [E(i.name), `<span class="${i.qty <= i.min ? 'low' : ''}">${i.qty} ${E(i.unit)}${i.qty <= i.min ? ' · LOW' : ''}</span>`]))}<p class="m">Record parts you use from a task ("Parts used") so stock stays correct.</p></div>`;
      h += `<div class="card" style="margin-top:14px"><h3>My work orders</h3>${I.orders.length ? woTable(I.orders, false) : '<p class="m">No work orders assigned to you.</p>'}</div>`;
    }
    return h;
  }

  /* ================= Detail view additions (admin and students) ================= */
  window.verifyFix = async (id, ok) => { const t = ($('#vft') || {}).value || ''; if (!ok && t.trim().length < 3) return toast('Tell us what is still wrong.'); if (await api('verify', { id, ok, text: t })) { closeM(); toast(ok ? 'Thank you. Marked as resolved.' : 'Reopened. The team has been told.') } };
  const d1 = window.detail;
  window.detail = id => {
    if (isM()) return taskModal(id);
    d1(id); const r = S.reports.find(x => x.id === id), m = document.querySelector('.mod'); if (!r || !m) return; css(); let h = '';
    if (r.incident) h += `<div class="rp-box sug">Part of incident <b>${E(r.incident)}</b>: grouped with similar complaints. This complaint keeps its own history.</div>`;
    if (r.reassignReq && isA()) h += `<div class="rp-box sug"><b>${E(r.reassignReq.by)}</b> asked to be reassigned: ${E(r.reassignReq.reason)}</div>`;
    if (r.before) h += `<div class="lab">Before the work</div><img src="/api/photo/${r.id}?before=1" alt="Photo before the work" style="max-width:100%;border-radius:14px">`;
    if (r.completion) h += `<div class="rp-box data"><span class="rp-tag">COMPLETION NOTE</span><div>${E(r.completion.note)}</div></div>`;
    if ((r.comments || []).length) h += `<div class="lab">Staff comments</div><div class="tl">${r.comments.map(c => `<div><b>${E(c.text)}</b><div class="m">${E(c.who)} · ${ago(c.t)}</div></div>`).join('')}</div>`;
    const asg = r.hist.filter(x => /^(Assigned|Reassigned)|assigned|Reassign/i.test(x[0]));
    if (asg.length) h += `<div class="lab">Assignment history</div><div class="tl">${asg.map(x => `<div><b>${E(x[0])}</b><div class="m">${ago(x[1])}${x[2] ? ' · ' + E(x[2]) : ''}</div></div>`).join('')}</div>`;
    if (isA() && (r.parts || []).length) h += `<div class="lab">Parts used</div>${r.parts.map(p => `<p class="m" style="margin:2px 0">• ${p.qty} ${E(p.unit)} ${E(p.name)} · ${E(cur())}${p.cost}</p>`).join('')}`;
    if (r.status === 'Awaiting verification' && (r.by === 'me' || isA())) h += `<div class="lab">Is it fixed?</div><div class="rp-box">The team says the work is done${r.completion ? ': “' + E(r.completion.note) + '”' : ''}. ${r.after ? 'See the photo above.' : ''}</div><textarea id="vft" rows="2" placeholder="Only needed if it is not fixed: what is still wrong?"></textarea><br><br><button class="btn bp" onclick="verifyFix('${r.id}',true)">Yes, it is fixed</button><br><br><button class="btn dl" style="width:100%" onclick="verifyFix('${r.id}',false)">Not fixed, reopen it</button>`;
    h && m.insertAdjacentHTML('beforeend', h);
  };

  /* ================= smart category hint while writing a report ================= */
  const f0 = window.rform;
  window.rform = () => {
    f0(); const ta = $('#ds'); if (!ta) return; ta.insertAdjacentHTML('afterend', '<div id="sug" class="m" style="margin:6px 0"></div>'); let tm;
    const run = async () => { const t = ta.value.trim(), box = $('#sug'); if (!box) return; if (t.length < 8) { box.innerHTML = ''; return } const j = await jg('/api/suggest?text=' + encodeURIComponent(t)); if (!j || !$('#sug')) return;
      box.innerHTML = j.cat ? `Looks like <b>${E(j.cat)}</b>${j.pri ? ' · likely ' + E(j.pri) + ' priority' : ''}${j.staff ? ' · goes to ' + E(j.staff) : ''}. ${j.cat === draft.cat ? '<span class="st-ok">✓ selected</span>' : `<button class="chip" onclick="keep();draft.cat='${j.cat}';rform()">Use ${E(j.cat)}</button>`}${j.note ? `<br><span class="st-warn">${E(j.note)}</span>` : ''}` : '' };
    ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 500) }); if (ta.value.trim().length >= 8) run();
  };

  /* ================= dashboard alerts for administrators ================= */
  const a0 = window.admin;
  window.admin = () => { const h = a0(); if (!isA()) return h; css(); const op = S.reports.filter(isOpen), req = op.filter(r => r.reassignReq).length, aw = op.filter(r => r.status === 'Awaiting verification').length, low = ((S.inv || {}).items || []).filter(i => i.qty <= i.min).length, cu = op.filter(r => r.pri === 'Critical' && r.as === 'Unassigned').length;
    const a = [cu && ['high', `${cu} Critical complaint${cu > 1 ? 's' : ''} not assigned`, 'reports'], req && ['medium', `${req} reassignment request${req > 1 ? 's' : ''} waiting`, 'staffws'], low && ['medium', `${low} item${low > 1 ? 's' : ''} low in stock`, 'inventory'], aw && ['info', `${aw} complaint${aw > 1 ? 's' : ''} awaiting verification by the reporter`, 'staffws']].filter(Boolean);
    return (a.length ? `<div style="margin-top:14px">${a.map(x => `<div class="rp-box lv-${x[0]}" style="cursor:pointer" onclick="go('${x[2]}')"><b>${E(x[1])}</b> <span class="m">→ open</span></div>`).join('')}</div>` : '') + h };

  /* ================= navigation and render hook ================= */
  Object.assign(MY, { analytics: analyticsV, intel: intelV, staffws: () => isA() ? teamV() : staffV(), inventory: inventoryV });
  const ROLE = { studio: 'admin', libreports: 'admin', integrations: 'admin', analytics: 'admin', intel: 'admin', staffws: 'admin,maintenance', inventory: 'admin,maintenance' };
  NAVS.admin = [['overview', 'home', 'Dashboard'], ['reports', 'plus', 'Complaints'], ['staffws', 'users', 'Staff Workspace'], ['workflows', 'clock', 'Workflow Automation'], ['studio', 'shield', 'AI Report Studio'], ['analytics', 'clock', 'Analytics'], ['intel', 'shield', 'Intelligence'], ['inventory', 'plus', 'Inventory'], ['libreports', 'check', 'Reports'], ['integrations', 'scan', 'Integrations'], null, ['ai', 'shield', 'AI assistant'], ['sos', 'shield', 'SOS queue'], ['qr', 'scan', 'QR codes'], ['rank', 'check', 'Leaderboard'], ['users', 'users', 'Users & data'], ['audit', 'check', 'Audit log'], ['notes', 'bell', 'Notifications']];
  NAVS.maintenance = [['staffws', 'home', 'Staff Workspace'], ['inventory', 'plus', 'Parts & work orders'], ['notes', 'bell', 'Notifications']];
  const r0 = window.render;
  window.render = () => {
    if (U && S.role === 'maintenance' && (view === 'overview' || view === 'reports')) view = 'staffws';
    if (U && MY[view] && !ROLE[view]?.split(',').includes(S.role)) view = 'overview';
    r0(); if (!U || !MY[view]) return;
    const t = document.querySelector('#main .top'); if (t) $('#main').innerHTML = t.outerHTML + MY[view]();
  };
  const g0 = window.go; window.go = v => { if (v !== view) { AN.d = null; IT.d = null } g0(v) };
})();
