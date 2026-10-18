'use strict';
// CARE backend: zero dependencies. Run: node server.js  (Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
try{require('fs').readFileSync(require('path').join(__dirname,'.env'),'utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!l.trim().startsWith('#')&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')})}catch(e){}

const PORT=+process.env.PORT||3000,DIR=__dirname,DD=process.env.DATA_DIR||DIR,DATA=path.join(DD,'data.json'),UP=path.join(DD,'uploads');
const BLD={'Science Block':['Room 204','Lab 204','Floor 2'],'Engineering':['Room 104','Workshop'],'Arts Block':['Room 206'],'Library':['Reading Hall','East Wing'],'Student Centre':['Cafeteria','Washroom G']};
const CATS=['Electrical','Plumbing','Cleanliness','Equipment','Safety'],
ST=['Submitted','Under review','Assigned','Accepted','In progress','Blocked','Awaiting verification','Resolved','Reopened','Withdrawn'],
PRI=['Critical','High','Medium','Low'],TEAM=['Unassigned','Akash M.','Neha P.','Housekeeping','IT support','Security team'],
DUE={Critical:4,High:24,Medium:72,Low:168},BASEP={Safety:'High',Electrical:'Medium',Plumbing:'Medium',Cleanliness:'Medium',Equipment:'Low'},
STAFF_DEPT={'Akash M.':'Electrical','Neha P.':'Plumbing','Housekeeping':'Cleanliness','IT support':'Equipment','Security team':'Safety','Security Desk':'Safety'},
DEPT_STAFF={Electrical:'Akash M.',Plumbing:'Neha P.',Cleanliness:'Housekeeping',Equipment:'IT support',Safety:'Security team'},
CRIT=/\b(fire|smoke|spark\w*|exposed wire|short circuit|gas leak|electric shock|flood\w*|collapse\w*|assault|harass\w*|stalk\w*)\b/i;
let db={seq:1000,sosSeq:0,users:{},reports:[],sos:[],notes:{},audit:[],workflows:[],wfLogs:[]};
fs.mkdirSync(UP,{recursive:true});
try{db=JSON.parse(fs.readFileSync(DATA,'utf8'))}catch(e){}
db.workflows=db.workflows||[];db.wfLogs=db.wfLogs||[];db.insights=db.insights||[];
let wt;const flush=()=>{try{fs.writeFileSync(DATA+'.tmp',JSON.stringify(db));fs.renameSync(DATA+'.tmp',DATA)}catch(e){console.error('save failed',e.message)}};
const save=()=>{clearTimeout(wt);wt=setTimeout(flush,200)};
process.on('SIGINT',()=>{flush();process.exit()});process.on('SIGTERM',()=>{flush();process.exit()});
const EMBED=null;//EMBED
let STU=null;
const asset=n=>EMBED?EMBED[n]:fs.readFileSync(path.join(DIR,n),'utf8');
const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
const mkUser=(name,email,role,pw,team='')=>{const salt=crypto.randomBytes(16).toString('hex'),id=crypto.randomUUID(),tm=team||STAFF_DEPT[name]||(role==='maintenance'?'General':'');return db.users[id]={id,name,email,role,team:tm,salt,hash:hash(pw,salt),contacts:[],ok:0,fake:0,score:800}};
if(!Object.keys(db.users).length){console.log('\nFirst run: staff accounts created (shown once, delete data.json to reset):');
 [['Campus Admin','admin','admin'],['Akash M.','akash','maintenance'],['Neha P.','neha','maintenance'],['Housekeeping','housekeeping','maintenance'],['IT support','it','maintenance'],['Security team','security','maintenance'],['Security Desk','desk','responder']]
 .forEach(([n,e,r])=>{const ad=r==='admin',pw=(ad&&process.env.ADMIN_PASSWORD)||crypto.randomBytes(7).toString('base64url'),em=(ad&&process.env.ADMIN_EMAIL)||e+'@care.edu';mkUser(n,em,r,pw);console.log(`  ${r.padEnd(12)} ${em.padEnd(24)} ${ad&&process.env.ADMIN_PASSWORD?'(from ADMIN_PASSWORD)':pw}`)});console.log('');save()}
if(process.env.ADMIN_PASSWORD){const em=(process.env.ADMIN_EMAIL||'admin@care.edu').toLowerCase(),a=Object.values(db.users).find(x=>x.email===em&&x.role==='admin');if(a){a.salt=crypto.randomBytes(16).toString('hex');a.hash=hash(process.env.ADMIN_PASSWORD,a.salt);save()}}
/* ---------- helpers & validation ---------- */
function validateImageBuffer(buf){
 if(!buf||buf.length<12)return null;
 if(buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return{ext:'jpg',mime:'image/jpeg'};
 if(buf[0]===0x89&&buf[1]===0x50&&buf[2]===0x4e&&buf[3]===0x47&&buf[4]===0x0d&&buf[5]===0x0a&&buf[6]===0x1a&&buf[7]===0x0a)return{ext:'png',mime:'image/png'};
 if(buf[0]===0x52&&buf[1]===0x49&&buf[2]===0x46&&buf[3]===0x46&&buf[8]===0x57&&buf[9]===0x45&&buf[10]===0x42&&buf[11]===0x50)return{ext:'webp',mime:'image/webp'};
 return null;
}
function parseBase64Image(dataUrl,maxSize=5e6){
 if(typeof dataUrl!=='string')bad('Invalid image data.');
 const m=/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/.exec(dataUrl);
 if(!m)bad('Invalid image format. Supported formats: JPEG, PNG, WebP.');
 const raw=m[2];if(raw.length>maxSize*1.45)bad('Image exceeds maximum allowed size of 5 MB.');
 const buf=Buffer.from(raw,'base64');if(buf.length>maxSize)bad('Image exceeds maximum allowed size of 5 MB.');
 const v=validateImageBuffer(buf);if(!v)bad('File content does not match a valid JPEG, PNG, or WebP image.');
 return{buf,ext:v.ext,mime:v.mime};
}
const bad=(m,c=400)=>{throw{c,m}},now=()=>Date.now(),clean=(s,n)=>String(s??'').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ').trim().slice(0,n);
const open1=r=>!['Resolved','Withdrawn'].includes(r.status)&&!['duplicate','fake'].includes(r.mod),find=id=>db.reports.find(r=>r.id===String(id));
const note=(uid,t)=>{const a=db.notes[uid]=db.notes[uid]||[];a.unshift({t,ts:now(),read:0});a.length=Math.min(a.length,100)};
const notifyRole=(role,t)=>Object.values(db.users).filter(u=>u.role===role).forEach(u=>note(u.id,t));
const audit=(u,a)=>{db.audit.unshift({t:now(),who:u.name,a});db.audit.length=Math.min(db.audit.length,500)};
const ipOf=req=>(process.env.TRUST_PROXY==='1'&&String(req.headers['x-forwarded-for']||'').split(',')[0].trim())||req.socket.remoteAddress;
const need=(u,...r)=>{if(!r.includes(u.role))bad('Not allowed.',403)};
const sess=new Map(),rl=new Map(),ck=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=')).filter(x=>x[0]&&x[1]));
const who=req=>{const t=ck(req).care_sid,s=t&&sess.get(t);if(!s||s.exp<now()){t&&sess.delete(t);return null}return db.users[s.uid]||null};
const blocked=k=>(rl.get(k)||[]).filter(t=>now()-t<9e5).length>=10,fail=k=>rl.set(k,[...(rl.get(k)||[]).filter(t=>now()-t<9e5),now()]);
const login=(res,req,u)=>{const t=crypto.randomBytes(32).toString('hex');sess.set(t,{uid:u.id,exp:now()+6048e5});
 res.setHeader('Set-Cookie',`care_sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`)};
const setStatus=(r,s,u)=>{const from=r.status;r.status=s;r.upd=now();r.hist.push([s,r.upd,u.name]);if(s==='Resolved')r.resolved=r.upd;else delete r.resolved;
 if(r.uid!==u.id)note(r.uid,`${r.title} is now ${s.toLowerCase()}`);statusHooks(r,from,s)};
const unscore=r=>{const o=db.users[r.uid];if(o&&r.scored==='valid'){o.ok--;o.score-=10}if(o&&r.scored==='fake'){o.fake--;o.score+=r.anon?15:10}delete r.scored};
const sc=u=>({id:u.id,name:u.name,email:u.email,role:u.role,team:u.team||STAFF_DEPT[u.name]||'',score:u.score,ok:u.ok,acc:u.ok+u.fake?Math.round(100*u.ok/(u.ok+u.fake)):100});
/* ---------- workflow automation engine ---------- */
const DEFAULT_WORKFLOWS=[
 {id:'wf_plumbing_auto',name:'Automatic Plumbing Assignment',desc:'Routes plumbing & water complaints to Neha P. with standard SLA.',trigger:'report_submitted',active:true,conditions:[{field:'cat',op:'eq',value:'Plumbing'}],actions:[{type:'assign_staff',value:'Neha P.'},{type:'set_status',value:'Assigned'},{type:'notify_staff',template:'New plumbing task assigned: {{title}}'},{type:'notify_student',template:'Your plumbing report has been assigned to Neha P.'},{type:'audit_log',message:'Auto-assigned plumbing issue to Neha P.'}]},
 {id:'wf_electrical_auto',name:'Automatic Electrical Assignment',desc:'Routes electrical complaints to Akash M.',trigger:'report_submitted',active:true,conditions:[{field:'cat',op:'eq',value:'Electrical'}],actions:[{type:'assign_staff',value:'Akash M.'},{type:'set_status',value:'Assigned'},{type:'notify_staff',template:'New electrical task assigned: {{title}}'},{type:'notify_student',template:'Your electrical report has been assigned to Akash M.'},{type:'audit_log',message:'Auto-assigned electrical issue to Akash M.'}]},
 {id:'wf_cleanliness_auto',name:'Automatic Housekeeping Assignment',desc:'Routes cleanliness complaints to Housekeeping team.',trigger:'report_submitted',active:true,conditions:[{field:'cat',op:'eq',value:'Cleanliness'}],actions:[{type:'assign_staff',value:'Housekeeping'},{type:'set_status',value:'Assigned'},{type:'notify_staff',template:'New housekeeping task: {{title}}'}]},
 {id:'wf_urgent_escalate',name:'Critical Issue Escalation',desc:'Alerts administration immediately when a Critical report is filed.',trigger:'report_submitted',active:true,conditions:[{field:'pri',op:'eq',value:'Critical'}],actions:[{type:'notify_admin',template:'🚨 CRITICAL ESCALATION: {{id}} - {{title}}'},{type:'audit_log',message:'Critical report auto-escalated to administration'}]},
 {id:'wf_overdue_escalate',name:'Overdue Task Escalation',desc:'Alerts staff and supervisors when SLA deadline is exceeded.',trigger:'report_overdue',active:true,conditions:[{field:'overdue',op:'eq',value:true}],actions:[{type:'notify_staff',template:'⚠️ Task {{id}} is overdue! Please update progress.'},{type:'notify_admin',template:'⚠️ SLA Breach: {{id}} ({{as}})'},{type:'audit_log',message:'Overdue task escalated'}]},
 {id:'wf_verification_alert',name:'Completion Verification Routing',desc:'Prompts student to inspect and confirm fix once work is submitted.',trigger:'verification_requested',active:true,conditions:[],actions:[{type:'notify_student',template:'Work completed for {{id}}! Please verify the fix photo and confirm resolution.'},{type:'audit_log',message:'Verification requested from student'}]}
];
if(!db.workflows||!db.workflows.length){db.workflows=DEFAULT_WORKFLOWS;save()}
/* Workflow engine: TRIGGER -> CONDITIONS -> ACTIONS. Triggers are fired from the real complaint flow (submit, update, reopen, photo upload),
   from a one-minute scheduler (deadline approaching, overdue, daily/weekly/monthly runs), and from "Run now". Actions change real data.
   Actions taken by a workflow never start other workflows (prevents loops). */
const WF_TRIGGERS={report_submitted:'New complaint submitted',report_assigned:'Complaint assigned',status_changed:'Complaint status changed',critical_created:'Critical complaint created',deadline_approaching:'Complaint deadline approaching',report_overdue:'Complaint overdue',task_completed:'Staff member completes a task',after_photo_uploaded:'Resolution photo uploaded',report_reopened:'Complaint reopened',verification_requested:'Verification requested',schedule:'Scheduled run (daily, weekly or monthly)'};
const WF_FIELDS={cat:{label:'Category',kind:'text',opts:CATS},pri:{label:'Priority',kind:'text',opts:PRI},bld:{label:'Building',kind:'text',opts:Object.keys(BLD)},status:{label:'Status',kind:'text',opts:ST},as:{label:'Assigned to',kind:'text',opts:TEAM},as_team:{label:'Staff role / team',kind:'text',opts:[...CATS,'General']},
 hours_left:{label:'Hours until deadline (negative = late)',kind:'num'},overdue:{label:'Is overdue',kind:'bool'},workload:{label:"Assignee's open tasks",kind:'num'},similar:{label:'Similar complaints (same building and category, last 30 days)',kind:'num'}};
const WF_OPS={text:['eq','neq','includes'],num:['eq','neq','gt','gte','lt','lte'],bool:['eq']};
const WF_OPLABEL={eq:'is',neq:'is not',includes:'contains',gt:'is more than',gte:'is at least',lt:'is less than',lte:'is at most'};
const WF_ACT={auto_assign:{label:'Assign the least busy available staff member in the right team',p:[]},assign_staff:{label:'Assign to a specific person',p:[{k:'value',kind:'staff',label:'Assign to'}]},
 reassign:{label:'Reassign to another staff member',p:[{k:'value',kind:'staff?',label:'Reassign to'}]},set_status:{label:'Update complaint status',p:[{k:'value',kind:'status',label:'New status'}]},set_priority:{label:'Change priority',p:[{k:'value',kind:'priority',label:'New priority'}]},
 escalate:{label:'Escalate (raise priority, new deadline, alert admins and assignee)',p:[]},notify_staff:{label:'Notify the assigned staff member',p:[{k:'template',kind:'tpl',label:'Message'}]},notify_student:{label:'Notify the person who reported it',p:[{k:'template',kind:'tpl',label:'Message'}]},
 notify_admin:{label:'Notify administrators / supervisors',p:[{k:'template',kind:'tpl',label:'Message'}]},notify_team:{label:'Notify the responsible team',p:[{k:'template',kind:'tpl',label:'Message'}]},add_timeline_note:{label:'Add a note to the complaint timeline',p:[{k:'message',kind:'tpl',label:'Timeline note'}]},
 request_verification:{label:'Request verification (status becomes Awaiting verification)',p:[]},find_recurring:{label:'Identify recurring issues',p:[{k:'value',kind:'num',label:'Minimum complaints (same building and category, 90 days)',def:3}]},audit_log:{label:'Write to the audit log',p:[{k:'message',kind:'tpl',label:'Audit message'}]}};
const WF_SOON=[];
const WF_VARS=['title','id','as','bld','room','cat','pri','status','count','ids'];
const WF_TEMPLATES=[
 {key:'plumber',name:'New plumbing complaint: assign an available plumber',trigger:'report_submitted',conditions:[{field:'cat',op:'eq',value:'Plumbing'}],actions:[{type:'auto_assign'},{type:'notify_staff',template:'New plumbing task: {{title}} ({{bld}}, {{room}})'},{type:'notify_student',template:'Your complaint {{id}} was assigned to {{as}}.'},{type:'add_timeline_note',message:'Automatically assigned to the least busy plumber.'}]},
 {key:'critical',name:'Critical complaint: notify the team and supervisor',trigger:'critical_created',conditions:[],actions:[{type:'notify_team',template:'🚨 Critical: {{id}} {{title}} at {{bld}}, {{room}}'},{type:'notify_admin',template:'🚨 Critical complaint {{id}}: {{title}} ({{bld}}, {{room}})'},{type:'audit_log',message:'Critical complaint {{id}} sent to the responsible team and supervisors'}]},
 {key:'overdue',name:'Overdue complaint: escalate to the next authority',trigger:'report_overdue',conditions:[{field:'overdue',op:'eq',value:true}],actions:[{type:'escalate'},{type:'notify_admin',template:'⚠ {{id}} was escalated after missing its deadline ({{as}})'},{type:'add_timeline_note',message:'Escalated automatically after the deadline passed.'}]},
 {key:'recurring',name:'Repeated complaints in one building: record a recurring-issue finding',trigger:'report_submitted',conditions:[{field:'similar',op:'gte',value:3}],actions:[{type:'find_recurring',value:3}]},
 {key:'verify',name:'Task completed: request verification and update the timeline',trigger:'task_completed',conditions:[{field:'status',op:'eq',value:'Resolved'}],actions:[{type:'request_verification'},{type:'add_timeline_note',message:'Work completed by the team. Waiting for the fix to be verified.'}]},
 {key:'weekly',name:'Every Monday: digest of overdue complaints for admins',trigger:'schedule',schedule:{freq:'weekly',hour:9,dow:1,dom:1},conditions:[{field:'overdue',op:'eq',value:true}],actions:[{type:'notify_admin',template:'{{count}} overdue complaints: {{ids}}'},{type:'find_recurring',value:3}]},
 {key:'monthly',name:'Every month: generate a campus maintenance report and save it to Drive',trigger:'schedule',schedule:{freq:'monthly',hour:8,dow:1,dom:1},conditions:[],actions:[{type:'generate_report',value:'summary'},{type:'create_google_doc'},{type:'create_google_sheet'},{type:'save_to_drive'}]}];
let wfBusy=0;const BY='Automation Engine',staffOf=n=>Object.values(db.users).find(x=>x.name===n&&x.role==='maintenance'),teamOf=x=>x.team||STAFF_DEPT[x.name]||'General',
 load1=n=>n&&n!=='Unassigned'?db.reports.filter(x=>open1(x)&&x.as===n).length:0;
function leastBusy(team,exclude){return Object.values(db.users).filter(x=>x.role==='maintenance'&&x.name!==exclude&&teamOf(x)===team).sort((a,b)=>load1(a.name)-load1(b.name)||a.name.localeCompare(b.name))[0]||null}
function wfVal(r,f){const t=now();switch(f){case'hours_left':return Math.round((r.due-t)/36e4)/10;case'overdue':return open1(r)&&r.due<t;case'workload':return load1(r.as);
 case'as_team':{const s=staffOf(r.as);return s?teamOf(s):(STAFF_DEPT[r.as]||'')}case'similar':return db.reports.filter(x=>x.bld===r.bld&&x.cat===r.cat&&!['duplicate','fake'].includes(x.mod)&&t-x.created<30*DAYMS).length;default:return r[f]}}
function wfCond(c,r){const F=WF_FIELDS[c.field];if(!F)return false;let a=wfVal(r,c.field),b=c.value;
 if(F.kind==='num'){a=+a;b=+b}else if(F.kind==='bool'){a=!!a;b=(b===true||b==='true')}else{a=String(a??'');b=String(b??'')}
 switch(c.op){case'eq':return a===b;case'neq':return a!==b;case'includes':return F.kind==='text'&&a.toLowerCase().includes(b.toLowerCase());case'gt':return a>b;case'gte':return a>=b;case'lt':return a<b;case'lte':return a<=b}return false}
const wfMatch=(wf,r)=>(wf.conditions||[]).every(c=>wfCond(c,r));
const fill=(t,r,x={})=>String(t||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>{const v=k in x?x[k]:(r?r[k]:'');return v==null?'':String(v)});
function wfStatus(r,s,msg){r.status=s;r.upd=now();r.hist.push([msg||s,r.upd,BY]);if(s==='Resolved')r.resolved=r.upd;else delete r.resolved}
function wfAssign(r,name,wf,msg){r.as=name;r.upd=now();r.hist.push([msg||'Assigned to '+name+' via workflow: '+wf.name,r.upd,BY]);if(['Submitted','Under review'].includes(r.status))wfStatus(r,'Assigned','Assigned');
 const s=staffOf(name)||Object.values(db.users).find(x=>x.name===name);if(s&&!(wf.actions||[]).some(x=>x.type==='notify_staff'))note(s.id,`New task assigned: ${r.title} (${r.id})`);return`assign ${r.id} → ${name}`}
function wfRecurring(min,r,wf){const t=now(),g={};db.reports.filter(x=>!['duplicate','fake'].includes(x.mod)&&t-x.created<90*DAYMS&&(!r||(x.bld===r.bld&&x.cat===r.cat))).forEach(x=>{(g[x.bld+'|'+x.cat]=g[x.bld+'|'+x.cat]||[]).push(x)});let n=0;
 Object.entries(g).forEach(([k,l])=>{if(l.length<min)return;const[bld,cat]=k.split('|');if(db.insights.some(i=>i.key===k&&i.count===l.length&&t-i.t<7*DAYMS))return;
  db.insights.unshift({id:'ins_'+t.toString(36)+Math.random().toString(36).slice(2,5),key:k,t,kind:'recurring',bld,cat,count:l.length,open:l.filter(open1).length,rooms:[...new Set(l.map(x=>x.room))],reportIds:l.map(x=>x.id).slice(0,30),by:wf.name});db.insights.length=Math.min(db.insights.length,200);
  notifyRole('admin',`🔁 Recurring issue: ${l.length} ${cat.toLowerCase()} complaints in ${bld} in the last 90 days (${l.filter(open1).length} still open). An inspection is recommended.`);n++});
 return n?`recurring issues found: ${n}`:null}
function wfDo(a,r,wf,X){const t=now();switch(a.type){
 case'auto_assign':{if(!open1(r)||r.as!=='Unassigned')return null;const s=leastBusy(r.cat);if(!s)throw new Error(`No staff available for ${r.cat} (${r.id})`);return wfAssign(r,s.name,wf,`Assigned to ${s.name} (least busy ${r.cat} staff) via workflow: ${wf.name}`)}
 case'assign_staff':{if(!open1(r))return null;if(!staffOf(a.value)&&!TEAM.includes(a.value))throw new Error(`Unknown staff member "${a.value}"`);if(r.as===a.value)return null;return wfAssign(r,a.value,wf)}
 case'reassign':{if(!open1(r)||r.as==='Unassigned')return null;let n=a.value;const from=r.as;if(!n){const s=leastBusy(wfVal(r,'as_team')||r.cat,from);if(!s)throw new Error(`No other staff available to take ${r.id}`);n=s.name}if(n===from)return null;
  wfAssign(r,n,wf,`Reassigned from ${from} to ${n} via workflow: ${wf.name}`);const o=staffOf(from);if(o)note(o.id,`${r.id} (${r.title}) was reassigned to ${n}`);return`reassign ${r.id}: ${from} → ${n}`}
 case'set_status':{if(!ST.includes(a.value))throw new Error(`Invalid status "${a.value}"`);if(r.status===a.value)return null;wfStatus(r,a.value,`${a.value} (workflow: ${wf.name})`);return`status ${r.id} → ${a.value}`}
 case'set_priority':{if(!PRI.includes(a.value))throw new Error(`Invalid priority "${a.value}"`);if(!open1(r)||r.pri===a.value)return null;r.pri=a.value;r.due=r.created+DUE[a.value]*36e5;r.upd=t;r.hist.push(['Priority set to '+a.value,t,BY]);return`priority ${r.id} → ${a.value}`}
 case'escalate':{if(!open1(r))return null;const i=PRI.indexOf(r.pri),was=r.pri;r.pri=i>0?PRI[i-1]:r.pri;r.due=t+DUE[r.pri]*36e5;r.overdueEscalated=false;r.escalations=(r.escalations||0)+1;r.upd=t;
  r.hist.push([`Escalated${was!==r.pri?` (${was} → ${r.pri})`:''} via workflow: ${wf.name}`,t,BY]);notifyRole('admin',`⬆ Escalated ${r.id}: ${r.title}${r.as&&r.as!=='Unassigned'?' ('+r.as+')':''}, new deadline set`);const s=staffOf(r.as);if(s)note(s.id,`⬆ ${r.id} was escalated. Please update progress.`);return`escalate ${r.id}: ${was} → ${r.pri}`}
 case'notify_staff':{const s=r.as&&r.as!=='Unassigned'&&(staffOf(r.as)||Object.values(db.users).find(x=>x.name===r.as));if(!s)return null;note(s.id,fill(a.template||'Task alert: {{id}}',r,X));return`notify ${s.name}`}
 case'notify_student':{if(!r.uid||!db.users[r.uid])return null;note(r.uid,fill(a.template||'Update on {{id}}',r,X));return`notify reporter of ${r.id}`}
 case'notify_admin':notifyRole('admin',fill(a.template||'Update on {{id}}',r,X));return'notify admins';
 case'notify_team':{const l=Object.values(db.users).filter(x=>x.role==='maintenance'&&teamOf(x)===r.cat);if(!l.length)return null;const m=fill(a.template||'Update on {{id}}',r,X);l.forEach(x=>note(x.id,m));return`notify ${r.cat} team (${l.length})`}
 case'add_timeline_note':r.hist.push([fill(a.message||'Automation note',r,X),t,BY]);r.upd=t;return`timeline note on ${r.id}`;
 case'request_verification':{if(r.status==='Awaiting verification'||r.mod==='fake'||r.mod==='duplicate'||r.status==='Withdrawn')return null;wfStatus(r,'Awaiting verification',`Awaiting verification (workflow: ${wf.name})`);if(r.uid&&db.users[r.uid])note(r.uid,`Work on ${r.id} is complete. Please check the fix and confirm it.`);return`verification requested for ${r.id}`}
 case'find_recurring':return wfRecurring(Math.max(2,+a.value||3),X&&X.single?r:null,wf);
 case'audit_log':db.audit.unshift({t,who:'Workflow: '+wf.name,a:fill(a.message||'Workflow executed: '+wf.name,r,X)});db.audit.length=Math.min(db.audit.length,500);return'audit log';
 default:if(STU&&STU.wfActions[a.type])return STU.wfActions[a.type](a,r,wf,X);throw new Error(`Action "${a.type}" is not available`)}}
function wfDigest(a,list,wf,X){const f=l=>({count:l.length,ids:l.map(x=>x.id).slice(0,8).join(', ')+(l.length>8?' …':'')});
 if(a.type==='notify_admin'){notifyRole('admin',fill(a.template||'{{count}} complaints: {{ids}}',list[0],{...X}));return'notify admins (digest)'}
 if(a.type==='notify_team'){const g={};list.forEach(x=>(g[x.cat]=g[x.cat]||[]).push(x));let n=0;Object.entries(g).forEach(([c,l])=>Object.values(db.users).filter(u=>u.role==='maintenance'&&teamOf(u)===c).forEach(u=>{note(u.id,fill(a.template||'{{count}} complaints: {{ids}}',l[0],f(l)));n++}));return n?`notify teams (${n})`:null}
 const g={};list.forEach(x=>{if(x.as&&x.as!=='Unassigned')(g[x.as]=g[x.as]||[]).push(x)});let n=0;Object.entries(g).forEach(([nm,l])=>{const s=staffOf(nm);if(s){note(s.id,fill(a.template||'{{count}} tasks: {{ids}}',l[0],f(l)));n++}});return n?`notify staff (${n})`:null}
const WF_GLOBAL=new Set(['find_recurring','audit_log']),WF_DIGEST=new Set(['notify_admin','notify_team','notify_staff']);
function runWf(wf,trigger,list,o={}){const t0=now(),sched=!!o.sched,done=[],errs=[],ids=list.map(x=>x.id),X={count:list.length,ids:ids.slice(0,8).join(', ')+(ids.length>8?' …':''),single:!sched};wfBusy++;
 try{for(const a of(wf.actions||[])){try{const outs=[];
   if(WF_GLOBAL.has(a.type)){const q=wfDo(a,sched?null:list[0],wf,X);if(q)outs.push(q)}
   else if(sched&&WF_DIGEST.has(a.type)){if(list.length){const q=wfDigest(a,list,wf,X);if(q)outs.push(q)}}
   else list.forEach(r=>{try{const q=wfDo(a,r,wf,X);if(q)outs.push(q)}catch(e){errs.push(e.message)}});
   if(outs.length)done.push(outs.length>1&&!WF_GLOBAL.has(a.type)?`${a.type} ×${outs.length}`:outs[0])}catch(e){errs.push(e.message)}}}finally{wfBusy--}
 const rec={id:'wfl_'+t0+'_'+Math.random().toString(36).slice(2,6),wfId:wf.id,wfName:wf.name,trigger,reportId:list.length===1?list[0].id:null,matched:list.length,executed:done,t:t0,ms:now()-t0,success:!errs.length,manual:!!o.manual,sched};
 if(errs.length)rec.error=[...new Set(errs)].slice(0,3).join('; ');db.wfLogs=db.wfLogs||[];db.wfLogs.unshift(rec);if(db.wfLogs.length>500)db.wfLogs.length=500;
 wf.lastRun=t0;wf.lastStatus=errs.length?'error':'success';wf.lastError=rec.error||'';wf.runs=(wf.runs||0)+1;wf.lastMatched=list.length;if(errs.length)wf.fails=(wf.fails||0)+1;save();return rec}
function executeWorkflows(trigger,ctx={},only){if(wfBusy)return;const r=ctx.report||(ctx.id?find(ctx.id):null);if(!r)return;
 (db.workflows||[]).filter(w=>w.active&&w.trigger===trigger&&(!only||w.id===only)).forEach(wf=>{if(wfMatch(wf,r))runWf(wf,trigger,[r])})}
function runScheduled(wf,manual){const l=db.reports.filter(r=>open1(r)&&wfMatch(wf,r)).slice(0,200);return runWf(wf,'schedule',l,{sched:true,manual})}
function statusHooks(r,from,s){if(from===s)return;executeWorkflows('status_changed',{report:r,from,to:s});if(s==='Reopened')executeWorkflows('report_reopened',{report:r});if(s==='Awaiting verification')executeWorkflows('verification_requested',{report:r});
 if(s==='Awaiting verification'||(s==='Resolved'&&from!=='Awaiting verification'))executeWorkflows('task_completed',{report:r})}
const schedDue=(s,d)=>d.getHours()>=s.hour&&(s.freq==='daily'||(s.freq==='weekly'&&d.getDay()===s.dow)||(s.freq==='monthly'&&d.getDate()===Math.min(s.dom,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()))),
 ymdOf=d=>d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
function wfTick(){const t=now(),d=new Date();
 (db.workflows||[]).filter(w=>w.active&&w.trigger==='deadline_approaching').forEach(wf=>{const h=Math.max(.25,+((wf.triggerCfg||{}).hours)||4);
  db.reports.filter(r=>open1(r)&&r.due>t&&r.due-t<=h*36e5).forEach(r=>{r.wfAppr=r.wfAppr||{};if(r.wfAppr[wf.id]===r.due)return;r.wfAppr[wf.id]=r.due;if(wfMatch(wf,r))runWf(wf,'deadline_approaching',[r])})});
 (db.workflows||[]).filter(w=>w.active&&w.trigger==='schedule'&&w.schedule).forEach(wf=>{if(!schedDue(wf.schedule,d)||wf.lastSlot===ymdOf(d))return;wf.lastSlot=ymdOf(d);runScheduled(wf,false)})}
function wfClean(d){d=d&&typeof d==='object'?d:{};const name=clean(d.name,80);if(name.length<3)bad('Give the workflow a name (at least 3 characters).');
 const trigger=String(d.trigger);if(!WF_TRIGGERS[trigger])bad('Choose a trigger.');const w={name,desc:clean(d.desc,200),trigger,active:d.active!==false&&d.active!=='false',conditions:[],actions:[]};
 if(trigger==='deadline_approaching'){const h=+((d.triggerCfg||{}).hours);if(!(h>=.25&&h<=168))bad('Enter between 0.25 and 168 hours for the deadline warning.');w.triggerCfg={hours:h}}
 if(trigger==='schedule'){const s=d.schedule||{},freq=String(s.freq),hour=+s.hour;if(!['daily','weekly','monthly'].includes(freq))bad('Choose daily, weekly or monthly.');if(!Number.isInteger(hour)||hour<0||hour>23)bad('Choose an hour between 0 and 23.');
  const dow=+s.dow,dom=+s.dom;if(freq==='weekly'&&!(Number.isInteger(dow)&&dow>=0&&dow<=6))bad('Choose a weekday.');if(freq==='monthly'&&!(Number.isInteger(dom)&&dom>=1&&dom<=28))bad('Choose a day of the month between 1 and 28.');w.schedule={freq,hour,dow:Number.isInteger(dow)?dow:1,dom:Number.isInteger(dom)?dom:1}}
 const cs=Array.isArray(d.conditions)?d.conditions:[];if(cs.length>8)bad('Use at most 8 conditions.');
 cs.forEach((c,i)=>{const F=WF_FIELDS[c&&c.field];if(!F)bad(`Condition ${i+1}: choose a field.`);if(!WF_OPS[F.kind].includes(c.op))bad(`Condition ${i+1}: choose how to compare.`);let v=c.value;
  if(F.kind==='num'){v=+v;if(!Number.isFinite(v))bad(`Condition ${i+1}: enter a number.`)}else if(F.kind==='bool'){v=v===true||v==='true'}else{v=clean(v,60);if(!v)bad(`Condition ${i+1}: enter a value.`);if(F.opts&&c.op!=='includes'&&!F.opts.includes(v))bad(`Condition ${i+1}: "${v}" is not a valid ${F.label.toLowerCase()}.`)}
  w.conditions.push({field:c.field,op:c.op,value:v})});
 const as=Array.isArray(d.actions)?d.actions:[];if(!as.length)bad('Add at least one action.');if(as.length>8)bad('Use at most 8 actions.');
 as.forEach((a,i)=>{const M=WF_ACT[a&&a.type];if(!M)bad(`Action ${i+1}: choose an action that is available.`);const o={type:a.type},n=`Action ${i+1}`;
  M.p.forEach(p=>{let v=a[p.k];if(p.kind==='staff'||p.kind==='staff?'){v=clean(v,60);if(!v&&p.kind==='staff')bad(`${n}: choose who to assign.`);if(v&&!staffOf(v)&&!(TEAM.includes(v)&&v!=='Unassigned'))bad(`${n}: "${v}" is not a staff member.`)}
   else if(p.kind==='status'){if(!ST.includes(v))bad(`${n}: choose a status.`)}else if(p.kind==='priority'){if(!PRI.includes(v))bad(`${n}: choose a priority.`)}
   else if(p.kind==='choice'){v=clean(v,40);if(!(p.opts||[]).includes(v))bad(`${n}: choose a ${p.label.toLowerCase()}.`)}else if(p.kind==='num'){v=+v||p.def;if(!(Number.isInteger(v)&&v>=2&&v<=20))bad(`${n}: enter a whole number from 2 to 20.`)}else{v=clean(v,200);if(!v)bad(`${n}: write the message.`)}o[p.k]=v});w.actions.push(o)});return w}
const wfState=()=>({workflows:db.workflows,wfLogs:(db.wfLogs||[]).slice(0,150),insights:(db.insights||[]).slice(0,20),wfMeta:{triggers:WF_TRIGGERS,fields:WF_FIELDS,opsByKind:WF_OPS,opLabel:WF_OPLABEL,actions:WF_ACT,soon:WF_SOON,vars:WF_VARS,templates:WF_TEMPLATES,
 staff:Object.values(db.users).filter(x=>x.role==='maintenance').map(x=>({name:x.name,team:teamOf(x)})),priorities:PRI,statuses:ST}});
function scanOverdueTasks(){
 const t=now();
 db.reports.forEach(r=>{
  if(open1(r)&&r.due<t&&!r.overdueEscalated){
   r.overdue=true;r.overdueEscalated=true;
   r.hist.push(['Task marked overdue (SLA breach)',t,'System SLA Monitor']);
   if(r.as&&r.as!=='Unassigned'){
    const staff=Object.values(db.users).find(u=>u.name===r.as);
    if(staff)note(staff.id,`⚠️ Task ${r.id} (${r.title}) has exceeded its SLA deadline!`);
   }
   notifyRole('admin',`⚠️ Overdue SLA breach: ${r.id} (${r.title}) assigned to ${r.as}`);
   executeWorkflows('report_overdue',{report:r});
  }
 });
}
setInterval(()=>{scanOverdueTasks();wfTick();try{STU&&STU.tick()}catch(e){console.error('tick',e.message)}try{ping()}catch(e){}},60000);setTimeout(()=>{try{wfTick()}catch(e){}},3000);
/* ---------- demo data (first run only; NO_DEMO=1 skips) ---------- */
if(!db.reports.length&&process.env.NO_DEMO!=='1'){const T=Date.now();
 [['Broken corridor light','Electrical','Science Block','Floor 2','In progress','High','Akash M.',12],['Water leak near lab','Plumbing','Engineering','Room 104','Assigned','Medium','Neha P.',60],
  ['Damaged projector','Equipment','Arts Block','Room 206','Resolved','Low','Unassigned',1440],['Air conditioner not working','Equipment','Library','Reading Hall','Submitted','Medium','Unassigned',5],
  ['Dim lights near cafeteria','Safety','Student Centre','Cafeteria','Under review','High','Security team',90],['Broken lock on washroom door','Safety','Student Centre','Washroom G','Submitted','High','Unassigned',200],
  ['Overflowing bin','Cleanliness','Science Block','Lab 204','Submitted','Low','Unassigned',300],['Unlit path behind workshop','Safety','Engineering','Workshop','Under review','High','Security team',240]]
 .forEach(([title,cat,bld,room,status,pri,as,m])=>{const c=T-m*6e4;db.reports.push({id:'CARE-'+(++db.seq),title,cat,bld,room,desc:title,status,pri,as,uid:'seed',anon:0,meBy:[],upd:c,created:c-(status==='Resolved'?6*36e5:0),
  due:c+DUE[pri]*36e5,hist:[[status,c]],inotes:[],photo:false,resolved:status==='Resolved'?c:undefined})});save()}
/* ---------- actions ---------- */
const A={
register(u,d,req,res){const ip=ipOf(req);if(blocked('r'+ip))bad('Too many attempts. Try again later.',429);
 const name=clean(d.name,60),email=clean(d.email,120).toLowerCase(),pw=String(d.password||''),role=d.role==='staff'?'staff':'student';
 if(name.length<2)bad('Enter your full name.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))bad('Enter a valid email.');if(pw.length<8||pw.length>200)bad('Password must be at least 8 characters.');
 if(Object.values(db.users).some(x=>x.email===email)){fail('r'+ip);bad('That email is already registered.')}
 fail('r'+ip);login(res,req,mkUser(name,email,role,pw));return{ok:1}},
login(u,d,req,res){const k='l'+ipOf(req)+clean(d.email,120).toLowerCase();if(blocked(k))bad('Too many attempts. Try again in 15 minutes.',429);
 const x=Object.values(db.users).find(v=>v.email===clean(d.email,120).toLowerCase()),h=hash(String(d.password||'').slice(0,200),x?x.salt:'0'.repeat(32));
 if(!x||!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(x.hash))){fail(k);bad('Incorrect email or password.')}login(res,req,x);return{ok:1}},
logout(u,d,req,res){const t=ck(req).care_sid;sess.delete(t);res.setHeader('Set-Cookie','care_sid=; HttpOnly; Path=/; Max-Age=0');return{ok:1}},
submit(u,d){need(u,'student','staff');const cat=String(d.cat),bld=String(d.bld),room=String(d.room);
 if(!CATS.includes(cat)||!BLD[bld]||!BLD[bld].includes(room))bad('Invalid category or location.');
 const desc=clean(d.desc,1000);if(desc.length<5)bad('Add a short description so the team knows what to fix.');
 const anon=d.anon?1:0;if(anon&&u.score<500)bad('Anonymous reporting is switched off for your account after repeated fake reports.',403);
 const dup=db.reports.find(r=>open1(r)&&r.bld===bld&&r.room===room&&r.cat===cat);if(dup&&!d.force)return{dup:{id:dup.id,title:dup.title}};
 let buf=null;if(d.photo){const s=String(d.photo),p='data:image/jpeg;base64,';if(!s.startsWith(p)||s.length>2.8e6)bad('Photo must be a JPEG under 2 MB.');buf=Buffer.from(s.slice(p.length),'base64');if(buf[0]!==0xff||buf[1]!==0xd8)bad('Invalid photo.')}
 const id='CARE-'+(++db.seq),pri=CRIT.test(desc)?'Critical':BASEP[cat],t=now();if(buf)fs.writeFileSync(path.join(UP,id+'.jpg'),buf);
 db.reports.unshift({id,title:desc.split('\n')[0].length>42?desc.slice(0,40)+'…':desc.split('\n')[0],cat,bld,room,desc,status:'Submitted',pri,as:'Unassigned',uid:u.id,anon,meBy:[],upd:t,created:t,
  due:t+DUE[pri]*36e5,hist:[['Submitted',t]],inotes:[],photo:!!buf});
 note(u.id,`Report ${id} submitted`);if(pri==='Critical')notifyRole('admin',`Critical report ${id}: ${desc.slice(0,60)}`);
 const rep=db.reports[0];executeWorkflows('report_submitted',{report:rep});if(pri==='Critical')executeWorkflows('critical_created',{report:rep});return{id,pri}},
metoo(u,d){need(u,'student','staff');const r=find(d.id);if(!r||!open1(r))bad('Report not found.',404);if(r.uid===u.id)bad('This is your own report.');
 if(r.meBy.includes(u.id))bad('You already confirmed this issue.');r.meBy.push(u.id);r.upd=now();return{ok:1}},
update(u,d){const r=find(d.id);if(!r)bad('Report not found.',404);const adm=u.role==='admin',mt=u.role==='maintenance';
 if(!adm&&!(mt&&r.as===u.name))bad('Not allowed.',403);const log=[],hk=[];
 if(d.status!==undefined){let s=String(d.status);if(mt&&s==='Resolved')s='Awaiting verification';if(!ST.includes(s))bad('Invalid status.');if(mt&&!['In progress','Awaiting verification'].includes(s))bad('Not allowed.',403);if(s!==r.status){setStatus(r,s,u);log.push('status → '+s)}}
 if(adm){if(d.pri!==undefined){if(!PRI.includes(d.pri))bad('Invalid priority.');if(d.pri!==r.pri){r.pri=d.pri;r.due=r.created+DUE[d.pri]*36e5;log.push('priority → '+d.pri);if(d.pri==='Critical')hk.push('critical_created')}}
  if(d.as!==undefined){if(!TEAM.includes(d.as))bad('Invalid assignee.');if(d.as!==r.as){r.hist.push([(r.as==='Unassigned'?'Assigned to ':'Reassigned from '+r.as+' to ')+d.as,now(),u.name]);r.as=d.as;delete r.reassignReq;log.push('assigned → '+d.as);if(d.as!=='Unassigned')hk.push('report_assigned');note(r.uid,`${r.title} assigned to ${d.as}`);if(d.as!=='Unassigned'&&r.status==='Submitted')setStatus(r,'Assigned',u)}}
  if(d.due){const t=Date.parse(String(d.due)+'T23:59:59');if(!isNaN(t)&&t>0){r.due=t;log.push('deadline changed')}}
  const nt=clean(d.note,500);
  if(d.mod){const m=String(d.mod);if(!['valid','duplicate','info','fake'].includes(m))bad('Invalid action.');
   if(m==='duplicate'){if(!/^CARE-\d{4,}$/.test(String(d.dupOf))||!find(d.dupOf)||d.dupOf===r.id)bad('Enter an existing report ID.');r.dupOf=d.dupOf}else delete r.dupOf;
   if(m==='info'&&!nt)bad('Type your question for the reporter in the note box first.');
   unscore(r);r.mod=m;const o=db.users[r.uid];
   if(o&&m==='valid'){o.ok++;o.score=Math.min(1000,o.score+10);r.scored='valid';note(o.id,`${r.id} was confirmed as a valid report. Your score went up.`)}
   if(o&&m==='fake'){o.fake++;o.score=Math.max(0,o.score-(r.anon?15:10));r.scored='fake';note(o.id,`${r.id} was marked as a fake or misused report. Your score went down.`)}
   if(m==='info')note(r.uid,`More information needed on ${r.id}: ${nt}`);log.push('marked '+m)}
  if(nt&&d.mod!=='info'){r.inotes.push([nt,now(),u.name]);log.push('note added')}}
 r.upd=now();if(log.length)audit(u,`${r.id}: ${log.join(', ')}`);hk.forEach(h=>executeWorkflows(h,{report:r}));return{ok:1}},
reopen(u,d){const r=find(d.id);if(!r||r.uid!==u.id||r.status!=='Resolved')bad('Cannot reopen this report.');setStatus(r,'Reopened',u);notifyRole('admin',`${r.id} was reopened by the reporter`);return{ok:1}},
feedback(u,d){const r=find(d.id),n=+d.rating;if(!r||r.uid!==u.id||r.status!=='Resolved'||r.fb)bad('Cannot rate this report.');if(!Number.isInteger(n)||n<1||n>5)bad('Rating must be 1 to 5.');
 r.fb={rating:n,comment:clean(d.comment,300)};return{ok:1}},
afterPhoto(u,d){const r=find(d.id);if(!r)bad('Report not found.',404);if(!(u.role==='admin'||(u.role==='maintenance'&&r.as===u.name)))bad('Not allowed.',403);
 const s=String(d.photo||''),pf='data:image/jpeg;base64,';if(!s.startsWith(pf)||s.length>2.8e6)bad('Photo must be a JPEG under 2 MB.');const buf=Buffer.from(s.slice(pf.length),'base64');if(buf[0]!==0xff||buf[1]!==0xd8)bad('Invalid photo.');
 fs.writeFileSync(path.join(UP,r.id+'-after.jpg'),buf);r.after=true;r.upd=now();r.hist.push(['Fix photo added',r.upd,u.name]);note(r.uid,`A photo of the fix was added to ${r.title}`);audit(u,`${r.id}: fix photo added`);executeWorkflows('after_photo_uploaded',{report:r});return{ok:1}},
createUser(u,d){need(u,'admin');const name=clean(d.name,60),email=clean(d.email,120).toLowerCase(),pw=String(d.password||''),role=String(d.role);
 if(name.length<2)bad('Enter a full name.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))bad('Enter a valid email.');if(pw.length<8)bad('Password must be at least 8 characters.');
 if(!['student','staff','maintenance','responder','admin'].includes(role))bad('Invalid role.');if(Object.values(db.users).some(x=>x.email===email))bad('That email is already registered.');
 mkUser(name,email,role,pw);audit(u,`created ${role} account for ${email}`);return{ok:1}},
setRole(u,d){need(u,'admin');const x=db.users[String(d.id)],role=String(d.role);if(!x)bad('User not found.',404);if(x.id===u.id)bad('You cannot change your own role.');
 if(!['student','staff','maintenance','responder','admin'].includes(role))bad('Invalid role.');x.role=role;audit(u,`${x.email} is now ${role}`);note(x.id,`Your role was changed to ${role}`);return{ok:1}},
aiRun(u,d){need(u,'admin');if(d.kind!=='autoassign')bad('Unknown workflow.');const MAP={Plumbing:'Neha P.',Electrical:'Akash M.',Cleanliness:'Housekeeping',Equipment:'IT support',Safety:'Security team'};let n=0;
 db.reports.filter(r=>open1(r)&&r.as==='Unassigned').forEach(r=>{r.as=MAP[r.cat];if(['Submitted','Under review'].includes(r.status))r.status='Assigned';r.upd=now();r.hist.push(['Auto-assigned to '+r.as,r.upd,u.name+' via AI assistant']);note(r.uid,`${r.title} assigned to ${r.as}`);executeWorkflows('report_assigned',{report:r});n++});
 audit(u,`AI assistant: auto-assigned ${n} reports by category`);return{n}},
saveWorkflow(u,d){need(u,'admin');const w=wfClean(d),old=d.id?db.workflows.find(x=>x.id===String(d.id)):null;if(d.id&&!old)bad('Workflow not found.',404);if(!old&&db.workflows.length>=30)bad('You can have up to 30 workflows.');
 const t=old||{id:'wf_'+crypto.randomBytes(4).toString('hex'),runs:0,fails:0};Object.assign(t,w);if(w.trigger!=='schedule'){delete t.schedule}if(w.trigger!=='deadline_approaching')delete t.triggerCfg;
 if(t.schedule){const n=new Date();t.lastSlot=schedDue(t.schedule,n)?ymdOf(n):t.lastSlot}if(!old)db.workflows.push(t);audit(u,`${old?'edited':'created'} workflow "${t.name}"`);return{ok:1,id:t.id}},
deleteWorkflow(u,d){need(u,'admin');const i=db.workflows.findIndex(x=>x.id===String(d.id));if(i<0)bad('Workflow not found.',404);const[w]=db.workflows.splice(i,1);audit(u,`deleted workflow "${w.name}"`);return{ok:1}},
toggleWorkflow(u,d){need(u,'admin');const w=db.workflows.find(x=>x.id===String(d.id));if(!w)bad('Workflow not found.',404);w.active=!!d.on;audit(u,`${w.active?'enabled':'disabled'} workflow "${w.name}"`);return{ok:1}},
wfPreview(u,d){need(u,'admin');const w=d.id?db.workflows.find(x=>x.id===String(d.id)):wfClean(d.wf);if(!w)bad('Workflow not found.',404);const l=db.reports.filter(r=>open1(r)&&wfMatch(w,r));
 return{n:l.length,sample:l.slice(0,8).map(r=>({id:r.id,title:r.title,bld:r.bld,as:r.as,pri:r.pri})),quiet:1}},
runWorkflow(u,d){need(u,'admin');const w=db.workflows.find(x=>x.id===String(d.id));if(!w)bad('Workflow not found.',404);if(wfBusy)bad('Another workflow is running. Try again.');let rec;
 if(w.trigger==='schedule')rec=runScheduled(w,true);else{const r=find(d.reportId);if(!r)bad('Enter an existing complaint ID, for example CARE-1003.');if(!wfMatch(w,r))return{ran:false,msg:`${r.id} does not meet this workflow's conditions, so nothing was changed.`};rec=runWf(w,w.trigger,[r],{manual:true})}
 audit(u,`ran workflow "${w.name}" manually`);return{ran:true,success:rec.success,matched:rec.matched,executed:rec.executed,error:rec.error||''}},
read(u){(db.notes[u.id]||[]).forEach(n=>n.read=1);return{ok:1,quiet:1}},
addContact(u,d){const n=clean(d.n,60),p=clean(d.p,25);if(!n||!/^[+\d][\d\s\-()]{5,19}$/.test(p))bad('Enter a name and a valid phone number.');if(u.contacts.length>=5)bad('You can save up to 5 contacts.');u.contacts.push({n,p});return{ok:1}},
delContact(u,d){const i=+d.i;if(!Number.isInteger(i)||!u.contacts[i])bad('Contact not found.',404);u.contacts.splice(i,1);return{ok:1}},
sos(u,d){need(u,'student','staff');if(db.sos.some(s=>s.uid===u.id&&s.status!=='Resolved'))bad('You already have an active SOS request.');
 const types=['Security concern','Medical emergency','Fire','Other'],type=types.includes(d.kind)?d.kind:'Other',t=now(),id='SOS-'+(++db.sosSeq);
 const token=crypto.randomBytes(16).toString('hex');
 const coords=(d.lat&&d.lng)?{lat:+d.lat,lng:+d.lng,acc:+d.acc||0,t}:null;
 const locTrail=coords?[coords]:[];
 const contacts=(u.contacts||[]).map(c=>({n:c.n,p:c.p}));
 const sItem={id,token,uid:u.id,who:u.name,type,loc:clean(d.loc,80)||'Not given',desc:clean(d.desc,300),t,status:'Active',coords,locTrail,messages:[],contacts,call:{active:false},tl:[['Alert logged',t]]};
 db.sos.unshift(sItem);
 notifyRole('admin',`🚨 ${type} SOS from ${u.name}`);notifyRole('responder',`🚨 ${type} SOS from ${u.name}`);
 broadcast('sos-new',{id,who:u.name,type,loc:sItem.loc,coords,token});return{id,token,coords}},
sosLoc(u,d){const s=db.sos.find(x=>x.id===String(d.id));if(!s)bad('Request not found.',404);
 if(s.uid!==u.id&&!['admin','responder'].includes(u.role))bad('Not allowed.',403);
 if(s.status==='Resolved')return{ok:0,m:'Resolved',quiet:1};
 const lat=+d.lat,lng=+d.lng,acc=+d.acc||0,t=now();if(isNaN(lat)||isNaN(lng))bad('Invalid coords.');
 s.coords={lat,lng,acc,t};s.locTrail=s.locTrail||[];s.locTrail.push({lat,lng,acc,t});if(s.locTrail.length>60)s.locTrail.shift();
 broadcast('sos-loc',{id:s.id,coords:s.coords,locTrail:s.locTrail});return{ok:1,coords:s.coords,quiet:1}},
sosMsg(u,d){const s=db.sos.find(x=>x.id===String(d.id));if(!s)bad('Request not found.',404);
 if(s.uid!==u.id&&!['admin','responder'].includes(u.role))bad('Not allowed.',403);
 const text=clean(d.text,500);if(!text)bad('Message cannot be empty.');
 s.messages=s.messages||[];
 const msg={id:'m_'+now()+'_'+crypto.randomBytes(4).toString('hex'),uid:u.id,who:u.name,role:u.role,text,t:now()};
 s.messages.push(msg);if(s.messages.length>200)s.messages.shift();
 if(u.id===s.uid){notifyRole('admin',`SOS message from ${u.name}: ${text.slice(0,50)}`);notifyRole('responder',`SOS message from ${u.name}: ${text.slice(0,50)}`)}
 else note(s.uid,`SOS update from ${u.name}: ${text.slice(0,50)}`);
 broadcast('sos-msg',{id:s.id,msg});return{ok:1,msg,quiet:1}},
sosSignal(u,d){const s=db.sos.find(x=>x.id===String(d.id));if(!s)bad('Request not found.',404);
 if(s.uid!==u.id&&!['admin','responder'].includes(u.role))bad('Not allowed.',403);
 const sigType=String(d.sigType);if(!['call-start','call-offer','call-answer','call-ice','call-end'].includes(sigType))bad('Invalid signal.');
 s.call=s.call||{active:false};
 if(sigType==='call-start'||sigType==='call-offer')s.call={active:true,callerId:u.id,caller:u.name,callerRole:u.role,started:now()};
 else if(sigType==='call-end')s.call={active:false,ended:now()};
 broadcast('sos-signal',{id:s.id,fromUid:u.id,fromName:u.name,fromRole:u.role,sigType,data:d.data});return{ok:1,quiet:1}},
sosCancel(u,d){const s=db.sos.find(x=>x.id===String(d.id));if(!s)bad('Request not found.',404);
 if(s.uid!==u.id)bad('Not allowed.',403);
 if(s.status!=='Resolved'){s.status='Resolved';s.tl.push(['Cancelled by reporter',now(),u.name]);if(s.call)s.call.active=false;broadcast('sos-resolved',{id:s.id})}
 return{ok:1}},
sosAct(u,d){need(u,'admin','responder');const s=db.sos.find(x=>x.id===String(d.id));if(!s)bad('Request not found.',404);const t=now(),a=String(d.action);
 if(a==='ack'&&s.status==='Active'){s.status='Acknowledged';s.tl.push(['Acknowledged',t,u.name])}
 else if(a==='assign'&&s.status!=='Resolved'&&s.status!=='Active'){const to=clean(d.to,60);if(!to)bad('Enter who it is assigned to.');s.status='Assigned';s.tl.push(['Assigned to '+to,t,u.name])}
 else if(a==='resolve'&&s.status!=='Resolved'&&s.status!=='Active'){s.status='Resolved';s.tl.push(['Resolved',t,clean(d.note,300)||u.name]);if(s.call)s.call.active=false;broadcast('sos-resolved',{id:s.id})}else bad('That step is not available.');
 note(s.uid,`Your ${s.type} request is now ${s.status.toLowerCase()}`);audit(u,`${s.id}: ${a}`);return{ok:1}}};
/* ---------- leaderboard + AI assistant ---------- */
const lvl=c=>c>=900?'Campus Guardian':c>=800?'Trusted Reporter':c>=700?'Contributor':'Newcomer',DAYMS=864e5;
const board=()=>Object.values(db.users).filter(x=>['student','staff'].includes(x.role)).sort((a,b)=>b.score-a.score||b.ok-a.ok||a.name.localeCompare(b.name));
function lb(u){const b=board(),adm=u.role==='admin',sh=n=>{const w=n.split(' ');return w[0]+(w[1]?' '+w[1][0]+'.':'')},i=b.findIndex(x=>x.id===u.id);
 return{top:b.slice(0,10).map((x,k)=>({rank:k+1,name:adm?x.name:sh(x.name),score:x.score,ok:x.ok,level:lvl(x.score),me:x.id===u.id})),myRank:i<0?0:i+1,total:b.length}}
function solvers(){const g={};db.reports.filter(r=>r.status==='Resolved'&&r.resolved&&r.as!=='Unassigned'&&!['fake','duplicate'].includes(r.mod)).forEach(r=>{(g[r.as]=g[r.as]||[]).push(r.resolved-r.created)});
 return Object.entries(g).sort((a,b)=>b[1].length-a[1].length).map(([n,a])=>[n,a.length,Math.round(a.reduce((x,y)=>x+y,0)/a.length/36e5*10)/10])}
const CATK=[['Plumbing',/plumb|water|leak|\btap|drain|pipe/],['Electrical',/electr|light|socket|wire|power|\bfan/],['Cleanliness',/clean|\bbin\b|dirt|hygien|garbage|waste/],['Equipment',/equip|projector|\bac\b|air cond|computer|bench|furniture/],['Safety',/safety|unsafe|\block|dark|harass|threat/]];
function ai(q0){const q=String(q0||'').toLowerCase().slice(0,300),t=now(),cat=(CATK.find(([c,re])=>re.test(q))||[])[0],bld=Object.keys(BLD).find(b=>q.includes(b.toLowerCase())),
 win=/today/.test(q)?DAYMS:/yesterday/.test(q)?2*DAYMS:/month/.test(q)?30*DAYMS:/week|7 days/.test(q)?7*DAYMS:0,wl=win?' in the last '+(win===DAYMS?'day':win===2*DAYMS?'2 days':win===30*DAYMS?'30 days':'7 days'):'',
 valid=db.reports.filter(r=>!['fake','duplicate'].includes(r.mod)),row=r=>[r.id,r.title,r.bld+' · '+r.room,r.status,r.pri,r.as],RC=['ID','Issue','Location','Status','Priority','Assigned'];
 if(/student|rankboard|rank board|leaderboard|reputation/.test(q)){const b=board().slice(0,10);return{text:b.length?`${b[0].name} leads the student rankboard with ${b[0].score} points.`:'No students yet.',cols:['#','Student','Level','Confirmed','Score'],rows:b.map((x,i)=>[i+1,x.name,lvl(x.score),x.ok,x.score])}}
 if(/(who|which|top|best).*(solv|resolv|fix|staff|worker|member|person|performer|team)|most (problems|issues|reports|tasks)|solved the most|resolved the most/.test(q)){const g={};
  valid.filter(r=>r.status==='Resolved'&&r.resolved&&r.as!=='Unassigned'&&(!win||r.resolved>t-win)&&(!cat||r.cat===cat)).forEach(r=>g[r.as]=(g[r.as]||0)+1);
  const rows=Object.entries(g).sort((a,b)=>b[1]-a[1]).map(([n,c],i)=>[i+1,n,c]);return{text:rows.length?`${rows[0][1]} solved the most${cat?' '+cat.toLowerCase():''} problems${wl}: ${rows[0][2]} resolved.`:`No resolved${cat?' '+cat.toLowerCase():''} problems found${wl}.`,cols:['#','Staff / team','Resolved'],rows}}
 if(/auto.?assign|assign (all|every|the)|distribute|route (them|all)/.test(q)){const n=valid.filter(r=>open1(r)&&r.as==='Unassigned').length;
  return{text:n?`${n} open reports have no assignee. I can route each to its team by category (Plumbing to Neha P., Electrical to Akash M., Cleanliness to Housekeeping, Equipment to IT support, Safety to Security team).`:'Every open report already has an assignee.',action:n?{type:'autoassign',label:`Assign ${n} unassigned reports by category`}:null}}
 if(/summary|overview|status|stats|how are we|digest/.test(q)){const l=valid.filter(r=>!win||r.created>t-win),o=l.filter(open1),top=cnt(l,r=>r.cat)[0];
  return{text:`Summary${wl||' (all time)'}: ${l.length} reports, ${o.length} open, ${l.length-o.length} resolved.`,cols:['Metric','Value'],rows:[['Reports',l.length],['Open',o.length],['Resolved',l.length-o.length],['Overdue',o.filter(r=>r.due<t).length],['Unassigned',o.filter(r=>r.as==='Unassigned').length],['Critical open',o.filter(r=>r.pri==='Critical').length],['Most reported category',top?top[0]+' ('+top[1]+')':'none']]}}
 if(!cat&&!bld&&!win&&!/report|issue|problem|list|show|open|resolved|solved|overdue|unassigned|critical|urgent|high|count|how many/.test(q))return{text:'I can list reports by category, building, status or time period, rank staff who solved the most problems, show the student rankboard, summarise the week, or auto-assign reports. Try one of the examples.',cols:[],rows:[]};
 let l=valid.filter(r=>(!cat||r.cat===cat)&&(!bld||r.bld===bld)&&(!win||r.created>t-win));
 if(/resolved|solved|fixed|closed|completed/.test(q))l=l.filter(r=>r.status==='Resolved');else if(/open|pending|unresolved|active|outstanding/.test(q))l=l.filter(open1);
 if(/critical|urgent/.test(q))l=l.filter(r=>r.pri==='Critical');else if(/\bhigh\b/.test(q))l=l.filter(r=>r.pri==='High');
 if(/unassigned|not assigned/.test(q))l=l.filter(r=>r.as==='Unassigned'&&open1(r));if(/overdue|late|delayed/.test(q))l=l.filter(r=>open1(r)&&r.due<t);
 return{text:`${/how many|count|number/.test(q)?'Count':'Found'}: ${l.length} ${cat?cat.toLowerCase()+' ':''}report${l.length===1?'':'s'}${bld?' in '+bld:''}${wl}.`,cols:RC,rows:l.slice(0,30).map(row)}}
/* ---------- state ---------- */
const cnt=(a,f)=>{const m={};a.forEach(x=>{const k=f(x);m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])};
function state(u){const adm=u.role==='admin',t=now(),op=db.reports.filter(open1),valid=db.reports.filter(r=>!['duplicate','fake'].includes(r.mod));
 const vis=db.reports.filter(r=>adm||(u.role==='maintenance'?r.as===u.name:['student','staff'].includes(u.role)&&(r.uid===u.id||!['fake','duplicate'].includes(r.mod))));
 const reports=vis.map(r=>{const o={id:r.id,title:r.title,cat:r.cat,bld:r.bld,room:r.room,desc:r.desc,status:r.status,pri:r.pri,as:r.as,me:r.meBy.length,upd:r.upd,due:r.due,
  mod:r.mod,dupOf:r.dupOf,overdue:open1(r)&&r.due<t,photo:r.photo,after:!!r.after,before:!!r.before,progress:r.progress||0,completion:r.completion,reassignReq:r.reassignReq,incident:r.incident,created:r.created,resolved:r.resolved,by:r.uid===u.id?'me':'other',anon:r.anon,hist:r.hist.map(h=>adm?h:[h[0],h[1]])};
  if(adm||r.uid===u.id)o.fb=r.fb;o.comments=(r.comments||[]).map(c=>adm||u.role==='maintenance'||c.who===u.name?c:{...c,who:c.role==='admin'?'Administration':'Maintenance team'});if(!adm&&u.role!=='maintenance')delete o.reassignReq;else o.parts=r.parts||[];if(adm){o.reporter=(db.users[r.uid]||{name:r.repName||'Demo data'}).name;o.inotes=r.inotes}return o});
 const sos=db.sos.filter(s=>['admin','responder'].includes(u.role)||s.uid===u.id).map(s=>({
  ...s,
  coords:s.coords||null,
  locTrail:s.locTrail||[],
  messages:s.messages||[],
  contacts:s.contacts||(db.users[s.uid]?db.users[s.uid].contacts||[]:[]),
  call:s.call||{active:false},
  mine:s.uid===u.id,
  uid:undefined
 }));
 const out={me:sc(u),reports,sos,notes:db.notes[u.id]||[],contacts:u.contacts,hot:cnt(op,r=>r.bld),lb:lb(u)};
 if(adm){const done=db.reports.filter(r=>r.resolved),fb=db.reports.filter(r=>r.fb),rec=cnt(valid.filter(r=>t-r.created<7776e6),r=>`${r.bld} — ${r.room} · ${r.cat}`).filter(x=>x[1]>=2);
  out.stats={total:valid.length,open:op.length,awaiting:op.filter(r=>r.as==='Unassigned').length,overdue:op.filter(r=>r.due<t).length,resolved:valid.length-op.length,
   avg:done.length?Math.round(done.reduce((s,r)=>s+r.resolved-r.created,0)/done.length/36e5*10)/10:0};
  out.A={wk:[7,6,5,4,3,2,1,0].map(i=>valid.filter(r=>r.created>t-(i+1)*6048e5&&r.created<=t-i*6048e5).length),rec,byCat:cnt(valid,r=>r.cat),byBld:cnt(op,r=>r.bld),
   workload:cnt(op.filter(r=>r.as!=='Unassigned'),r=>r.as),rating:fb.length?Math.round(fb.reduce((s,r)=>s+r.fb.rating,0)/fb.length*10)/10:0};out.audit=db.audit;out.users=Object.values(db.users).map(x=>({id:x.id,name:x.name,email:x.email,role:x.role,score:x.score,ok:x.ok,fake:x.fake,reports:db.reports.filter(r=>r.uid===x.id).length}));out.solvers=solvers()}
 if(adm)Object.assign(out,wfState());if(STU)Object.assign(out,STU.state(u));return out}
/* ---------- http ---------- */
const clients=new Set();
const broadcast=(event,data)=>{const p=`event: ${event}\ndata: ${typeof data==='string'?data:JSON.stringify(data)}\n\n`;clients.forEach(r=>{try{r.write(p)}catch(e){}})};
const ping=()=>{clients.forEach(r=>{try{r.write('data: 1\n\n')}catch(e){}});broadcast('sync',{t:now()})};
setInterval(()=>clients.forEach(r=>{try{r.write(': hb\n\n')}catch(e){}}),25e3);
const json=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let n=0;const a=[];req.on('data',c=>{n+=c.length;if(n>3e6){no({c:413,m:'Request too large.'});req.destroy()}else a.push(c)});
 req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(a).toString()||'{}'))}catch(e){no({c:400,m:'Bad request.'})}});req.on('error',()=>no({c:400,m:'Bad request.'}))});
