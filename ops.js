'use strict';
/* CARE: operations backend.
   - Complaint intelligence (duplicates, root causes, predictions, recommendations, smart categorisation)
   - Analytics with filters
   - Staff workspace actions + resolution verification
   - Inventory, parts used on repairs, work orders and equipment history
   Everything is computed from the real complaint database. Findings (counted from data) are kept apart from suggestions (rules). */
module.exports = function (C) {
  const { db, now, bad, clean, note, notifyRole, audit, find, open1, CATS, BLD, PRI, ST, TEAM, DAYMS, DEPT_STAFF, STAFF_DEPT, CRIT, BASEP, staffOf, teamOf, setStatus, wfStatus, fs, path, UP } = C;
  db.inv = db.inv || { items: [], moves: [], orders: [], seq: 0, wo: 0, seeded: false };
  db.incidents = db.incidents || []; db.incSeq = db.incSeq || 0;
  const CUR = process.env.CARE_CURRENCY || '\u20b9';
  const valid = () => db.reports.filter(r => !['fake', 'duplicate'].includes(r.mod));
  const r1 = x => Math.round(x * 10) / 10, hrs = ms => r1(ms / 36e5);
  const grp = (list, f) => { const m = new Map(); list.forEach(x => { const k = f(x); m.has(k) ? m.get(k).push(x) : m.set(k, [x]) }); return [...m.entries()].sort((a, b) => b[1].length - a[1].length) };
  const isAdmin = u => u.role === 'admin';
  const admin = u => { if (!isAdmin(u)) bad('Not allowed.', 403) };
  const MOD = u => u.role === 'maintenance';

  /* ================= smart categorisation ================= */
  const KW = {
    Plumbing: ['leak', 'leaking', 'water', 'tap', 'faucet', 'pipe', 'drain', 'clog', 'blocked drain', 'overflow', 'flush', 'toilet', 'sink', 'seepage', 'drip', 'flood', 'sewage', 'geyser', 'plumb', 'no water', 'low pressure'],
    Electrical: ['light', 'bulb', 'tube light', 'lamp', 'switch', 'socket', 'wire', 'wiring', 'spark', 'power', 'fan', 'electric', 'short circuit', 'circuit', 'mcb', 'flicker', 'voltage', 'tripped', 'power cut', 'charging point'],
    Cleanliness: ['dirty', 'clean', 'garbage', 'bin', 'trash', 'waste', 'smell', 'odor', 'odour', 'stain', 'dust', 'cockroach', 'insect', 'mosquito', 'spill', 'unhygienic', 'litter', 'sweep', 'mop'],
    Equipment: ['projector', 'ac', 'air conditioner', 'computer', 'pc', 'printer', 'whiteboard', 'bench', 'desk', 'chair', 'door', 'window', 'furniture', 'lift', 'elevator', 'wifi', 'network', 'internet', 'screen', 'mic', 'speaker', 'broken'],
    Safety: ['unsafe', 'lock', 'broken lock', 'dark', 'unlit', 'harass', 'threat', 'fire', 'smoke', 'extinguisher', 'cctv', 'camera', 'fence', 'stairs', 'railing', 'slippery', 'theft', 'stolen', 'assault', 'stalk', 'gas leak']
  };
  const URG = /\b(urgent|immediately|emergency|danger\w*|hazard\w*|injur\w*|asap)\b/i;
  function classify(text) {
    const q = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ') + ' ', sc = {}, why = {};
    CATS.forEach(c => { sc[c] = 0; why[c] = []; KW[c].forEach(k => { if (q.includes(' ' + k + ' ') || (k.length > 4 && q.includes(' ' + k))) { sc[c] += k.includes(' ') ? 2 : 1; why[c].push(k) } }) });
    const tot = CATS.reduce((s, c) => s + sc[c], 0), best = CATS.slice().sort((a, b) => sc[b] - sc[a])[0];
    if (!tot) return { cat: null, pri: null, team: null, staff: null, confidence: 0, why: [], note: 'Not enough detail to suggest a category yet.' };
    const crit = CRIT.test(text || ''), pri = crit ? 'Critical' : URG.test(text || '') && BASEP[best] !== 'High' ? 'High' : BASEP[best];
    return { cat: best, pri, team: best, staff: DEPT_STAFF[best] || null, confidence: Math.round(100 * sc[best] / tot), why: why[best].slice(0, 4), note: crit ? 'Wording suggests a safety hazard, so the suggested priority is Critical.' : '' };
  }

  /* ================= intelligence ================= */
  const STOP = new Set('the and for with from this that there their near next very too out into over under please kindly still again since which while when where after before only some any all can cannot could would should will just also more than then them they you your our its not has have had been was were are room block floor hall not working issue problem'.split(' '));
  const stem = w => w.replace(/(ages?|ing|ed|es|s)$/, '');
  const toks = s => new Set((String(s || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem).filter(w => w.length > 2));
  const jac = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => b.has(x) && i++); return i / (a.size + b.size - i) };
  const SUG = {
    Plumbing: ['Inspect the shared supply line, valves and drainage for this building', 'Check for hidden leaks above or below the affected rooms', 'Test water pressure and look for corroded fittings'],
    Electrical: ['Inspect the distribution board and circuit breakers serving these rooms', 'Check for overloaded circuits and loose wiring', 'Review the age of the fittings in this area'],
    Cleanliness: ['Review the cleaning schedule and bin capacity for this area', 'Check ventilation and drainage if smells are reported', 'Add a mid-day clean on the busiest days'],
    Equipment: ['Check service history and age of the equipment in this area', 'Consider a planned maintenance visit instead of fixing one fault at a time', 'Check whether usage has outgrown the equipment'],
    Safety: ['Do a safety walk-through of this area, at night as well', 'Check lighting, locks and visibility', 'Review the security patrol route for this building']
  };
  function dups() {
    const L = valid().filter(r => open1(r)), P = L.map((r, i) => i), tk = L.map(r => toks(r.title + ' ' + r.desc)), rank = i => P[i] === i ? i : (P[i] = rank(P[i])), best = {};
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; if (a.bld !== b.bld) continue;
      const s = jac(tk[i], tk[j]), sr = a.room === b.room, sc = a.cat === b.cat;
      if ((sr && sc && s >= .2) || (sr && s >= .5) || (sc && s >= .5)) { P[rank(i)] = rank(j); best[i] = Math.max(best[i] || 0, s); best[j] = Math.max(best[j] || 0, s) }
    }
    const g = {}; L.forEach((r, i) => (g[rank(i)] = g[rank(i)] || []).push(i));
    return Object.values(g).filter(a => a.length > 1).map(a => {
      const rs = a.map(i => L[i]), shared = [...tk[a[0]]].filter(w => a.every(i => tk[i].has(w))), inc = [...new Set(rs.map(r => r.incident).filter(Boolean))];
      return { ids: rs.map(r => r.id), titles: rs.map(r => r.title), bld: rs[0].bld, rooms: [...new Set(rs.map(r => r.room))], cats: [...new Set(rs.map(r => r.cat))], score: Math.round(100 * Math.max(...a.map(i => best[i] || 0))), shared: shared.slice(0, 5), incident: inc.length === 1 && rs.every(r => r.incident === inc[0]) ? inc[0] : '' };
    }).sort((a, b) => b.ids.length - a.ids.length);
  }
  function rootCauses() {
    const t = now(), L = valid().filter(r => t - r.created < 90 * DAYMS);
    return grp(L, r => r.bld + '|' + r.cat).filter(([, v]) => v.length >= 3).map(([k, v]) => {
      const [bld, cat] = k.split('|'), f = {}; v.forEach(r => toks(r.title + ' ' + r.desc).forEach(w => f[w] = (f[w] || 0) + 1));
      const words = Object.entries(f).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const rooms = grp(v, r => r.room).map(([room, l]) => [room, l.length]);
      return { bld, cat, count: v.length, open: v.filter(open1).length, rooms, words, ids: v.map(r => r.id).slice(0, 12), evidence: `${v.length} ${cat.toLowerCase()} complaints in ${bld} in the last 90 days across ${rooms.length} location${rooms.length === 1 ? '' : 's'}${words.length ? '; repeated words: ' + words.map(w => w[0] + ' (' + w[1] + ')').join(', ') : ''}.`, inspect: SUG[cat] };
    });
  }
  function predictions() {
    const t = now(), L = valid().filter(r => !['Withdrawn'].includes(r.status));
    return grp(L, r => r.bld + '|' + r.room + '|' + r.cat).filter(([, v]) => v.length >= 3).map(([k, v]) => {
      const [bld, room, cat] = k.split('|'), ts = v.map(r => r.created).sort((a, b) => a - b), gaps = ts.slice(1).map((x, i) => (x - ts[i]) / DAYMS), avgGap = gaps.reduce((s, x) => s + x, 0) / gaps.length, last = ts[ts.length - 1];
      const recent = ts.filter(x => t - x < 30 * DAYMS).length, prior = ts.filter(x => t - x >= 30 * DAYMS && t - x < 60 * DAYMS).length;
      return { bld, room, cat, count: v.length, avgGapDays: r1(avgGap), lastAt: last, nextAt: Math.round(last + avgGap * DAYMS), overdueForInspection: last + avgGap * DAYMS <= t + 7 * DAYMS, recent, prior, trend: recent > prior ? 'rising' : recent < prior ? 'falling' : 'steady',
        evidence: `${v.length} ${cat.toLowerCase()} complaints at ${bld}, ${room}; one every ${r1(avgGap)} days on average; last one ${r1((t - last) / DAYMS)} days ago.` };
    }).sort((a, b) => (b.overdueForInspection - a.overdueForInspection) || b.count - a.count).slice(0, 10);
  }
  function recommendations() {
    const t = now(), out = [], op = valid().filter(open1), push = (level, text, evidence) => out.push({ level, text, evidence });
    const crU = op.filter(r => r.pri === 'Critical' && r.as === 'Unassigned'); if (crU.length) push('high', `Assign the ${crU.length} unassigned Critical complaint${crU.length > 1 ? 's' : ''} now.`, crU.map(r => r.id).join(', '));
    const od = op.filter(r => r.due < t); if (od.length) push(od.length >= 3 ? 'high' : 'medium', `Escalate or reassign the ${od.length} overdue complaint${od.length > 1 ? 's' : ''}.`, od.slice(0, 6).map(r => `${r.id} (${hrs(t - r.due)} h late, ${r.as})`).join('; '));
    const un = op.filter(r => r.as === 'Unassigned'); if (un.length) push('medium', `Assign the ${un.length} open complaint${un.length > 1 ? 's' : ''} that have no assignee, or turn on the automatic assignment workflows.`, `oldest: ${un.sort((a, b) => a.created - b.created)[0].id}, ${r1((t - un[0].created) / DAYMS)} days old`);
    const load = Object.values(db.users).filter(u => MOD(u)).map(u => [u.name, op.filter(r => r.as === u.name).length]).sort((a, b) => b[1] - a[1]);
    if (load.length > 1 && load[0][1] >= 4 && load[0][1] >= 2 * Math.max(1, load[load.length - 1][1])) push('medium', `Rebalance workload: ${load[0][0]} has ${load[0][1]} open tasks, ${load[load.length - 1][0]} has ${load[load.length - 1][1]}.`, load.map(x => x.join(': ')).join(', '));
    const cats = CATS.map(c => [c, op.filter(r => r.cat === c)]).filter(([, l]) => l.length >= 3 && l.filter(r => r.due < t).length / l.length >= .3);
    cats.forEach(([c, l]) => push('medium', `${c} work is falling behind: ${l.filter(r => r.due < t).length} of ${l.length} open complaints are overdue. Check staffing or deadlines.`, `${c}: ${l.length} open`));
    const aw = op.filter(r => r.status === 'Awaiting verification' && t - r.upd > 3 * DAYMS); if (aw.length) push('info', `${aw.length} fixed complaint${aw.length > 1 ? 's are' : ' is'} waiting more than 3 days for the reporter to verify. They close automatically after 7 days.`, aw.map(r => r.id).join(', '));
    const rq = op.filter(r => r.reassignReq); if (rq.length) push('medium', `${rq.length} staff reassignment request${rq.length > 1 ? 's need' : ' needs'} a decision.`, rq.map(r => `${r.id}: ${r.reassignReq.by}`).join('; '));
    const low = db.inv.items.filter(i => i.qty <= i.min); if (low.length) push('medium', `Restock ${low.length} low item${low.length > 1 ? 's' : ''}: ${low.map(i => i.name).join(', ')}.`, low.map(i => `${i.name}: ${i.qty} left (minimum ${i.min})`).join('; '));
    rootCauses().slice(0, 2).forEach(x => push('info', `Schedule an inspection: ${x.cat.toLowerCase()} in ${x.bld}.`, x.evidence));
    return out;
  }
  function intel() { return { dups: dups(), root: rootCauses(), predict: predictions(), recs: recommendations(), incidents: db.incidents.map(i => ({ ...i, open: i.ids.filter(id => { const r = find(id); return r && open1(r) }).length })).slice(0, 50), generatedAt: now() } }

  /* ================= analytics ================= */
  function analytics(q) {
    const t = now(), from = q.from ? Date.parse(q.from + 'T00:00:00') : 0, to = q.to ? Date.parse(q.to + 'T23:59:59') : t;
    if (isNaN(from) || isNaN(to)) bad('Enter valid dates.'); if (from > to) bad('The start date is after the end date.');
    const cat = CATS.includes(q.cat) ? q.cat : '', bld = BLD[q.bld] ? q.bld : '', base = valid().filter(r => (!cat || r.cat === cat) && (!bld || r.bld === bld));
    const L = base.filter(r => r.created >= from && r.created <= to), op = L.filter(open1), res = L.filter(r => r.status === 'Resolved' && r.resolved);
    const avgOf = a => a.length ? r1(a.reduce((s, r) => s + (r.resolved - r.created), 0) / a.length / 36e5) : null;
    const k = { total: L.length, open: op.length, resolved: L.filter(r => r.status === 'Resolved').length, overdue: op.filter(r => r.due < t).length, critical: L.filter(r => r.pri === 'Critical').length, criticalOpen: op.filter(r => r.pri === 'Critical').length, avgRes: avgOf(res), sla: res.length ? Math.round(100 * res.filter(r => r.resolved <= r.due).length / res.length) : null, unassigned: op.filter(r => r.as === 'Unassigned').length, awaiting: L.filter(r => r.status === 'Awaiting verification').length };
    const months = []; const d = new Date(t); for (let i = 5; i >= 0; i--) { const a = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime(), l = base.filter(r => r.created >= a && r.created < b); months.push({ label: new Date(a).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), total: l.length, resolved: l.filter(r => r.status === 'Resolved').length, critical: l.filter(r => r.pri === 'Critical').length }) }
    const people = Object.values(db.users).filter(u => MOD(u)).map(u => { const mine = valid().filter(r => r.as === u.name), o = mine.filter(open1); return { name: u.name, team: teamOf(u), open: o.length, overdue: o.filter(r => r.due < t).length, done: mine.filter(r => r.status === 'Resolved').length } }).sort((a, b) => b.open - a.open);
    const dept = CATS.map(c => { const l = L.filter(r => r.cat === c), rs = l.filter(r => r.status === 'Resolved' && r.resolved); return { cat: c, team: DEPT_STAFF[c] || '', total: l.length, open: l.filter(open1).length, overdue: l.filter(r => open1(r) && r.due < t).length, avgRes: avgOf(rs), sla: rs.length ? Math.round(100 * rs.filter(r => r.resolved <= r.due).length / rs.length) : null } }).filter(x => x.total);
    const heat = { blds: Object.keys(BLD), cats: CATS, cells: Object.keys(BLD).map(b => CATS.map(c => L.filter(r => r.bld === b && r.cat === c).length)) };
    const fb = L.filter(r => r.fb);
    return { filters: { from: q.from || '', to: q.to || '', cat, bld }, kpis: k, byCat: grp(L, r => r.cat).map(([a, v]) => [a, v.length]), byBld: grp(L, r => r.bld).map(([a, v]) => [a, v.length]), byPri: PRI.map(p => [p, L.filter(r => r.pri === p).length]), months, people, dept, heat,
      recurring: grp(L.filter(r => t - r.created < 90 * DAYMS), r => r.bld + '|' + r.cat).filter(([, v]) => v.length >= 2).slice(0, 8).map(([a, v]) => ({ bld: a.split('|')[0], cat: a.split('|')[1], count: v.length, open: v.filter(open1).length })),
      resolution: PRI.map(p => { const rs = res.filter(r => r.pri === p); return { pri: p, n: rs.length, avg: avgOf(rs), sla: rs.length ? Math.round(100 * rs.filter(r => r.resolved <= r.due).length / rs.length) : null } }).filter(x => x.n),
      rating: fb.length ? r1(fb.reduce((s, r) => s + r.fb.rating, 0) / fb.length) : 0, ratings: fb.length };
  }

  /* ================= staff workspace ================= */
  const addComment = (r, u, text, kind) => { r.comments = r.comments || []; r.comments.push({ t: now(), who: u.name, role: u.role, text, kind }); if (r.comments.length > 100) r.comments.shift() };
  const mayWork = (u, r) => isAdmin(u) || (MOD(u) && r.as === u.name);
  const pct = v => { const n = Math.round(+v); if (!(n >= 0 && n <= 100)) bad('Progress must be between 0 and 100.'); return n };
  function jpeg(s) { const pf = 'data:image/jpeg;base64,'; s = String(s || ''); if (!s.startsWith(pf) || s.length > 2.8e6) bad('Photo must be a JPEG under 2 MB.'); const b = Buffer.from(s.slice(pf.length), 'base64'); if (b[0] !== 0xff || b[1] !== 0xd8) bad('Invalid photo.'); return b }
  const lowCheck = (it, before) => { if (it.qty <= it.min && before > it.min) notifyRole('admin', `Low stock: ${it.name} (${it.qty} ${it.unit} left, minimum ${it.min})`) };

  const actions = {
    staffTask(u, d) {
      const r = find(d.id); if (!r) bad('Complaint not found.', 404); if (!mayWork(u, r)) bad('Not allowed.', 403);
      const op = String(d.op), t = now(), text = clean(d.text, 500), openish = open1(r);
      if (!openish && op !== 'comment') bad('This complaint is already closed.');
      if (r.status === 'Awaiting verification' && op !== 'comment') bad('This task is waiting for the reporter to verify the fix.');
      if (op === 'accept') { if (!['Submitted', 'Under review', 'Assigned', 'Reopened'].includes(r.status)) bad('This task cannot be accepted now.'); setStatus(r, 'Accepted', u) }
      else if (op === 'start') { if (r.status === 'In progress') bad('This task is already in progress.'); setStatus(r, 'In progress', u) }
      else if (op === 'block') { if (text.length < 5) bad('Say what is blocking the work.'); addComment(r, u, text, 'blocked'); setStatus(r, 'Blocked', u); r.hist.push(['Blocked: ' + text.slice(0, 120), t, u.name]); notifyRole('admin', `${r.id} is blocked: ${text.slice(0, 80)}`) }
      else if (op === 'progress') { const p = pct(d.value); r.progress = p; if (p > 0 && ['Submitted', 'Under review', 'Assigned', 'Accepted', 'Reopened', 'Blocked'].includes(r.status)) setStatus(r, 'In progress', u); r.hist.push([`Progress ${p}%`, t, u.name]); if (text) addComment(r, u, text, 'progress') }
      else if (op === 'comment') { if (text.length < 2) bad('Write a note first.'); addComment(r, u, text, 'work'); if (r.uid && r.uid !== u.id && db.users[r.uid]) note(r.uid, `New update on ${r.title} from the maintenance team`) }
      else if (op === 'complete') { if (text.length < 5) bad('Describe what was done (at least a few words).'); r.completion = { note: text, t, by: u.name }; r.progress = 100; addComment(r, u, text, 'completion'); setStatus(r, 'Awaiting verification', u); }
      else if (op === 'reassign') { if (text.length < 5) bad('Tell the administrator why you need to be reassigned.'); r.reassignReq = { by: u.name, reason: text, t }; r.hist.push(['Reassignment requested: ' + text.slice(0, 120), t, u.name]); notifyRole('admin', `${u.name} asked to be reassigned from ${r.id}: ${text.slice(0, 80)}`) }
      else bad('Unknown task action.');
      r.upd = now(); audit(u, `${r.id}: task ${op}`); return { ok: 1 };
    },
    verify(u, d) {
      const r = find(d.id); if (!r) bad('Complaint not found.', 404); if (!(isAdmin(u) || r.uid === u.id)) bad('Only the person who reported it can verify.', 403);
      if (r.status !== 'Awaiting verification') bad('This complaint is not waiting for verification.');
      const ok = d.ok === true || d.ok === 'true', text = clean(d.text, 400);
      if (ok) { setStatus(r, 'Resolved', u); r.hist.push([isAdmin(u) && r.uid !== u.id ? 'Fix verified by administrator' : 'Fix verified by the reporter', now(), u.name]); const s = staffOf(r.as); if (s) note(s.id, `${r.id} was verified as fixed. Thank you.`) }
      else { if (text.length < 3) bad('Tell us what is still wrong.'); addComment(r, u, text, 'reopen'); setStatus(r, 'Reopened', u); r.progress = 0; const s = staffOf(r.as); if (s) note(s.id, `${r.id} was reopened: ${text.slice(0, 80)}`); notifyRole('admin', `${r.id} failed verification and was reopened`) }
      r.upd = now(); return { ok: 1 };
    },
    beforePhoto(u, d) { const r = find(d.id); if (!r) bad('Complaint not found.', 404); if (!mayWork(u, r)) bad('Not allowed.', 403); fs.writeFileSync(path.join(UP, r.id + '-before.jpg'), jpeg(d.photo)); r.before = true; r.upd = now(); r.hist.push(['Before photo added', r.upd, u.name]); return { ok: 1 } },
    usePart(u, d) {
      const r = find(d.id); if (!r) bad('Complaint not found.', 404); if (!mayWork(u, r)) bad('Not allowed.', 403); if (!open1(r)) bad('This complaint is already closed.');
      const it = db.inv.items.find(x => x.id === String(d.item)), n = +d.qty; if (!it) bad('Choose a part from the stock list.'); if (!Number.isInteger(n) || n < 1) bad('Enter how many were used.'); if (n > it.qty) bad(`Only ${it.qty} ${it.unit} of ${it.name} in stock.`);
      const before = it.qty; it.qty -= n; const t = now(), cost = r1(n * it.cost);
      db.inv.moves.unshift({ t, item: it.id, name: it.name, delta: -n, reason: 'Used on ' + r.id, reportId: r.id, by: u.name }); db.inv.moves.length = Math.min(db.inv.moves.length, 400);
      (r.parts = r.parts || []).push({ item: it.id, name: it.name, qty: n, unit: it.unit, cost, by: u.name, t }); r.hist.push([`Part used: ${n} x ${it.name}`, t, u.name]); lowCheck(it, before); audit(u, `${r.id}: used ${n} ${it.unit} ${it.name}`); return { ok: 1 };
    },
    groupIncident(u, d) {
      admin(u); const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map(String))]; if (ids.length < 2 || ids.length > 20) bad('Choose 2 to 20 complaints to group.');
      const rs = ids.map(find); if (rs.some(r => !r)) bad('One of those complaints does not exist.'); if (rs.some(r => r.incident)) bad('One of those complaints is already part of an incident.');
      const id = 'INC-' + (++db.incSeq), title = clean(d.title, 100) || `${rs[0].cat} issue at ${rs[0].bld}`;
      db.incidents.unshift({ id, title, ids, created: now(), by: u.name }); rs.forEach(r => { r.incident = id; r.hist.push([`Grouped into incident ${id} with ${ids.filter(x => x !== r.id).join(', ')}`, now(), u.name]) }); audit(u, `grouped ${ids.join(', ')} into ${id}`); return { ok: 1, id };
    },
    ungroupIncident(u, d) { admin(u); const i = db.incidents.findIndex(x => x.id === String(d.id)); if (i < 0) bad('Incident not found.', 404); const [x] = db.incidents.splice(i, 1); x.ids.forEach(id => { const r = find(id); if (r) { delete r.incident; r.hist.push([`Removed from incident ${x.id}`, now(), u.name]) } }); audit(u, `removed incident ${x.id}`); return { ok: 1 } },

    /* ----- inventory ----- */
    invSave(u, d) {
      admin(u); const name = clean(d.name, 60), unit = clean(d.unit, 12) || 'pcs', min = +d.min || 0, cost = +d.cost || 0, cat = CATS.includes(d.cat) ? d.cat : '', loc = clean(d.loc, 60);
      if (name.length < 2) bad('Enter the item name.'); if (!Number.isInteger(min) || min < 0) bad('Minimum stock must be a whole number.'); if (!(cost >= 0)) bad('Unit cost cannot be negative.');
      let it = d.id && db.inv.items.find(x => x.id === String(d.id));
      if (d.id && !it) bad('Item not found.', 404);
      if (!it) { const q = +d.qty || 0; if (!Number.isInteger(q) || q < 0) bad('Starting quantity must be a whole number.'); if (db.inv.items.some(x => x.name.toLowerCase() === name.toLowerCase())) bad('That item already exists.'); it = { id: 'ITM-' + (++db.inv.seq), qty: q }; db.inv.items.push(it); if (q) db.inv.moves.unshift({ t: now(), item: it.id, name, delta: q, reason: 'Opening stock', by: u.name }) }
      Object.assign(it, { name, unit, min, cost, cat, loc }); audit(u, `saved inventory item ${name}`); return { ok: 1 };
    },
    invAdjust(u, d) {
      admin(u); const it = db.inv.items.find(x => x.id === String(d.id)), n = +d.delta; if (!it) bad('Item not found.', 404); if (!Number.isInteger(n) || n === 0) bad('Enter a whole number to add (or a negative number to remove).'); if (it.qty + n < 0) bad('Stock cannot go below zero.');
      const before = it.qty; it.qty += n; db.inv.moves.unshift({ t: now(), item: it.id, name: it.name, delta: n, reason: clean(d.reason, 80) || (n > 0 ? 'Restock' : 'Adjustment'), by: u.name }); db.inv.moves.length = Math.min(db.inv.moves.length, 400); lowCheck(it, before); audit(u, `${n > 0 ? 'added' : 'removed'} ${Math.abs(n)} ${it.unit} ${it.name}`); return { ok: 1 };
    },
    invDelete(u, d) { admin(u); const i = db.inv.items.findIndex(x => x.id === String(d.id)); if (i < 0) bad('Item not found.', 404); const [it] = db.inv.items.splice(i, 1); audit(u, `deleted inventory item ${it.name}`); return { ok: 1 } },
    woSave(u, d) {
      admin(u); const title = clean(d.title, 100), asset = clean(d.asset, 80), cat = CATS.includes(d.cat) ? d.cat : '', bld = BLD[d.bld] ? d.bld : '', room = clean(d.room, 40), by = clean(d.assignedTo, 40), notes = clean(d.notes, 400), rep = clean(d.reportId, 20);
      if (title.length < 3) bad('Give the work order a title.'); if (by && !staffOf(by)) bad('Choose a staff member from the list.'); if (rep && !find(rep)) bad('That complaint ID does not exist.');
      const due = d.due ? Date.parse(d.due + 'T23:59:59') : 0; if (d.due && isNaN(due)) bad('Enter a valid date.');
      let w = d.id && db.inv.orders.find(x => x.id === String(d.id)); if (d.id && !w) bad('Work order not found.', 404);
      if (!w) { w = { id: 'WO-' + (++db.inv.wo + 100), status: 'Open', created: now(), by: u.name, cost: 0 }; db.inv.orders.unshift(w) }
      Object.assign(w, { title, asset, cat, bld, room, assignedTo: by, notes, reportId: rep, due }); if (by) { const s = staffOf(by); s && note(s.id, `New work order ${w.id}: ${title}`) } audit(u, `saved work order ${w.id}`); return { ok: 1, id: w.id };
    },
    woStatus(u, d) {
      const w = db.inv.orders.find(x => x.id === String(d.id)); if (!w) bad('Work order not found.', 404); if (!(isAdmin(u) || (MOD(u) && w.assignedTo === u.name))) bad('Not allowed.', 403);
      const s = String(d.status); if (!['Open', 'In progress', 'Done', 'Cancelled'].includes(s)) bad('Invalid status.');
      if (d.cost !== undefined && d.cost !== '') { const c = +d.cost; if (!(c >= 0)) bad('Repair cost cannot be negative.'); w.cost = r1(c) }
      if (d.notes) w.notes = clean(d.notes, 400); w.status = s; if (s === 'Done') w.done = now(); else delete w.done; audit(u, `work order ${w.id} is now ${s}`); return { ok: 1 };
    },
    woDelete(u, d) { admin(u); const i = db.inv.orders.findIndex(x => x.id === String(d.id)); if (i < 0) bad('Work order not found.', 404); db.inv.orders.splice(i, 1); return { ok: 1 } }
  };

  /* seed a few example stock items on a demo install (editable; NO_DEMO=1 skips) */
  if (!db.inv.seeded && !db.inv.items.length && process.env.NO_DEMO !== '1') {
    [['LED tube light 18W', 'pcs', 24, 10, 180, 'Electrical'], ['Switch / socket', 'pcs', 12, 5, 95, 'Electrical'], ['PVC pipe 1/2 in', 'm', 30, 10, 60, 'Plumbing'], ['Tap / faucet', 'pcs', 6, 4, 250, 'Plumbing'], ['Washer set', 'sets', 3, 5, 40, 'Plumbing'], ['Floor cleaner', 'l', 20, 8, 120, 'Cleanliness'], ['Door lock', 'pcs', 4, 2, 450, 'Safety']]
      .forEach(([name, unit, qty, min, cost, cat]) => db.inv.items.push({ id: 'ITM-' + (++db.inv.seq), name, unit, qty, min, cost, cat, loc: 'Main store' }));
  }
  db.inv.seeded = true;

  /* ================= state, http, tick ================= */
  function state(u) {
    const out = {};
    if (isAdmin(u)) {
      out.inv = { items: db.inv.items, moves: db.inv.moves.slice(0, 100), orders: db.inv.orders, currency: CUR };
      out.incidents = db.incidents.slice(0, 50); out.staffList = Object.values(db.users).filter(x => MOD(x)).map(x => ({ name: x.name, team: teamOf(x) }));
    } else if (MOD(u)) out.inv = { items: db.inv.items.map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, min: i.min })), orders: db.inv.orders.filter(w => w.assignedTo === u.name), moves: [], currency: CUR };
    return out;
  }
  async function http(req, res, u, UO, p) {
    if (req.method !== 'GET') return false;
    const J = (c, o) => (C.json(res, c, o), true), q = Object.fromEntries(UO.searchParams);
    if (p === '/api/suggest') { if (!u) return J(401, { error: 'Please log in.' }); return J(200, classify(clean(q.text, 800))) }
    if (p === '/api/analytics') { if (!u || !isAdmin(u)) return J(403, { error: 'Admins only.' }); return J(200, analytics(q)) }
    if (p === '/api/intel') { if (!u || !isAdmin(u)) return J(403, { error: 'Admins only.' }); return J(200, intel()) }
    return false;
  }
  function tick() { // reporters who never answer: close after 7 days awaiting verification
    const t = now();
    db.reports.forEach(r => { if (r.status !== 'Awaiting verification') return; const h = [...r.hist].reverse().find(x => x[0] === 'Awaiting verification' || /^Awaiting verification/.test(x[0])); if (!h || t - h[1] < 7 * DAYMS) return;
      wfStatus(r, 'Resolved', 'Resolved automatically: no reply from the reporter for 7 days'); if (r.uid && db.users[r.uid]) note(r.uid, `${r.id} was closed automatically because the fix was not disputed for 7 days. You can reopen it if the problem is back.`); const s = staffOf(r.as); s && note(s.id, `${r.id} was closed (no objection from the reporter).`) });
  }

  return { actions, http, state, tick, api: { classify, intel, analytics, dups, rootCauses, predictions, recommendations }, docs: { 'GET /api/intel': 'admin: duplicates, root causes, predictions, recommendations', 'GET /api/analytics?from=&to=&cat=&bld=': 'admin: filtered analytics', 'GET /api/suggest?text=': 'suggest category, priority and team for a description', 'POST /api/act staffTask verify beforePhoto usePart groupIncident ungroupIncident invSave invAdjust invDelete woSave woStatus woDelete': 'staff workspace, verification, inventory' } };
};
