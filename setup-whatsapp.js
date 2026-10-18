#!/usr/bin/env node
'use strict';
// One-time WhatsApp setup for CARE (Twilio):  node setup-whatsapp.js
// Asks for your Twilio details, writes them to the .env file next to this script, and can send a test message.
// Your keys stay on this computer. Nothing is sent anywhere except to Twilio when you run the test.
const fs = require('fs'), path = require('path'), rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const lines = [], waiting = []; let closed = false;
rl.on('line', l => waiting.length ? waiting.shift()(l) : lines.push(l)); rl.on('close', () => { closed = true; waiting.splice(0).forEach(f => f('')) });
const ask = (q, d) => { process.stdout.write(q + (d ? ` [${d}]` : '') + ': '); return new Promise(r => { const done = a => { if (closed || lines.length) process.stdout.write('\n'); r(String(a).trim() || d || '') }; lines.length ? done(lines.shift()) : waiting.push(done) }) };
const file = path.join(__dirname, '.env');
function setKeys(o) {
  let t = ''; try { t = fs.readFileSync(file, 'utf8') } catch (e) { }
  Object.entries(o).forEach(([k, v]) => { const re = new RegExp('^\\s*#?\\s*' + k + '\\s*=.*$', 'm'); t = re.test(t) ? t.replace(re, k + '=' + v) : t + (t && !t.endsWith('\n') ? '\n' : '') + k + '=' + v + '\n' });
  fs.writeFileSync(file, t);
}
(async () => {
  console.log('\nCARE WhatsApp setup (Twilio). Your keys are saved only in the .env file on this computer.\n');
  const sid = await ask('Twilio Account SID (starts with AC)');
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) { console.log('\nThat does not look like an Account SID (AC followed by 32 characters). Copy it from the Twilio Console home page.'); return rl.close() }
  const token = await ask('Twilio Auth Token');
  if (token.length < 16) { console.log('\nThat Auth Token looks too short. Copy it from the Twilio Console home page.'); return rl.close() }
  const from = await ask('WhatsApp sender number (the Twilio sandbox number, with +)', '+14155238886');
  const cc = await ask('Country code for numbers saved without one', '91');
  const pub = await ask('Public address of CARE for the tracking link, e.g. https://your-site.com (Enter to skip)', '');
  setKeys({ TWILIO_SID: sid, TWILIO_TOKEN: token, TWILIO_WA_FROM: from.replace(/[^\d+]/g, ''), WA_DEFAULT_CC: cc.replace(/\D/g, ''), ...(pub ? { PUBLIC_URL: pub } : {}) });
  console.log('\nSaved to ' + file);
  const to = await ask('\nPhone to send a test to, with country code (it must have joined the Twilio sandbox). Enter to skip', '');
  rl.close();
  if (to) {
    Object.assign(process.env, { TWILIO_SID: sid, TWILIO_TOKEN: token, TWILIO_WA_FROM: from.replace(/[^\d+]/g, ''), WA_DEFAULT_CC: cc.replace(/\D/g, '') });
    const t = require('./whatsapp.js')({ db: { sos: [], users: {} }, now: Date.now, bad() { }, clean: x => x, audit() { }, A: {} }).test, n = t.digits(to);
    if (!n) return console.log('\nThat phone number is not valid. Run  node wa-test.js +91XXXXXXXXXX  later to test.');
    const r = await t.send(n, { who: 'CARE test', type: 'Test alert', loc: 'CARE server', map: '', link: pub || 'http://localhost:3000' });
    console.log(r.ok ? '\nSENT. Check WhatsApp on ' + n + '.' : '\nNOT SENT: ' + r.why + '\n(Most common reason: that phone has not sent the join code to the Twilio sandbox number yet.)');
  }
  console.log('\nDone. Restart the server with  node server.js  . It should print: WhatsApp SOS: automatic sending is ON (twilio).');
})();