/* ---------- feature modules: reports.js google.js ops.js mcp.js (each adds actions, routes and state) ---------- */
const loadMod=n=>EMBED&&EMBED[n]?(()=>{const m={exports:{}};new Function('module','exports','require',EMBED[n])(m,m.exports,require);return m.exports})():require('./'+n);
const CTX={loadMod,unscore,broadcast,db,A,now,bad,clean,note,notifyRole,audit,find,open1,CATS,BLD,PRI,ST,TEAM,DAYMS,DEPT_STAFF,STAFF_DEPT,CRIT,BASEP,CATK,staffOf,teamOf,setStatus,wfStatus,save,json,body,crypto,fs,path,DD,UP};
{const parts=['reports','google','ops','mcp','tidy','home','whatsapp'].map(n=>CTX[n]=loadMod(n+'.js')(CTX));
 parts.forEach(p=>Object.assign(A,p.actions||{}));Object.assign(WF_ACT,CTX.mcp.wfDefs);['generate_report','create_google_doc','create_google_sheet','save_to_drive','email_report'].forEach(k=>WF_GLOBAL.add(k));
 STU={http:async(...a)=>{for(const p of parts)if(p.http&&await p.http(...a))return true;return false},state:u=>Object.assign({},...parts.map(p=>p.state?p.state(u):{})),tick:()=>parts.forEach(p=>p.tick&&p.tick()),wfActions:CTX.mcp.wfActions,docs:Object.assign({},...parts.map(p=>p.docs||{}))}}
