/* CARE frontend: "Chat with apps" (AI & Automation > Chat with apps).
   A chat where answers can come with a small interactive app (chart, table, form) shown right inside the conversation.
   This page is an MCP Apps *host*: it reads the app from the server (resources/read), shows it in a sandboxed iframe that has no
   access to this page, and answers the app's requests (tools/call, open link, send message) over postMessage JSON-RPC.
   Loaded after ui-hub.js. */
(function () {
  const E = esc;
  const CH = window.CH = { msgs: [], busy: false, html: {}, frames: new Map(), draft: '', n: 0 };
  const NAMES = { 'ui://care/dashboard': 'Dashboard', 'ui://care/complaints': 'Complaints', 'ui://care/workload': 'Staff workload', 'ui://care/recurring': 'Recurring issues', 'ui://care/email': 'Email a report', 'ui://care/report-builder': 'Report builder' };
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!S.theme && matchMedia('(prefers-color-scheme:dark)').matches);
  const hostCtx = () => ({ theme: isDark() ? 'dark' : 'light', displayMode: 'inline', platform: 'web', locale: navigator.language || 'en' });

  const css = () => {
    if (document.getElementById('chatcss')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="chatcss">
#chat-log{display:flex;flex-direction:column;gap:12px;min-height:200px;max-height:66vh;overflow-y:auto;padding:4px 2px 8px;scroll-behavior:smooth}
.ch-m{display:flex;flex-direction:column;gap:6px;max-width:100%}.ch-m.user{align-items:flex-end}
.ch-b{border:1px solid var(--line);background:var(--in);border-radius:16px;padding:9px 14px;max-width:min(680px,92%);white-space:pre-wrap;word-break:break-word}
.ch-m.user .ch-b{background:var(--pri);color:#fff;border-color:var(--pri)}.ch-b.err{border-color:#c0392b}.ch-b.pend{color:var(--mut)}
.ch-app{width:100%;border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}.ch-ah{display:flex;justify-content:space-between;align-items:center;padding:6px 8px 6px 14px;border-bottom:1px solid var(--line);font-size:13px;color:var(--mut)}
.ch-ah button{border:0;background:transparent;color:var(--mut);cursor:pointer;font-size:15px;padding:2px 8px;border-radius:8px}.ch-ah button:hover{background:var(--in);color:#c0392b}
.chat-app{display:block;width:100%;border:0;height:140px;background:transparent;color-scheme:normal}
.ch-x{font-size:12px;color:var(--mut)}.ch-x button{border:0;background:transparent;color:var(--mut);cursor:pointer;text-decoration:underline;font:inherit;padding:0 4px}.ch-x button:hover{color:#c0392b}
.ch-in{display:flex;gap:8px;margin-top:10px}.ch-in input{flex:1}
</style>`);
  };

  /* ---------- talking to the MCP endpoint (same login, administrators only) ---------- */
  async function mcp(method, params) {
    const r = await fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'Request failed');
    if (j.error) throw new Error(j.error.message || 'Request failed');
    return j.result;
  }
  const readOnly = n => /^(get_|search_|find_|compose_|open_)/.test(n);

  /* ---------- host side of the MCP Apps protocol ---------- */
  addEventListener('message', async ev => {
    let ctx = null; CH.frames.forEach((c, el) => { if (!el.isConnected) CH.frames.delete(el); else if (el.contentWindow === ev.source) ctx = c });
    const m = ev.data; if (!ctx || !m || m.jsonrpc !== '2.0') return;
    const post = o => { try { ctx.el.contentWindow.postMessage({ jsonrpc: '2.0', ...o }, '*') } catch (e) { } };
    const ok = result => m.id !== undefined && post({ id: m.id, result }), fail = (message, code = -32000) => m.id !== undefined && post({ id: m.id, error: { code, message } });
    const p = m.params || {};
    switch (m.method) {
      case 'ui/initialize': return ok({ protocolVersion: '2026-01-26', hostInfo: { name: 'CARE', version: '3.1.0' }, hostCapabilities: { openLinks: {}, serverTools: {}, message: { text: {} } }, hostContext: hostCtx() });
      case 'ui/notifications/initialized':
        post({ method: 'ui/notifications/tool-input', params: { arguments: ctx.app.args || {} } });
        return post({ method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: JSON.stringify(ctx.app.result).slice(0, 60000) }], structuredContent: ctx.app.result, isError: false } });
      case 'ui/notifications/size-changed': return void (ctx.el.style.height = Math.min(760, Math.max(90, Math.ceil(+p.height || 0) + 4)) + 'px');
      case 'ping': return ok({});
      case 'tools/call': {
        const known = ((S.mcp && S.mcp.tools) || []).some(t => t.name === p.name); if (!known) return fail('Unknown tool: ' + String(p.name).slice(0, 60), -32602);
        try { const r = await mcp('tools/call', { name: p.name, arguments: p.arguments || {} }); ok(r); if (!readOnly(p.name) && typeof load === 'function') load() } catch (e) { fail(e.message) }
        return;
      }
      case 'ui/open-link': { let u; try { u = new URL(String(p.url)) } catch (e) { } if (!u || u.protocol !== 'https:') return fail('Only https links can be opened.'); window.open(u.href, '_blank', 'noopener,noreferrer'); return ok({}) }
      case 'ui/message': { const c = Array.isArray(p.content) ? p.content[0] : p.content, t = c && c.text; if (!t) return fail('Empty message.'); chatSend(String(t).slice(0, 800)); return ok({}) }
      default: if (m.id !== undefined) fail('Method not found: ' + m.method, -32601);
    }
  });
  /* dark mode: tell every open app */
  new MutationObserver(() => CH.frames.forEach((c, el) => { try { el.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: hostCtx() }, '*') } catch (e) { } })).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  async function mountApp(slot, app) {
    let html = CH.html[app.uri];
    if (!html) { try { const r = await mcp('resources/read', { uri: app.uri }); html = CH.html[app.uri] = r.contents[0].text } catch (e) { slot.innerHTML = `<p class="st-bad" style="padding:10px 14px">Could not load this app: ${E(e.message)}</p>`; return } }
    const f = document.createElement('iframe');
    f.className = 'chat-app'; f.title = NAMES[app.uri] || 'App'; f.setAttribute('sandbox', 'allow-scripts');   /* no same-origin: the app cannot read CARE's cookies or page */
    CH.frames.set(f, { el: f, app }); f.srcdoc = html; slot.appendChild(f);
  }

  /* ---------- messages ---------- */
  function msgNode(m) {
    const d = document.createElement('div'); d.className = 'ch-m ' + m.role; d.dataset.id = m.id;
    d.innerHTML = `<div class="ch-b ${m.pending ? 'pend' : ''} ${m.err ? 'err' : ''}">${m.pending ? '<span class="rp-spin"></span>' : ''}${E(m.text)}</div>`;
    (m.apps || []).forEach((a, i) => {
      const box = document.createElement('div'); box.className = 'ch-app';
      box.innerHTML = `<div class="ch-ah"><b>${E(NAMES[a.uri] || 'App')}</b><button type="button" aria-label="Remove this card" title="Remove this card">✕</button></div><div class="ch-slot"></div>`;
      box.querySelector('button').onclick = () => { m.apps.splice(m.apps.indexOf(a), 1); box.remove() };
      d.appendChild(box); mountApp(box.querySelector('.ch-slot'), a);
    });
    const x = document.createElement('div'); x.className = 'ch-x';
    const steps = (m.steps || []).length ? `<details><summary>What the assistant did${m.mode === 'ai' ? ' (AI)' : ''}</summary>${m.steps.map(s => `<div>${s.ok ? '<span class="st-ok">✓</span>' : '<span class="st-bad">✕</span>'} ${E(s.tool.replace(/_/g, ' '))}${s.ok ? '' : ': ' + E(s.error)}</div>`).join('')}</details>` : '';
    x.innerHTML = steps + (m.pending ? '' : '<button type="button">Delete message</button>');
    const del = x.querySelector('button'); if (del) del.onclick = () => { CH.msgs.splice(CH.msgs.indexOf(m), 1); d.remove() };
    if (steps || del) d.appendChild(x);
    return d;
  }
  const logEl = () => document.getElementById('chat-log');
  const scrollEnd = () => { const l = logEl(); if (l) l.scrollTop = l.scrollHeight };
  function push(m) { m.id = ++CH.n; CH.msgs.push(m); const l = logEl(); if (l) { const h = l.querySelector(':scope > p'); if (h) h.remove(); l.appendChild(msgNode(m)); scrollEnd() } return m }
  function redraw(m) { const l = logEl(), old = l && l.querySelector(`[data-id="${m.id}"]`); if (old) { old.replaceWith(msgNode(m)); scrollEnd() } }
  function setBusy() { const b = document.getElementById('chat-go'); if (b) { b.disabled = CH.busy; b.textContent = CH.busy ? 'Working…' : 'Send' } }

  window.chatSend = async function (text) {
    text = String(text || '').trim(); if (!text) return; if (CH.busy) return toast('Please wait for the answer first.');
    if (text.length < 4) return toast('Write a little more, for example "dashboard for this month".');
    const hist = CH.msgs.filter(m => !m.pending && m.text).slice(-8).map(m => ({ role: m.role, text: m.text }));
    push({ role: 'user', text }); const pend = push({ role: 'assistant', text: 'Working on it…', pending: true });
    CH.busy = true; setBusy();
    const j = await api('assist', { prompt: text, chat: true, history: hist });
    CH.busy = false; setBusy(); pend.pending = false;
    if (!j) { pend.text = 'That did not work. The message at the top of the page says why.'; pend.err = true } else { pend.text = j.reply || 'Done.'; pend.apps = j.apps || []; pend.steps = j.steps || []; pend.mode = j.mode }
    redraw(pend);
  };
  window.chatGo = () => { const i = document.getElementById('chat-in'); if (!i) return; const t = i.value; i.value = ''; CH.draft = ''; chatSend(t) };
  window.chatClear = () => { if (!CH.msgs.length) return; if (!confirm('Delete this whole conversation? Reports and emails you already made are not affected.')) return; CH.msgs = []; CH.frames.clear(); const l = logEl(); if (l) l.innerHTML = '' };

  function chatV() {
    css(); window.__addCss && window.__addCss(); setTimeout(() => { const l = logEl(); if (l && !l.dataset.ready) { l.dataset.ready = 1; CH.msgs.forEach(m => l.appendChild(msgNode(m))); scrollEnd() } }, 0);
    const chips = ['Dashboard for this month', 'Overdue complaints', 'Recurring issues', 'Staff workload', 'Open the report builder', 'Email the latest report to someone'];
    return `<div id="chat-root" class="card"><div class="wfh"><div><h3 style="margin:0">Chat with your campus data</h3><div class="m">Answers come with charts, tables and forms you can click. Numbers always come from the live complaint data. ${S.studio && S.studio.ai ? 'AI is on.' : 'AI is off: the assistant understands the example requests below.'}</div></div><div><button class="wfbtn" onclick="mailCompose()">✉ Compose email</button><button class="wfbtn d" onclick="chatClear()">Clear chat</button></div></div>
      <div class="chips" style="margin:10px 0">${chips.map(c => `<button class="chip" onclick="chatSend(this.textContent)">${E(c)}</button>`).join('')}</div>
      <div id="chat-log" aria-live="polite">${CH.msgs.length ? '' : '<p class="m" style="margin:auto">Ask something to begin.</p>'}</div>
      <div class="ch-in"><input type="text" id="chat-in" maxlength="800" placeholder="e.g. overdue complaints in Engineering" aria-label="Message" value="${E(CH.draft)}" oninput="CH.draft=this.value" onkeydown="if(event.key==='Enter')chatGo()"><button class="btn bp mt" id="chat-go" style="width:auto" onclick="chatGo()">${CH.busy ? 'Working…' : 'Send'}</button></div></div>`;
  }
  (window.__HUBV = window.__HUBV || {}).chat = chatV;

  /* keep the conversation (and its open apps) alive when the page refreshes itself after a live update */
  const r0 = window.render;
  window.render = () => { if (typeof view !== 'undefined' && view === 'chat' && typeof U !== 'undefined' && U && isA() && document.getElementById('chat-root')) { try { theme() } catch (e) { } return } r0() };
})();
