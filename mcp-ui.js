'use strict';
/* CARE: MCP Apps (interactive UI inside the chat).
   Each tool result can ship with a small web app. A tool names it in _meta.ui.resourceUri ("ui://care/..."), the client reads
   that resource (resources/read, mime type text/html;profile=mcp-app) and shows it in a sandboxed iframe next to the answer.
   The app talks to the client with JSON-RPC over postMessage (ui/initialize, ui/notifications/tool-result, tools/call ...).
   Works in CARE's own chat and in any MCP client that supports MCP Apps. No libraries: charts are plain SVG/HTML.
   Data shown here comes from complaints written by students, so every value is escaped before it is displayed. */
const MIME = 'text/html;profile=mcp-app';

const CSS = `
:root{--bg:transparent;--ink:#1d2733;--mut:#66758a;--line:#d9e0ea;--card:#fff;--in:#f3f6fa;--pri:#0b8d7d;--bad:#c0392b;--warn:#c27a0a;--ok:#17734f;color-scheme:light dark}
:root[data-theme=dark]{--ink:#e8eef6;--mut:#9aa9bd;--line:#2d3a4b;--card:#17202c;--in:#101822;--pri:#35c2af;--bad:#ff7b6b;--warn:#f0b04a;--ok:#4cd39a}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#e8eef6;--mut:#9aa9bd;--line:#2d3a4b;--card:#17202c;--in:#101822;--pri:#35c2af;--bad:#ff7b6b;--warn:#f0b04a;--ok:#4cd39a}}
*{box-sizing:border-box}body{margin:0;padding:12px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
h3{margin:0 0 8px;font-size:15px}.m{color:var(--mut);font-size:12.5px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px;margin:0 0 12px}.k div{background:var(--in);border:1px solid var(--line);border-radius:12px;padding:8px 10px}.k b{display:block;font-size:20px}.k small{color:var(--mut)}
button,select,input,textarea{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 10px}
button{cursor:pointer}button:hover:not(:disabled){border-color:var(--pri)}button.p{background:var(--pri);border-color:var(--pri);color:#fff}button:disabled{opacity:.55;cursor:default}button.on{background:var(--pri);color:#fff;border-color:var(--pri)}
input,textarea,select{width:100%}label{display:block;font-size:12px;color:var(--mut);margin:8px 0 3px}label.c{display:flex;gap:8px;align-items:center;color:var(--ink);font-size:13px;margin:6px 0}label.c input{width:auto}
table{width:100%;border-collapse:collapse;font-size:13px}th{font-size:11px;letter-spacing:.05em;text-align:left;color:var(--mut);padding:6px 8px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap}td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}td small{display:block;color:var(--mut)}
.w{overflow-x:auto}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:600;border:1px solid var(--line);background:var(--in)}
.Critical{color:var(--bad);border-color:var(--bad)}.High{color:var(--warn);border-color:var(--warn)}.bar{display:grid;grid-template-columns:130px 1fr 54px;gap:8px;align-items:center;margin:5px 0;cursor:pointer}.bar:hover span:first-child{color:var(--pri)}
.tr{height:14px;background:var(--in);border-radius:7px;overflow:hidden;position:relative;border:1px solid var(--line)}.tr i{position:absolute;left:0;top:0;bottom:0;background:#0b8d7d55}.tr s{position:absolute;left:0;top:0;bottom:0;background:var(--pri)}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.box{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:10px 0;background:var(--in)}
.hm td,.hm th{text-align:center;cursor:default}.hm td.c{cursor:pointer;border-radius:6px;min-width:52px}
`;

