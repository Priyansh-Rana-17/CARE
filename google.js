'use strict';
/* CARE: Google Workspace integration (official Google Docs, Sheets, Drive and Gmail REST APIs, OAuth 2.0).
   Gmail: reports (PDF/CSV), Google Doc/Sheet links and any file you attach can be emailed from the connected Google account.
   Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README). Until then the Integrations page shows "Setup required"
   and every Google action fails with a clear message instead of pretending to succeed. */
module.exports = function (C) {
  const { db, now, bad, clean, crypto, audit } = C, env = process.env, R = () => C.reports;
  db.google = db.google || {};
  const MOCK = env.CARE_GOOGLE_MOCK ? env.CARE_GOOGLE_MOCK.replace(/\/$/, '') : '';   // test hook: point every Google host at a local fake
  const HOST = { token: MOCK ? MOCK + '/token' : 'https://oauth2.googleapis.com/token', revoke: MOCK ? MOCK + '/revoke' : 'https://oauth2.googleapis.com/revoke', docs: MOCK || 'https://docs.googleapis.com', sheets: MOCK || 'https://sheets.googleapis.com', api: MOCK || 'https://www.googleapis.com', gmail: MOCK || 'https://gmail.googleapis.com', auth: 'https://accounts.google.com/o/oauth2/v2/auth' };
  const SCOPES = ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];
  const FOLDER = env.GOOGLE_DRIVE_FOLDER_NAME || 'CARE Reports';
  const canEmail = () => !!db.google.refresh && /gmail\.send/.test(db.google.scope || '');
  const MAXHR = Math.max(1, +env.GMAIL_MAX_PER_HOUR || 30), DOMAINS = String(env.GMAIL_ALLOWED_DOMAINS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  const configured = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const baseUrl = req => env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, '') : ((req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host);
  const redirectUri = req => env.GOOGLE_REDIRECT_URI || baseUrl(req) + '/api/google/callback';
  const status = req => ({ configured: configured(), connected: !!db.google.refresh, email: db.google.email || '', folder: db.google.folderId ? FOLDER : '', folderUrl: db.google.folderId ? 'https://drive.google.com/drive/folders/' + db.google.folderId : '', connectedAt: db.google.connectedAt || 0, lastError: db.google.lastError || '', canEmail: canEmail(), needsReconnect: !!db.google.refresh && !canEmail(), mailLimit: MAXHR, allowedDomains: DOMAINS, redirectUri: req ? redirectUri(req) : '', scopes: SCOPES.filter(s => s.startsWith('https')).map(s => s.split('/').pop()) });
  const notReady = () => { if (!configured()) bad('Google is not set up yet. An administrator must add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see Integrations for the steps).', 400); if (!db.google.refresh) bad('Google is not connected. Open Integrations and click "Connect Google".', 400) };

  /* ---------- tokens ---------- */
  let tok = { v: '', exp: 0 };
  async function access() {
    notReady();
    if (tok.v && tok.exp > now() + 30000) return tok.v;
    const r = await fetch(HOST.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: db.google.refresh, grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant') { db.google.refresh = ''; db.google.lastError = 'Google access was revoked or expired. Connect again.'; C.save(); bad('Google access expired or was revoked. Open Integrations and connect Google again.', 400) }
      bad('Google sign-in failed: ' + (j.error_description || j.error || r.status), 502);
    }
    tok = { v: j.access_token, exp: now() + (j.expires_in || 3600) * 1000 };
    return tok.v;
  }
  async function g(url, o = {}) {
    const t = await access(), h = { Authorization: 'Bearer ' + t, ...(o.headers || {}) };
    if (o.json) { h['content-type'] = 'application/json'; o.body = JSON.stringify(o.json) }
    const r = await fetch(url, { method: o.method || (o.body ? 'POST' : 'GET'), headers: h, body: o.body, signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.error && (j.error.message || j.error)) || r.statusText; bad(`Google API error (${r.status}): ${m}`, 502) }
    return j;
  }

  /* ---------- Drive ---------- */
  async function folder() {
    if (db.google.folderId) { try { const f = await g(`${HOST.api}/drive/v3/files/${db.google.folderId}?fields=id,trashed`); if (!f.trashed) return db.google.folderId } catch (e) { } }
    const q = encodeURIComponent(`name='${FOLDER.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const l = await g(`${HOST.api}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
    const f = l.files && l.files[0] ? l.files[0] : await g(`${HOST.api}/drive/v3/files?fields=id,name`, { json: { name: FOLDER, mimeType: 'application/vnd.google-apps.folder' } });
    db.google.folderId = f.id; C.save(); return f.id;
  }
  async function moveInto(fileId, folderId) {
    const f = await g(`${HOST.api}/drive/v3/files/${fileId}?fields=parents`), old = (f.parents || []).filter(x => x !== folderId);
    if ((f.parents || []).includes(folderId) && !old.length) return;
    await g(`${HOST.api}/drive/v3/files/${fileId}?addParents=${folderId}${old.length ? '&removeParents=' + old.join(',') : ''}&fields=id,parents`, { method: 'PATCH', json: {} });
  }
  async function upload(name, mime, buf, folderId) {
    const b = 'care' + crypto.randomBytes(8).toString('hex'), meta = JSON.stringify({ name, parents: [folderId] });
    const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--`)]);
    return g(`${HOST.api}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`, { body, headers: { 'content-type': 'multipart/related; boundary=' + b } });
  }

  /* ---------- Google Doc ---------- */
  function docText(rep) {
    const parts = []; // [text, style]
    const P = (t, s = 'NORMAL') => parts.push([String(t ?? '') + '\n', s]);
    P(rep.title, 'TITLE'); P(`Period: ${rep.period.label}`); P(`Generated: ${new Date(rep.generatedAt).toLocaleString()} by ${rep.generatedBy}`);
    const fl = Object.entries(rep.filters).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join('; '); if (fl) P('Filters: ' + fl);
    P('Key figures', 'HEADING_1'); rep.kpis.forEach(k => P(`${k[0]}: ${k[1]}`));
    if (rep.narrative && rep.narrative.summary) { P('AI-generated summary', 'HEADING_1'); P('Written by an AI model from this report\u2019s figures. Check it before relying on it.'); P(rep.narrative.summary); (rep.narrative.recommendations || []).forEach(x => P('\u2022 ' + x)) }
    P('Findings from the data', 'HEADING_1'); rep.findings.forEach(x => P('\u2022 ' + x));
    if (rep.suggestions.length) { P('Suggested actions (rule-based)', 'HEADING_1'); rep.suggestions.forEach(x => P(`\u2022 ${x.text} (based on: ${x.basis})`)) }
    rep.sections.forEach(s => {
      P(s.heading, 'HEADING_1'); if (s.note) P(s.note);
      if (!s.table.rows.length) { P('No data for these filters.'); return }
      P(s.table.cols.join('  |  '), 'TABLE_HEAD'); s.table.rows.slice(0, 40).forEach(r => P(r.join('  |  ')));
      if (s.table.rows.length > 40) P(`\u2026 ${s.table.rows.length - 40} more rows are in the Google Sheet or CSV export.`);
    });
    return parts;
  }
  async function createDoc(rep, title) {
    const doc = await g(`${HOST.docs}/v1/documents`, { json: { title: title || rep.title } }), parts = docText(rep);
    let text = '', idx = 1; const reqs = [];
    parts.forEach(([t, s]) => { const a = idx, b = idx + [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xffff ? 2 : 1), 0) ; text += t;
      if (['TITLE', 'HEADING_1'].includes(s)) reqs.push({ updateParagraphStyle: { range: { startIndex: a, endIndex: b }, paragraphStyle: { namedStyleType: s }, fields: 'namedStyleType' } });
      if (s === 'TABLE_HEAD') reqs.push({ updateTextStyle: { range: { startIndex: a, endIndex: b - 1 }, textStyle: { bold: true }, fields: 'bold' } });
      idx = b });
    await g(`${HOST.docs}/v1/documents/${doc.documentId}:batchUpdate`, { json: { requests: [{ insertText: { location: { index: 1 }, text } }, ...reqs] } });
    return { id: doc.documentId, url: `https://docs.google.com/document/d/${doc.documentId}/edit`, title: doc.title || title || rep.title };
  }

  /* ---------- Google Sheet ---------- */
  const sheetName = (s, used) => { let n = String(s).replace(/[\[\]:*?\/\\']/g, ' ').trim().slice(0, 28) || 'Sheet'; let k = n, i = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 25) + ' ' + i++; used.add(k.toLowerCase()); return k };
  async function createSheet(rep, title) {
    const used = new Set(), tabs = [];
    const sum = [[rep.title], ['Period', rep.period.label], ['Generated', new Date(rep.generatedAt).toLocaleString()], ...Object.entries(rep.filters).filter(([, v]) => v).map(([k, v]) => [k, v]), [], ['Key figures'], ...rep.kpis, [], ['Findings from the data'], ...rep.findings.map(x => [x])];
    if (rep.suggestions.length) sum.push([], ['Suggested actions (rule-based)'], ...rep.suggestions.map(x => [x.text, 'Based on: ' + x.basis]));
    if (rep.narrative && rep.narrative.summary) sum.push([], ['AI-generated summary (check before relying on it)'], [rep.narrative.summary], ...(rep.narrative.recommendations || []).map(x => ['\u2022 ' + x]));
    tabs.push({ name: sheetName('Summary', used), rows: sum, hdr: -1 });
    rep.sections.forEach(s => tabs.push({ name: sheetName(s.heading, used), rows: [[s.heading], [], s.table.cols, ...s.table.rows], hdr: 2, chart: s.chart && s.table.rows.length ? s.chart : null, n: s.table.rows.length }));
    if (rep.complaints.length) tabs.push({ name: sheetName('Complaints', used), rows: [['Complaints included in this report'], [], ['ID', 'Issue', 'Category', 'Location', 'Priority', 'Status', 'Assigned to', 'Reported', 'Deadline', 'Hours to resolve'], ...rep.complaints], hdr: 2 });
    const sp = await g(`${HOST.sheets}/v4/spreadsheets`, { json: { properties: { title: title || rep.title }, sheets: tabs.map(t => ({ properties: { title: t.name } })) } });
    await g(`${HOST.sheets}/v4/spreadsheets/${sp.spreadsheetId}/values:batchUpdate`, { json: { valueInputOption: 'RAW', data: tabs.map(t => ({ range: `'${t.name.replace(/'/g, "''")}'!A1`, values: t.rows.map(r => r.map(v => v ?? '')) })) } });
    const warn = [];
    try { // tidy-up: bold headers, widths, charts. Failure here never loses the data.
      const reqs = []; (sp.sheets || []).forEach((s, i) => { const t = tabs[i], id = s.properties.sheetId;
        if (t.hdr >= 0) reqs.push({ repeatCell: { range: { sheetId: id, startRowIndex: t.hdr, endRowIndex: t.hdr + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: .9, green: .93, blue: .98 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } });
        reqs.push({ repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat' } }, { autoResizeDimensions: { dimensions: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: Math.min(10, (t.rows[t.hdr >= 0 ? t.hdr : 0] || [1]).length) } } });
        if (t.chart) reqs.push({ addChart: { chart: { spec: { title: t.name, basicChart: { chartType: t.chart.kind === 'line' ? 'LINE' : 'COLUMN', legendPosition: 'NO_LEGEND', headerCount: 1, axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS', title: t.chart.unit || '' }],
          domains: [{ domain: { sourceRange: { sources: [{ sheetId: id, startRowIndex: 2, endRowIndex: 3 + t.n, startColumnIndex: t.chart.label, endColumnIndex: t.chart.label + 1 }] } } }],
          series: [{ series: { sourceRange: { sources: [{ sheetId: id, startRowIndex: 2, endRowIndex: 3 + t.n, startColumnIndex: t.chart.value, endColumnIndex: t.chart.value + 1 }] } }, targetAxis: 'LEFT_AXIS' }] } }, position: { overlayPosition: { anchorCell: { sheetId: id, rowIndex: 3 + t.n + 1, columnIndex: 0 }, widthPixels: 560, heightPixels: 300 } } } } }) });
      if (reqs.length) await g(`${HOST.sheets}/v4/spreadsheets/${sp.spreadsheetId}:batchUpdate`, { json: { requests: reqs } });
    } catch (e) { warn.push('Sheet created, but formatting and charts could not be added: ' + e.message) }
    return { id: sp.spreadsheetId, url: sp.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sp.spreadsheetId}/edit`, title: title || rep.title, warnings: warn };
  }

  /* ---------- high level: used by the UI, workflows and MCP tools ---------- */
  const need = (id) => { const e = R().api.entryOf(id), rep = e && R().api.readRep(id); if (!e || !rep) bad('Report not found: ' + id, 404); return { e, rep } };
  const ago = () => now();
  async function toDoc(id, title) { const { e, rep } = need(id); const d = await createDoc(rep, title); e.gdoc = { ...d, t: ago() }; C.save(); return e.gdoc }
  async function toSheet(id, title) { const { e, rep } = need(id); const s = await createSheet(rep, title); e.gsheet = { ...s, t: ago() }; C.save(); return e.gsheet }
  async function toDrive(id, o = {}) {
    const { e, rep } = need(id), fid = await folder(), files = [];
    if (e.gdoc) { await moveInto(e.gdoc.id, fid); files.push({ kind: 'Google Doc', name: e.gdoc.title, url: e.gdoc.url }) }
    if (e.gsheet) { await moveInto(e.gsheet.id, fid); files.push({ kind: 'Google Sheet', name: e.gsheet.title, url: e.gsheet.url }) }
    const base = R().api.san(e.title).replace(/[^\w.() -]+/g, '_').slice(0, 80) || e.id;
    if (o.pdf) { const f = await upload(base + '.pdf', 'application/pdf', R().api.pdf(rep), fid); files.push({ kind: 'PDF', name: f.name, url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` }) }
    if (o.csv) { const f = await upload(base + '.csv', 'text/csv', Buffer.from(R().api.csv(rep), 'utf8'), fid); files.push({ kind: 'CSV', name: f.name, url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` }) }
    if (!files.length) bad('Nothing to save yet. Create a Google Doc or Sheet first, or include the PDF or CSV.');
    e.drive = { folderId: fid, folderUrl: 'https://drive.google.com/drive/folders/' + fid, files: [...((e.drive && e.drive.files) || []).filter(x => !files.some(n => n.kind === x.kind)), ...files], t: ago() };
    C.save(); return e.drive;
  }


  /* ---------- Gmail: send reports and documents ---------- */
  const EMAIL = /^[^\s@<>(),;:"\\]{1,64}@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]{2,}$/;
  const hdr = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  const wrap = buf => (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString('base64').replace(/(.{76})/g, '$1\r\n');
  function encSubject(s) {   // RFC 2047, split so no encoded word exceeds the 75 character limit
    if (/^[\x20-\x7e]*$/.test(s)) return s;
    const words = []; let cur = '', n = 0;
    for (const ch of s) { const b = Buffer.byteLength(ch); if (n + b > 42) { words.push(cur); cur = ''; n = 0 } cur += ch; n += b }
    if (cur) words.push(cur);
    return words.map(w => '=?UTF-8?B?' + Buffer.from(w, 'utf8').toString('base64') + '?=').join('\r\n ');
  }
  const fname = n => { const x = String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/[^\x20-\x7e]/g, '_').trim().slice(0, 90); return x || 'file' };
  function addrs(v, label) {
    const a = (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(x => String(x).trim().toLowerCase()).filter(Boolean), u = a.filter((x, i) => a.indexOf(x) === i);
    u.forEach(x => { if (x.length > 254 || !EMAIL.test(x)) bad(`${label}: "${x.slice(0, 60)}" is not a valid email address.`) });
    if (DOMAINS.length) u.forEach(x => { if (!DOMAINS.includes(x.split('@')[1])) bad(`${x} is not allowed. This CARE server only sends email to: ${DOMAINS.join(', ')}.`, 403) });
    return u;
  }
  function mime({ to, cc, subject, text, files }) {
    const b = 'care_' + crypto.randomBytes(12).toString('hex');
    const head = [`To: ${to.join(', ')}`, cc.length ? `Cc: ${cc.join(', ')}` : '', `Subject: ${encSubject(hdr(subject))}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${b}"`].filter(Boolean).join('\r\n');
    let out = `${head}\r\n\r\n--${b}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(Buffer.from(text, 'utf8'))}\r\n`;
    files.forEach(f => { const n = fname(f.name); out += `--${b}\r\nContent-Type: ${f.mime || 'application/octet-stream'}; name="${n}"\r\nContent-Disposition: attachment; filename="${n}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(f.buf)}\r\n` });
    return Buffer.from(out + `--${b}--`, 'utf8');
  }
  function mailReady() { notReady(); if (!canEmail()) bad('CARE does not have permission to send email yet. Open Integrations, disconnect Google and connect it again, and keep the "Send email on your behalf" box ticked.', 400) }
  async function gmailSend(m) {
    mailReady();
    const hr = (db.google.sent = (db.google.sent || []).filter(t => now() - t < 36e5));
    if (hr.length >= MAXHR) bad(`Email limit reached (${MAXHR} per hour). Try again later.`, 429);
    const total = m.files.reduce((n, f) => n + f.buf.length, 0); if (total > 18e6) bad('The attachments are too large for one email (limit about 18 MB).');
    const raw = mime(m).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    let j; try { j = await g(`${HOST.gmail}/gmail/v1/users/me/messages/send`, { json: { raw } }) } catch (e) {
      const t = e.m || e.message || ''; if (/has not been used|disabled|accessNotConfigured/i.test(t)) bad('The Gmail API is not enabled in your Google Cloud project. Enable it (APIs & Services > Library > Gmail API) and try again.', 502);
      if (/insufficient|scope|forbidden|403/i.test(t)) bad('Google did not allow sending email. Disconnect Google in Integrations and connect again, keeping the email permission ticked.', 502); throw e }
    hr.push(now()); C.save(); return j;
  }
  const kpiLines = rep => (rep.kpis || []).slice(0, 8).map(k => `  - ${k[0]}: ${k[1]}`);
  /* generic: send a message with any files (used for "share a document") */
  async function emailFiles(o, by) {
    const to = addrs(o.to, 'To'), cc = addrs(o.cc, 'Cc'); if (!to.length) bad('Enter at least one recipient email address.');
    if (to.length + cc.length > 10) bad('You can send to at most 10 people at once.');
    const files = (Array.isArray(o.files) ? o.files : []).slice(0, 5).map(f => { const buf = Buffer.from(String(f.data || ''), 'base64'); if (!buf.length) bad(`"${fname(f.name)}" is empty.`); return { name: fname(f.name), mime: /^[\w.+-]+\/[\w.+-]+$/.test(f.type || '') ? f.type : 'application/octet-stream', buf } });
    const subject = hdr(clean(o.subject, 150)) || 'Document from CARE';
    const text = [clean(o.message, 3000), '', `Sent from CARE campus support by ${by}${db.google.email ? ' (' + db.google.email + ')' : ''}.`].join('\n').trim();
    if (!clean(o.message, 3000) && !files.length) bad('Write a message or attach a file.');
    const j = await gmailSend({ to, cc, subject, text, files });
    return { to, cc, subject, files: files.map(f => f.name), messageId: j.id };
  }
  /* send a saved report: PDF/CSV attachments, Google Doc/Sheet/Drive links, optional view access for the recipients */
  async function emailReport(id, o, by) {
    const { e, rep } = need(id), to = addrs(o.to, 'To'), cc = addrs(o.cc, 'Cc');
    if (!to.length) bad('Enter at least one recipient email address.'); if (to.length + cc.length > 10) bad('You can send to at most 10 people at once.');
    mailReady();
    const base = R().api.san(e.title).replace(/[^\w.() -]+/g, '_').slice(0, 80) || e.id, files = [], warnings = [];
    if (o.pdf !== false) files.push({ name: base + '.pdf', mime: 'application/pdf', buf: R().api.pdf(rep) });
    if (o.csv) files.push({ name: base + '.csv', mime: 'text/csv', buf: Buffer.from(R().api.csv(rep), 'utf8') });
    (Array.isArray(o.files) ? o.files : []).slice(0, 4).forEach(f => { const buf = Buffer.from(String(f.data || ''), 'base64'); if (buf.length) files.push({ name: fname(f.name), mime: /^[\w.+-]+\/[\w.+-]+$/.test(f.type || '') ? f.type : 'application/octet-stream', buf }) });
    const links = []; if (o.links !== false) { if (e.gdoc) links.push(['Google Doc', e.gdoc.url]); if (e.gsheet) links.push(['Google Sheet', e.gsheet.url]); if (e.drive) links.push(['Drive folder', e.drive.folderUrl]) }
    const shared = [];
    if (o.share) for (const [kind, f] of [['Google Doc', e.gdoc], ['Google Sheet', e.gsheet]]) if (f) for (const who of [...to, ...cc]) {
      try { await g(`${HOST.api}/drive/v3/files/${f.id}/permissions?sendNotificationEmail=false`, { json: { role: 'reader', type: 'user', emailAddress: who } }); shared.push(`${kind}: ${who}`) }
      catch (x) { warnings.push(`Could not give ${who} access to the ${kind} (${(x.m || x.message || '').replace(/^Google API error \(\d+\): /, '').slice(0, 100)}). They can still read the attached PDF.`) } }
    const subject = hdr(clean(o.subject, 150)) || `${e.title} (CARE report)`, note = clean(o.message, 3000);
    const text = [note, note ? '' : null, `Report: ${e.title}`, `Period: ${rep.period.label}`, `Complaints included: ${rep.counts ? rep.counts.matched : e.matched}`, '', 'Key figures:', ...kpiLines(rep),
      ...(links.length ? ['', 'Links:', ...links.map(l => `  ${l[0]}: ${l[1]}`)] : []), ...(files.length ? ['', 'Attached: ' + files.map(f => f.name).join(', ')] : []), '', `Sent from CARE campus support by ${by}${db.google.email ? ' (' + db.google.email + ')' : ''}.`].filter(x => x !== null).join('\n');
    const j = await gmailSend({ to, cc, subject, text, files });
    e.mails = [{ id: 'ml_' + now().toString(36) + crypto.randomBytes(2).toString('hex'), t: now(), by, to, cc, subject, files: files.map(f => f.name), links: links.length, shared: shared.length }, ...(e.mails || [])].slice(0, 30); C.save();
    return { to, cc, subject, files: files.map(f => f.name), links: links.map(l => l[0]), shared, warnings, messageId: j.id, entry: R().api.meta(e) };
  }

  /* move the Google files made for a report to the Drive trash (recoverable for 30 days); never touches the shared folder */
  async function trashFiles(e) {
    const ids = new Set(), fid = u => { const m = /\/d\/([\w-]{10,})/.exec(String(u || '')); return m && m[1] }; [e.gdoc, e.gsheet].forEach(f => f && f.id && ids.add(f.id));
    ((e.drive && e.drive.files) || []).forEach(f => { const i = fid(f.url); if (i) ids.add(i) });
    let n = 0; const warn = []; if (!ids.size) return { n, warn };
    for (const id of ids) { try { await g(`${HOST.api}/drive/v3/files/${id}`, { method: 'PATCH', json: { trashed: true } }); n++ } catch (x) { warn.push(`${e.id}: a Google file could not be moved to the trash (${(x.m || x.message || '').replace(/^Google API error \(\d+\): /, '').slice(0, 90)})`) } }
    return { n, warn };
  }

  /* ---------- actions ---------- */
  const adm = u => { if (u.role !== 'admin') bad('Not allowed.', 403) };
  const actions = {
    async exportGoogle(u, d) {
      adm(u); const id = String(d.id), done = [], errs = [];
      const step = async (k, fn) => { try { done.push([k, await fn()]) } catch (e) { errs.push(k + ': ' + (e.m || e.message)); if (/not set up|not connected|expired/.test(e.m || '')) throw e } };
      if (d.doc) await step('Google Doc', () => toDoc(id));
      if (d.sheet) await step('Google Sheet', () => toSheet(id));
      if (d.drive) await step('Google Drive', () => toDrive(id, { pdf: !!d.pdf, csv: !!d.csv }));
      audit(u, `exported report ${id} to Google (${done.map(x => x[0]).join(', ') || 'nothing'})`);
      if (errs.length && !done.length) bad(errs.join(' '), 502);
      return { ok: 1, errors: errs, entry: R().api.meta(R().api.entryOf(id)) };
    },
    async emailReport(u, d) {
      adm(u); const r = await emailReport(String(d.id), { to: d.to, cc: d.cc, subject: d.subject, message: d.message, pdf: d.pdf !== false && d.pdf !== 0, csv: !!d.csv, links: d.links !== false, share: !!d.share, files: d.files }, u.name);
      audit(u, `emailed report ${d.id} to ${r.to.concat(r.cc).join(', ')}`); return { ok: 1, ...r };
    },
    async emailFiles(u, d) { adm(u); const r = await emailFiles(d, u.name); audit(u, `emailed ${r.files.length} file(s) to ${r.to.concat(r.cc).join(', ')}`); return { ok: 1, ...r } },
    async googleDisconnect(u) {
      adm(u);
      if (db.google.refresh && configured()) { try { await fetch(HOST.revoke + '?token=' + encodeURIComponent(db.google.refresh), { method: 'POST' }) } catch (e) { } }
      db.google = {}; tok = { v: '', exp: 0 }; audit(u, 'disconnected Google Workspace'); return { ok: 1 };
    }
  };

  /* ---------- http: OAuth ---------- */
  const pend = new Map();
  async function http(req, res, u, UO, p) {
    if (req.method === 'GET' && p === '/api/google/status') { if (!u || u.role !== 'admin') return C.json(res, 403, { error: 'Admins only.' }), true; return C.json(res, 200, status(req)), true }
    if (req.method === 'GET' && p === '/api/google/connect') {
      if (!u || u.role !== 'admin') return C.json(res, 403, { error: 'Only an administrator can connect Google.' }), true;
      if (!configured()) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Google is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, restart CARE, then try again. Steps are on the Integrations page.'); return true }
      const st = crypto.randomBytes(16).toString('hex'); pend.set(st, { uid: u.id, exp: now() + 6e5 });
      const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state: st });
      res.writeHead(302, { Location: HOST.auth + '?' + q }); res.end(); return true;
    }
    if (req.method === 'GET' && p === '/api/google/callback') {
      const back = (m) => { if (m) { db.google.lastError = m } res.writeHead(302, { Location: '/#integrations' }); res.end() }, st = pend.get(UO.searchParams.get('state')); pend.delete(UO.searchParams.get('state'));
      if (!u || !st || st.exp < now() || st.uid !== u.id) { back('The Google sign-in link was not valid or expired. Please try again.'); return true }
      if (UO.searchParams.get('error')) { back('Google sign-in was cancelled or denied (' + UO.searchParams.get('error') + ').'); return true }
      try {
        const r = await fetch(HOST.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: UO.searchParams.get('code') || '', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }) }), j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error_description || j.error || 'token exchange failed');
        if (!j.refresh_token && !db.google.refresh) throw new Error('Google did not return offline access. Remove CARE from your Google account permissions and connect again.');
        if (j.refresh_token) db.google.refresh = j.refresh_token;
        tok = { v: j.access_token, exp: now() + (j.expires_in || 3600) * 1000 };
        let email = ''; try { const ui = await (await fetch(HOST.api + '/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + j.access_token } })).json(); email = ui.email || '' } catch (e) { }
        Object.assign(db.google, { email, connectedAt: now(), lastError: '', folderId: '', scope: j.scope || '' }); audit(u, 'connected Google Workspace' + (email ? ' (' + email + ')' : '')); C.save(); back();
      } catch (e) { back('Could not connect Google: ' + e.message) }
      return true;
    }
    return false;
  }

  return { actions, http, api: { status, configured, canEmail, trashFiles, emailReport, emailFiles, addrs, toDoc, toSheet, toDrive, createDoc, createSheet, notReady }, docs: { 'GET /api/google/status': 'admin: connection status', 'GET /api/google/connect': 'admin: start Google sign-in', 'POST /api/act exportGoogle googleDisconnect': 'admin: send a report to Google Docs/Sheets/Drive', 'POST /api/act emailReport emailFiles': 'admin: send a report or any files by Gmail from the connected Google account' } };
};
