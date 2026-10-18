#!/usr/bin/env node
'use strict';
// CARE MCP bridge for apps that start MCP servers as a command (stdio), e.g. Claude Desktop.
// It forwards each JSON-RPC line to your running CARE server's /mcp endpoint. No packages needed (Node 18+).
//   CARE_URL=http://localhost:3000  CARE_MCP_TOKEN=<token from Integrations>  node mcp-stdio.js
const url = (process.env.CARE_URL || 'http://localhost:3000').replace(/\/$/, '') + '/mcp', token = process.env.CARE_MCP_TOKEN || '';
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
if (!token) console.error('CARE_MCP_TOKEN is not set. Copy the token from CARE > Integrations.');
require('readline').createInterface({ input: process.stdin }).on('line', async line => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line) } catch (e) { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
  const fail = m => { if (!Array.isArray(msg) && msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: m } }) };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: line });
    if (r.status === 202) return;
    const t = (await r.text()).trim();
    if (t.startsWith('{"jsonrpc"') || t.startsWith('[')) process.stdout.write(t + '\n');
    else fail(`CARE answered ${r.status}${r.status === 401 ? ' (wrong or missing token)' : ''}: ${t.slice(0, 160)}`);
  } catch (e) { fail('Cannot reach CARE at ' + url + ': ' + e.message) }
});
