'use strict';
/* CARE: home-page numbers for students and staff members (the three cards at the top of the Overview).
   Read only: it never changes data. Everything is counted from the live complaint list.
   - impact:    how many issues this person reported on each of the last 7 days
   - health:    share of campus complaints that are resolved, and how many are open right now
   - community: how many other people backed this person's reports with "Me too" */
module.exports = function (C) {
  const { db, now, open1 } = C, DAY = C.DAYMS || 864e5;
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() };
  /* Staff-member accounts can be given complaints: their names are added to the list of people a complaint can be assigned to
     (the list the server already checks when an administrator assigns a complaint). Nothing is removed from that list. */
  const syncTeam = () => Object.values(db.users).forEach(x => { if (x.role === 'staff' && !C.TEAM.includes(x.name)) C.TEAM.push(x.name) });
  syncTeam();
  const state = u => {
    syncTeam();
    if (u.role === 'admin') return { home: { staffMembers: Object.values(db.users).filter(x => x.role === 'staff').map(x => x.name) } };
    if (!['student', 'staff'].includes(u.role)) return {};
    const t = now(), d0 = dayStart(t), mine = db.reports.filter(r => r.uid === u.id);
    const week = [0, 0, 0, 0, 0, 0, 0];
    mine.forEach(r => { const ago = Math.round((d0 - dayStart(r.created || r.upd || t)) / DAY); if (ago >= 0 && ago <= 6) week[6 - ago]++ });
    const valid = db.reports.filter(r => !['duplicate', 'fake'].includes(r.mod) && r.status !== 'Withdrawn');
    const open = valid.filter(open1).length, resolved = valid.filter(r => r.status === 'Resolved').length;
    const backers = new Set(); let backs = 0;
    mine.forEach(r => (r.meBy || []).forEach(id => { if (id !== u.id) { backers.add(id); backs++ } }));
    return { home: { impact: { week, total: week.reduce((a, b) => a + b, 0) }, health: { open, resolved, total: valid.length, pct: valid.length ? Math.round(resolved / valid.length * 100) : 100 }, community: { people: backers.size, backs } } };
  };
  return { state, tick: syncTeam, docs: { 'GET /api/state (home)': 'adds "home": impact (reports per day, last 7 days), health (open / resolved share) and community (Me too backers) for students and staff members' } };
};
