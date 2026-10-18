'use strict';
/* CARE: Model Context Protocol (MCP) server + the assistant that uses the same tools.
   - POST /mcp  speaks MCP over HTTP (JSON-RPC 2.0: initialize, tools/list, tools/call), protected by a bearer token
   - mcp-stdio.js bridges it to desktop MCP clients that start servers as commands (stdio)
   - the AI Report Studio assistant calls exactly these tools, so what you can do in the app, an AI client can do too
   No npm packages are needed: the protocol is small and implemented directly. */
module.exports = function (C) {
  const { db, now, bad, clean, crypto, audit, find, open1, CATS, BLD, PRI, ST, TEAM, DAYMS, staffOf, teamOf, note, notifyRole } = C, env = process.env;
  const R = () => C.reports.api, G = () => C.google.api, O = () => C.ops.api, UI = C.loadMod ? C.loadMod('mcp-ui.js') : require('./mcp-ui.js');
  db.mcp = db.mcp || {};
  const token = () => env.MCP_TOKEN || (db.mcp.token = db.mcp.token || crypto.randomBytes(24).toString('hex'));
  const TYPEKEYS = Object.keys(R().TYPES);
  const PERIODS = ['all', 'today', '7d', '30d', '90d', 'this_month', 'last_month', 'this_year'];
  const filterProps = {
    period: { type: 'string', enum: PERIODS, description: 'Time period of complaints by date reported. Default: all' },
    from: { type: 'string', description: 'Start date YYYY-MM-DD (use with "to" instead of period)' }, to: { type: 'string', description: 'End date YYYY-MM-DD' },
    category: { type: 'string', enum: CATS }, building: { type: 'string', enum: Object.keys(BLD) }, priority: { type: 'string', enum: PRI },
    status: { type: 'string', description: 'open, resolved, overdue, or an exact status such as "In progress"' }, assigned_to: { type: 'string', description: 'Staff member name' }
  };
  const specFrom = a => ({ type: a.type || 'summary', range: a.period, from: a.from, to: a.to, cat: a.category, bld: a.building, dept: a.department, pri: a.priority, status: a.status, as: a.assigned_to, title: a.title });
  const lim = (a, d = 25) => Math.max(1, Math.min(100, +a.limit || d));
  const fmt = t => new Date(t).toISOString().slice(0, 10);
  const row = r => ({ id: r.id, title: r.title, category: r.cat, building: r.bld, room: r.room, priority: r.pri, status: r.status, assigned_to: r.as, reported: fmt(r.created), deadline: fmt(r.due), overdue: open1(r) && r.due < now(), incident: r.incident || undefined });

  /* ---------- tools ---------- */
  const TOOLS = [
    { name: 'get_complaint_summary', title: 'Complaint summary', description: 'Counts and averages for campus complaints: total, open, resolved, overdue, critical, average resolution hours, plus breakdowns by category, building and priority. Real data only.', inputSchema: { type: 'object', properties: filterProps },
      async run(a) { const sp = R().cleanSpec(specFrom(a)), rng = R().resolveRange(sp), l = R().filterList(sp, rng), m = R().metrics(l), g = f => R().grp(l, f).map(([k, v]) => ({ name: k, total: v.length, open: v.filter(open1).length }));
        return { period: rng.label, ...m, avg_resolution_hours: m.avgRes, resolved_within_deadline_percent: m.sla, by_category: g(r => r.cat), by_building: g(r => r.bld), by_priority: PRI.map(p => ({ name: p, total: l.filter(r => r.pri === p).length })) } } },
    { name: 'search_complaints', title: 'Search complaints', description: 'Find complaints by words in the title or description and/or filters. Returns up to 100 complaints (reporter identities are never included).', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for, e.g. "leak"' }, ...filterProps, limit: { type: 'integer', minimum: 1, maximum: 100 } } },
      async run(a) { const sp = R().cleanSpec(specFrom(a)), rng = R().resolveRange(sp), w = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean); let l = R().filterList(sp, rng); if (w.length) l = l.filter(r => w.every(x => (r.id + ' ' + r.title + ' ' + r.desc + ' ' + r.room).toLowerCase().includes(x))); return { count: l.length, complaints: l.slice(0, lim(a)).map(row) } } },
    { name: 'get_overdue_complaints', title: 'Overdue complaints', description: 'Open complaints that have passed their deadline, longest overdue first.', inputSchema: { type: 'object', properties: { category: filterProps.category, building: filterProps.building, assigned_to: filterProps.assigned_to, limit: { type: 'integer', minimum: 1, maximum: 100 } } },
      async run(a) { const sp = R().cleanSpec({ type: 'list', cat: a.category, bld: a.building, as: a.assigned_to, status: 'overdue' }), l = R().filterList(sp, R().resolveRange(sp)).sort((x, y) => x.due - y.due); return { count: l.length, complaints: l.slice(0, lim(a)).map(r => ({ ...row(r), hours_late: R().hrs(now() - r.due), escalations: r.escalations || 0 })) } } },
    { name: 'get_staff_workload', title: 'Staff workload', description: 'Open, overdue, in-progress and completed tasks for every maintenance staff member, plus how many open complaints are unassigned.', inputSchema: { type: 'object', properties: {} },
      async run() { const t = now(), v = R().valid(); return { unassigned_open: v.filter(r => open1(r) && r.as === 'Unassigned').length, staff: Object.values(db.users).filter(u => u.role === 'maintenance').map(u => { const m = v.filter(r => r.as === u.name), o = m.filter(open1), d = m.filter(r => r.status === 'Resolved' && r.resolved); return { name: u.name, team: teamOf(u), open: o.length, in_progress: o.filter(r => r.status === 'In progress').length, awaiting_verification: o.filter(r => r.status === 'Awaiting verification').length, overdue: o.filter(r => r.due < t).length, completed: d.length, avg_hours_to_resolve: d.length ? R().r1(d.reduce((s, r) => s + r.resolved - r.created, 0) / d.length / 36e5) : null } }) } } },
    { name: 'find_recurring_issues', title: 'Recurring issues', description: 'Buildings where the same category of complaint keeps coming back.', inputSchema: { type: 'object', properties: { min_count: { type: 'integer', minimum: 2, maximum: 20, description: 'Default 3' }, days: { type: 'integer', minimum: 7, maximum: 365, description: 'Look-back window, default 90' }, building: filterProps.building, category: filterProps.category } },
      async run(a) { const t = now(), mc = +a.min_count || 3, days = +a.days || 90, l = R().valid().filter(r => t - r.created < days * DAYMS && (!a.building || r.bld === a.building) && (!a.category || r.cat === a.category));
        return { window_days: days, issues: R().grp(l, r => r.bld + '|' + r.cat).filter(([, v]) => v.length >= mc).map(([k, v]) => ({ building: k.split('|')[0], category: k.split('|')[1], complaints: v.length, still_open: v.filter(open1).length, rooms: [...new Set(v.map(r => r.room))], ids: v.map(r => r.id).slice(0, 20) })) } } },
    { name: 'generate_operations_report', title: 'Generate operations report', description: 'Build a report from real complaint data and save it in the CARE report library. Either give a plain-English "prompt" (e.g. "unresolved plumbing complaints this month") or set type and filters. Returns the report id to use with the Google tools.',
      inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, type: { type: 'string', enum: TYPEKEYS, description: 'Report type; default summary' }, title: { type: 'string' }, ...filterProps, ai_summary: { type: 'boolean', description: 'Add an AI-written summary (only if an AI key is configured)' } } },
      async run(a, by) { const spec = R().merge(a.prompt ? R().parsePrompt(a.prompt) : {}, Object.fromEntries(Object.entries(specFrom(a)).filter(([k, v]) => v && !(k === 'type' && !a.type)))); if (!a.prompt && !a.type) spec.type = 'summary';
        const { entry, rep } = await R().generate(spec, { by, prompt: a.prompt || '', source: by.startsWith('Workflow') ? by : 'AI assistant / MCP', ai: !!a.ai_summary && R().aiOn() });
        return { report_id: entry.id, title: entry.title, type: rep.type, period: rep.period.label, complaints_matched: rep.counts.matched, key_figures: Object.fromEntries(rep.kpis), findings: rep.findings, suggested_actions: rep.suggestions.map(s => s.text), ai_summary: rep.narrative && rep.narrative.summary || undefined } } },
    { name: 'create_google_doc', title: 'Create Google Doc', description: 'Create a Google Doc from a saved report (needs Google to be connected in CARE). Returns the document link.', inputSchema: { type: 'object', properties: { report_id: { type: 'string' }, title: { type: 'string' } }, required: ['report_id'] },
      async run(a) { const d = await G().toDoc(String(a.report_id), a.title && clean(a.title, 120)); return { document_id: d.id, url: d.url, title: d.title } } },
    { name: 'create_google_sheet', title: 'Create Google Sheet', description: 'Create a Google Sheet (summary, one tab per table, all complaints, charts) from a saved report. Needs Google to be connected.', inputSchema: { type: 'object', properties: { report_id: { type: 'string' }, title: { type: 'string' } }, required: ['report_id'] },
      async run(a) { const d = await G().toSheet(String(a.report_id), a.title && clean(a.title, 120)); return { spreadsheet_id: d.id, url: d.url, title: d.title, warnings: d.warnings } } },
    { name: 'save_report_to_drive', title: 'Save report to Google Drive', description: 'Put a report into the "CARE Reports" Google Drive folder: moves the Google Doc/Sheet already created for it and optionally uploads PDF and CSV copies. With nothing created yet, uploads PDF and CSV.', inputSchema: { type: 'object', properties: { report_id: { type: 'string' }, include_pdf: { type: 'boolean' }, include_csv: { type: 'boolean' } }, required: ['report_id'] },
      async run(a) { const e = R().entryOf(String(a.report_id)); if (!e) bad('Report not found: ' + a.report_id, 404); const none = !e.gdoc && !e.gsheet && a.include_pdf === undefined && a.include_csv === undefined; const d = await G().toDrive(e.id, { pdf: none || !!a.include_pdf, csv: none || !!a.include_csv }); return { folder_url: d.folderUrl, files: d.files } } }
  ];

  /* ---------- Gmail + interactive UI tools ---------- */
  const PLABEL = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', this_month: 'This month', last_month: 'Last month', this_year: 'This year' };
  const addrList = v => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 10);
  const recentReports = () => (db.studio.reports || []).slice(0, 30).map(e => ({ id: e.id, title: e.title, type: e.type, period: e.period && e.period.label, created: fmt(e.createdAt), has_doc: !!e.gdoc, has_sheet: !!e.gsheet }));
  const composeOut = (a, draft) => { const list = recentReports(), g = G().status(), sel = a.report_id && R().entryOf(String(a.report_id)) ? String(a.report_id) : (list[0] && list[0].id) || '';
    return { reports: list, selected: sel, draft: draft || {}, google: { connected: g.connected, canEmail: g.canEmail, email: g.email } } };
  TOOLS.push(
    { name: 'send_report_email', title: 'Send report by Gmail', description: 'Email a saved report from the connected Gmail account: PDF (and optional CSV) attached, with links to its Google Doc/Sheet/Drive folder. Only send when the user clearly asked for it and named the recipients. Optionally give the recipients view access to the Google Doc/Sheet.',
      inputSchema: { type: 'object', properties: { report_id: { type: 'string' }, to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses (max 10 with cc)' }, cc: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, message: { type: 'string', description: 'Short note shown above the report summary' }, include_pdf: { type: 'boolean', description: 'Default true' }, include_csv: { type: 'boolean' }, include_google_links: { type: 'boolean', description: 'Default true' }, share_google_files: { type: 'boolean', description: 'Also grant the recipients view access to the Google Doc/Sheet' } }, required: ['report_id', 'to'] },
      async run(a, by) { const r = await G().emailReport(String(a.report_id), { to: a.to, cc: a.cc, subject: a.subject, message: a.message, pdf: a.include_pdf !== false, csv: !!a.include_csv, links: a.include_google_links !== false, share: !!a.share_google_files }, by);
        return { sent: true, to: r.to, cc: r.cc, subject: r.subject, files: r.files, links: r.links, shared: r.shared, warnings: r.warnings } } },
    { name: 'compose_report_email', title: 'Email form', description: 'Open an interactive form to email a saved report by Gmail. Use when the user wants to email or share a report but has not finished choosing recipients or options. Nothing is sent until they press Send.',
      inputSchema: { type: 'object', properties: { report_id: { type: 'string', description: 'Report to preselect; default is the newest' }, to: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, message: { type: 'string' } } },
      async run(a) { return composeOut(a, { to: addrList(a.to), subject: clean(a.subject, 150), message: clean(a.message, 3000) }) } },
    { name: 'open_report_builder', title: 'Report builder form', description: 'Open an interactive form to build a report (type, period, category, building, priority) and then save it to Google or email it.', inputSchema: { type: 'object', properties: {} },
      async run() { return { types: TYPEKEYS.map(k => ({ key: k, label: R().TYPES[k].label })), periods: PERIODS.filter(x => x !== 'all').map(k => ({ key: k, label: PLABEL[k] || k })), categories: CATS, buildings: Object.keys(BLD), priorities: PRI } } }
  );
  /* which tools show an app in the chat (MCP Apps: _meta.ui.resourceUri) and how clients should treat them */
  const UIOF = { get_complaint_summary: 'ui://care/dashboard', search_complaints: 'ui://care/complaints', get_overdue_complaints: 'ui://care/complaints', get_staff_workload: 'ui://care/workload', find_recurring_issues: 'ui://care/recurring', compose_report_email: 'ui://care/email', send_report_email: 'ui://care/email', open_report_builder: 'ui://care/report-builder' };
  const READONLY = new Set(['get_complaint_summary', 'search_complaints', 'get_overdue_complaints', 'get_staff_workload', 'find_recurring_issues', 'compose_report_email', 'open_report_builder']);
  TOOLS.forEach(t => { t.ui = UIOF[t.name]; t.annotations = READONLY.has(t.name) ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: /google|drive|email/.test(t.name) } });
  const byName = Object.fromEntries(TOOLS.map(t => [t.name, t]));
  async function callTool(name, args, by, o) {
    const t = byName[name]; if (!t) bad('Unknown tool: ' + name, 404);
    args = args && typeof args === 'object' ? args : {};
    /* the in-app assistant never sends email by itself: it opens the form, and a person presses Send */
    if (o && o.draft && name === 'send_report_email') return { ...composeOut(args, { to: addrList(args.to), cc: addrList(args.cc), subject: clean(args.subject, 150), message: clean(args.message, 3000), csv: !!args.include_csv, fromAssistant: true }), status: 'draft_ready_for_review', note: 'The email has NOT been sent. A form with these details is now shown to the user, who must review it and press Send.' };
    const out = await t.run(args, by || 'Assistant');
    if (/^(create_|save_|generate_|send_)/.test(name)) audit({ name: by || 'Assistant' }, `tool ${name} ${JSON.stringify(args).slice(0, 160)}`);
    return out;
  }

  /* ---------- JSON-RPC (MCP) ---------- */
  const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
  async function rpc(msg, by) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: msg && msg.id != null ? msg.id : null, error: { code: -32600, message: 'Invalid request' } };
    const id = msg.id, ok = result => ({ jsonrpc: '2.0', id, result }), err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined) return null; // notification
    switch (msg.method) {
      case 'initialize': { const want = msg.params && msg.params.protocolVersion; return ok({ protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI.MIME] } } }, serverInfo: { name: 'care-campus', title: 'CARE Campus Operations', version: '3.1.0' }, instructions: 'Tools read real CARE complaint data and several show an interactive app in the chat (charts, tables, forms). To produce documents: generate_operations_report, then create_google_doc / create_google_sheet, then save_report_to_drive. To share a report by Gmail use send_report_email (only when asked and recipients are named) or compose_report_email to open the form. Never invent numbers; use tool results.' }) }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS.map(({ name, title, description, inputSchema, ui, annotations }) => ({ name, title, description, inputSchema, annotations, ...(ui ? { _meta: { ui: { resourceUri: ui } } } : {}) })) });
      case 'resources/list': return ok({ resources: UI.list() });
      case 'resources/templates/list': return ok({ resourceTemplates: [] });
      case 'resources/read': { const uri = String(msg.params && msg.params.uri || ''); if (!UI.has(uri)) return err(-32002, 'Resource not found: ' + uri.slice(0, 80)); return ok({ contents: [UI.read(uri)] }) }
      case 'tools/call': {
        const p = msg.params || {}, t = byName[p.name]; if (!t) return err(-32602, 'Unknown tool: ' + p.name);
        try { const out = await callTool(p.name, p.arguments, by); return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: false }) }
        catch (e) { return ok({ content: [{ type: 'text', text: e && e.m ? e.m : 'Tool failed: ' + (e && e.message) }], isError: true }) }
      }
      default: return err(-32601, 'Method not found: ' + msg.method);
    }
  }

  /* ---------- the assistant (used by AI Report Studio) ---------- */
  async function llmAssist(prompt, by, steps, hist) {
    const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })), msgs = [...(hist || []), { role: 'user', content: prompt }];
    const system = 'You are the CARE campus operations assistant. Use the tools to answer; never invent numbers. For document requests call generate_operations_report first, then create_google_doc / create_google_sheet / save_report_to_drive only if asked. If a tool fails, say so plainly. Charts, tables and forms appear in the chat by themselves when you call a tool, so do not repeat their numbers at length. To email a report, call send_report_email: it opens a form for the user to review and press Send, so never say an email was sent. Finish with a short plain-language summary.';
    for (let i = 0; i < 8; i++) {
      const j = await R().claude({ system, tools, messages: msgs }), blocks = j.content || [], uses = blocks.filter(b => b.type === 'tool_use');
      msgs.push({ role: 'assistant', content: blocks });
      if (!uses.length || j.stop_reason !== 'tool_use') return blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const results = [];
      for (const u of uses) { try { const out = await callTool(u.name, u.input, by, { draft: true }); steps.push({ tool: u.name, args: u.input, ok: true, out }); results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) }) } catch (e) { const m = e.m || e.message; steps.push({ tool: u.name, args: u.input, ok: false, error: m }); results.push({ type: 'tool_result', tool_use_id: u.id, content: m, is_error: true }) } }
      msgs.push({ role: 'user', content: results });
    }
    return 'Stopped after too many steps.';
  }
  const HELP = 'I can show a live dashboard, list overdue or specific complaints, show staff workload and recurring issues, build reports (Google Doc, Sheet, Drive, PDF, CSV) and email a report from Gmail. Try: "dashboard for this month", "overdue complaints", "recurring issues", "plumbing report with a Google Sheet", or "email the latest report to name@gmail.com".';
  const argsFromSpec = sp => { const o = {}; if (sp.range && sp.range !== 'all') o.period = sp.range; if (sp.from) o.from = sp.from; if (sp.to) o.to = sp.to; if (sp.cat) o.category = sp.cat; if (sp.bld) o.building = sp.bld; if (sp.pri) o.priority = sp.pri; if (sp.status) o.status = sp.status; if (sp.as) o.assigned_to = sp.as; return o };
  async function assist(prompt, by, over, o2) {
    o2 = o2 || {}; prompt = clean(prompt, 800); if (prompt.length < 4) bad('Describe what you need, for example "unresolved plumbing complaints this month".');
    const steps = []; let reply = '', mode = 'rules';
    const hist = (Array.isArray(o2.history) ? o2.history : []).slice(-8).map(h => ({ role: h && h.role === 'assistant' ? 'assistant' : 'user', content: clean(h && h.text, 700) })).filter(h => h.content);
    while (hist.length && hist[0].role !== 'user') hist.shift();
    const clean2 = []; hist.forEach(h => { if (!clean2.length || clean2[clean2.length - 1].role !== h.role) clean2.push(h) }); if (clean2.length && clean2[clean2.length - 1].role === 'user') clean2.pop();
    if (R().aiOn()) { try { reply = await llmAssist(prompt, by, steps, clean2); mode = 'ai' } catch (e) { steps.length = 0; reply = ''; mode = 'rules' } }
    if (mode === 'rules') {
      const q = prompt.toLowerCase(), run = async (tool, args) => { try { const out = await callTool(tool, args, by, { draft: true }); steps.push({ tool, args, ok: true, out }); return out } catch (e) { steps.push({ tool, args, ok: false, error: e.m || e.message }); return null } };
      const doc = /google doc|\bdocs?\b|document/.test(q), sheet = /sheet|spreadsheet/.test(q), drive = /\bdrive\b/.test(q), pdf = /\bpdf\b/.test(q), csv = /\bcsv\b/.test(q);
      const addr = prompt.match(/[^\s@<>,;()"]+@[^\s@<>,;()"]+\.[a-z]{2,}/ig) || [], wantsFile = /\b(report|doc|docs|document|sheet|spreadsheet|pdf|csv|drive|export)\b/.test(q);
      const sp = R().parsePrompt(prompt) || {}, filt = argsFromSpec(sp), has = Object.keys(filt).length > 0;
      const intent = /\b(e-?mail|gmail|send|share|forward)\b/.test(q) && (addr.length || /report/.test(q) || /\bform\b/.test(q)) ? 'email'
        : /report builder|report form|build (me )?a report/.test(q) ? 'builder'
        : /recurring|keeps? (coming|happening)|again and again|repeat(ed)? (issue|complaint|problem)/.test(q) ? 'recurring'
        : /work ?load|who is (busy|free)|staff (load|status)|team (load|status)/.test(q) ? 'workload'
        : /overdue|past (the )?deadline|late complaints|delayed/.test(q) && !wantsFile ? 'overdue'
        : /dashboard|overview|summary|statistics|\bstats\b|\bchart|graph|breakdown|how many/.test(q) && !wantsFile ? 'summary'
        : o2.chat && !wantsFile && has ? 'search' : '';
      if (o2.chat && !intent && !wantsFile) { reply = HELP }
      else if (intent === 'email') {
        const idm = prompt.match(/\bRPT-\d+\b/i), fresh = /\b(new|fresh|generate|create|make|build)\b/.test(q) || has || (sp.type && sp.type !== 'summary');
        let id = idm ? idm[0].toUpperCase() : '', gen = null;
        if (!id && fresh && !/\b(latest|last|newest|recent)\b/.test(q)) { gen = await run('generate_operations_report', { prompt, ...(over || {}) }); id = gen ? gen.report_id : '' }
        if (!gen || id) { const d = await run('send_report_email', { report_id: id, to: addr }); reply = d ? `The email form is ready${addr.length ? ' for ' + addr.join(', ') : ''}. Check the details and press Send. Nothing has been sent yet.` : (steps[steps.length - 1].error || 'Could not prepare the email.') }
        else reply = steps[0] ? steps[0].error : 'Could not create the report.';
      } else if (intent) {
        const tool = { builder: 'open_report_builder', recurring: 'find_recurring_issues', workload: 'get_staff_workload', overdue: 'get_overdue_complaints', summary: 'get_complaint_summary', search: 'search_complaints' }[intent];
        const a = intent === 'overdue' ? { category: filt.category, building: filt.building, assigned_to: filt.assigned_to } : intent === 'recurring' ? { category: filt.category, building: filt.building } : intent === 'search' ? { ...filt, limit: 50 } : intent === 'summary' ? filt : {};
        const out = await run(tool, a);
        reply = !out ? steps[steps.length - 1].error : intent === 'builder' ? 'Choose what the report should cover, then create it. You can save it to Google or email it afterwards.'
          : intent === 'summary' ? `${out.period}: ${out.total} complaints, ${out.open} open, ${out.overdue} overdue, ${out.critical} critical. Click a bar to see those complaints.`
          : intent === 'workload' ? `${out.staff.length} staff members; ${out.unassigned_open} open complaint${out.unassigned_open === 1 ? ' is' : 's are'} unassigned.`
          : intent === 'recurring' ? (out.issues.length ? `${out.issues.length} building and category combinations keep coming back in the last ${out.window_days} days.` : `No recurring issues in the last ${out.window_days} days.`)
          : `${out.count} complaint${out.count === 1 ? '' : 's'}${out.count > out.complaints.length ? ' (showing ' + out.complaints.length + ')' : ''}.`;
      } else {
        const rep = await run('generate_operations_report', { prompt, ...(over || {}) });
        if (rep) {
          if (doc) await run('create_google_doc', { report_id: rep.report_id });
          if (sheet) await run('create_google_sheet', { report_id: rep.report_id });
          if (drive || pdf || csv) await run('save_report_to_drive', { report_id: rep.report_id, include_pdf: pdf || (drive && !doc && !sheet), include_csv: csv || (drive && !doc && !sheet) });
          reply = `Report ${rep.report_id} "${rep.title}" is ready (${rep.complaints_matched} complaint${rep.complaints_matched === 1 ? '' : 's'}, ${rep.period}).`;
          const f = steps.filter(s => !s.ok); if (f.length) reply += ' The report is saved in CARE, but ' + f.map(s => `${s.tool.replace(/_/g, ' ')} failed: ${s.error}`).join(' ');
        } else reply = steps[0] ? steps[0].error : 'Could not create the report.';
      }
    }
    const made = [...steps].reverse().find(s => s.ok && s.tool === 'generate_operations_report');
    const uiOf = s => s.out && s.out.status === 'draft_ready_for_review' ? 'ui://care/email' : byName[s.tool] && byName[s.tool].ui;
    const apps = steps.filter(s => s.ok && uiOf(s)).slice(-3).map(s => ({ tool: s.tool, uri: uiOf(s), args: s.args || {}, result: s.out }));
    return { reply, mode, steps: steps.map(s => ({ tool: s.tool, args: s.args, ok: s.ok, error: s.error, result: s.ok ? summarise(s.out) : undefined })), reportId: made ? made.out.report_id : '', apps };
  }
  const summarise = o => { const s = JSON.stringify(o); return s.length > 700 ? JSON.parse(JSON.stringify(o, (k, v) => Array.isArray(v) && v.length > 5 ? [...v.slice(0, 5), `... ${v.length - 5} more`] : v)) : o };

  /* ---------- workflow actions (real work, used by Workflow Automation) ---------- */
  const wfDefs = {
    generate_report: { label: 'Generate a report and save it to the Reports library', p: [{ k: 'value', kind: 'choice', label: 'Report type', opts: TYPEKEYS, optLabels: Object.fromEntries(TYPEKEYS.map(k => [k, R().TYPES[k].label]))}] },
    create_google_doc: { label: 'Create a Google Doc from the generated report (needs Google connected)', p: [] },
    create_google_sheet: { label: 'Create a Google Sheet from the generated report (needs Google connected)', p: [] },
    save_to_drive: { label: 'Save the report (Doc, Sheet, PDF, CSV) to Google Drive', p: [] },
    email_report: { label: 'Email the generated report by Gmail (PDF + links; needs Google connected)', p: [{ k: 'value', kind: 'text', label: 'Send to (email addresses, comma separated)' }] }
  };
  function chain(X, wf, label, fn) {
    X.chain = (X.chain || Promise.resolve()).then(async () => {
      const rec = { id: 'wfl_' + now() + '_g' + Math.random().toString(36).slice(2, 5), wfId: wf.id, wfName: wf.name, trigger: wf.trigger, reportId: null, matched: 0, executed: [], t: now(), ms: 0, success: true, manual: false, sched: wf.trigger === 'schedule' }, t0 = now();
      try { const out = await fn(); rec.executed = [`(in background) ${label}${out && out.url ? ': ' + out.url : ''}`] } catch (e) { rec.success = false; rec.error = `${label}: ${e.m || e.message}`; wf.lastStatus = 'error'; wf.lastError = rec.error; wf.fails = (wf.fails || 0) + 1 }
      rec.ms = now() - t0; db.wfLogs.unshift(rec); db.wfLogs.length = Math.min(db.wfLogs.length, 500); C.save();
    });
  }
  const gready = () => { try { G().notReady() } catch (e) { throw new Error(e.m || e.message) } };
  const needId = X => { if (!X.reportId) throw new Error('Add a "Generate a report" action before this one.'); return X.reportId };
  const wfActions = {
    generate_report(a, r, wf, X) {
      const sched = wf.trigger === 'schedule', fr = wf.schedule && wf.schedule.freq, spec = { type: TYPEKEYS.includes(a.value) ? a.value : 'summary', range: sched ? (fr === 'monthly' ? 'last_month' : fr === 'daily' ? 'today' : '7d') : '30d' };
      if (r && !sched) { spec.bld = r.bld; if (['summary', 'unresolved', 'recurring', 'list'].includes(spec.type)) spec.cat = r.cat }
      const by = 'Workflow: ' + wf.name, rep = R().build(spec, by), e = R().saveReport(rep, { by, source: by });
      X.reportId = e.id; return `report ${e.id} generated`;
    },
    create_google_doc(a, r, wf, X) { const id = needId(X); gready(); chain(X, wf, 'Google Doc created', () => G().toDoc(id)); return 'Google Doc started' },
    create_google_sheet(a, r, wf, X) { const id = needId(X); gready(); chain(X, wf, 'Google Sheet created', () => G().toSheet(id)); return 'Google Sheet started' },
    email_report(a, r, wf, X) { const id = needId(X); gready(); const to = G().addrs(a.value, 'Send to'); if (!to.length) throw new Error('Enter who should receive the report.'); if (!G().canEmail()) throw new Error('CARE cannot send email yet: reconnect Google in Integrations and allow email.');
      chain(X, wf, 'Report emailed to ' + to.join(', '), async () => { await G().emailReport(id, { to, pdf: true, csv: true, links: true, message: `Automatic report from the workflow "${wf.name}".` }, 'Workflow: ' + wf.name); return {} }); return 'Email started' },
    save_to_drive(a, r, wf, X) { const id = needId(X); gready(); chain(X, wf, 'Saved to Google Drive', async () => { const d = await G().toDrive(id, { pdf: true, csv: true }); return { url: d.folderUrl } }); return 'Drive upload started' }
  };

  /* ---------- actions + http ---------- */
  const actions = {
    async assist(u, d) { if (u.role !== 'admin') bad('Not allowed.', 403); const o = await assist(d.prompt, u.name, d.over && typeof d.over === 'object' ? d.over : {}, { chat: !!d.chat, history: d.history }); audit(u, 'asked the assistant: ' + clean(d.prompt, 100)); return o },
    mcpRotate(u) { if (u.role !== 'admin') bad('Not allowed.', 403); if (env.MCP_TOKEN) bad('The MCP token is set by the MCP_TOKEN environment variable. Change it there.'); db.mcp.token = crypto.randomBytes(24).toString('hex'); audit(u, 'created a new MCP access token'); return { ok: 1 } }
  };
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) };
  async function http(req, res, u, UO, p) {
    if (p !== '/mcp') return false;
    const send = (c, o, h) => { res.writeHead(c, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(h || {}) }); res.end(o == null ? '' : JSON.stringify(o)) };
    const o = req.headers.origin; if (o) { try { if (new URL(o).host !== req.headers.host) return send(403, { error: 'Origin not allowed.' }), true } catch (e) { return send(403, { error: 'Origin not allowed.' }), true } }
    if (req.method !== 'POST') return send(405, { error: 'Use POST with a JSON-RPC message.' }, { Allow: 'POST' }), true;
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''), viaToken = m && same(m[1], token());
    if (!viaToken && !(u && u.role === 'admin')) return send(401, { error: 'Missing or wrong MCP token.' }, { 'WWW-Authenticate': 'Bearer realm="CARE MCP"' }), true;
    let msg; try { msg = await C.body(req) } catch (e) { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), true }
    const by = viaToken ? 'MCP client' : u.name;
    if (Array.isArray(msg)) { const outs = (await Promise.all(msg.map(x => rpc(x, by)))).filter(Boolean); return outs.length ? send(200, outs) : send(202), true }
    const out = await rpc(msg, by); C.save(); return out ? send(200, out) : send(202), true;
  }
  const state = u => u.role === 'admin' ? { mcp: { token: token(), tokenFromEnv: !!env.MCP_TOKEN, tools: TOOLS.map(t => ({ name: t.name, description: t.description, ui: !!t.ui })) } } : {};

  return { actions, http, state, wfDefs, wfActions, api: { callTool, assist, rpc, TOOLS }, docs: { 'POST /mcp': 'Model Context Protocol endpoint (JSON-RPC 2.0), header "Authorization: Bearer <token>"', 'POST /api/act assist': 'admin: run the report assistant' } };
};