const PATCH=function(){window.addC=async()=>{const n=$('#cn').value.trim(),p=$('#cp').value.trim();if(!n||!p)return toast('Enter a name and phone number.');await api('addContact',{n,p})};
 window.delC=i=>api('delContact',{i});const r0=window.rform;window.rform=()=>{r0();const f=document.querySelector('.drop input[type=file]');if(f)f.onchange=function(){pickPhoto(this)}};const a0=window.api;window.api=(t,d)=>{if(t==='sos'&&d){const{type:k,...r}=d;return a0(t,{...r,kind:k})}return a0(t,d)};window.hot=()=>S.hot||[];const s0=window.student;
 window.student=()=>{const m=S.me||{},c=m.score||800,L=c>=900?'Campus Guardian':c>=800?'Trusted Reporter':c>=700?'Contributor':'Newcomer',nx=c>=900?1000:c>=800?900:c>=700?800:700;
  return s0().replace(/<div>\d+<small>score/,'<div>'+c+'<small>score').replace('Trusted Reporter</h3>',L+'</h3>').replace('Level 4 · Campus Guardian','Reputation score '+c)
  .replace(/width:72%/,'width:'+Math.min(100,Math.max(0,c-(nx-100)))+'%').replace(/\d+ points to reach Level 5/,Math.max(0,nx-c)+' points to next level')
  .replace(/<b>\+-?\d+ confirmed<\/b>/,'<b>+'+(m.ok||0)+' confirmed</b>').replace('<b>98% accuracy</b>','<b>'+(m.acc??100)+'% accuracy</b>')};
 NAVS.student.splice(4,0,['rank','check','Leaderboard']);NAVS.admin.splice(1,0,['ai','shield','AI assistant']);NAVS.admin.splice(7,0,['rank','check','Leaderboard'],['users','users','Users & data']);NAVS.admin.splice(NAVS.admin.length-1,0,['workflows','clock','Workflow Automation']);
 const r1=window.render,mine=['ai','rank','users','workflows'];window.AIH=[];
 window.render=()=>{r1();if(U)$('#sosb').style.display=['student','staff'].includes(S.role)?'':'none';if(!U||!mine.includes(view))return;if(view!=='rank'&&!isA()){view='overview';return r1()}const t=document.querySelector('#main .top');if(t)$('#main').innerHTML=t.outerHTML+({ai:aiV,rank:rankV,users:usersV,workflows:wfV}[view])()};
 const tb=(h,rows)=>`<div style="overflow-x:auto"><table><thead><tr>${h.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const aiV=()=>head('Workflow automation','AI assistant')+`<div class="card"><p class="m">Ask in plain English about reports, staff and students. It reads the live database.</p><div class="chips">${['Plumbing problems list','Electrical problems last week','Who solved the most problems?','Rankboard of students','Overdue issues','Unassigned issues','Summary of this week','Auto-assign unassigned reports'].map(x=>`<button class="chip" onclick="askAI(this.textContent)">${x}</button>`).join('')}</div>
  <div class="fl"><input type="text" id="aq" placeholder="e.g. critical safety problems in Engineering" aria-label="Ask the assistant" onkeydown="if(event.key==='Enter')askAI()"><button class="btn mt" onclick="askAI()">Ask</button></div></div>`+
  AIH.map((a,i)=>`<div class="card" style="margin-top:14px"><div class="lab">You asked</div><b>${esc(a.q)}</b><p>${esc(a.text)}</p>${a.rows&&a.rows.length?tb(a.cols,a.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`)):''}${a.action?`<br><button class="btn bp" style="width:auto" onclick="runAI(${i})">${esc(a.action.label)}</button>`:''}</div>`).reverse().join('');
 window.askAI=async q=>{q=(typeof q==='string'?q:'')||($('#aq')||{}).value||'';q=q.trim();if(!q)return;try{const r=await fetch('/api/ai?q='+encodeURIComponent(q)),j=await r.json();if(!r.ok)return toast(j.error||'Assistant error');AIH.push({q,...j});render();setTimeout(()=>{const i=$('#aq');i&&i.focus()},0)}catch(e){toast('Server not reachable')}};
 window.runAI=async i=>{const a=AIH[i];if(!a||!a.action||!confirm(a.action.label+'? This is recorded in the audit log.'))return;const j=await api('aiRun',{kind:a.action.type});if(j){a.action=null;a.text=`Done: ${j.n} reports assigned.`;render()}};
 const rankV=()=>{const L=S.lb||{top:[]};return head('Community','Student rankboard')+`<div class="card"><p class="m">Ranked by reputation score. Confirmed reports raise it and fake reports lower it.${L.myRank?` Your rank: <b>#${L.myRank}</b> of ${L.total}.`:''}</p>`+
  tb(['#','STUDENT','LEVEL','CONFIRMED','SCORE'],L.top.map(x=>`<tr${x.me?' style="font-weight:600"':''}><td>${['🥇','🥈','🥉'][x.rank-1]||x.rank}</td><td>${esc(x.name)}${x.me?' (you)':''}</td><td>${x.level}</td><td>${x.ok}</td><td>${x.score}</td></tr>`))+(L.top.length?'':'<p class="m">No students yet.</p>')+`</div>`+
  (isA()&&S.solvers?`<div class="card" style="margin-top:16px"><h3>Maintenance team: most problems solved</h3>`+tb(['#','STAFF / TEAM','SOLVED','AVG HOURS'],S.solvers.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x[0])}</td><td>${x[1]}</td><td>${x[2]}</td></tr>`))+(S.solvers.length?'':'<p class="m">No resolved reports yet.</p>')+`</div>`:'')};
 const ROLES=['student','staff','maintenance','responder','admin'];
 const usersV=()=>head('Administration','Users & data')+`<div class="card"><h3>Create an account</h3><p class="m">Use this to add maintenance staff, responders or other admins.</p><div class="g2"><input type="text" id="nn" placeholder="Full name" aria-label="Full name"><input type="email" id="ne" placeholder="Email" aria-label="Email"></div><div class="g2"><input type="password" id="np" placeholder="Temporary password (8+ characters)" aria-label="Password"><select id="nr" aria-label="Role">${['maintenance','responder','admin','staff','student'].map(r=>`<option value="${r}">${RL[r]}</option>`).join('')}</select></div><button class="btn bp" onclick="mkUserA()">Create account</button></div>
  <div class="card" style="margin-top:16px;padding:0;overflow:hidden"><div style="padding:18px 22px"><h3>All accounts (${(S.users||[]).length})</h3><div class="m">Live database: ${(S.users||[]).length} users · ${S.reports.length} reports · ${S.sos.length} SOS requests. <a href="/api/export" style="color:var(--teal)">Download full export (JSON)</a></div></div>`+
  tb(['NAME','EMAIL','ROLE','SCORE','REPORTS'],(S.users||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td><select class="as" aria-label="Role for ${esc(x.name)}" ${x.id===U.id?'disabled':''} onchange="setRoleA('${x.id}',this.value)">${ROLES.map(r=>`<option value="${r}" ${r===x.role?'selected':''}>${RL[r]}</option>`).join('')}</select></td><td>${x.score}</td><td>${x.reports}</td></tr>`))+`</div>
  <div class="card" style="margin-top:16px"><h3>API</h3><p class="m">Frontend and backend talk over a JSON API, open at <a href="/api" style="color:var(--teal)">/api</a>. Any other app can use it with the same login cookie: GET /api/reports, /api/leaderboard, /api/stats, /api/export, /api/ai?q=… and POST /api/act.</p></div>`;
 window.mkUserA=async()=>{const g=i=>($(i)||{}).value||'';if(await api('createUser',{name:g('#nn'),email:g('#ne'),password:g('#np'),role:g('#nr')}))toast('Account created.')};
 window.setRoleA=async(id,role)=>{if(await api('setRole',{id,role}))toast('Role updated.')};
 const shrink=f=>new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(f);im.onload=()=>{const k=Math.min(1,1280/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.8))};im.onerror=no;im.src=u});
 window.afterPhoto=async(id,i)=>{const f=i.files[0];if(!f)return;try{const photo=await shrink(f);closeM();if(await api('afterPhoto',{id,photo}))toast('Fix photo added.')}catch(e){toast('Could not read that image.')}};
 const d0=window.detail;window.detail=id=>{d0(id);const r=S.reports.find(x=>x.id===id),m=document.querySelector('.mod');if(!m||!r)return;let h='';
  if(r.after)h+=`<div class="lab">After the fix</div><img src="/api/photo/${r.id}?after=1" alt="Photo after the fix" style="max-width:100%;border-radius:14px">`;
  else if(isA()||(isM()&&r.as===U.name))h+=`<div class="lab" style="margin-top:14px">Add a photo of the fix</div><input type="file" accept="image/*" onchange="afterPhoto('${r.id}',this)">`;m.insertAdjacentHTML('beforeend',h)};
 const a1=window.authView;window.authView=()=>{a1();const c=document.querySelector('.auth');c&&c.insertAdjacentHTML('beforeend','<p class="m" style="margin:14px 0 0">Maintenance, responder and admin accounts are created by an administrator.</p>')};
 const t=setInterval(()=>{if(U||document.querySelector('.auth')){document.getElementById('boot')?.remove();clearInterval(t)}},50);setTimeout(()=>document.getElementById('boot')?.remove(),4000)};
