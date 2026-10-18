'use strict';
/* CARE: SOS alerts that are really SENT on WhatsApp (not just opened in the WhatsApp app).
   WhatsApp can only be sent by a business API. Google Cloud / Google Workspace has no WhatsApp API, so this uses one of:
     1) Meta WhatsApp Cloud API (direct, from developers.facebook.com)  -> WA_TOKEN + WA_PHONE_ID  (+ WA_TEMPLATE, see README)
     2) Twilio WhatsApp                                                 -> TWILIO_SID + TWILIO_TOKEN + TWILIO_WA_FROM
   Nothing is faked: if neither is configured, the app keeps its old behaviour (opens WhatsApp with the text filled in).
   The message goes to the contacts the student / staff member saved, only for their own SOS (administrators and responders may also trigger it). */
module.exports = function (C) {
  const { db, now, bad, clean, audit } = C, env = process.env;
  const META = () => !!(env.WA_TOKEN && env.WA_PHONE_ID), TWILIO = () => !!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_WA_FROM);
  const provider = () => (env.WA_PROVIDER === 'twilio' && TWILIO()) ? 'twilio' : (env.WA_PROVIDER === 'meta' && META()) ? 'meta' : META() ? 'meta' : TWILIO() ? 'twilio' : '';
  const CC = String(env.WA_DEFAULT_CC || '91').replace(/\D/g, '');   /* country code added to numbers written without one (default 91 = India) */
  const digits = p => {
    let s = String(p || '').trim(), plus = s.startsWith('+'); s = s.replace(/\D/g, '');
    if (!plus && s.startsWith('00')) { s = s.slice(2); plus = true }
    if (!plus) { s = s.replace(/^0+/, ''); if (s.length <= 10 && CC) s = CC + s }
    return /^\d{8,15}$/.test(s) ? s : '';
  };
  const origin = req => { if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, ''); const h = req && req.headers && req.headers.host; const pr = (env.TRUST_PROXY && req.headers['x-forwarded-proto']) || 'http'; return h ? pr + '://' + h : '' };
  const post = async (url, opt) => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
    try { const r = await fetch(url, { ...opt, signal: ac.signal }), j = await r.json().catch(() => ({})); return { ok: r.ok, j } }
    catch (e) { return { ok: false, j: { error: { message: e.name === 'AbortError' ? 'The WhatsApp service did not answer in time.' : 'Could not reach the WhatsApp service.' } } } }
    finally { clearTimeout(t) }
  };
  const why = j => String((j && j.error && (j.error.message || j.error.error_user_msg)) || (j && j.message) || 'The WhatsApp service refused the message.').slice(0, 200);
  async function send(to, v) {   /* v = { who, type, loc, map, link } */
    if (provider() === 'meta') {
      const base = (env.WA_API_BASE || 'https://graph.facebook.com/v20.0').replace(/\/$/, ''), body = env.WA_TEMPLATE
        ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: env.WA_TEMPLATE, language: { code: env.WA_TEMPLATE_LANG || 'en' }, components: [{ type: 'body', parameters: [v.who, v.type, v.loc, v.link].map(text => ({ type: 'text', text: String(text).replace(/[\r\n\t]+/g, ' ').slice(0, 300) })) }] } }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: text(v) } };
      const r = await post(`${base}/${env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.WA_TOKEN }, body: JSON.stringify(body) });
      return r.ok ? { ok: 1 } : { ok: 0, why: why(r.j) };
    }
    const base = (env.TWILIO_API_BASE || 'https://api.twilio.com').replace(/\/$/, '');
    const f = new URLSearchParams({ From: 'whatsapp:' + (env.TWILIO_WA_FROM.startsWith('+') ? env.TWILIO_WA_FROM : '+' + env.TWILIO_WA_FROM.replace(/\D/g, '')), To: 'whatsapp:+' + to, Body: text(v) });
    const r = await post(`${base}/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(env.TWILIO_SID + ':' + env.TWILIO_TOKEN).toString('base64') }, body: f.toString() });
    return r.ok ? { ok: 1 } : { ok: 0, why: why(r.j) };
  }
  const text = v => `EMERGENCY SOS from ${v.who}: ${v.type} at ${v.loc}.${v.map ? ' GPS: ' + v.map : ''} Live tracker & chat: ${v.link}`;

  const actions = {
    /* d.id = SOS id; d.phone (optional) = send to just that one saved contact */
    async sosWhatsApp(u, d, req) {
      if (!provider()) return { ok: 1, configured: false };
      const s = db.sos.find(x => x.id === String(d.id || '')); if (!s) bad('SOS request not found.', 404);
      if (!(s.uid === u.id || ['admin', 'responder'].includes(u.role))) bad('Not allowed.', 403);
      if (s.status === 'Resolved') bad('This SOS is already resolved.');
      let list = (s.contacts || []).slice(0, 5); if (d.phone) { const w = digits(d.phone); list = list.filter(c => digits(c.p) === w) }
      if (!list.length) bad('No saved contacts to alert.');
      const t = now(); s.waSent = s.waSent || {};
      const v = { who: s.who, type: s.type, loc: s.loc, map: s.coords ? `https://maps.google.com/?q=${s.coords.lat},${s.coords.lng}` : '', link: origin(req) + '/#track=' + s.token };
      let sent = 0; const failed = [];
      for (const c of list) {
        const to = digits(c.p); if (!to) { failed.push({ n: c.n, why: 'The phone number is not valid. Write it with the country code, for example +91 98765 43210.' }); continue }
        if (t - (s.waSent[to] || 0) < 60000) { failed.push({ n: c.n, why: 'Already alerted less than a minute ago.' }); continue }
        const r = await send(to, v);
        if (r.ok) { s.waSent[to] = t; sent++ } else failed.push({ n: c.n, why: r.why });
      }
      if (sent) { s.tl = s.tl || []; s.tl.push([`WhatsApp alert sent to ${sent} contact${sent === 1 ? '' : 's'}`, now()]); audit(u, `sent the WhatsApp alert of ${s.id} to ${sent} contact${sent === 1 ? '' : 's'}`) }
      return { ok: 1, configured: true, provider: provider(), sent, failed };
    }
  };
  /* Pressing SOS now sends the WhatsApp alert by itself: the original "sos" action is wrapped, so nothing else has to be clicked. */
  const sos0 = C.A.sos;
  if (typeof sos0 === 'function') C.A.sos = async function (u, d, req) {
    const r = await sos0.apply(this, arguments);
    if (provider() && r && r.id) setImmediate(async () => {
      try {
        const j = await actions.sosWhatsApp(u, { id: r.id }, req), s = db.sos.find(x => x.id === r.id), f = (j && j.failed) || [];
        if (s && f.length) { s.tl = s.tl || []; s.tl.push([`WhatsApp not delivered to ${f.map(x => x.n).join(', ')}: ${f[0].why}`, now()]) }
      } catch (e) {
        const s = db.sos.find(x => x.id === r.id); if (s) { s.tl = s.tl || []; s.tl.push([`WhatsApp alert not sent: ${e.m || e.message || 'unknown error'}`, now()]) }
      }
      try { C.save() } catch (e) { }
    });
    return r;
  };
  console.log(provider() ? `WhatsApp SOS: automatic sending is ON (${provider()})` : 'WhatsApp SOS: automatic sending is OFF. Add TWILIO_* or WA_* keys to .env (see .env.example)');
  return {
    actions,
    test: { send, digits, provider },
    state: u => ['student', 'staff'].includes(u.role) ? { wa: { configured: !!provider() } } : {},
    docs: { 'POST /api/act sosWhatsApp': '{id, phone?} really sends the SOS text on WhatsApp to the saved contacts (needs the Meta WhatsApp Cloud API or Twilio; see README)' }
  };
};
