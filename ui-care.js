/* CARE frontend: tidier data pages and delete buttons.
   Replaces the long unsorted lists with: summary strips, quick filters, sorting, "show more" paging, grouping by day,
   and delete buttons (single and bulk, always with a confirmation). What a person may delete is decided by the server;
   the buttons only hide what is not allowed. The audit log is deliberately not deletable.
   Loaded last (after ui-hub.js and ui-chat.js). */
(function () {
  const E = esc, $$ = s => [...document.querySelectorAll(s)];
  const TD = window.TD = { n: 25, sel: {}, quick: '', mod: false, sort: 'upd', bld: 'All', sosTab: 'active', an: 50, aq: '', aw: '', uq: '', nn: 30, mn: 10 };
  const css = () => {
    if (document.getElementById('carecss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="carecss">
.td-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px;margin:14px 0}
.td-k button{text-align:left;border:1px solid var(--line);border-radius:14px;padding:10px 14px;background:var(--card);color:var(--ink);cursor:pointer;font:inherit}
.td-k button b{font-size:22px;display:block}.td-k button small{color:var(--mut)}.td-k button:hover{border-color:var(--pri)}.td-k button.on{border-color:var(--pri);box-shadow:0 0 0 2px var(--pri) inset}
.td-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.td-bar .wfbtn{margin:0}.td-sel{position:sticky;top:0;z-index:5;background:var(--card);border:1px solid var(--pri);border-radius:12px;padding:8px 12px;margin:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.td-more{text-align:center;margin:14px 0}.td-tabs{display:flex;gap:6px;margin:12px 0}.td-tabs button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:7px 16px;cursor:pointer;font:inherit}.td-tabs button.on{background:var(--pri);border-color:var(--pri);color:#fff}
.td-nt{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}.td-nt.new{border-left:4px solid var(--pri)}.td-nt button{border:0;background:transparent;color:var(--mut);cursor:pointer;font-size:16px;border-radius:8px;padding:2px 8px}.td-nt button:hover{background:var(--in);color:#c0392b}
.td-tbl td,.td-tbl th{white-space:normal}.td-dz{margin-top:18px;border-top:1px solid var(--line);padding-top:6px}
</style>`);
  };
  const ago2 = t => (typeof ago === 'function' ? ago(t) : new Date(t).toLocaleString());
  const fdate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const more = (shown, total, key, step) => total > shown ? `<div class="td-more"><button class="wfbtn" onclick="TD.${key}+=${step};render()">Show ${Math.min(step, total - shown)} more <span class="m">(${total - shown} not shown)</span></button></div>` : '';
  const tdSet = window.tdSet = (k, v) => { TD[k] = v; TD.n = 25; render() };
  const hidden = r => ['duplicate', 'fake'].includes(r.mod) || r.status === 'Withdrawn';
  const mayDel = r => isA() || (r.by === 'me' && ['Submitted', 'Under review', 'Assigned', 'Withdrawn'].includes(r.status) && !(r.comments || []).length && !r.progress);
  const kpi = (items, on, key) => `<div class="td-k">${items.map(([k, l, n, bad]) => `<button type="button" class="${on === k ? 'on' : ''}" onclick="tdSet('${key}','${on === k ? '' : k}')"><b class="${bad && n ? 'st-bad' : ''}">${n}</b><small>${E(l)}</small></button>`).join('')}</div>`;

  /* ================= deleting complaints ================= */
  window.delComplaints = async ids => {
    const rs = ids.map(i => S.reports.find(r => r.id === i)).filter(Boolean); if (!rs.length) return;
    const names = rs.slice(0, 3).map(r => `• ${r.id}  ${String(r.title).slice(0, 50)}`).join('\n') + (rs.length > 3 ? `\n• … and ${rs.length - 3} more` : '');
    if (!confirm(`Delete ${rs.length === 1 ? 'this complaint' : rs.length + ' complaints'}?\n\n${names}\n\nTheir history, notes and photos are removed too. Reports already saved in the Reports library keep their numbers.\nThis cannot be undone.`)) return;
    const j = await api('deleteComplaints', { ids }); if (j) { ids.forEach(i => delete TD.sel[i]); toast(j.deleted + (j.deleted === 1 ? ' complaint' : ' complaints') + ' deleted.') }
  };
  window.delItem = async (id, kind, i) => {
    const what = { inotes: 'this internal note', comments: 'this staff comment', photo: 'the reporter\u2019s photo', before: 'the before photo', after: 'the fix photo' }[kind];
    if (!confirm(`Delete ${what}?\nThis cannot be undone.`)) return; const j = await api('deleteComplaintItem', { id, kind, i }); if (j) { closeM(); toast('Deleted.') }
  };
  window.tdPick = (id, on) => { if (on) TD.sel[id] = 1; else delete TD.sel[id]; render() };
  window.tdAll = (ids, on) => { ids.forEach(i => { if (on) TD.sel[i] = 1; else delete TD.sel[i] }); render() };

  /* ================= complaints ================= */
  function decorate(html, ids) {   /* adds a tick box and a delete button to every row of the existing table */
    html = html.replace('<thead><tr><th>ISSUE</th>', `<thead><tr><th style="width:34px"><input type="checkbox" style="width:auto" aria-label="Select all shown" ${ids.length && ids.every(i => TD.sel[i]) ? 'checked' : ''} onchange="tdAll(${E(JSON.stringify(ids)).replace(/&quot;/g, "'")},this.checked)"></th><th>ISSUE</th>`).replace('<th>ASSIGNED TO</th></tr>', '<th>ASSIGNED TO</th><th></th></tr>');
    return html.replace(/<tr>(<td><b onclick="detail\('(CARE-\d+)'\)"[\s\S]*?)<\/td><\/tr>/g, (m, inner, id) => `<tr><td><input type="checkbox" style="width:auto" ${TD.sel[id] ? 'checked' : ''} onchange="tdPick('${id}',this.checked)" aria-label="Select ${id}"></td>${inner}</td><td><button class="wfbtn d" style="margin:0" onclick="delComplaints(['${id}'])" aria-label="Delete ${id}" title="Delete this complaint">🗑</button></td></tr>`);
  }
  function reportsV() {
    if (isM() || isR()) return null; css(); window.__addCss && window.__addCss();
    const all = S.reports.slice();
    if (!isA()) {   /* student / staff: my reports */
      const mine = all.filter(r => r.by === 'me').sort((a, b) => b.upd - a.upd);
      return head('Your activity', 'My reports') + (mine.length ? `<p class="m">${mine.length} report${mine.length === 1 ? '' : 's'} · ${mine.filter(r => r.status !== 'Resolved').length} not resolved yet</p>` + mine.slice(0, TD.mn).map(r => rc(r) + (mayDel(r) ? `<div style="margin:-4px 0 16px;text-align:right"><button class="wfbtn d" onclick="delComplaints(['${r.id}'])">Delete this report</button></div>` : '')).join('') + more(TD.mn, mine.length, 'mn', 10) : '<div class="card">No reports yet.</div>');
    }
    const live = all.filter(r => !hidden(r)), openL = live.filter(r => open1(r));
    const Q = { open: r => open1(r) && !hidden(r), overdue: r => r.overdue && !hidden(r), unassigned: r => open1(r) && !hidden(r) && r.as === 'Unassigned', verify: r => r.status === 'Awaiting verification', resolved: r => r.status === 'Resolved' && !hidden(r), mod: hidden };
    const q = ft.q.toLowerCase(), pi = x => PRI.indexOf(x.pri);
    let rs = all.filter(r => (TD.mod || TD.quick === 'mod' || !hidden(r)) && (!TD.quick || Q[TD.quick](r)) && (ft.st === 'All' || r.status === ft.st) && (ft.pr === 'All' || r.pri === ft.pr) && (ft.cat === 'All' || r.cat === ft.cat) && (TD.bld === 'All' || r.bld === TD.bld) && (!q || [r.id, r.title, r.desc, r.bld, r.room, r.cat, r.reporter].join(' ').toLowerCase().includes(q)));
    const S0 = { upd: (a, b) => b.upd - a.upd, new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created, pri: (a, b) => pi(a) - pi(b) || a.due - b.due, due: (a, b) => (open1(b) - open1(a)) || a.due - b.due };
    rs.sort(S0[TD.sort] || S0.upd);
    const page = rs.slice(0, TD.n), ids = page.map(r => r.id), sel = Object.keys(TD.sel).filter(i => all.some(r => r.id === i));
    const sl = (k, o, lab) => `<select aria-label="${lab}" onchange="tdSet('${k}',this.value)">${o.map(([v, l]) => `<option value="${E(v)}" ${v === TD[k] ? 'selected' : ''}>${E(l)}</option>`).join('')}</select>`;
    const f = (k, o, lab, all) => `<select aria-label="${lab}" onchange="ft.${k}=this.value;TD.n=25;render()"><option value="All" ${ft[k] === 'All' ? 'selected' : ''}>${all}</option>${o.map(x => `<option ${x === ft[k] ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    return head('Administration', 'All complaints')
      + kpi([['open', 'Open', openL.filter(r => r.status !== 'Withdrawn').length], ['overdue', 'Overdue', all.filter(Q.overdue).length, 1], ['unassigned', 'Unassigned', all.filter(Q.unassigned).length, 1], ['verify', 'Awaiting verification', all.filter(Q.verify).length], ['resolved', 'Resolved', all.filter(Q.resolved).length], ['mod', 'Hidden: duplicate, fake, withdrawn', all.filter(hidden).length]], TD.quick, 'quick')
      + `<div class="fl"><input type="text" placeholder="Search ID, keyword, location, reporter…" aria-label="Search" value="${E(ft.q)}" onchange="ft.q=this.value;TD.n=25;render()">${f('st', ST, 'Status', 'All statuses')}${f('pr', PRI, 'Priority', 'All priorities')}${f('cat', CATS, 'Category', 'All categories')}${sl('bld', [['All', 'All buildings'], ...Object.keys(BLD).map(b => [b, b])], 'Building')}${sl('sort', [['upd', 'Recently updated'], ['new', 'Newest first'], ['old', 'Oldest first'], ['pri', 'Highest priority'], ['due', 'Deadline soonest']], 'Sort by')}</div>`
      + `<div class="td-bar"><span class="m">${rs.length === all.length ? `${rs.length} complaints` : `${rs.length} of ${all.length} complaints`}${TD.quick || ft.st !== 'All' || ft.pr !== 'All' || ft.cat !== 'All' || TD.bld !== 'All' || q ? '' : ' · duplicates, fake and withdrawn are hidden'}</span><label class="m" style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${TD.mod ? 'checked' : ''} onchange="tdSet('mod',this.checked)"> Show duplicates, fake and withdrawn</label><button class="wfbtn" onclick="csv()">⬇ Export CSV</button>${TD.quick || ft.st !== 'All' || ft.pr !== 'All' || ft.cat !== 'All' || TD.bld !== 'All' || q ? '<button class="wfbtn" onclick="ft.q=\'\';ft.st=ft.pr=ft.cat=\'All\';TD.bld=\'All\';TD.quick=\'\';TD.n=25;render()">Clear filters</button>' : ''}</div>`
      + (sel.length ? `<div class="td-sel"><b>${sel.length} selected</b><button class="wfbtn d" style="margin:0" onclick="delComplaints(Object.keys(TD.sel))">Delete selected</button><button class="wfbtn" style="margin:0" onclick="TD.sel={};render()">Clear selection</button></div>` : '')
      + `<div class="card td-tbl" style="padding:0;overflow:hidden"><div style="overflow-x:auto">${rs.length ? decorate(tbl2(page), ids) : '<p class="m" style="padding:20px">No complaints match. <a href="#" onclick="ft.q=\'\';ft.st=ft.pr=ft.cat=\'All\';TD.bld=\'All\';TD.quick=\'\';render();return false" style="color:var(--teal)">Clear the filters</a></p>'}</div></div>` + more(TD.n, rs.length, 'n', 25);
  }

  /* ================= notifications ================= */
  const dayOf = t => { const a = new Date(t), n = new Date(), k = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5); return k <= 0 ? 'Today' : k === 1 ? 'Yesterday' : k < 7 ? 'Earlier this week' : 'Older' };
  window.ntDel = async i => { const n = S.notes[i]; if (n) await api('deleteNotes', { ts: n.ts, t: n.t }) };
  window.ntClr = async mode => { if (!confirm(mode === 'all' ? 'Delete all notifications?' : 'Delete the notifications you have already read?')) return; if (await api('deleteNotes', mode === 'all' ? { all: 1 } : { readOnly: 1 })) toast('Notifications deleted.') };
  function notesV() {
    css(); const unread = S.notes.filter(n => !n.read).length;
    setTimeout(() => { if (S.notes.some(n => !n.read)) { S.notes.forEach(n => n.read = 1); api('read', {}) } }, 400);
    const list = S.notes.map((n, i) => ({ n, i })).slice(0, TD.nn), groups = {}; list.forEach(x => (groups[dayOf(x.n.ts)] = groups[dayOf(x.n.ts)] || []).push(x));
    return head('Updates', 'Notifications') + (S.notes.length ? `<div class="td-bar"><span class="m">${S.notes.length} notification${S.notes.length === 1 ? '' : 's'}${unread ? ` · ${unread} new` : ''}</span><button class="wfbtn" onclick="ntClr('read')">Delete read</button><button class="wfbtn d" onclick="ntClr('all')">Delete all</button></div>`
      + ['Today', 'Yesterday', 'Earlier this week', 'Older'].filter(g => groups[g]).map(g => `<div class="lab" style="margin:14px 0 6px">${g}</div>${groups[g].map(({ n, i }) => `<div class="card td-nt ${n.read ? '' : 'new'}" style="padding:12px 16px"><div><b>${E(n.t)}</b>${n.read ? '' : ' <span class="pill Inprogress">New</span>'}<div class="m">${ago2(n.ts)}</div></div><button type="button" onclick="ntDel(${i})" aria-label="Delete this notification" title="Delete">✕</button></div>`).join('')}`).join('') + more(TD.nn, S.notes.length, 'nn', 30)
      : '<div class="card">You’re all caught up.</div>');
  }

  /* ================= SOS: active vs history ================= */
  window.sosDel = async id => { if (confirm(`Delete the finished SOS record ${id}?\nThis cannot be undone.`) && await api('deleteSos', { id })) toast('Deleted.') };
  window.sosClr = async days => { if (!confirm(days ? `Delete finished SOS records older than ${days} days?` : 'Delete ALL finished SOS records?\nThis cannot be undone.')) return; const j = await api('deleteSos', { resolved: 1, olderDays: days }); if (j) toast(j.deleted + ' deleted.') };
  function sosV() {
    if (!(isA() || isR())) return null; css();
    const act = S.sos.filter(s => s.status !== 'Resolved'), his = S.sos.filter(s => s.status === 'Resolved').sort((a, b) => b.t - a.t);
    const tabs = `<div class="td-tabs"><button class="${TD.sosTab === 'active' ? 'on' : ''}" onclick="tdSet('sosTab','active')">Active (${act.length})</button><button class="${TD.sosTab === 'history' ? 'on' : ''}" onclick="tdSet('sosTab','history')">History (${his.length})</button></div>`;
    if (TD.sosTab === 'active') { const keep = S.sos; S.sos = act; let h; try { h = sosq() } finally { S.sos = keep } return h.replace('</h2></div>', '</h2></div>' + tabs).replace('No SOS requests.', 'No active SOS requests.') }
    const rowsH = his.slice(0, TD.n).map(s => { const ack = s.tl.find(t => t[0] === 'Acknowledged'), last = s.tl[s.tl.length - 1] || []; return `<tr><td>${fdate(s.t)}<small>${new Date(s.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></td><td><b>${E(s.type)}</b><small>${E(s.id)}</small></td><td>${E(s.who)}<small>${E(s.loc)}</small></td><td>${E(last[0] || 'Resolved')}${last[2] ? `<small>by ${E(last[2])}</small>` : ''}</td><td>${ack ? Math.max(1, Math.round((ack[1] - s.t) / 6e4)) + ' min' : '<span class="m">n/a</span>'}</td>${isA() ? `<td><button class="wfbtn d" style="margin:0" onclick="sosDel('${E(s.id)}')" aria-label="Delete ${E(s.id)}">🗑</button></td>` : ''}</tr>` }).join('');
    return head('Emergency response', 'SOS queue') + tabs + (his.length ? `${isA() ? `<div class="td-bar"><button class="wfbtn d" onclick="sosClr(30)">Delete older than 30 days</button><button class="wfbtn d" onclick="sosClr(0)">Delete all finished</button></div>` : ''}<div class="card td-tbl" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead><tr><th>WHEN</th><th>TYPE</th><th>WHO / WHERE</th><th>OUTCOME</th><th>FIRST RESPONSE</th>${isA() ? '<th></th>' : ''}</tr></thead><tbody>${rowsH}</tbody></table></div></div>` + more(TD.n, his.length, 'n', 25) : '<div class="card">No finished SOS requests yet.</div>');
  }

  /* ================= audit log (searchable, never deletable) ================= */
  function auditV() {
    if (!isA()) return null; css(); const q = TD.aq.toLowerCase(), who = [...new Set(S.audit.map(a => a.who))].sort();
    const rows = S.audit.filter(a => (!TD.aw || a.who === TD.aw) && (!q || (a.a + ' ' + a.who).toLowerCase().includes(q)));
    return head('Accountability', 'Audit log') + `<p class="m">The record of who did what, newest first (the latest ${S.audit.length >= 500 ? '500' : S.audit.length} actions). It cannot be deleted, so it stays trustworthy.</p>
      <div class="fl"><input type="text" placeholder="Search actions…" aria-label="Search the audit log" value="${E(TD.aq)}" onchange="TD.aq=this.value;TD.an=50;render()"><select aria-label="Who" onchange="TD.aw=this.value;TD.an=50;render()"><option value="">Everyone</option>${who.map(w => `<option ${w === TD.aw ? 'selected' : ''}>${E(w)}</option>`).join('')}</select><button class="wfbtn" onclick="auditCsv()">⬇ Export CSV</button></div>
      <div class="m" style="margin:6px 0">${rows.length} of ${S.audit.length} entries</div>
      <div class="card td-tbl" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead><tr><th>WHEN</th><th>WHO</th><th>ACTION</th></tr></thead><tbody>${rows.slice(0, TD.an).map(a => `<tr><td title="${E(new Date(a.t).toLocaleString())}">${ago2(a.t)}<small>${fdate(a.t)}</small></td><td>${E(a.who)}</td><td>${E(a.a)}</td></tr>`).join('') || '<tr><td colspan="3" class="m">Nothing matches.</td></tr>'}</tbody></table></div></div>` + more(TD.an, rows.length, 'an', 50);
  }
  window.auditCsv = () => { const q = c => '"' + String(c).replace(/"/g, '""') + '"', t = 'when,who,action\n' + S.audit.map(a => [new Date(a.t).toISOString(), a.who, a.a].map(q).join(',')).join('\n'), u = URL.createObjectURL(new Blob([t], { type: 'text/csv' })), l = document.createElement('a'); l.href = u; l.download = 'care-audit-log.csv'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000) };

  /* ================= users ================= */
  window.usrDel = id => {
    const x = (S.users || []).find(u => u.id === id); if (!x) return;
    modal(`<div style="display:flex;justify-content:space-between;gap:10px"><h2 style="margin:0">Delete ${E(x.name)}?</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
      <p>${E(x.email)} · ${E(RL[x.role] || x.role)}. This account can no longer log in, and its notifications are removed.</p>
      ${x.role === 'maintenance' ? '<p class="m">Open complaints assigned to this person become unassigned.</p>' : ''}
      ${x.reports ? `<label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0"><input type="checkbox" id="ud_r" style="width:auto;margin-top:3px"><span>Also delete the ${x.reports} complaint${x.reports === 1 ? '' : 's'} this person reported <span class="m">(otherwise they stay, marked “account deleted”)</span></span></label>` : ''}
      <p class="m">This cannot be undone.</p><div class="rp-bar"><button class="btn mt" style="width:auto;background:#c0392b;color:#fff" onclick="usrDelGo('${E(x.id)}')">Delete account</button><button class="btn mt" style="width:auto" onclick="closeM()">Cancel</button></div>`);
  };
  window.usrDelGo = async id => { const w = !!(document.getElementById('ud_r') || {}).checked; closeM(); const j = await api('deleteUser', { id, withReports: w }); if (j) toast('Account deleted' + (j.reports ? `, ${j.reports} complaint${j.reports === 1 ? '' : 's'} deleted` : '') + (j.unassigned ? `, ${j.unassigned} complaint${j.unassigned === 1 ? '' : 's'} now unassigned` : '') + '.') };
  function usersV() {
    if (!isA()) return null; css(); const ROLES = ['student', 'staff', 'maintenance', 'responder', 'admin'], q = TD.uq.toLowerCase(), U2 = S.users || [];
    const rows = U2.filter(x => !q || (x.name + ' ' + x.email + ' ' + x.role).toLowerCase().includes(q)).sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || a.name.localeCompare(b.name));
    return head('Administration', 'Users & data') + `<div class="card"><h3>Create an account</h3><p class="m">Use this to add maintenance staff, responders or other admins.</p><div class="g2"><input type="text" id="nn" placeholder="Full name" aria-label="Full name"><input type="email" id="ne" placeholder="Email" aria-label="Email"></div><div class="g2"><input type="password" id="np" placeholder="Temporary password (8+ characters)" aria-label="Password"><select id="nr" aria-label="Role">${['maintenance', 'responder', 'admin', 'staff', 'student'].map(r => `<option value="${r}">${RL[r]}</option>`).join('')}</select></div><button class="btn bp" onclick="mkUserA()">Create account</button></div>
      <div class="td-k" style="margin-top:16px">${ROLES.map(r => `<button type="button" class="${TD.uq === r ? 'on' : ''}" onclick="TD.uq='${TD.uq === r ? '' : r}';render()"><b>${U2.filter(x => x.role === r).length}</b><small>${E(RL[r] || r)}</small></button>`).join('')}</div>
      <div class="fl"><input type="text" placeholder="Search name, email or role…" aria-label="Search accounts" value="${E(TD.uq)}" onchange="TD.uq=this.value;render()"><a class="wfbtn" style="text-decoration:none" href="/api/export">⬇ Full export (JSON)</a></div>
      <div class="card td-tbl" style="padding:0;overflow:hidden"><div style="padding:16px 22px"><h3 style="margin:0">Accounts (${rows.length}${rows.length === U2.length ? '' : ' of ' + U2.length})</h3><div class="m">Live database: ${U2.length} users · ${S.reports.length} complaints · ${S.sos.length} SOS requests</div></div><div style="overflow-x:auto"><table><thead><tr><th>NAME</th><th>ROLE</th><th>SCORE</th><th>REPORTS</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td><b>${E(x.name)}</b>${x.id === U.id ? ' <span class="pill">you</span>' : ''}<small>${E(x.email)}</small></td><td><select class="as" aria-label="Role for ${E(x.name)}" ${x.id === U.id ? 'disabled' : ''} onchange="setRoleA('${E(x.id)}',this.value)">${ROLES.map(r => `<option value="${r}" ${r === x.role ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select></td><td>${x.score}</td><td>${x.reports}</td><td>${x.id === U.id ? '' : `<button class="wfbtn d" style="margin:0" onclick="usrDel('${E(x.id)}')" aria-label="Delete ${E(x.name)}">🗑 Delete</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="m">No accounts match.</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h3>API</h3><p class="m">Frontend and backend talk over a JSON API, open at <a href="/api" style="color:var(--teal)">/api</a>. Any other app can use it with the same login cookie.</p></div>`;
  }

  /* ================= complaint window: tidier + delete buttons ================= */
  const d1 = window.detail;
  window.detail = id => {
    d1(id); const r = S.reports.find(x => x.id === id), m = document.querySelector('.mod'); if (!m || !r) return; css();
    const lab = [...m.querySelectorAll('.lab')].find(l => l.textContent.trim() === 'History'), tl = lab && lab.nextElementSibling;
    if (lab && tl && tl.classList.contains('tl')) { const n = tl.children.length, det = document.createElement('details'), sm = document.createElement('summary'); det.open = n <= 4; sm.className = 'lab'; sm.style.cursor = 'pointer'; sm.textContent = `History (${n} step${n === 1 ? '' : 's'})`; lab.replaceWith(det); det.append(sm, tl) }
    if (isA()) {
      [...m.querySelectorAll('p.m')].filter(p => p.textContent.trim().startsWith('📝')).forEach((p, i) => p.insertAdjacentHTML('beforeend', ` <button class="wfbtn d" style="margin:0 0 0 6px;padding:2px 8px" onclick="delItem('${id}','inotes',${i})">Delete</button>`));
      m.querySelectorAll('img').forEach(img => { const u = img.getAttribute('src') || '', k = u.includes('after=1') ? 'after' : u.includes('before=1') ? 'before' : u.startsWith('/api/photo/') ? 'photo' : ''; if (k) img.insertAdjacentHTML('afterend', `<div><button class="wfbtn d" onclick="delItem('${id}','${k}')">Remove this photo</button></div>`) });
    }
    if (mayDel(r)) m.insertAdjacentHTML('beforeend', `<div class="td-dz"><div class="lab">Delete</div><p class="m">${isA() ? 'Removes this complaint with its history, notes and photos.' : 'You can delete your own report until work on it starts.'}</p><button class="btn dl" style="width:100%" onclick="closeM();delComplaints(['${r.id}'])">Delete this complaint</button></div>`);
  };

  /* ================= hook into the page ================= */
  const OV = { reports: reportsV, notes: notesV, sos: sosV, audit: auditV, users: usersV };
  const r0 = window.render;
  window.render = () => {
    r0(); if (typeof U === 'undefined' || !U || !OV[view]) return;
    const t = document.querySelector('#main .top'); if (!t) return;
    let h = null; try { h = OV[view]() } catch (e) { console.error('CARE page error', e) }
    if (h != null) $('#main').innerHTML = t.outerHTML + h;
  };
})();