const page=()=>{let h=asset('index.html');
 h=h.replace('</head>','<style id="boot">.app,.sosf{visibility:hidden}</style></head>');const i=h.lastIndexOf('</body>');
 return h.slice(0,i)+'<script src="/app.js"></script><script>('+PATCH+')()</script><script src="/ui-studio.js"></script><script src="/ui-ops.js"></script><script src="/ui-hub.js"></script><script src="/ui-chat.js"></script><script src="/ui-care.js"></script><script src="/ui-home.js"></script><script src="/ui-sos.js"></script><script src="/ui-redesign.js"></script>'+h.slice(i)};
http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org; frame-src 'self' https://www.openstreetmap.org; connect-src 'self' wss: https:; frame-ancestors 'none'");
 const UO=new URL(req.url,'http://x'),p=UO.pathname;
 if(req.method==='GET'&&p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(page())}
 if(req.method==='GET'&&p==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(asset('app.js'))}
 if(req.method==='GET'&&['/ui-studio.js','/ui-ops.js','/ui-hub.js','/ui-chat.js','/ui-care.js','/ui-home.js','/ui-sos.js','/ui-redesign.js'].includes(p)){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(asset(p.slice(1)))}
 if(p.startsWith('/api/sos/track/')){
  const parts=p.slice('/api/sos/track/'.length).split('/'),tok=parts[0],sub=parts[1];
  const s=db.sos.find(x=>x.token===tok);if(!s)return json(res,404,{error:'Emergency tracking link not found or expired.'});
  if(req.method==='GET'&&!sub){
   return json(res,200,{id:s.id,token:s.token,type:s.type,who:s.who,status:s.status,t:s.t,loc:s.loc,desc:s.desc,coords:s.coords||null,locTrail:s.locTrail||[],messages:s.messages||[],contacts:s.contacts||[],call:s.call||{active:false},tl:s.tl});
  }
  if(req.method==='POST'&&sub==='msg'){
   const d=await body(req),text=clean(d.text,500),sender=clean(d.sender,60)||'Emergency Contact';
   if(!text)bad('Message cannot be empty.');s.messages=s.messages||[];
   const msg={id:'m_'+now()+'_'+crypto.randomBytes(4).toString('hex'),who:sender,role:'contact',text,t:now()};
   s.messages.push(msg);
   notifyRole('admin',`SOS message from contact on ${s.id}: ${text.slice(0,50)}`);
   notifyRole('responder',`SOS message from contact on ${s.id}: ${text.slice(0,50)}`);
   note(s.uid,`Message from contact (${sender}): ${text.slice(0,50)}`);
   broadcast('sos-msg',{id:s.id,msg});save();return json(res,200,{ok:1,msg});
  }
  if(req.method==='POST'&&sub==='signal'){
   const d=await body(req);broadcast('sos-signal',{id:s.id,fromName:clean(d.sender,60)||'Emergency Contact',fromRole:'contact',sigType:d.sigType,data:d.data});return json(res,200,{ok:1});
  }
 }
 if(req.method==='POST'&&p==='/api/act'){const o=req.headers.origin;if(o&&new URL(o).host!==req.headers.host)bad('Blocked.',403);
  if(!String(req.headers['content-type']).includes('application/json'))bad('Bad request.',415);
  const d=await body(req),type=String(d.type),u=who(req);if(!Object.hasOwn(A,type))bad('Unknown action.',404);
  if(!u&&!['login','register','logout'].includes(type))bad('Please log in.',401);
  const r=(await A[type](u,d,req,res))||{};if(!r.quiet&&type!=='login'&&type!=='register')save(),ping();else save();delete r.quiet;return json(res,200,r)}
 const u=who(req);
 if(req.method==='GET'&&p==='/api/state'){if(!u)return json(res,401,{error:'Please log in.'});return json(res,200,state(u))}
 if(req.method==='GET'&&p==='/api/stream'){if(!u&&!UO.searchParams.get('token'))return json(res,401,{});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});res.write(': ok\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return}
 const adminOnly=()=>!u?(json(res,401,{error:'Please log in.'}),1):u.role!=='admin'?(json(res,403,{error:'Admins only.'}),1):0;
 if(req.method==='GET'&&p==='/healthz')return json(res,200,{ok:1});
 if(STU&&await STU.http(req,res,u,UO,p))return;
 if(req.method==='GET'&&p==='/api')return json(res,200,{name:'CARE API',more:STU&&STU.docs,auth:'cookie session (POST /api/act {type:"login"})',read:{'GET /api/me':'current user + score','GET /api/state':'everything the current role may see','GET /api/reports':'reports visible to you','GET /api/leaderboard':'student rankboard','GET /api/stream':'server-sent events, fires on any change',
  'GET /api/photo/:id[?after=1]':'report photo','GET /api/ai?q=':'admin: ask the assistant','GET /api/stats':'admin: KPIs + analytics','GET /api/users':'admin: all accounts','GET /api/export':'admin: full database as JSON','GET /api/sos/track/:token':'emergency contact live tracking'},
  write:{'POST /api/act':'{type, ...} types: register login logout submit metoo update reopen feedback afterPhoto sos sosLoc sosMsg sosSignal sosCancel sosAct addContact delContact read createUser setRole aiRun','POST /api/sos/track/:token/msg':'emergency contact chat','POST /api/sos/track/:token/signal':'emergency contact call signaling'}});
 if(req.method==='GET'&&p==='/api/me')return u?json(res,200,sc(u)):json(res,401,{error:'Please log in.'});
 if(req.method==='GET'&&p==='/api/reports')return u?json(res,200,state(u).reports):json(res,401,{error:'Please log in.'});
 if(req.method==='GET'&&p==='/api/leaderboard')return u?json(res,200,lb(u)):json(res,401,{error:'Please log in.'});
 if(req.method==='GET'&&p==='/api/ai'){if(adminOnly())return;return json(res,200,ai(UO.searchParams.get('q')))}
 if(req.method==='GET'&&p==='/api/stats'){if(adminOnly())return;const x=state(u);return json(res,200,{stats:x.stats,analytics:x.A,solvers:x.solvers})}
 if(req.method==='GET'&&p==='/api/users'){if(adminOnly())return;return json(res,200,state(u).users)}
 if(req.method==='GET'&&p==='/api/export'){if(adminOnly())return;res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="care-export.json"'});
  return res.end(JSON.stringify({exported:new Date().toISOString(),users:state(u).users,reports:db.reports.map(r=>({...r,reporter:(db.users[r.uid]||{}).name,uid:undefined,meBy:undefined})),sos:db.sos.map(x=>({...x,uid:undefined})),audit:db.audit},null,1))}
 const m=/^\/api\/photo\/(CARE-\d+)$/.exec(p);
 if(req.method==='GET'&&m){if(!u||u.role==='responder')return json(res,401,{});const r=find(m[1]);
  const aft=UO.searchParams.get('after')==='1',bef=UO.searchParams.get('before')==='1';if(!r||!(aft?r.after:bef?r.before:r.photo)||(u.role==='maintenance'&&r.as!==u.name)||(['fake','duplicate'].includes(r.mod)&&u.role!=='admin'&&r.uid!==u.id))return json(res,404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=3600'});return res.end(fs.readFileSync(path.join(UP,r.id+(aft?'-after':bef?'-before':'')+'.jpg')))}
 json(res,404,{error:'Not found'})}catch(e){if(e&&e.c)return json(res,e.c,{error:e.m});console.error(e);json(res,500,{error:'Server error.'})}
}).listen(PORT,()=>console.log(`CARE running on http://localhost:${PORT}`));
