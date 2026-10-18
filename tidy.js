'use strict';
/* CARE: deleting things. One module for every "delete" in the app so the rules are in one place:
   - every delete is checked on the server (the buttons only hide what you may not do)
   - nothing is deleted silently: each delete is written to the audit log (the audit log itself cannot be deleted)
   - things that others depend on are protected (open SOS requests, the last administrator, your own account) */
module.exports = function (C) {
  const { db, now, bad, clean, audit, fs, path, UP, find, open1 } = C, R = () => C.reports.api, G = () => C.google.api;
  const adm = u => { if (u.role !== 'admin') bad('Only an administrator can do this.', 403) };
  const ids = d => [...new Set((Array.isArray(d.ids) ? d.ids : [d.id]).map(x => String(x || '')).filter(Boolean))].slice(0, 200);
  const rm = f => { try { fs.unlinkSync(f) } catch (e) { } };

  /* ---------- complaints ---------- */
  function dropComplaint(r) {
    try { C.unscore && C.unscore(r) } catch (e) { }
    ['', '-after', '-before'].forEach(x => rm(path.join(UP, r.id + x + '.jpg')));
    db.reports.splice(db.reports.indexOf(r), 1);
    (db.incidents || []).slice().forEach(x => { if (!x.ids.includes(r.id)) return; x.ids = x.ids.filter(i => i !== r.id);
      if (x.ids.length < 2) { x.ids.forEach(i => { const o = find(i); if (o) delete o.incident }); db.incidents.splice(db.incidents.indexOf(x), 1) } });
  }
  const mayDelete = (u, r) => u.role === 'admin' || (['student', 'staff'].includes(u.role) && r.uid === u.id && ['Submitted', 'Under review', 'Assigned', 'Withdrawn'].includes(r.status) && !(r.comments || []).length && !r.progress);
  const actions = {
    deleteComplaints(u, d) {
      const list = ids(d); if (!list.length) bad('Choose what to delete.');
      const rs = list.map(find).filter(Boolean); if (!rs.length) bad('Complaint not found.', 404);
      rs.forEach(r => { if (!mayDelete(u, r)) bad(u.role === 'admin' ? 'Not allowed.' : `${r.id} cannot be deleted any more because work on it has started. Ask an administrator.`, 403) });
      rs.forEach(r => { audit(u, `deleted complaint ${r.id} "${String(r.title).slice(0, 60)}"`); dropComplaint(r) });
      return { ok: 1, deleted: rs.length };
    },
    /* one note, comment or photo inside a complaint */
    deleteComplaintItem(u, d) {
      adm(u); const r = find(d.id); if (!r) bad('Complaint not found.', 404); const k = String(d.kind), i = +d.i;
      if (k === 'inotes' || k === 'comments') { const a = r[k] || []; if (!Number.isInteger(i) || i < 0 || i >= a.length) bad('That entry no longer exists.', 404); a.splice(i, 1); audit(u, `${r.id}: removed a ${k === 'inotes' ? 'internal note' : 'staff comment'}`) }
      else if (['photo', 'before', 'after'].includes(k)) { if (!r[k]) bad('There is no such photo.', 404); rm(path.join(UP, r.id + (k === 'after' ? '-after' : k === 'before' ? '-before' : '') + '.jpg')); r[k] = false; r.hist.push([`${k === 'photo' ? 'Reporter photo' : k === 'after' ? 'Fix photo' : 'Before photo'} removed`, now(), u.name]); r.upd = now(); audit(u, `${r.id}: removed the ${k} photo`) }
      else bad('Unknown item.');
      return { ok: 1 };
    },
    /* ---------- notifications (each person's own) ---------- */
    deleteNotes(u, d) {
      const a = db.notes[u.id] || [];
      if (d.all) db.notes[u.id] = []; else if (d.readOnly) db.notes[u.id] = a.filter(n => !n.read); else { const i = a.findIndex(n => n.ts === +d.ts && (d.t == null || n.t === String(d.t))); if (i < 0) bad('That notification is already gone.', 404); a.splice(i, 1) }
      return { ok: 1 };
    },
    /* ---------- SOS history: finished requests only ---------- */
    deleteSos(u, d) {
      if (!['admin', 'responder', 'student', 'staff'].includes(u.role)) bad('Not allowed.', 403);
      let list; if (d.resolved) { adm(u); const days = Math.max(0, +d.olderDays || 0); list = db.sos.filter(s => s.status === 'Resolved' && now() - (s.t || 0) >= days * 864e5) } else list = ids(d).map(i => db.sos.find(s => s.id === i)).filter(Boolean);
      if (!list.length) return { ok: 1, deleted: 0 };
      list.forEach(s => { if (s.status !== 'Resolved') bad(`${s.id} is still active. Record the outcome first, then it can be deleted.`); if (u.role !== 'admin' && s.uid !== u.id) bad('You can only delete your own SOS history.', 403) });
      list.forEach(s => db.sos.splice(db.sos.indexOf(s), 1)); audit(u, `deleted ${list.length} finished SOS record${list.length === 1 ? '' : 's'}`); return { ok: 1, deleted: list.length };
    },
    /* ---------- workflow run history and recurring-issue findings ---------- */
    deleteRuns(u, d) {
      adm(u); const before = db.wfLogs.length;
      if (d.all) db.wfLogs = []; else if (d.failedOnly) db.wfLogs = db.wfLogs.filter(x => x.success); else if (+d.olderDays > 0) db.wfLogs = db.wfLogs.filter(x => now() - x.t < +d.olderDays * 864e5); else { const s = new Set(ids(d)); if (!s.size) bad('Choose what to delete.'); db.wfLogs = db.wfLogs.filter(x => !s.has(x.id)) }
      const n = before - db.wfLogs.length; audit(u, `deleted ${n} workflow run record${n === 1 ? '' : 's'}`); return { ok: 1, deleted: n };
    },
    deleteInsight(u, d) {
      adm(u); const b = db.insights.length; db.insights = d.all ? [] : db.insights.filter(x => x.t !== +d.t); const n = b - db.insights.length; if (!n) bad('Not found.', 404); audit(u, `deleted ${n} recurring-issue finding${n === 1 ? '' : 's'}`); return { ok: 1, deleted: n };
    },
    /* ---------- accounts ---------- */
    deleteUser(u, d) {
      adm(u); const x = db.users[String(d.id)]; if (!x) bad('Account not found.', 404);
      if (x.id === u.id) bad('You cannot delete your own account while you are signed in with it.');
      if (x.role === 'admin' && Object.values(db.users).filter(y => y.role === 'admin').length < 2) bad('This is the only administrator. Make someone else an administrator first.');
      let reports = 0, unassigned = 0;
      db.reports.slice().forEach(r => {
        if (r.uid === x.id) { if (d.withReports) { dropComplaint(r); reports++ } else r.repName = x.name + ' (account deleted)' }
        else if (x.role === 'maintenance' && r.as === x.name && open1(r)) { r.as = 'Unassigned'; r.upd = now(); r.hist.push([`Unassigned (the account of ${x.name} was removed)`, r.upd, u.name]); unassigned++ } });
      db.sos = db.sos.filter(s => !(s.uid === x.id && s.status === 'Resolved'));
      delete db.notes[x.id]; delete db.users[x.id];   /* their login sessions stop working at once: the server looks the account up on every request */
      audit(u, `deleted account ${x.email}${reports ? ` and ${reports} of their complaints` : ''}${unassigned ? `; ${unassigned} open complaints are now unassigned` : ''}`);
      return { ok: 1, reports, unassigned };
    },
    /* ---------- report library ---------- */
    async deleteReports(u, d) {
      adm(u); const list = ids(d).map(i => R().entryOf(i)).filter(Boolean); if (!list.length) bad('Report not found.', 404);
      let trashed = 0; const warnings = [];
      if (d.trashGoogle) for (const e of list) { try { const t = await G().trashFiles(e); trashed += t.n; warnings.push(...t.warn) } catch (x) { warnings.push(`${e.id}: Google files were not moved to the trash (${x.m || x.message})`) } }
      list.forEach(e => { db.studio.reports.splice(db.studio.reports.indexOf(e), 1); rm(path.join(C.DD, 'reports', e.id + '.json')) });
      audit(u, `deleted ${list.length} report${list.length === 1 ? '' : 's'} (${list.map(e => e.id).join(', ')})${trashed ? `; ${trashed} Google file${trashed === 1 ? '' : 's'} moved to the Drive trash` : ''}`);
      return { ok: 1, deleted: list.length, trashed, warnings };
    },
    deleteMail(u, d) {
      adm(u); const e = R().entryOf(String(d.id)); if (!e) bad('Report not found.', 404);
      const b = (e.mails || []).length; e.mails = d.all ? [] : (e.mails || []).filter(m => m.id !== String(d.mailId)); if (b === e.mails.length) bad('Not found.', 404);
      audit(u, `removed ${b - e.mails.length} sent-email record${b - e.mails.length === 1 ? '' : 's'} of ${e.id}`); return { ok: 1, entry: R().meta(e) };
    }
  };
  return { actions, docs: { 'POST /api/act deleteComplaints deleteComplaintItem deleteNotes deleteSos deleteRuns deleteInsight deleteUser deleteReports deleteMail': 'delete things (rules are enforced on the server and every delete is written to the audit log)' } };
};
