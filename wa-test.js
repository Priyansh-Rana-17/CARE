#!/usr/bin/env node
'use strict';
// Checks your WhatsApp keys: node wa-test.js +91XXXXXXXXXX   (the number must be allowed to receive: Twilio sandbox joined, or Meta test/template)
try { require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }) } catch (e) { }
const t = require('./whatsapp.js')({ db: { sos: [], users: {} }, now: Date.now, bad() { }, clean: x => x, audit() { }, A: {} }).test;
(async () => {
  if (!t.provider()) return console.log('No keys found. Create .env from .env.example first.');
  const to = t.digits(process.argv[2]); if (!to) return console.log('Give a phone number with country code, e.g. node wa-test.js +919876543210');
  const r = await t.send(to, { who: 'CARE test', type: 'Test alert', loc: 'CARE server', map: '', link: process.env.PUBLIC_URL || 'http://localhost:3000' });
  console.log(r.ok ? 'SENT. Check WhatsApp on ' + to : 'NOT SENT: ' + r.why);
})();