const BRIDGE = `
(function(){
  var seq=0,wait={},h={};
  function send(m){m.jsonrpc='2.0';parent.postMessage(m,'*')}
  function req(method,params){return new Promise(function(ok,no){var i=++seq;wait[i]={ok:ok,no:no};send({id:i,method:method,params:params||{}})})}
  function note(method,params){send({method:method,params:params||{}})}
  function theme(c){c=c||{};var t=c.theme||(c.hostContext&&c.hostContext.theme);if(t)document.documentElement.setAttribute('data-theme',t)}
  addEventListener('message',function(ev){
    if(ev.source!==parent)return;var m=ev.data;if(!m||m.jsonrpc!=='2.0')return;
    if(m.id!==undefined&&!m.method){var p=wait[m.id];if(p){delete wait[m.id];m.error?p.no(new Error(m.error.message||'Request failed')):p.ok(m.result)}return}
    if(m.method==='ui/notifications/tool-result'&&h.result)h.result(m.params||{});
    else if(m.method==='ui/notifications/tool-input'&&h.input)h.input(m.params||{});
    else if(m.method==='ui/notifications/host-context-changed')theme(m.params);
    else if(m.method==='ui/resource-teardown'&&m.id!==undefined)send({id:m.id,result:{}});
  });
  function size(){note('ui/notifications/size-changed',{width:Math.ceil(document.documentElement.scrollWidth),height:Math.ceil(document.documentElement.scrollHeight)})}
  window.APP={
    onResult:function(f){h.result=f},onInput:function(f){h.input=f},
    call:function(name,args){return req('tools/call',{name:name,arguments:args||{}}).then(function(r){if(r&&r.isError){throw new Error(((r.content||[])[0]||{}).text||'The tool failed')}return r&&r.structuredContent?r.structuredContent:r})},
    link:function(u){return req('ui/open-link',{url:u})},message:function(t){return req('ui/message',{role:'user',content:[{type:'text',text:t}]})},size:size,
    start:function(){req('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'care-app',version:'1.0.0'},appCapabilities:{}}).then(function(r){theme(r&&r.hostContext)}).catch(function(){}).then(function(){note('ui/notifications/initialized');size()})}
  };
  if(window.ResizeObserver)new ResizeObserver(size).observe(document.body);
  window.esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  window.$=function(s){return document.querySelector(s)};
})();`;

