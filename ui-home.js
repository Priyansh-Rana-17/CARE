/* CARE frontend: (1) the three summary cards at the top of the student / staff Overview,
   (2) for staff members (role "staff"): "My reports" becomes "Assigned reports" = complaints whose "Assigned to" is that person.
   (Cards:
   (Your impact, Campus health, Community). Numbers come from S.home, which home.js adds to the state.
   It does not change any existing function: it only puts the cards in front of the existing Overview. Loaded after ui-care.js.) */
(function () {
  const css = () => {
    if (document.getElementById('homecss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="homecss">
.hm-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.hm-c{position:relative;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:92px;padding:14px 18px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}
.hm-c .t{font-size:13px;color:var(--mut)}.hm-c .v{font-size:24px;line-height:1.15;font-weight:400;margin:1px 0;color:var(--ink)}.hm-c .s{font-size:12.5px;color:var(--mut)}.hm-c .s.g{color:var(--teal);font-weight:500}.hm-c .s.w{color:#b9770e;font-weight:500}
.hm-bars{display:flex;align-items:flex-end;gap:4px;height:44px;flex:none}.hm-bars i{display:block;width:9px;border-radius:5px;background:color-mix(in srgb,var(--pri) 22%,transparent)}.hm-bars i.on{background:var(--pri)}
.hm-ring{position:relative;width:58px;height:58px;flex:none}.hm-ring svg{width:58px;height:58px;transform:rotate(-90deg)}.hm-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px;font-weight:500}
@media(max-width:900px){.hm-cards{grid-template-columns:1fr}}
</style>`);
  };
  function cards() {
    const h = S.home; if (!h) return '';
    css();
    const w = h.impact.week, mx = Math.max(1, ...w), n = h.impact.total, p = h.health.pct;
    const label = p >= 70 ? 'Healthy' : p >= 40 ? 'Doing okay' : 'Needs attention', warn = p < 40;
    const R = 24, L = 2 * Math.PI * R, col = p >= 70 ? '#19b98a' : p >= 40 ? '#e29b2d' : '#19b98a';
    const ppl = h.community.people;
    return `<div class="hm-cards" role="group" aria-label="Your summary">
<div class="hm-c"><div><div class="t">Your impact</div><div class="v">${n}</div><div class="s">${n === 1 ? 'issue' : 'issues'} reported · last 7 days</div></div>
  <div class="hm-bars" role="img" aria-label="Reports per day, last 7 days: ${w.join(', ')}">${w.map(c => `<i class="${c ? 'on' : ''}" style="height:${c ? Math.max(14, Math.round(c / mx * 44)) : 8}px"></i>`).join('')}</div></div>
<div class="hm-c"><div><div class="t">Campus health</div><div class="v">${label}</div><div class="s ${warn ? 'w' : 'g'}">${h.health.open} open right now</div></div>
  <div class="hm-ring" role="img" aria-label="${p}% of campus issues resolved"><svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="${R}" fill="none" stroke="color-mix(in srgb,#19b98a 22%,transparent)" stroke-width="5"/><circle cx="29" cy="29" r="${R}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(L * p / 100).toFixed(1)} ${L.toFixed(1)}"/></svg><b>${p}%</b></div></div>
<div class="hm-c"><div><div class="t">Community</div><div class="v">${ppl} ${ppl === 1 ? 'person' : 'people'}</div><div class="s">backed a report with “Me too”</div></div></div>
</div>`;
  }
  const s1 = window.student;
  if (typeof s1 === 'function') window.student = () => cards() + s1();
  /* ---------- staff members: "My reports" -> "Assigned reports" ----------
     Students keep "My reports" exactly as before. For a staff member the same pages are drawn, but with the complaints
     that are assigned to them (the "Assigned to" name) in place of the ones they reported themselves. The original
     functions are not edited: while the page is drawn, each complaint is marked as "mine" when it is assigned to this person. */
  const staffMember = () => typeof S !== 'undefined' && S && S.role === 'staff' && typeof U !== 'undefined' && U;
  if (typeof NAVS !== 'undefined' && NAVS.student) NAVS.staff = NAVS.student.map(n => n && n[0] === 'reports' ? [n[0], n[1], 'Assigned reports'] : n);
  const WORDS = { 'My reports': 'Assigned reports', 'Your activity': 'Assigned to you', 'No reports yet. Tap “Report an issue” to start.': 'No reports are assigned to you yet.', 'No reports yet.': 'No reports are assigned to you yet.' };
  function staffWords() {
    const m = document.getElementById('main'); if (!m) return;
    const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (WORDS[t]) n.nodeValue = n.nodeValue.replace(t, WORDS[t]) }
    /* the delete button is for complaints you reported yourself; assigned complaints are not yours to delete */
    m.querySelectorAll('button').forEach(b => { if (b.textContent.trim() === 'Delete this report') { const p = b.parentElement; if (p && p.children.length === 1) p.remove(); else b.remove() } });
  }
  const r1 = window.render;
  window.render = () => {
    /* administrators: staff-member names join the "Assigned to" list */
    if (typeof S !== 'undefined' && S && S.role === 'admin' && S.home && S.home.staffMembers && typeof TEAM !== 'undefined') S.home.staffMembers.forEach(n => { if (!TEAM.includes(n)) TEAM.push(n) });
    if (!staffMember()) return r1();
    const all = S.reports;
    S.reports = all.map(r => ({ ...r, by: r.as === U.name ? 'me' : 'other' }));
    try { r1() } finally { S.reports = all }
    staffWords();
  };
})();
