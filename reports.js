'use strict';
/* CARE: AI Report Studio backend.
   - builds reports from the REAL complaint database (nothing is invented)
   - understands plain-English requests ("unresolved plumbing complaints this month")
   - exports PDF (no libraries needed) and CSV
   - keeps a library of generated reports (files in DATA_DIR/reports)
   - optional: ANTHROPIC_API_KEY adds an AI-written summary, clearly labelled as AI-generated */
module.exports = function (C) {
  const { db, now, bad, clean, open1, CATS, BLD, PRI, ST, TEAM, STAFF_DEPT, DEPT_STAFF, DAYMS, CATK, staffOf, teamOf, fs, path, DD, audit, find } = C;
  db.studio = db.studio || { reports: [], seq: 0 };
  const LIB = path.join(DD, 'reports');
  fs.mkdirSync(LIB, { recursive: true });

  /* ---------- small helpers ---------- */
  const valid = () => db.reports.filter(r => !['fake', 'duplicate'].includes(r.mod));
  const r1 = x => Math.round(x * 10) / 10;
  const hrs = ms => r1(ms / 36e5);
  const avg = a => a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null;
  const fmtD = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() };
  const deptOf = r => { const s = staffOf(r.as); return s ? teamOf(s) : (STAFF_DEPT[r.as] || '') };
  const grp = (list, f) => { const m = new Map(); list.forEach(x => { const k = f(x); m.has(k) ? m.get(k).push(x) : m.set(k, [x]) }); return [...m.entries()].sort((a, b) => b[1].length - a[1].length) };
  const PORD = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  /* ---------- periods ---------- */
  const RANGES = { all: 'All time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', this_month: 'This month', last_month: 'Last month', this_year: 'This year' };
  function resolveRange(s, t = now()) {
    const d = new Date(t);
    let from = 0, to = t, tok = s.range || 'all';
    if (s.from || s.to) {
      from = s.from ? Date.parse(s.from + 'T00:00:00') : 0; to = s.to ? Date.parse(s.to + 'T23:59:59') : t;
      if (isNaN(from) || isNaN(to)) bad('Enter valid dates.');
      if (from > to) bad('The start date is after the end date.');
      tok = 'custom';
    } else if (tok === 'today') from = dayStart(t);
    else if (tok === '7d') from = t - 7 * DAYMS;
    else if (tok === '30d') from = t - 30 * DAYMS;
    else if (tok === '90d') from = t - 90 * DAYMS;
    else if (tok === 'this_month') from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    else if (tok === 'last_month') { from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); to = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1 }
    else if (tok === 'this_year') from = new Date(d.getFullYear(), 0, 1).getTime();
    else if (tok !== 'all') bad('Unknown period.');
    return { from, to, token: tok, label: tok === 'all' ? 'All time' : fmtD(from) + ' to ' + fmtD(to) };
  }

  /* ---------- filters ---------- */
  const STATUS_FILTERS = ['open', 'resolved', 'overdue', ...ST];
  function cleanSpec(d) {
    d = d && typeof d === 'object' ? d : {};
    const o = { type: String(d.type || 'summary'), range: String(d.range || 'all'), from: clean(d.from, 10), to: clean(d.to, 10), cat: clean(d.cat, 30), bld: clean(d.bld, 40), dept: clean(d.dept, 30), pri: clean(d.pri, 12), status: clean(d.status, 30), as: clean(d.as, 40), title: clean(d.title, 120) };
    if (!TYPES[o.type]) bad('Choose a report type.');
    if (o.cat && !CATS.includes(o.cat)) bad('Unknown category.');
    if (o.bld && !BLD[o.bld]) bad('Unknown building.');
    if (o.dept && !CATS.includes(o.dept)) bad('Unknown department.');
    if (o.pri && !PRI.includes(o.pri)) bad('Unknown priority.');
    if (o.status && !STATUS_FILTERS.includes(o.status)) bad('Unknown status.');
    if (o.as && !TEAM.includes(o.as)) bad('Unknown staff member.');
    if (o.from || o.to) { delete o.range; resolveRange(o) } else resolveRange(o);
    return o;
  }
  const statusOK = (r, s, t) => !s || (s === 'open' ? open1(r) : s === 'resolved' ? r.status === 'Resolved' : s === 'overdue' ? open1(r) && r.due < t : r.status === s);
  function filterList(sp, rng) {
    const t = now();
    return valid().filter(r => r.created >= rng.from && r.created <= rng.to && (!sp.cat || r.cat === sp.cat) && (!sp.bld || r.bld === sp.bld) && (!sp.pri || r.pri === sp.pri) &&
      (!sp.as || r.as === sp.as) && (!sp.dept || deptOf(r) === sp.dept) && statusOK(r, sp.status, t)).sort((a, b) => b.created - a.created);
  }

  /* ---------- numbers ---------- */
  function metrics(list) {
    const t = now(), op = list.filter(open1), res = list.filter(r => r.status === 'Resolved' && r.resolved);
    return {
      total: list.length, open: op.length, resolved: list.filter(r => r.status === 'Resolved').length, overdue: op.filter(r => r.due < t).length,
      critical: list.filter(r => r.pri === 'Critical').length, unassigned: op.filter(r => r.as === 'Unassigned').length,
      avgRes: avg(res.map(r => hrs(r.resolved - r.created))), sla: res.length ? Math.round(100 * res.filter(r => r.resolved <= r.due).length / res.length) : null,
      reopened: list.filter(r => (r.hist || []).some(h => /reopened/i.test(h[0]))).length
    };
  }
  const CCOLS = ['ID', 'Issue', 'Category', 'Location', 'Priority', 'Status', 'Assigned to', 'Reported', 'Deadline', 'Hours to resolve'];
  const crow = r => [r.id, r.title, r.cat, r.bld + ' - ' + r.room, r.pri, r.status, r.as, fmtD(r.created), fmtD(r.due), r.resolved ? hrs(r.resolved - r.created) : ''];
  const catRows = list => CATS.map(c => { const l = list.filter(r => r.cat === c), m = metrics(l); return [c, m.total, m.open, m.resolved, m.overdue, m.avgRes ?? ''] }).filter(r => r[1]);
  const bldRows = list => Object.keys(BLD).map(b => { const l = list.filter(r => r.bld === b), m = metrics(l); return [b, m.total, m.open, m.resolved, m.overdue] }).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
  const sec = (heading, cols, rows, chart, note) => ({ heading, table: { cols, rows }, chart: chart || null, note: note || '' });
  const openList = list => list.filter(open1).sort((a, b) => PORD[a.pri] - PORD[b.pri] || a.due - b.due);

  /* ---------- report types ---------- */
  const TYPES = {
    summary: {
      label: 'Complaint summary', desc: 'Totals, categories, buildings, priorities, trend and open complaints',
      build(rep, list) {
        rep.sections.push(sec('Complaints by category', ['Category', 'Total', 'Open', 'Resolved', 'Overdue', 'Avg hours to resolve'], catRows(list), { kind: 'bar', label: 0, value: 1, unit: 'complaints' }));
        rep.sections.push(sec('Complaints by building', ['Building', 'Total', 'Open', 'Resolved', 'Overdue'], bldRows(list), { kind: 'bar', label: 0, value: 1, unit: 'complaints' }));
        rep.sections.push(sec('Complaints by priority', ['Priority', 'Total', 'Open'], PRI.map(p => [p, list.filter(r => r.pri === p).length, list.filter(r => r.pri === p && open1(r)).length]).filter(r => r[1])));
        const tr = trend(list); if (tr.length > 1) rep.sections.push(sec('Trend', ['Period', 'New complaints', 'Resolved'], tr, { kind: 'line', label: 0, value: 1, unit: 'complaints' }));
        const op = openList(list).slice(0, 30);
        rep.sections.push(sec('Unresolved complaints' + (list.filter(open1).length > 30 ? ' (30 most urgent)' : ''), ['ID', 'Issue', 'Location', 'Priority', 'Status', 'Assigned to', 'Deadline', 'Overdue'], op.map(r => [r.id, r.title, r.bld + ' - ' + r.room, r.pri, r.status, r.as, fmtD(r.due), r.due < now() ? 'Yes' : '']), null));
      }
    },
    unresolved: {
      label: 'Unresolved complaints', desc: 'Every complaint that is still open, most urgent first',
      build(rep, list) {
        const op = openList(list);
        rep.sections.push(sec('Unresolved complaints', ['ID', 'Issue', 'Category', 'Location', 'Priority', 'Status', 'Assigned to', 'Age (days)', 'Deadline', 'Overdue'], op.slice(0, 300).map(r => [r.id, r.title, r.cat, r.bld + ' - ' + r.room, r.pri, r.status, r.as, r1((now() - r.created) / DAYMS), fmtD(r.due), r.due < now() ? 'Yes' : '']), null, op.length > 300 ? 'Showing the first 300 of ' + op.length + '.' : ''));
        rep.sections.push(sec('By category', ['Category', 'Open'], CATS.map(c => [c, op.filter(r => r.cat === c).length]).filter(r => r[1]), { kind: 'bar', label: 0, value: 1, unit: 'open' }));
      }
    },
    resolution: {
      label: 'Resolution time by department', desc: 'Compare average resolution times and SLA performance across departments',
      build(rep, list) {
        const rows = CATS.map(c => {
          const l = list.filter(r => r.cat === c), res = l.filter(r => r.status === 'Resolved' && r.resolved), tt = res.map(r => hrs(r.resolved - r.created));
          return [c, DEPT_STAFF[c] || '', l.length, res.length, avg(tt) ?? '', tt.length ? Math.min(...tt) : '', tt.length ? Math.max(...tt) : '', res.length ? Math.round(100 * res.filter(r => r.resolved <= r.due).length / res.length) : '']
        }).filter(r => r[2]);
        rep.sections.push(sec('Average hours to resolve, by department', ['Department', 'Responsible team', 'Complaints', 'Resolved', 'Avg hours', 'Fastest (h)', 'Slowest (h)', 'Resolved within deadline %'], rows, { kind: 'bar', label: 0, value: 4, unit: 'hours' }));
        const byPri = PRI.map(p => { const res = list.filter(r => r.pri === p && r.status === 'Resolved' && r.resolved); return [p, res.length, avg(res.map(r => hrs(r.resolved - r.created))) ?? ''] }).filter(r => r[1]);
        if (byPri.length) rep.sections.push(sec('Average hours to resolve, by priority', ['Priority', 'Resolved', 'Avg hours'], byPri, { kind: 'bar', label: 0, value: 2, unit: 'hours' }));
      }
    },
    critical: {
      label: 'Critical incidents', desc: 'Critical-priority complaints and how they were handled',
      build(rep, list) {
        const cr = list.filter(r => r.pri === 'Critical');
        rep.sections.push(sec('Critical incidents', ['ID', 'Issue', 'Location', 'Status', 'Assigned to', 'Reported', 'Hours to resolve', 'Escalations'], cr.slice(0, 300).map(r => [r.id, r.title, r.bld + ' - ' + r.room, r.status, r.as, fmtD(r.created), r.resolved ? hrs(r.resolved - r.created) : '', r.escalations || 0])));
        rep.sections.push(sec('Critical incidents by building', ['Building', 'Critical incidents'], grp(cr, r => r.bld).map(([k, v]) => [k, v.length]), { kind: 'bar', label: 0, value: 1, unit: 'incidents' }));
      }
    },
    staff: {
      label: 'Staff performance and workload', desc: 'Workload, completions and speed for each maintenance staff member',
      build(rep, list) {
        const people = Object.values(db.users).filter(u => u.role === 'maintenance');
        const rows = people.map(u => {
          const mine = list.filter(r => r.as === u.name), m = metrics(mine), all = valid().filter(r => r.as === u.name && open1(r));
          return [u.name, teamOf(u), mine.length, m.resolved, m.open, m.overdue, m.avgRes ?? '', mine.length ? Math.round(100 * m.resolved / mine.length) : '', all.length];
        });
        rep.sections.push(sec('Staff summary', ['Staff', 'Team', 'Assigned in period', 'Resolved', 'Still open', 'Overdue', 'Avg hours to resolve', 'Completion %', 'Open tasks right now'], rows, { kind: 'bar', label: 0, value: 8, unit: 'open tasks' }));
        const un = list.filter(r => open1(r) && r.as === 'Unassigned').length;
        if (un) rep.sections.push(sec('Not yet assigned', ['Open and unassigned'], [[un]]));
      }
    },
    buildings: {
      label: 'Buildings with most complaints', desc: 'Where maintenance problems concentrate',
      build(rep, list) {
        rep.sections.push(sec('Complaints by building and category', ['Building', 'Total', ...CATS, 'Open'], Object.keys(BLD).map(b => { const l = list.filter(r => r.bld === b); return [b, l.length, ...CATS.map(c => l.filter(r => r.cat === c).length), l.filter(open1).length] }).filter(r => r[1]).sort((a, b) => b[1] - a[1]), { kind: 'bar', label: 0, value: 1, unit: 'complaints' }));
        rep.sections.push(sec('Busiest locations', ['Location', 'Complaints', 'Open'], grp(list, r => r.bld + ' - ' + r.room).slice(0, 10).map(([k, v]) => [k, v.length, v.filter(open1).length])));
      }
    },
    overdue: {
      label: 'Overdue tasks', desc: 'Open complaints that have passed their deadline',
      build(rep, list) {
        const t = now(), od = list.filter(r => open1(r) && r.due < t).sort((a, b) => a.due - b.due);
        rep.sections.push(sec('Overdue complaints', ['ID', 'Issue', 'Location', 'Priority', 'Status', 'Assigned to', 'Deadline', 'Hours late', 'Escalations'], od.slice(0, 300).map(r => [r.id, r.title, r.bld + ' - ' + r.room, r.pri, r.status, r.as, fmtD(r.due), hrs(t - r.due), r.escalations || 0])));
        rep.sections.push(sec('Overdue by assignee', ['Assigned to', 'Overdue'], grp(od, r => r.as).map(([k, v]) => [k, v.length]), { kind: 'bar', label: 0, value: 1, unit: 'overdue' }));
      }
    },
    recurring: {
      label: 'Recurring issues', desc: 'Same building and category reported repeatedly',
      build(rep, list) {
        const rows = grp(list, r => r.bld + '|' + r.cat).filter(([, v]) => v.length >= 2).map(([k, v]) => {
          const [b, c] = k.split('|'), ts = v.map(r => r.created).sort((a, z) => a - z), gaps = ts.slice(1).map((x, i) => (x - ts[i]) / DAYMS);
          return [b, c, v.length, v.filter(open1).length, [...new Set(v.map(r => r.room))].join(', '), fmtD(ts[0]), fmtD(ts[ts.length - 1]), r1(gaps.reduce((s, x) => s + x, 0) / gaps.length)];
        });
        rep.sections.push(sec('Recurring issues', ['Building', 'Category', 'Complaints', 'Open', 'Rooms', 'First reported', 'Last reported', 'Avg days between reports'], rows, rows.length ? { kind: 'bar', label: 1, value: 2, unit: 'complaints' } : null, rows.length ? '' : 'No building has the same kind of complaint twice or more in this period.'));
      }
    },
    list: {
      label: 'Complaint listing', desc: 'A plain list of the complaints that match your filters',
      build(rep, list) { rep.sections.push(sec('Complaints', CCOLS, list.slice(0, 300).map(crow), null, list.length > 300 ? 'Showing the first 300 of ' + list.length + '.' : '')) }
    }
  };

  function trend(list) {
    if (!list.length) return [];
    const t0 = Math.min(...list.map(r => r.created)), t1 = now(), days = (t1 - t0) / DAYMS, rows = [];
    if (days <= 70) { // weekly
      const n = Math.max(1, Math.ceil((t1 - dayStart(t0)) / (7 * DAYMS)));
      for (let i = 0; i < n; i++) { const a = dayStart(t0) + i * 7 * DAYMS, b = a + 7 * DAYMS, l = list.filter(r => r.created >= a && r.created < b); rows.push([fmtD(a), l.length, l.filter(r => r.status === 'Resolved').length]) }
    } else { // monthly
      const d0 = new Date(t0), d1 = new Date(t1);
      for (let y = d0.getFullYear(), m = d0.getMonth(); y < d1.getFullYear() || (y === d1.getFullYear() && m <= d1.getMonth()); m++) {
        if (m > 11) { m = 0; y++ }
        const a = new Date(y, m, 1).getTime(), b = new Date(y, m + 1, 1).getTime(), l = list.filter(r => r.created >= a && r.created < b);
        rows.push([new Date(a).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), l.length, l.filter(r => r.status === 'Resolved').length]);
        if (rows.length > 36) break;
      }
    }
    return rows;
  }

  /* ---------- findings (facts) and suggestions (rules) ---------- */
  function findings(list, m) {
    const f = [], t = now();
    if (!m.total) return ['No complaints match these filters.'];
    f.push(`${m.total} complaint${m.total === 1 ? '' : 's'}: ${m.open} open, ${m.resolved} resolved.`);
    if (m.avgRes != null) f.push(`Average time to resolve: ${m.avgRes} hours${m.sla != null ? `; ${m.sla}% of resolved complaints were closed within their deadline` : ''}.`);
    if (m.overdue) { const o = list.filter(r => open1(r) && r.due < t).sort((a, b) => a.due - b.due)[0]; f.push(`${m.overdue} open complaint${m.overdue === 1 ? ' is' : 's are'} past the deadline; the longest overdue is ${o.id} (${o.title}, ${hrs(t - o.due)} hours late, assigned to ${o.as}).`) }
    const tc = grp(list, r => r.cat)[0], tb = grp(list, r => r.bld)[0];
    if (tc && grp(list, r => r.cat).length > 1) f.push(`Most reported category: ${tc[0]} (${tc[1].length} of ${m.total}).`);
    if (tb && grp(list, r => r.bld).length > 1) f.push(`Most reported building: ${tb[0]} (${tb[1].length} of ${m.total}).`);
    if (m.unassigned) f.push(`${m.unassigned} open complaint${m.unassigned === 1 ? ' has' : 's have'} no assignee yet.`);
    if (m.critical) f.push(`${m.critical} complaint${m.critical === 1 ? ' was' : 's were'} Critical priority.`);
    if (m.reopened) f.push(`${m.reopened} complaint${m.reopened === 1 ? ' was' : 's were'} reopened after being marked fixed.`);
    return f;
  }
  function suggest(list, m) {
    const s = [], t = now();
    if (m.unassigned) s.push({ text: `Assign the ${m.unassigned} unassigned open complaint${m.unassigned === 1 ? '' : 's'} (a workflow with the "assign least busy staff" action can do this automatically).`, basis: `${m.unassigned} open complaints have no assignee` });
    if (m.overdue >= 1) s.push({ text: 'Review the overdue complaints and escalate or reassign them; consider an automatic escalation workflow.', basis: `${m.overdue} open complaints are past their deadline` });
    grp(list, r => r.bld + '|' + r.cat).filter(([, v]) => v.length >= 3).slice(0, 3).forEach(([k, v]) => { const [b, c] = k.split('|'); s.push({ text: `Schedule an inspection of ${c.toLowerCase()} systems in ${b}; a shared cause is likely.`, basis: `${v.length} ${c.toLowerCase()} complaints in ${b}` }) });
    const busy = Object.values(db.users).filter(u => u.role === 'maintenance').map(u => [u.name, valid().filter(r => r.as === u.name && open1(r)).length]).sort((a, b) => b[1] - a[1]);
    if (busy.length > 1 && busy[0][1] >= 4 && busy[0][1] >= 2 * Math.max(1, busy[busy.length - 1][1])) s.push({ text: `Rebalance work: ${busy[0][0]} has ${busy[0][1]} open tasks while ${busy[busy.length - 1][0]} has ${busy[busy.length - 1][1]}.`, basis: 'open tasks per staff member' });
    if (m.sla != null && m.sla < 70) s.push({ text: 'Fewer than 70% of resolved complaints met their deadline; review staffing or deadlines for the slowest categories.', basis: `${m.sla}% resolved within deadline` });
    return s;
  }

  /* ---------- build a report ---------- */
  const filtersOf = sp => ({ Category: sp.cat, Building: sp.bld, Department: sp.dept, Priority: sp.pri, Status: sp.status, 'Assigned to': sp.as });
  function defaultTitle(sp, rng) {
    const parts = [TYPES[sp.type].label]; if (sp.cat) parts.push(sp.cat); if (sp.bld) parts.push(sp.bld);
    return parts.join(' - ') + (rng.token === 'all' ? '' : ' (' + (RANGES[rng.token] || rng.label) + ')');
  }
  function build(spec, by) {
    const sp = cleanSpec(spec), rng = resolveRange(sp), list = filterList(sp, rng), m = metrics(list);
    const rep = { v: 1, type: sp.type, title: sp.title || defaultTitle(sp, rng), period: rng, filters: filtersOf(sp), generatedAt: now(), generatedBy: by || 'System', counts: { matched: list.length, truncated: list.length > 300 }, kpis: [], sections: [], findings: [], suggestions: [], narrative: null, complaints: [] };
    rep.kpis = [['Complaints', m.total], ['Open', m.open], ['Resolved', m.resolved], ['Overdue', m.overdue], ['Critical', m.critical], ['Avg hours to resolve', m.avgRes ?? 'n/a'], ['Resolved within deadline', m.sla == null ? 'n/a' : m.sla + '%']];
    TYPES[sp.type].build(rep, list, m, sp);
    rep.findings = findings(list, m); rep.suggestions = suggest(list, m);
    rep.complaints = list.slice(0, 300).map(crow);
    rep.spec = sp;
    return rep;
  }

  /* ---------- plain-English requests ---------- */
  function parsePrompt(p) {
    const q = String(p || '').toLowerCase().slice(0, 600), sp = {};
    const has = re => re.test(q);
    sp.type = has(/staff|workload|performance|technician|plumbers?\b.*(performance|workload)/) && !has(/plumbing complaints/) ? 'staff'
      : has(/compare|comparison|resolution time|average resolution|resolution times/) && has(/department|categor|team|resolution time/) && !has(/include .*average resolution/) ? 'resolution'
      : has(/overdue|late tasks|past (the )?deadline/) ? 'overdue'
      : has(/critical/) ? 'critical'
      : has(/recurring|repeat|keeps? happening/) ? 'recurring'
      : has(/(which|what|top|most).*(building)|buildings? with (the )?most|most .*complaints.*building/) ? 'buildings'
      : has(/\b(show|list|find|get|display)\b[^.]*\b(unresolved|open|pending|outstanding)\b/) ? 'unresolved'
      : has(/\b(show|list|find|get|display)\b[^.]*\bcomplaints\b/) && !has(/report|summary/) ? 'list'
      : 'summary';
    const kw = { Plumbing: /plumb|water|leak|pipe|\btaps?\b|drain/, Electrical: /electric|wiring|\blights?\b|power|socket/, Cleanliness: /clean|garbage|hygien|\bbins?\b/, Equipment: /equipment|projector|\bac\b|air cond/, Safety: /safety|security|\block/ };
    const cat = CATS.find(c => kw[c].test(q)); if (cat) sp.cat = cat;
    const bld = Object.keys(BLD).find(b => q.includes(b.toLowerCase())); if (bld) sp.bld = bld;
    const pm = /\b(critical|high|medium|low)[ -]priority\b/.exec(q); if (pm) sp.pri = pm[1][0].toUpperCase() + pm[1].slice(1);
    const nm = TEAM.find(n => n !== 'Unassigned' && (q.includes(n.toLowerCase()) || q.includes(n.toLowerCase().split(' ')[0]) && n.includes(' '))); if (nm) sp.as = nm;
    if (sp.type === 'unresolved') sp.status = 'open';
    else if (has(/\bunresolved only|only (the )?unresolved|only open/)) sp.status = 'open';
    else if (has(/\b(show|list|find)\b[^.]*\bresolved\b/) && !has(/unresolved/)) sp.status = 'resolved';
    sp.range = has(/today/) ? 'today' : has(/last month|previous month/) ? 'last_month' : has(/this month|monthly|month so far|current month/) ? 'this_month' : has(/this year|annual|yearly/) ? 'this_year' : has(/quarter|90 days/) ? '90d' : has(/last 30 days|past 30 days/) ? '30d' : has(/this week|weekly|last 7 days|past week|last week/) ? '7d' : 'all';
    return sp;
  }
  const merge = (base, over) => { const o = { ...base }; Object.entries(over || {}).forEach(([k, v]) => { if (v !== '' && v != null && !(k === 'range' && v === 'all' && base.range && base.range !== 'all')) o[k] = v }); return o };

  /* ---------- AI narrative (optional; clearly labelled) ---------- */
  const KEY = () => process.env.ANTHROPIC_API_KEY || '', MODEL = () => process.env.CARE_AI_MODEL || 'claude-sonnet-5-5';
  const aiOn = () => !!KEY();
  async function claude(body) {
    const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const r = await fetch(base + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL(), max_tokens: 1200, ...body }), signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'AI request failed (' + r.status + ')');
    return j;
  }
  async function narrate(rep) {
    if (!aiOn()) return null;
    const facts = { title: rep.title, period: rep.period.label, filters: rep.filters, kpis: rep.kpis, findings: rep.findings, tables: rep.sections.map(s => ({ heading: s.heading, cols: s.table.cols, rows: s.table.rows.slice(0, 12) })) };
    try {
      const j = await claude({ system: 'You write short operations reports for a college campus maintenance team. Use ONLY the facts provided; never invent numbers, names or causes. Reply with JSON only: {"summary":"3-4 sentences","recommendations":["up to 4 short, practical recommendations"]}', messages: [{ role: 'user', content: JSON.stringify(facts) }] });
      const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      return { summary: clean(o.summary, 900), recommendations: (Array.isArray(o.recommendations) ? o.recommendations : []).slice(0, 4).map(x => clean(x, 300)), model: MODEL() };
    } catch (e) { return { error: 'AI summary unavailable: ' + e.message } }
  }

  /* ---------- CSV ---------- */
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && isNaN(+s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s };
  function csv(rep) {
    const L = [[rep.title], ['Period', rep.period.label], ['Generated', new Date(rep.generatedAt).toISOString()], ...Object.entries(rep.filters).filter(([, v]) => v).map(([k, v]) => [k, v]), [], ['Key figures'], ...rep.kpis];
    rep.sections.forEach(s => { L.push([], [s.heading], s.table.cols, ...s.table.rows) });
    if (rep.complaints.length) L.push([], ['Complaints included in this report'], CCOLS, ...rep.complaints);
    return '\ufeff' + L.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  /* ---------- PDF (no libraries) ---------- */
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const san = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e]/g, '');
  const tw = (s, z, b) => { let w = 0; for (const ch of s) w += HW[ch.charCodeAt(0) - 32] || 556; return w * z / 1000 * (b ? 1.07 : 1) };
  function fit(s, z, w, b) { s = san(s); if (tw(s, z, b) <= w) return s; while (s.length > 1 && tw(s + '..', z, b) > w) s = s.slice(0, -1); return s + '..' }
  function wrap(s, z, w, b) { const out = []; let line = ''; san(s).split(/\s+/).forEach(word => { const t = line ? line + ' ' + word : word; if (tw(t, z, b) <= w || !line) line = t; else { out.push(line); line = word } }); if (line) out.push(line); return out }
  function pdf(rep) {
    const W = 595, H = 842, M = 40, CW = W - 2 * M, pages = [];
    let ops, y;
    const esc = s => s.replace(/[\\()]/g, '\\$&'), f2 = n => (+n).toFixed(2);
    const newPage = () => { ops = []; pages.push(ops); y = H - M };
    const text = (x, yy, s, z = 10, b = false, col = '0.1 0.1 0.15') => ops.push(`BT /F${b ? 2 : 1} ${z} Tf ${col} rg ${f2(x)} ${f2(yy)} Td (${esc(san(s))}) Tj ET`);
    const rect = (x, yy, w, h, col) => ops.push(`${col} rg ${f2(x)} ${f2(yy)} ${f2(w)} ${f2(h)} re f`);
    const need = h => { if (y - h < M + 20) newPage() };
    const para = (s, z = 10, b = false, col) => wrap(s, z, CW, b).forEach(l => { need(z + 4); y -= z + 3; text(M, y, l, z, b, col) });
    const head = (s, z = 14) => { need(z + 24); y -= 10; para(s, z, true, '0.04 0.45 0.4') };
    newPage();
    rect(0, H - 70, W, 70, '0.1 0.15 0.4'); text(M, H - 36, 'CARE Campus Operations', 11, true, '1 1 1'); text(M, H - 54, 'Generated report', 9, false, '0.8 0.85 1'); y = H - 90;
    wrap(rep.title, 20, CW, true).forEach(l => { y -= 24; text(M, y, l, 20, true, '0.1 0.15 0.4') });
    y -= 6; para('Period: ' + rep.period.label, 10); para('Generated: ' + new Date(rep.generatedAt).toLocaleString() + ' by ' + rep.generatedBy, 10);
    const fl = Object.entries(rep.filters).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join('   '); if (fl) para('Filters: ' + fl, 10);
    y -= 8; const kw = CW / 4; // KPI cards
    for (let i = 0; i < rep.kpis.length; i += 4) { need(48); rep.kpis.slice(i, i + 4).forEach((k, j) => { const x = M + j * kw; rect(x, y - 40, kw - 6, 40, '0.94 0.95 0.98'); text(x + 8, y - 17, String(k[1]), 15, true, '0.1 0.15 0.4'); text(x + 8, y - 32, fit(k[0], 8, kw - 20), 8, false, '0.4 0.4 0.5') }); y -= 48 }
    if (rep.narrative && rep.narrative.summary) { head('AI-generated summary'); para('Written by an AI model from the figures in this report. Check it before relying on it.', 8, false, '0.45 0.45 0.5'); para(rep.narrative.summary); (rep.narrative.recommendations || []).forEach(x => para('- ' + x)) }
    head('Findings from the data'); rep.findings.forEach(x => para('- ' + x));
    if (rep.suggestions.length) { head('Suggested actions (rule-based)'); rep.suggestions.forEach(x => para('- ' + x.text + ' [Based on: ' + x.basis + ']')) }
    rep.sections.forEach(s => {
      head(s.heading, 13); if (s.note) para(s.note, 9, false, '0.45 0.45 0.5');
      if (s.chart) { const items = s.table.rows.map(r => [String(r[s.chart.label]), +r[s.chart.value] || 0]).slice(0, 12), mx = Math.max(1, ...items.map(i => i[1])); items.forEach(([k, v]) => { need(16); y -= 15; text(M, y, fit(k, 9, 150), 9); rect(M + 160, y - 2, Math.max(1, (CW - 220) * v / mx), 10, '0.04 0.55 0.49'); text(M + 164 + (CW - 220) * v / mx, y, String(v) + ' ' + (s.chart.unit || ''), 8, false, '0.3 0.3 0.4') }); y -= 6 }
      const cols = s.table.cols, rows = s.table.rows; if (!rows.length) { para('No data for these filters.', 9, false, '0.45 0.45 0.5'); return }
      const z = cols.length > 8 ? 6.5 : cols.length > 6 ? 7.5 : 8.5, want = cols.map((c, i) => Math.min(150, Math.max(tw(san(c), z, true), ...rows.slice(0, 60).map(r => tw(san(r[i]), z))) + 8)), tot = want.reduce((a, b) => a + b, 0), k = tot > CW ? CW / tot : 1, cw = want.map(w => w * k);
      const hdr = () => { need(24); rect(M, y - 14, CW, 16, '0.1 0.15 0.4'); let x = M + 3; cols.forEach((c, i) => { text(x, y - 10, fit(c, z, cw[i] - 5, true), z, true, '1 1 1'); x += cw[i] }); y -= 16 };
      hdr(); rows.slice(0, 200).forEach((r, ri) => { if (y - 14 < M + 20) { newPage(); hdr() } if (ri % 2) rect(M, y - 12, CW, 13, '0.96 0.96 0.98'); let x = M + 3; r.forEach((v, i) => { text(x, y - 9, fit(v, z, cw[i] - 5), z); x += cw[i] }); y -= 13 }); y -= 6;
    });
    // assemble the file
    const objs = [], add = s => objs.push(s) - 1;
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(null); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    pages.forEach((p, i) => { p.push(`BT /F1 8 Tf 0.5 0.5 0.55 rg ${M} 24 Td (${esc('CARE - ' + san(rep.title).slice(0, 70))}) Tj ET`, `BT /F1 8 Tf 0.5 0.5 0.55 rg ${W - M - 40} 24 Td (Page ${i + 1} of ${pages.length}) Tj ET`);
      const c = add(`<< /Length ${Buffer.byteLength(p.join('\n'), 'latin1')} >>\nstream\n${p.join('\n')}\nendstream`), pg = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c + 1} 0 R >>`); kids.push(pg + 1) });
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n', off = [];
    objs.forEach((o, i) => { off.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n` });
    const xr = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }

  /* ---------- library (files in DATA_DIR/reports) ---------- */
  const fileOf = id => path.join(LIB, id + '.json');
  const readRep = id => { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')) } catch (e) { return null } };
  const writeRep = (id, rep) => fs.writeFileSync(fileOf(id), JSON.stringify(rep));
  const entryOf = id => db.studio.reports.find(x => x.id === String(id));
  function saveReport(rep, o) {
    const id = 'RPT-' + (1001 + db.studio.seq++);
    const e = { id, title: rep.title, type: rep.type, prompt: o.prompt || '', spec: rep.spec, period: rep.period, createdAt: now(), createdBy: o.by || 'System', source: o.source || 'Manual', status: 'ready', matched: rep.counts.matched, ai: !!(rep.narrative && rep.narrative.summary), drive: null, gdoc: null, gsheet: null };
    writeRep(id, rep); db.studio.reports.unshift(e);
    while (db.studio.reports.length > 150) { const old = db.studio.reports.pop(); try { fs.unlinkSync(fileOf(old.id)) } catch (x) { } }
    return e;
  }
  const meta = e => ({ ...e, typeLabel: (TYPES[e.type] || {}).label || e.type });
  async function generate(spec, o = {}) {
    const rep = build(spec, o.by);
    if (o.ai) rep.narrative = await narrate(rep);
    const e = saveReport(rep, o);
    return { entry: e, rep };
  }

  /* ---------- actions ---------- */
  const need = u => { if (u.role !== 'admin') bad('Not allowed.', 403) };
  const actions = {
    async genReport(u, d) {
      need(u);
      const base = d.prompt ? parsePrompt(d.prompt) : {};
      const spec = merge(base, d.spec || {});
      if (!d.prompt && !(d.spec && d.spec.type)) bad('Describe the report you want, or choose a report type.');
      const { entry, rep } = await generate(spec, { by: u.name, prompt: clean(d.prompt, 600), source: 'Manual', ai: d.ai !== false && d.ai !== 'false' && aiOn() && !!d.ai });
      audit(u, `generated report ${entry.id} "${entry.title}"`);
      return { id: entry.id, entry: meta(entry), report: rep };
    },
    renameReport(u, d) { need(u); const e = entryOf(d.id); if (!e) bad('Report not found.', 404); const t = clean(d.title, 120); if (t.length < 2) bad('Enter a name for the report.'); e.title = t; const rep = readRep(e.id); if (rep) { rep.title = t; writeRep(e.id, rep) } audit(u, `renamed report ${e.id}`); return { ok: 1 } },
    async regenReport(u, d) {
      need(u); const e = entryOf(d.id); if (!e) bad('Report not found.', 404);
      const rep = build({ ...e.spec, title: e.title }, u.name); if (e.ai) rep.narrative = await narrate(rep);
      writeRep(e.id, rep); Object.assign(e, { period: rep.period, createdAt: now(), createdBy: u.name, matched: rep.counts.matched, status: 'ready', ai: !!(rep.narrative && rep.narrative.summary) });
      audit(u, `regenerated report ${e.id}`); return { ok: 1, report: rep };
    },
    deleteReport(u, d) { need(u); const i = db.studio.reports.findIndex(x => x.id === String(d.id)); if (i < 0) bad('Report not found.', 404); const [e] = db.studio.reports.splice(i, 1); try { fs.unlinkSync(fileOf(e.id)) } catch (x) { } audit(u, `deleted report ${e.id} "${e.title}" (files already on Google Drive are not deleted)`); return { ok: 1 } }
  };

  /* ---------- http ---------- */
  async function http(req, res, u, UO, p) {
    let m;
    if (req.method === 'GET' && (m = /^\/api\/studio\/report\/(RPT-\d+)(\/download)?$/.exec(p))) {
      if (!u) return C.json(res, 401, { error: 'Please log in.' }), true;
      if (u.role !== 'admin') return C.json(res, 403, { error: 'Admins only.' }), true;
      const e = entryOf(m[1]), rep = e && readRep(e.id); if (!rep) return C.json(res, 404, { error: 'Report not found.' }), true;
      if (!m[2]) return C.json(res, 200, { entry: meta(e), report: rep }), true;
      const fmt = UO.searchParams.get('fmt') || 'pdf', name = san(e.title).replace(/[^\w.-]+/g, '_').slice(0, 60) || e.id;
      if (fmt === 'csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` }); res.end(csv(rep)) }
      else if (fmt === 'pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` }); res.end(pdf(rep)) }
      else return C.json(res, 400, { error: 'Choose pdf or csv.' }), true;
      return true;
    }
    return false;
  }
  function state(u) {
    if (u.role !== 'admin') return {};
    return { studio: { reports: db.studio.reports.map(meta), types: Object.entries(TYPES).map(([k, v]) => ({ key: k, label: v.label, desc: v.desc })), ranges: RANGES, ai: aiOn(), aiModel: aiOn() ? MODEL() : '',
      examples: ['Generate a monthly campus complaint report.', 'Show all unresolved plumbing complaints.', 'Compare average resolution times across departments.', 'Generate a report of critical incidents.', 'Summarize staff performance and workload.', 'Identify buildings with the most maintenance complaints.', 'Create a weekly report of overdue tasks.'] } };
  }

  return { actions, http, state, api: { build, saveReport, generate, parsePrompt, cleanSpec, merge, metrics, filterList, resolveRange, TYPES, csv, pdf, readRep, entryOf, meta, narrate, aiOn, claude, MODEL, writeRep, fmtD, hrs, r1, grp, valid, deptOf, san }, docs: { 'GET /api/studio/report/:id[/download?fmt=pdf|csv]': 'admin: report data or file', 'POST /api/act genReport renameReport regenReport deleteReport': 'admin: AI Report Studio' } };
};