const shell = (title, body, script) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body>${body}<script>${BRIDGE}</script><script>${script}\nAPP.start();</script></body></html>`;

/* ---------- 1. dashboard: KPIs + clickable chart ---------- */
const dashboard = shell('CARE dashboard', `<div id="root" class="m">Loading…</div>`, `
var D=null,G='by_category',F=null,IN={};
var LAB={by_category:'Category',by_building:'Building',by_priority:'Priority'};
var KP=[['total','Complaints'],['open','Open'],['resolved','Resolved'],['overdue','Overdue'],['critical','Critical'],['avgRes','Avg hours to resolve'],['sla','Within deadline %']];
function draw(){
  if(!D){return}
  var k=KP.filter(function(x){return D[x[0]]!=null}).map(function(x){return '<div><b class="'+((x[0]==='overdue'||x[0]==='critical')&&D[x[0]]?'bad':'')+'">'+esc(D[x[0]])+'</b><small>'+x[1]+'</small></div>'}).join('');
  var rows=D[G]||[],mx=Math.max(1,Math.max.apply(null,rows.map(function(r){return r.total}).concat([1])));
  var bars=rows.map(function(r,i){return '<div class="bar" data-i="'+i+'" title="Click to list these complaints"><span>'+esc(r.name)+'</span><span class="tr"><i style="width:'+(r.total/mx*100)+'%"></i><s style="width:'+((r.open||0)/mx*100)+'%"></s></span><span class="m">'+r.total+(r.open!=null?' · '+r.open+' open':'')+'</span></div>'}).join('')||'<p class="m">No data for this period.</p>';
  $('#root').innerHTML='<div class="row" style="justify-content:space-between"><h3>'+esc(D.period||'Complaints')+'</h3><div class="row">'+Object.keys(LAB).map(function(g){return '<button class="'+(g===G?'on':'')+'" data-g="'+g+'">'+LAB[g]+'</button>'}).join('')+'</div></div><div class="k">'+k+'</div><div class="m" style="margin-bottom:4px">Complaints by '+LAB[G].toLowerCase()+' (dark = still open)</div>'+bars+'<div id="list"></div>';
  document.querySelectorAll('[data-g]').forEach(function(b){b.onclick=function(){G=b.dataset.g;F=null;draw()}});
  document.querySelectorAll('.bar').forEach(function(b){b.onclick=function(){pick(rows[+b.dataset.i])}});
  if(F)list();
}
var L=null;
function pick(r){
  var a=Object.assign({},IN,{limit:25}),f={by_category:'category',by_building:'building',by_priority:'priority'}[G];a[f]=r.name;
  F=r.name;$('#list').innerHTML='<p class="m">Loading '+esc(r.name)+'…</p>';
  APP.call('search_complaints',a).then(function(o){L=o;list()}).catch(function(e){$('#list').innerHTML='<p class="bad">'+esc(e.message)+'</p>'});
}
function list(){
  if(!L){return}
  $('#list').innerHTML='<div class="box"><b>'+esc(F)+'</b> <span class="m">· '+L.count+' complaint'+(L.count===1?'':'s')+(L.count>L.complaints.length?' (showing '+L.complaints.length+')':'')+'</span><div class="w"><table><tbody>'+L.complaints.map(function(c){return '<tr><td><b>'+esc(c.title)+'</b><small>'+esc(c.id)+' · '+esc(c.building)+' · '+esc(c.room)+'</small></td><td><span class="pill '+esc(c.priority)+'">'+esc(c.priority)+'</span></td><td>'+esc(c.status)+(c.overdue?' <span class="bad">overdue</span>':'')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
  APP.size();
}
APP.onInput(function(p){IN=p.arguments||{}});
APP.onResult(function(p){D=p.structuredContent||null;L=null;F=null;draw()});
`);

/* ---------- 2. complaints table (search + overdue) ---------- */
const complaints = shell('Complaints', `<div id="root" class="m">Loading…</div>`, `
var R=[],Q='',S={k:'reported',d:-1},P={Critical:0,High:1,Medium:2,Low:3};
var C=[['title','ISSUE'],['priority','PRIORITY'],['status','STATUS'],['assigned_to','ASSIGNED'],['deadline','DEADLINE']];
function draw(){
  var q=Q.toLowerCase(),rows=R.filter(function(r){return !q||(r.id+' '+r.title+' '+r.building+' '+r.room+' '+r.status+' '+r.assigned_to).toLowerCase().indexOf(q)>=0});
  rows.sort(function(a,b){var x=S.k==='priority'?P[a.priority]:a[S.k],y=S.k==='priority'?P[b.priority]:b[S.k];return (x>y?1:x<y?-1:0)*S.d});
  var late=R.filter(function(r){return r.overdue}).length;
  $('#root').innerHTML='<div class="row" style="justify-content:space-between"><h3>'+R.length+' complaint'+(R.length===1?'':'s')+(late?' · <span class="bad">'+late+' overdue</span>':'')+'</h3><input id="q" placeholder="Filter this list" value="'+esc(Q)+'" style="max-width:220px"></div><div class="w"><table><thead><tr>'+C.map(function(c){return '<th data-k="'+c[0]+'">'+c[1]+(S.k===c[0]?(S.d>0?' ▲':' ▼'):'')+'</th>'}).join('')+'</tr></thead><tbody>'+(rows.map(function(r){return '<tr><td><b>'+esc(r.title)+'</b><small>'+esc(r.id)+' · '+esc(r.building)+' · '+esc(r.room)+(r.hours_late?' · '+esc(r.hours_late)+' h late':'')+(r.incident?' · incident '+esc(r.incident):'')+'</small></td><td><span class="pill '+esc(r.priority)+'">'+esc(r.priority)+'</span></td><td>'+esc(r.status)+'</td><td>'+esc(r.assigned_to)+'</td><td class="'+(r.overdue?'bad':'')+'">'+esc(r.deadline)+'</td></tr>'}).join('')||'<tr><td colspan="5" class="m">Nothing matches.</td></tr>')+'</tbody></table></div>';
  var i=$('#q');i.oninput=function(){var p=i.selectionStart;Q=i.value;draw();var n=$('#q');n.focus();n.setSelectionRange(p,p)};
  document.querySelectorAll('th').forEach(function(h){h.onclick=function(){S=S.k===h.dataset.k?{k:S.k,d:-S.d}:{k:h.dataset.k,d:1};draw()}});
}
APP.onResult(function(p){var o=p.structuredContent||{};R=o.complaints||[];draw()});
`);

/* ---------- 3. staff workload ---------- */
const workload = shell('Staff workload', `<div id="root" class="m">Loading…</div>`, `
APP.onResult(function(p){
  var o=p.structuredContent||{},st=o.staff||[],mx=Math.max(1,Math.max.apply(null,st.map(function(s){return s.open}).concat([1])));
  $('#root').innerHTML='<div class="row" style="justify-content:space-between"><h3>Staff workload</h3>'+(o.unassigned_open?'<span class="pill High">'+o.unassigned_open+' open complaint'+(o.unassigned_open===1?'':'s')+' unassigned</span>':'<span class="pill ok">Everything is assigned</span>')+'</div>'
  +'<div class="m" style="margin-bottom:6px"><span style="color:var(--pri)">■</span> in progress &nbsp;<span style="color:var(--warn)">■</span> awaiting verification &nbsp;<span style="color:#8aa0b8">■</span> other open &nbsp;<span class="bad">!</span> overdue</div>'
  +(st.map(function(s){var ip=s.in_progress,aw=s.awaiting_verification,ot=Math.max(0,s.open-ip-aw);
    return '<div class="bar" style="grid-template-columns:130px 1fr 110px;cursor:default"><span><b>'+esc(s.name)+'</b><br><small class="m">'+esc(s.team||'')+'</small></span><span class="tr" style="display:flex;height:16px"><span style="width:'+(ip/mx*100)+'%;background:var(--pri)"></span><span style="width:'+(aw/mx*100)+'%;background:var(--warn)"></span><span style="width:'+(ot/mx*100)+'%;background:#8aa0b8"></span></span><span class="m">'+s.open+' open'+(s.overdue?' · <b class="bad">'+s.overdue+' !</b>':'')+'<br>'+s.completed+' done'+(s.avg_hours_to_resolve!=null?' · avg '+s.avg_hours_to_resolve+' h':'')+'</span></div>'}).join('')||'<p class="m">No maintenance staff yet.</p>');
});
`);

/* ---------- 4. recurring issues heatmap ---------- */
const recurring = shell('Recurring issues', `<div id="root" class="m">Loading…</div>`, `
var D=null,L=null,SEL=null;
function draw(){
  var is=D.issues||[];if(!is.length){$('#root').innerHTML='<h3>No recurring issues</h3><p class="m">No building has the same kind of complaint '+(D.window_days?'more than once in the last '+D.window_days+' days':'repeatedly')+'.</p>';return}
  var B=[],Ct=[];is.forEach(function(i){if(B.indexOf(i.building)<0)B.push(i.building);if(Ct.indexOf(i.category)<0)Ct.push(i.category)});
  var mx=Math.max.apply(null,is.map(function(i){return i.complaints}));
  var cell=function(b,c){var i=is.filter(function(x){return x.building===b&&x.category===c})[0];if(!i)return '<td class="m">·</td>';return '<td class="c" data-b="'+esc(b)+'" data-c="'+esc(c)+'" title="'+i.complaints+' complaints, '+i.still_open+' still open" style="background:rgba(192,57,43,'+(.15+.7*i.complaints/mx)+');color:#fff;font-weight:700">'+i.complaints+(i.still_open?'<small style="display:inline;color:#fff"> ('+i.still_open+')</small>':'')+'</td>'};
  $('#root').innerHTML='<h3>Recurring issues, last '+(D.window_days||90)+' days</h3><div class="m" style="margin-bottom:6px">Number of complaints (still open). Click a cell for details.</div><div class="w"><table class="hm"><thead><tr><th></th>'+Ct.map(function(c){return '<th>'+esc(c)+'</th>'}).join('')+'</tr></thead><tbody>'+B.map(function(b){return '<tr><th style="text-align:left;cursor:default">'+esc(b)+'</th>'+Ct.map(function(c){return cell(b,c)}).join('')+'</tr>'}).join('')+'</tbody></table></div><div id="d"></div>';
  document.querySelectorAll('td.c').forEach(function(t){t.onclick=function(){show(t.dataset.b,t.dataset.c)}});
}
function show(b,c){
  var i=D.issues.filter(function(x){return x.building===b&&x.category===c})[0];
  $('#d').innerHTML='<div class="box"><b>'+esc(b)+' · '+esc(c)+'</b><div class="m">Rooms: '+esc((i.rooms||[]).join(', '))+'</div><div class="m">Complaints: '+esc((i.ids||[]).join(', '))+'</div><p style="margin:8px 0 0">Look for a shared cause (pipes, wiring, ventilation) in this building.</p><div class="row" style="margin-top:8px"><button id="ls">List the complaints</button></div><div id="ll"></div></div>';
  $('#ls').onclick=function(){$('#ll').innerHTML='<p class="m">Loading…</p>';APP.call('search_complaints',{building:b,category:c,limit:20}).then(function(o){$('#ll').innerHTML='<div class="w"><table><tbody>'+o.complaints.map(function(r){return '<tr><td><b>'+esc(r.title)+'</b><small>'+esc(r.id)+' · '+esc(r.room)+'</small></td><td>'+esc(r.status)+'</td></tr>'}).join('')+'</tbody></table></div>';APP.size()}).catch(function(e){$('#ll').innerHTML='<p class="bad">'+esc(e.message)+'</p>'})};
  APP.size();
}
APP.onResult(function(p){D=p.structuredContent||{};draw()});
`);

/* ---------- 5. email form (operational form) ---------- */
const emailForm = shell('Email a report', `<div id="root" class="m">Loading…</div>`, `
var D=null;
function val(i){return ($('#'+i)||{}).value||''}
function chk(i){return !!($('#'+i)||{}).checked}
function draw(){
  var g=D.google||{},dr=D.draft||{},rs=D.reports||[];
  if(!rs.length){$('#root').innerHTML='<h3>Email a report</h3><p class="m">There are no saved reports yet. Ask for one first, for example "unresolved plumbing complaints this month".</p>';return}
  var sel=D.selected||rs[0].id;
  $('#root').innerHTML='<h3>Email a report from Gmail</h3>'
  +(dr.fromAssistant?'<div class="box warn">Review this draft. <b>Nothing has been sent yet.</b></div>':'')
  +(!g.canEmail?'<div class="box bad">'+(g.connected?'CARE needs permission to send email. Open Integrations, disconnect Google and connect it again.':'Google is not connected. An administrator can connect it under Integrations.')+'</div>':'<div class="m">Sent from '+esc(g.email||'the connected Google account')+'</div>')
  +'<label for="rid">Report</label><select id="rid">'+rs.map(function(r){return '<option value="'+esc(r.id)+'"'+(r.id===sel?' selected':'')+'>'+esc(r.title)+' · '+esc(r.id)+'</option>'}).join('')+'</select>'
  +'<label for="to">To (separate several addresses with commas)</label><input id="to" type="text" placeholder="name@gmail.com" value="'+esc((dr.to||[]).join(', '))+'">'
  +'<label for="cc">Cc (optional)</label><input id="cc" type="text" value="'+esc((dr.cc||[]).join(', '))+'">'
  +'<label for="sj">Subject</label><input id="sj" type="text" maxlength="150" value="'+esc(dr.subject||'')+'" placeholder="Leave empty to use the report name">'
  +'<label for="ms">Message</label><textarea id="ms" rows="3" maxlength="3000" placeholder="Add a short note (optional)">'+esc(dr.message||'')+'</textarea>'
  +'<label class="c"><input type="checkbox" id="pdf" checked> Attach the report as PDF</label><label class="c"><input type="checkbox" id="csv"'+(dr.csv?' checked':'')+'> Attach the data as CSV</label>'
  +'<label class="c"><input type="checkbox" id="lk" checked> Include links to the Google Doc, Sheet and Drive folder (if they exist)</label>'
  +'<label class="c"><input type="checkbox" id="sh"> Also let the recipients view the Google Doc and Sheet (they need a Google account)</label>'
  +'<div class="row" style="margin-top:10px"><button class="p" id="go"'+(g.canEmail?'':' disabled')+'>Send email</button><span id="st" class="m"></span></div>';
  $('#go').onclick=send;
}
function send(){
  var to=val('to').trim();if(!to){$('#st').innerHTML='<span class="bad">Enter at least one email address.</span>';return}
  $('#go').disabled=true;$('#st').textContent='Sending…';
  APP.call('send_report_email',{report_id:val('rid'),to:to,cc:val('cc'),subject:val('sj'),message:val('ms'),include_pdf:chk('pdf'),include_csv:chk('csv'),include_google_links:chk('lk'),share_google_files:chk('sh')}).then(function(r){
    $('#root').innerHTML='<h3 class="ok">✓ Email sent</h3><p>To <b>'+esc((r.to||[]).join(', '))+'</b>'+((r.cc||[]).length?' (cc '+esc(r.cc.join(', '))+')':'')+'</p><p class="m">Subject: '+esc(r.subject)+'<br>Attached: '+esc((r.files||[]).join(', ')||'nothing')+(r.shared&&r.shared.length?'<br>Google access given: '+esc(r.shared.join('; ')):'')+'</p>'+((r.warnings||[]).map(function(w){return '<p class="warn">'+esc(w)+'</p>'}).join(''));
    APP.size();
  }).catch(function(e){$('#go').disabled=false;$('#st').innerHTML='<span class="bad">'+esc(e.message)+'</span>';APP.size()});
}
APP.onResult(function(p){D=p.structuredContent||{};draw()});
`);

/* ---------- 6. report builder (operational form) ---------- */
const builder = shell('Report builder', `<div id="root" class="m">Loading…</div>`, `
var D=null,R=null;
function opts(a,first){return '<option value="">'+first+'</option>'+a.map(function(x){var v=x.key||x,l=x.label||x;return '<option value="'+esc(v)+'">'+esc(l)+'</option>'}).join('')}
function f(i){return ($('#'+i)||{}).value||''}
function draw(){
  $('#root').innerHTML='<h3>Build a report</h3><div class="row"><div style="flex:1 1 170px"><label>Report type</label><select id="ty">'+opts(D.types,'Summary')+'</select></div><div style="flex:1 1 150px"><label>Period</label><select id="pe">'+opts(D.periods,'All time')+'</select></div><div style="flex:1 1 150px"><label>Category</label><select id="ca">'+opts(D.categories,'Any')+'</select></div><div style="flex:1 1 150px"><label>Building</label><select id="bu">'+opts(D.buildings,'Any')+'</select></div><div style="flex:1 1 130px"><label>Priority</label><select id="pr">'+opts(D.priorities,'Any')+'</select></div></div>'
  +'<div class="row" style="margin-top:10px"><button class="p" id="go">Create report</button><span id="st" class="m"></span></div><div id="out"></div>';
  $('#go').onclick=function(){
    var a={};[['ty','type'],['pe','period'],['ca','category'],['bu','building'],['pr','priority']].forEach(function(p){if(f(p[0]))a[p[1]]=f(p[0])});
    $('#go').disabled=true;$('#st').textContent='Working on your real complaint data…';
    APP.call('generate_operations_report',a).then(function(r){R=r;$('#st').textContent='';$('#go').disabled=false;done()}).catch(function(e){$('#go').disabled=false;$('#st').innerHTML='<span class="bad">'+esc(e.message)+'</span>'});
  };
}
function done(){
  var k=Object.keys(R.key_figures||{}).slice(0,6).map(function(n){return '<div><b>'+esc(R.key_figures[n])+'</b><small>'+esc(n)+'</small></div>'}).join('');
  $('#out').innerHTML='<div class="box"><b>'+esc(R.title)+'</b> <span class="m">· '+esc(R.report_id)+' · '+esc(R.period)+' · '+R.complaints_matched+' complaints</span><div class="k" style="margin-top:8px">'+k+'</div><ul style="margin:6px 0 10px;padding-left:18px">'+(R.findings||[]).slice(0,4).map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'
  +'<div class="row"><button data-t="create_google_doc">Google Doc</button><button data-t="create_google_sheet">Google Sheet</button><button data-t="save_report_to_drive">Save to Drive</button><button id="em" class="p">Email it…</button></div><div id="res" class="m" style="margin-top:8px"></div></div>';
  document.querySelectorAll('button[data-t]').forEach(function(b){b.onclick=function(){b.disabled=true;$('#res').textContent='Working…';APP.call(b.dataset.t,{report_id:R.report_id}).then(function(o){$('#res').innerHTML='<span class="ok">✓ Done.</span> '+(o.url?'<a href="#" id="lnk">Open</a>':'')+(o.folder_url?'<a href="#" id="lnk">Open Drive folder</a>':'');var l=$('#lnk');if(l)l.onclick=function(e){e.preventDefault();APP.link(o.url||o.folder_url)}}).catch(function(e){b.disabled=false;$('#res').innerHTML='<span class="bad">'+esc(e.message)+'</span>'})}});
  $('#em').onclick=function(){APP.message('Open the email form for report '+R.report_id).catch(function(){$('#res').innerHTML='<span class="m">Ask the assistant: "email report '+esc(R.report_id)+'".</span>'})};
  APP.size();
}
APP.onResult(function(p){D=p.structuredContent||{types:[],periods:[],categories:[],buildings:[],priorities:[]};draw()});
`);

const APPS = {
  'ui://care/dashboard': { name: 'Complaint dashboard', description: 'KPIs and a clickable chart of complaints by category, building or priority.', html: dashboard },
  'ui://care/complaints': { name: 'Complaint list', description: 'Sortable, filterable table of complaints.', html: complaints },
  'ui://care/workload': { name: 'Staff workload', description: 'Open, in-progress and overdue work per staff member.', html: workload },
  'ui://care/recurring': { name: 'Recurring issues heatmap', description: 'Buildings and categories where the same problem keeps coming back.', html: recurring },
  'ui://care/email': { name: 'Email a report', description: 'Form to send a report (PDF/CSV and Google links) by Gmail.', html: emailForm },
  'ui://care/report-builder': { name: 'Report builder', description: 'Form to create a report, then save it to Google or email it.', html: builder }
};

module.exports = {
  MIME,
  list: () => Object.entries(APPS).map(([uri, a]) => ({ uri, name: a.name, description: a.description, mimeType: MIME })),
  read: uri => { const a = APPS[uri]; return a ? { uri, mimeType: MIME, text: a.html, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } } : null; },
  has: uri => !!APPS[uri]
};
