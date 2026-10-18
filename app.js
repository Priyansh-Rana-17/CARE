// CARE frontend logic: talks to server.js. Loaded after the original design script (it overrides its demo functions).
document.head.insertAdjacentHTML('beforeend',`<style>
input[type=email],input[type=password],input[type=date]{background:var(--in);border:1px solid var(--line);border-radius:12px;padding:10px 12px;width:100%}
.auth{max-width:440px;margin:6vh auto}.auth .seg{margin:16px 0}
.fl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.fl input{flex:1;min-width:180px}.fl select{width:auto}
@keyframes radarPulse{0%{transform:scale(0.9);box-shadow:0 0 0 0 rgba(225,64,63,0.7)}70%{transform:scale(1);box-shadow:0 0 0 14px rgba(225,64,63,0)}100%{transform:scale(0.9);box-shadow:0 0 0 0 rgba(225,64,63,0)}}
.radar-dot{width:12px;height:12px;background:#e1403f;border-radius:50%;display:inline-block;animation:radarPulse 1.8s infinite;vertical-align:middle}
.chat-box{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;padding:12px;background:var(--in);border-radius:14px}
.chat-bubble{max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word}
.chat-me{align-self:flex-end;background:#4b3fb5;color:#fff;border-bottom-right-radius:4px}
.chat-other{align-self:flex-start;background:var(--card);color:var(--ink);border-bottom-left-radius:4px;border:1px solid var(--line)}
.chat-author{font-size:11px;opacity:0.85;margin-bottom:2px;font-weight:600}
.chat-time{font-size:10px;opacity:0.75;margin-top:3px;text-align:right}
.call-banner{background:linear-gradient(135deg,#1c2468,#0e1440);color:#fff;border-radius:18px;padding:16px 20px;margin:14px 0;border:1px solid #323b7e}
.call-btn{border:none;border-radius:12px;padding:9px 15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:14px;text-decoration:none}
.call-btn-green{background:#2c9d73;color:#fff}.call-btn-red{background:#e1403f;color:#fff}.call-btn-secondary{background:#ffffff22;color:#fff}
.call-alert-modal{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#141838;color:#fff;border-radius:24px;padding:16px 24px;box-shadow:0 14px 45px rgba(0,0,0,0.5);display:flex;align-items:center;gap:16px;border:2px solid #e1403f;animation:radarPulse 2s infinite}
</style>`);
const PRI=['Critical','High','Medium','Low'],RL={student:'Student',staff:'Staff',maintenance:'Maintenance team',admin:'Administrator',responder:'Emergency responder'};
let U=null,es=null,first=1,am='login',sosT='Security concern',ft={q:'',st:'All',pr:'All',cat:'All'};
const isA=()=>S.role==='admin',isM=()=>S.role==='maintenance',isR=()=>S.role==='responder';
Object.assign(S,{me:{ok:0,acc:100,score:800},A:{wk:[],rec:[],byCat:[],byBld:[],workload:[],rating:0},audit:[]});
/* ---------- audio synthesizer ---------- */
let audioCtx=null;function getAudioCtx(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}
let sirenOsc=null;function playSiren(){stopSiren();try{const ctx=getAudioCtx(),osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sawtooth';g.gain.setValueAtTime(0.18,ctx.currentTime);osc.connect(g);g.connect(ctx.destination);const t0=ctx.currentTime;for(let i=0;i<10;i++){osc.frequency.setValueAtTime(600,t0+i*0.6);osc.frequency.linearRampToValueAtTime(950,t0+i*0.6+0.3);osc.frequency.linearRampToValueAtTime(600,t0+i*0.6+0.6)}osc.start(t0);osc.stop(t0+6);sirenOsc=osc}catch(e){}}
function stopSiren(){if(sirenOsc){try{sirenOsc.stop();sirenOsc.disconnect()}catch(e){}sirenOsc=null}}
let ringInterval=null;function playRingtone(){stopRingtone();try{const ctx=getAudioCtx(),ring=()=>{try{const o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();o1.frequency.value=440;o2.frequency.value=480;g.gain.value=0.15;o1.connect(g);o2.connect(g);g.connect(ctx.destination);o1.start();o2.start();setTimeout(()=>{try{o1.stop();o2.stop()}catch(e){}},1200)}catch(e){}};ring();ringInterval=setInterval(ring,2800)}catch(e){}}
function stopRingtone(){if(ringInterval){clearInterval(ringInterval);ringInterval=null}}
let ringbackInterval=null;function playRingback(){stopRingback();try{const ctx=getAudioCtx(),rb=()=>{try{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=440;g.gain.value=0.08;o.connect(g);g.connect(ctx.destination);o.start();setTimeout(()=>{try{o.stop()}catch(e){}},1000)}catch(e){}};rb();ringbackInterval=setInterval(rb,3000)}catch(e){}}
function stopRingback(){if(ringbackInterval){clearInterval(ringbackInterval);ringbackInterval=null}}
function playMsgChime(){try{const ctx=getAudioCtx(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(587.33,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+0.15);g.gain.setValueAtTime(0.1,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.25);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.25)}catch(e){}}
/* ---------- WebRTC Voice Calling ---------- */
let rtcPeer=null,localMediaStream=null,remoteAudioElem=null,callState='idle',callTimerInterval=null,callSeconds=0,activeCallSosId=null,activeCallToken=null,pendingIncomingCall=null;
const STUN_CFG={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
function ensureRemoteAudio(){if(!remoteAudioElem){remoteAudioElem=document.getElementById('careRemoteAudio');if(!remoteAudioElem){remoteAudioElem=document.createElement('audio');remoteAudioElem.id='careRemoteAudio';remoteAudioElem.autoplay=true;remoteAudioElem.playsinline=true;remoteAudioElem.style.display='none';document.body.appendChild(remoteAudioElem)}}}
async function sendSignal(sosId,sigType,data,token=null){if(token){fetch('/api/sos/track/'+token+'/signal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sigType,data,sender:U?U.name:'Emergency Contact'})}).catch(()=>{})}else{api('sosSignal',{id:sosId,sigType,data})}}
async function startVoiceCall(sosId,token=null){
 ensureRemoteAudio();activeCallSosId=sosId;activeCallToken=token;
 try{
  localMediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
 }catch(err){toast('Microphone access needed for in-browser call. Dial 1800 123 456 directly.');return}
 rtcPeer=new RTCPeerConnection(STUN_CFG);
 localMediaStream.getTracks().forEach(t=>rtcPeer.addTrack(t,localMediaStream));
 rtcPeer.ontrack=e=>{if(e.streams&&e.streams[0])remoteAudioElem.srcObject=e.streams[0]};
 rtcPeer.onicecandidate=e=>{if(e.candidate)sendSignal(sosId,'call-ice',e.candidate,token)};
 const offer=await rtcPeer.createOffer();
 await rtcPeer.setLocalDescription(offer);
 await sendSignal(sosId,'call-offer',offer,token);
 callState='calling';playRingback();updateCallBanners(sosId);toast('Calling responder/reporter…');
}
async function handleIncomingSignal(d){
 const{id,sigType,fromUid,fromName,fromRole,data}=d;
 if(sigType==='call-offer'){
  if(U&&fromUid===U.id)return; // ignore own signals
  if(callState!=='idle')return;
  pendingIncomingCall={sosId:id,fromName:fromName||'Emergency Caller',fromRole,offer:data};
  playRingtone();showIncomingCallModal(id,fromName,fromRole);
 }else if(sigType==='call-answer'){
  if(callState!=='calling')return;
  stopRingback();await rtcPeer.setRemoteDescription(new RTCSessionDescription(data));
  callState='connected';startCallTimer();updateCallBanners(id);toast('Call connected!');
 }else if(sigType==='call-ice'){
  if(rtcPeer&&data)rtcPeer.addIceCandidate(new RTCIceCandidate(data)).catch(()=>{});
 }else if(sigType==='call-end'){
  endVoiceCall(id,null,false);toast('Call ended.');
 }
}
function showIncomingCallModal(sosId,fromName,fromRole){
 hideIncomingCallModal();
 const div=document.createElement('div');div.id='incomingCallAlert';div.className='call-alert-modal';
 div.innerHTML=`<div style="width:44px;height:44px;border-radius:50%;background:#e1403f;display:grid;place-items:center;font-size:22px">📞</div>
 <div><b style="font-size:16px;display:block">Emergency Voice Call</b><span style="font-size:13px;color:#cfd3f5">${esc(fromName)} (${RL[fromRole]||fromRole||'Responder'}) is calling for ${sosId}</span></div>
 <div style="display:flex;gap:8px;margin-left:8px">
  <button class="call-btn call-btn-green" onclick="answerVoiceCall()">Accept</button>
  <button class="call-btn call-btn-red" onclick="declineVoiceCall()">Decline</button>
 </div>`;
 document.body.appendChild(div);
}
function hideIncomingCallModal(){const m=document.getElementById('incomingCallAlert');if(m)m.remove()}
async function answerVoiceCall(){
 hideIncomingCallModal();stopRingtone();
 if(!pendingIncomingCall)return;
 const{sosId,offer}=pendingIncomingCall;
 ensureRemoteAudio();activeCallSosId=sosId;
 try{
  localMediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
 }catch(e){toast('Microphone access needed to answer call.');return}
 rtcPeer=new RTCPeerConnection(STUN_CFG);
 localMediaStream.getTracks().forEach(t=>rtcPeer.addTrack(t,localMediaStream));
 rtcPeer.ontrack=e=>{if(e.streams&&e.streams[0])remoteAudioElem.srcObject=e.streams[0]};
 rtcPeer.onicecandidate=e=>{if(e.candidate)sendSignal(sosId,'call-ice',e.candidate,activeCallToken)};
 await rtcPeer.setRemoteDescription(new RTCSessionDescription(offer));
 const answer=await rtcPeer.createAnswer();
 await rtcPeer.setLocalDescription(answer);
 await sendSignal(sosId,'call-answer',answer,activeCallToken);
 callState='connected';startCallTimer();updateCallBanners(sosId);toast('Connected to emergency call!');
}
function declineVoiceCall(){
 hideIncomingCallModal();stopRingtone();
 if(pendingIncomingCall){sendSignal(pendingIncomingCall.sosId,'call-end',null,activeCallToken);pendingIncomingCall=null}
}
function startCallTimer(){
 clearInterval(callTimerInterval);callSeconds=0;
 callTimerInterval=setInterval(()=>{
  callSeconds++;
  const m=String(Math.floor(callSeconds/60)).padStart(2,'0'),s=String(callSeconds%60).padStart(2,'0');
  const t=document.querySelectorAll('.call-live-timer');t.forEach(el=>el.textContent=`${m}:${s}`);
 },1000);
}
function endVoiceCall(sosId,token=null,notify=true){
 stopRingback();stopRingtone();hideIncomingCallModal();
 if(notify&&sosId)sendSignal(sosId,'call-end',null,token);
 if(localMediaStream){localMediaStream.getTracks().forEach(t=>t.stop());localMediaStream=null}
 if(rtcPeer){try{rtcPeer.close()}catch(e){}rtcPeer=null}
 clearInterval(callTimerInterval);callSeconds=0;callState='idle';pendingIncomingCall=null;
 updateCallBanners(sosId);
}
function updateCallBanners(sosId){
 const title=document.getElementById(`callBannerTitle_${sosId}`);
 const sub=document.getElementById(`callBannerSub_${sosId}`);
 const acts=document.getElementById(`callBannerActions_${sosId}`);
 if(title)title.textContent=callState==='connected'?'🔴 Live Call In Progress':callState==='calling'?'📞 Calling…':'Direct Audio Connection';
 if(sub)sub.textContent=callState==='connected'?'Speaking live over encrypted WebRTC audio':callState==='calling'?'Ringing remote party…':'Talk directly with security desk & contacts';
 if(acts){
  if(callState==='connected'){
   acts.innerHTML=`<span class="call-live-timer" style="font-weight:600;font-size:14px;background:#e1403f;padding:4px 10px;border-radius:8px">00:00</span>
   <button class="call-btn call-btn-red" onclick="endVoiceCall('${sosId}')">End Call</button>`;
  }else if(callState==='calling'){
   acts.innerHTML=`<button class="call-btn call-btn-red" onclick="endVoiceCall('${sosId}')">Cancel</button>`;
  }else{
   acts.innerHTML=`<button class="call-btn call-btn-green" onclick="startVoiceCall('${sosId}')">📞 Voice Call</button>
   <a class="call-btn call-btn-secondary" href="tel:1800123456">☎️ Call 1800 123 456</a>`;
  }
 }
}
/* ---------- Live Geolocation Tracking ---------- */
let liveCoords=null;window.sosWatchId=null;
function startSosLocationWatch(sosId){
 if(!navigator.geolocation)return;
 if(window.sosWatchId)navigator.geolocation.clearWatch(window.sosWatchId);
 window.sosWatchId=navigator.geolocation.watchPosition(pos=>{
  liveCoords={lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy,t:Date.now()};
  updateSosLocationInDom(sosId,liveCoords);
  fetch('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'sosLoc',id:sosId,lat:liveCoords.lat,lng:liveCoords.lng,acc:liveCoords.acc})}).catch(()=>{});
 },err=>console.warn('Geolocation watchPosition:',err.message),{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}
function stopSosLocationWatch(){if(window.sosWatchId){navigator.geolocation.clearWatch(window.sosWatchId);window.sosWatchId=null}}
async function api(type,d){try{const r=await fetch('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,...d})}),j=await r.json();
 if(!r.ok){if(r.status===401){U=null;authView()}else toast(j.error||'Something went wrong');return null}
 if(type!=='read'&&type!=='sosLoc')await load();return j}catch(e){toast('Server not reachable');return null}}
function sse(token=null){
 if(es&&es.readyState!==2)return;
 es=new EventSource(token?'/api/stream?token='+token:'/api/stream');
 es.onmessage=()=>{if(!token)load()};
 es.addEventListener('sos-new',e=>{if(isA()||isR()){playSiren();toast('🚨 Urgent SOS alert received!');load()}});
 es.addEventListener('sos-msg',e=>{try{const d=JSON.parse(e.data);appendSosMsgToDom(d.id,d.msg)}catch(err){}});
 es.addEventListener('sos-loc',e=>{try{const d=JSON.parse(e.data);updateSosLocationInDom(d.id,d.coords)}catch(err){}});
 es.addEventListener('sos-signal',e=>{try{const d=JSON.parse(e.data);handleIncomingSignal(d)}catch(err){}});
 es.addEventListener('sos-resolved',e=>{try{const d=JSON.parse(e.data);stopSosLocationWatch();endVoiceCall(d.id,null,false);if(!token)load()}catch(err){}});
}
async function load(){
 if(location.hash.startsWith('#track=')){const tok=location.hash.slice(7);if(tok)return renderTrackView(tok)}
 try{const r=await fetch('/api/state');if(r.status===401){U=null;return authView()}const j=await r.json();Object.assign(S,j);U=j.me;S.role=j.me.role;
 $('#sosb').style.display=isR()?'none':'';sse();
 const myAct=S.sos.find(s=>s.mine&&s.status!=='Resolved');
 if(myAct&&!window.sosWatchId)startSosLocationWatch(myAct.id);
 else if(!myAct&&window.sosWatchId)stopSosLocationWatch();
 if(first){first=0;qrHash()}
 if(!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!$('#layer').innerHTML)render()}catch(e){}}
async function logout(){await api('logout',{});}
/* ---------- login / register ---------- */
function authView(){$('#sosb').style.display='none';$('#side').style.display='none';document.querySelector('.app').style.gridTemplateColumns='1fr';closeM();
$('#main').innerHTML=`<div class="card auth"><div class="brand" style="padding:0"><div class="logo">${ic('shield')}</div><div><b style="color:var(--ink)">CARE</b><small class="m">Campus support</small></div></div>
<div class="seg"><button class="${am==='login'?'on':''}" onclick="am='login';authView()">Log in</button><button class="${am==='register'?'on':''}" onclick="am='register';authView()">Create account</button></div>
${am==='register'?'<label class="l" for="ln">Full name</label><input type="text" id="ln" autocomplete="name"><br><br>':''}
<label class="l" for="le">Email</label><input type="email" id="le" autocomplete="email"><br><br>
<label class="l" for="lp">Password</label><input type="password" id="lp" autocomplete="${am==='login'?'current-password':'new-password'}" onkeydown="if(event.key==='Enter')authGo()">
${am==='register'?'<br><br><label class="l" for="lr">I am a</label><select id="lr"><option value="student">Student</option><option value="staff">Staff member</option></select>':''}
<br><br><button class="btn bp" onclick="authGo()">${am==='login'?'Log in':'Create account'} ›</button></div>`}
async function authGo(){const g=i=>($(i)||{}).value||'';if(await api(am,{name:g('#ln'),email:g('#le'),password:g('#lp'),role:g('#lr')}))toast('Welcome to CARE')}
/* ---------- shell ---------- */
const NAVS={student:[['overview','home','Overview'],['reports','plus','My reports'],['new','plus','New report'],['qr','scan','Scan QR'],['notes','bell','Notifications'],null,['safety','shield','Safety centre'],['contacts','users','Trusted contacts']],
maintenance:[['overview','home','My tasks'],['notes','bell','Notifications']],
admin:[['overview','home','Overview'],['reports','plus','All reports'],['analytics','clock','Analytics'],['sos','shield','SOS queue'],['qr','scan','QR codes'],['audit','check','Audit log'],['notes','bell','Notifications']],
responder:[['sos','shield','SOS queue'],['notes','bell','Notifications']]};
function render(){theme();document.querySelector('.app').style.gridTemplateColumns='';$('#side').style.display='';
const mine=S.reports.filter(r=>r.by==='me'),unread=S.notes.some(n=>!n.read),act=S.sos.filter(s=>s.status!=='Resolved').length,nav=NAVS[S.role]||NAVS.student;
if(isR()&&view==='overview')view='sos';
const ini=U.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
$('#side').innerHTML=`<div class="brand"><div class="logo">${ic('shield')}</div><div><b>CARE</b><small>Campus support</small></div></div>`+nav.map(n=>n?`<button class="nav ${view===n[0]?'on':''}" onclick="go('${n[0]}')"><i>${ic(n[1])}</i>${n[2]}${n[0]==='reports'&&!isA()?`<em>${mine.length}</em>`:''}${n[0]==='sos'&&act?`<em>${act}</em>`:''}${n[0]==='notes'&&unread?'<span class="dot"></span>':''}</button>`:'<div class="sp"></div>').join('')+
`<div class="sp"></div><div class="me"><div class="av">${ini}</div><div><b>${esc(U.name)}</b><small>${RL[S.role]}</small></div></div>`;
const V={overview:()=>isA()?admin():isM()?list():isR()?sosq():student(),reports:list,analytics,sos:sosq,audit,notes,safety,contacts};
$('#main').innerHTML=`<div class="top"><div><b>${esc(U.name)}</b> <span class="m">· ${RL[S.role]}</span></div><div class="tools"><button class="ib" onclick="dark()" aria-label="Toggle dark mode">${ic('moon')}</button><button class="ib" onclick="go('notes')" aria-label="Notifications">${ic('bell')}${unread?'<b></b>':''}</button><button class="btn mt" onclick="logout()">Log out</button></div></div>`+(V[view]||V.overview)()}
const sp=s=>`<span class="pill ${{Active:'Reopened',Acknowledged:'Inprogress',Assigned:'Assigned',Resolved:'Resolved'}[s]}">● ${s}</span>`;
const head=(l,t)=>`<div><div class="lab">${l}</div><h2>${t}</h2></div>`;
/* ---------- admin overview, tables, filters ---------- */
function tbl2(rs){return `<table><thead><tr><th>ISSUE</th><th>PRIORITY</th><th>STATUS</th><th>ASSIGNED TO</th></tr></thead><tbody>${rs.map(r=>{const can=isA()||(isM()&&r.as===U.name),so=isA()?ST:[r.status,...['In progress','Resolved'].filter(x=>x!==r.status)];
return `<tr><td><b onclick="detail('${r.id}')">${esc(r.title)}</b>${r.overdue?' <span class="pill Reopened">Overdue</span>':''}${r.mod?` <span class="pill">${r.mod}</span>`:''}<small>${r.id} · ${r.bld} · ${r.room}${r.me?` · ${r.me+1} affected`:''} · ${ago(r.upd)}</small></td>
<td>${isA()?`<select class="as" aria-label="Priority" onchange="upd('${r.id}','pri',this.value)">${PRI.map(p=>`<option ${p===r.pri?'selected':''}>${p}</option>`).join('')}</select>`:`<span class="p-${r.pri}">${r.pri}</span>`}<small>Due ${new Date(r.due).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</small></td>
<td>${can?`<select class="pill ps ${r.status.replace(' ','')}" aria-label="Status" onchange="upd('${r.id}','status',this.value)">${so.map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select>`:pill(r.status)}</td>
<td>${isA()?`<select class="as" aria-label="Assign" onchange="upd('${r.id}','as',this.value)">${TEAM.map(s=>`<option ${s===r.as?'selected':''}>${s}</option>`).join('')}</select>`:esc(r.as)}</td></tr>`}).join('')}</tbody></table>`}
const upd=(id,k,v)=>api('update',{id,[k]:v});
function admin(){const st=S.stats,act=S.sos.find(s=>s.status!=='Resolved'),h=new Date().getHours(),nu=new Set(S.reports.filter(r=>r.cat==='Safety'&&open1(r)).map(r=>r.bld)).size,
top=S.reports.filter(open1).sort((a,b)=>PRI.indexOf(a.pri)-PRI.indexOf(b.pri)||a.due-b.due).slice(0,5);
return `<div class="sh"><div><div class="lab" style="letter-spacing:.1em;text-transform:none;font-size:14px">${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div><h2 class="gh">Good ${h<12?'morning':h<17?'afternoon':'evening'}, ${esc(U.name)}</h2><div class="m">Here’s what needs attention across campus today.</div></div><button class="btn dl" onclick="csv()">Export CSV</button></div>
${act?`<div class="alert" style="border:2px solid #e1403f"><div class="sosb"><span class="radar-dot" style="width:16px;height:16px;background:#fff"></span></div><div><b style="font-size:18px;color:#c0392b">${act.status==='Active'?'🚨 Active SOS Alert in Progress':'Alert '+act.status.toLowerCase()}</b><br><span class="m">${esc(act.type)} · <b>${esc(act.who)}</b> · ${esc(act.loc)}${act.coords?' · 📍 Live GPS active':''} · ${ago(act.t)}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" style="background:#e1403f;color:#fff;padding:10px 16px" onclick="openSosHub('${act.id}')">Live Hub &amp; Map ›</button><button class="btn" style="background:#0b8d7d;color:#fff;padding:10px 16px" onclick="startVoiceCall('${act.id}')">📞 Call ${esc(act.who.split(' ')[0])}</button>${sirenOsc?'<button class="btn mt" onclick="stopSiren()">Mute siren</button>':''}</div></div>`:''}
<div class="stats">${stc('plus','Open issues',st.open,st.awaiting+' awaiting assignment','linear-gradient(90deg,#0b8d7d,#7a5be0)','#d9f3ec','#0b8d7d','#17734f')}${stc('clock','Avg. resolution',st.avg?st.avg+'h':'n/a',S.A.rating?S.A.rating+'/5 satisfaction':'no ratings yet','linear-gradient(90deg,#3f8fdc,#7a5be0)','#dce9fb','#3d7ad1','#2557a7')}${stc('users','Overdue',st.overdue,'past deadline','linear-gradient(90deg,#e29b2d,#e0564f)','#fdebd0','#d98a1a','#b9770e')}${stc('check','Resolved',st.resolved,'of '+st.total+' reports','linear-gradient(90deg,#2c9d73,#0b8d7d)','#d3f0e3','#23956a','#17734f')}</div>
<div class="cols"><div class="card" style="padding:0;overflow:hidden"><div class="sh" style="padding:22px 26px"><div><h3>Needs attention</h3><div class="m">Highest priority open issues</div></div></div>${top.length?tbl2(top):'<p class="m" style="padding:0 26px 20px">Nothing open. Great work.</p>'}<div style="padding:14px;text-align:center"><a style="color:var(--teal);cursor:pointer;font-size:14px" onclick="go('reports')">View all ${st.open} open reports</a></div></div>
<div><div class="card"><h3>Campus hotspots</h3><div class="m">Open issues by building</div>${hbars(S.hot)}${nu?`<div class="flag">${ic('shield')}<div><b>${nu} unsafe area${nu>1?'s':''} flagged</b><br><small>Based on open safety reports</small></div></div>`:''}</div>
<div class="card" style="margin-top:16px"><h3>Recurring problems</h3>${S.A.rec.slice(0,4).map(([k,n])=>`<p><b>${esc(k)}</b><br><small class="m">${n} reports in 90 days · schedule a preventive inspection</small></p>`).join('')||'<p class="m">No repeats detected.</p>'}</div></div></div>`}
const open1=r=>r.status!=='Resolved'&&!['duplicate','fake'].includes(r.mod);
function csv(){const t='id,title,category,building,room,status,priority,assigned,reporter\n'+S.reports.map(r=>[r.id,r.title,r.cat,r.bld,r.room,r.status,r.pri,r.as,r.reporter||''].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
modal(`<div style="display:flex;justify-content:space-between"><h2>Report data</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div><p class="m">Copy the CSV below into a spreadsheet.</p><textarea rows="10" readonly onfocus="this.select()">${esc(t)}</textarea>`)}
function list(){let rs=S.reports.slice().sort((a,b)=>b.upd-a.upd);
if(isA()){const q=ft.q.toLowerCase();rs=rs.filter(r=>(ft.st==='All'||r.status===ft.st)&&(ft.pr==='All'||r.pri===ft.pr)&&(ft.cat==='All'||r.cat===ft.cat)&&(!q||[r.id,r.title,r.desc,r.bld,r.room,r.cat,r.reporter].join(' ').toLowerCase().includes(q)));
const f=(k,o)=>`<select aria-label="${k}" onchange="ft.${k}=this.value;render()">${['All',...o].map(x=>`<option ${x===ft[k]?'selected':''}>${x}</option>`).join('')}</select>`;
return head('Administration','All reports')+`<div class="fl"><input type="text" placeholder="Search ID, keyword, location, reporter…" aria-label="Search" value="${esc(ft.q)}" onchange="ft.q=this.value;render()">${f('st',ST)}${f('pr',PRI)}${f('cat',CATS)}</div><div class="card" style="padding:0;overflow:hidden">${rs.length?tbl2(rs):'<p class="m" style="padding:20px">No reports match.</p>'}</div>`}
if(isM())return head('Assigned to you','My tasks')+(rs.length?`<div class="card" style="padding:0;overflow:hidden">${tbl2(rs)}</div>`:'<div class="card">No tasks assigned to you yet.</div>');
rs=rs.filter(r=>r.by==='me');return head('Your activity','My reports')+(rs.map(rc).join('')||'<div class="card">No reports yet.</div>')}
/* ---------- report detail, moderation, feedback ---------- */
function detail(id){const r=S.reports.find(x=>x.id===id);if(!r)return;const own=r.by==='me';
modal(`<div style="display:flex;justify-content:space-between"><div><div class="lab">${r.id} · ${r.cat}</div><h2>${esc(r.title)}</h2></div><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
${pill(r.status)} <span class="p-${r.pri}">${r.pri} priority</span>${r.overdue?' <span class="pill Reopened">Overdue</span>':''}${r.mod?` <span class="pill">${r.mod}${r.dupOf?' of '+r.dupOf:''}</span>`:''}
<p class="m">${ic('map')} ${r.bld} · ${r.room} · Assigned to ${esc(r.as)}${r.me?` · ${r.me+1} students affected`:''} · Due ${new Date(r.due).toLocaleDateString()}</p>
${r.reporter?`<p class="m">Reporter: ${esc(r.reporter)}${r.anon?' (anonymous to students)':''}</p>`:''}${r.desc?`<p>${esc(r.desc)}</p>`:''}${r.photo?`<img src="/api/photo/${r.id}" alt="Attached photo" style="max-width:100%;border-radius:14px">`:''}
<div class="lab">History</div><div class="tl">${r.hist.map(h=>`<div><b>${esc(h[0])}</b><div class="m">${ago(h[1])}${h[2]?' · '+esc(h[2]):''}</div></div>`).join('')}</div>
${isA()?`<div class="lab">Admin controls</div><div class="g2"><div><label class="l" for="ap">Priority</label><select id="ap">${PRI.map(p=>`<option ${p===r.pri?'selected':''}>${p}</option>`).join('')}</select></div><div><label class="l" for="ad">Deadline</label><input type="date" id="ad"></div></div>
${(r.inotes||[]).map(n=>`<p class="m">📝 ${esc(n[0])} <small>· ${esc(n[2])}, ${ago(n[1])}</small></p>`).join('')}
<label class="l" for="nt">Internal note (or message to reporter if you need more info)</label><textarea id="nt" rows="2"></textarea><br><br><button class="btn bp" onclick="saveA('${r.id}')">Save changes</button>
<div class="chips" style="margin-top:14px">${[['valid','Mark valid'],['duplicate','Duplicate of…'],['info','Needs more info'],['fake','Fake / misuse']].map(([m,l])=>`<button class="chip" onclick="modr('${r.id}','${m}')">${l}</button>`).join('')}</div>`:''}
${own&&r.status==='Resolved'&&!r.fb?`<div class="lab">Is it fixed?</div><div class="g2"><div><label class="l" for="rt">Rating</label><select id="rt">${[5,4,3,2,1].map(n=>`<option>${n}</option>`).join('')}</select></div><div><label class="l" for="fc">Comment</label><input type="text" id="fc"></div></div><button class="btn bp" onclick="sendFb('${r.id}')">Confirm resolved</button><br><br><button class="btn dl" style="width:100%" onclick="closeM();api('reopen',{id:'${r.id}'})">Problem is back, reopen</button>`:''}
${r.fb?`<p class="m">Rated ${r.fb.rating}/5${r.fb.comment?': '+esc(r.fb.comment):''}</p>`:''}`)}
function saveA(id){const nt=$('#nt').value.trim(),dd=$('#ad').value;closeM();api('update',{id,pri:$('#ap').value,due:dd||undefined,note:nt||undefined})}
function modr(id,m){let d;if(m==='duplicate'){d=prompt('Duplicate of which report ID? (e.g. CARE-1004)');if(!d)return}const nt=$('#nt').value.trim();if(m==='info'&&!nt)return toast('Type your question for the reporter in the note box first.');closeM();api('update',{id,mod:m,dupOf:d,note:nt||undefined})}
function sendFb(id){const rating=$('#rt').value,comment=$('#fc').value;closeM();api('feedback',{id,rating,comment}).then(j=>j&&toast('Thanks for the feedback.'))}
/* ---------- submit with photo + duplicate check ---------- */
function pickPhoto(i){const f=i.files[0];if(!f)return;draft.file=f.name;draft.photo=null;$('#fn').textContent=f.name;const im=new Image(),u=URL.createObjectURL(f);
im.onload=()=>{const k=Math.min(1,1280/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);draft.photo=c.toDataURL('image/jpeg',.8);URL.revokeObjectURL(u)};im.onerror=()=>toast('Could not read that image.');im.src=u}
async function submit(){keep();const d=draft;if(d.desc.trim().length<5)return toast('Add a short description so the team knows what to fix.');
const body={cat:d.cat,bld:d.bld,room:d.room,desc:d.desc,anon:d.anon,photo:d.photo||undefined};let j=await api('submit',body);if(!j)return;
if(j.dup){if(confirm(`A similar report already exists: “${j.dup.title}” (${j.dup.id}). Press OK to add “Me too” instead of a new report.`)){closeM();return meToo(j.dup.id)}j=await api('submit',{...body,force:true});if(!j)return}
closeM();view='reports';render();toast(`Report submitted. Your tracking ID is ${j.id}.${j.pri==='Critical'?' Marked critical for urgent review.':''}`)}
async function meToo(id){if(await api('metoo',{id}))toast('Thanks. Your confirmation was added to this issue.')}
/* ---------- notifications, safety, SOS ---------- */
function notes(){setTimeout(()=>{if(S.notes.some(n=>!n.read)){S.notes.forEach(n=>n.read=1);api('read',{})}},400);return head('Updates','Notifications')+(S.notes.map(n=>`<div class="card" style="margin-bottom:10px"><b>${esc(n.t)}</b><div class="m">${ago(n.ts)}</div></div>`).join('')||'<div class="card">You’re all caught up.</div>')}
const cleanPhone=p=>String(p||'').replace(/[^\d+]/g,'');
function renderMsgBubble(m){
 const me=(U&&m.uid===U.id)||(m.role==='contact'&&!U);
 const roleBadge=m.role==='admin'?'Admin':m.role==='responder'?'Security':m.role==='contact'?'Contact':'Reporter';
 return `<div class="chat-bubble ${me?'chat-me':'chat-other'}">
  <div class="chat-author">${esc(m.who)} <small>(${roleBadge})</small></div>
  <div>${esc(m.text)}</div>
  <div class="chat-time">${ago(m.t)}</div>
 </div>`;
}
async function sendChatMsg(sosId,token=null){
 const inp=$('#sosMsgIn');if(!inp)return;const text=inp.value.trim();if(!text)return;inp.value='';
 if(token){
  const sender=($('#contactSenderName')||{}).value||'Emergency Contact';
  const r=await fetch('/api/sos/track/'+token+'/msg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sender})});
  const j=await r.json();if(j&&j.msg)appendSosMsgToDom(sosId,j.msg);
 }else{
  const j=await api('sosMsg',{id:sosId,text});if(j&&j.msg)appendSosMsgToDom(sosId,j.msg);
 }
}
function sendQuickMsg(sosId,text,token=null){const inp=$('#sosMsgIn');if(inp){inp.value=text;sendChatMsg(sosId,token)}}
function appendSosMsgToDom(sosId,msg){
 const s=S.sos.find(x=>x.id===sosId);
 if(s){s.messages=s.messages||[];if(!s.messages.some(m=>m.id===msg.id))s.messages.push(msg)}
 if(window.currentTrackSos&&window.currentTrackSos.id===sosId){
  window.currentTrackSos.messages=window.currentTrackSos.messages||[];
  if(!window.currentTrackSos.messages.some(m=>m.id===msg.id))window.currentTrackSos.messages.push(msg);
 }
 const c=$('#sosChatMsgs');
 if(c){
  c.insertAdjacentHTML('beforeend',renderMsgBubble(msg));
  c.scrollTop=c.scrollHeight;playMsgChime();
 }
}
function updateSosLocationInDom(sosId,coords){
 const s=S.sos.find(x=>x.id===sosId);
 if(s){s.coords=coords;s.locTrail=s.locTrail||[];s.locTrail.push(coords)}
 if(window.currentTrackSos&&window.currentTrackSos.id===sosId){
  window.currentTrackSos.coords=coords;window.currentTrackSos.locTrail=window.currentTrackSos.locTrail||[];window.currentTrackSos.locTrail.push(coords);
 }
 const accElem=$('#sosHubAcc');if(accElem)accElem.textContent=`±${Math.round(coords.acc||0)}m accuracy`;
 const coordsElem=$('#sosHubCoords');if(coordsElem)coordsElem.textContent=`${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E`;
 const mapBox=$('#sosHubMap');
 if(mapBox){
  mapBox.innerHTML=`<iframe width="100%" height="200" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng-0.003}%2C${coords.lat-0.003}%2C${coords.lng+0.003}%2C${coords.lat+0.003}&amp;layer=mapnik&amp;marker=${coords.lat}%2C${coords.lng}"></iframe>`;
 }
}
function copySosLink(token){
 const url=location.origin+'/#track='+token;
 if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>toast('Live tracking link copied!')).catch(()=>prompt('Copy link:',url))}
 else prompt('Copy link:',url);
}
function alertAllWhatsApp(sosId){
 const s=S.sos.find(x=>x.id===sosId);if(!s)return;
 const contacts=s.contacts||(U?U.contacts||[]:[]);
 if(!contacts.length)return toast('No contacts saved.');
 const coords=s.coords||liveCoords;const trackUrl=location.origin+'/#track='+(s.token||'');
 const msg=`EMERGENCY SOS: I triggered an emergency alert on campus (${s.type}) at ${s.loc}.${coords?' GPS: https://maps.google.com/?q='+coords.lat+','+coords.lng:''} Live tracker & chat: ${trackUrl}`;
 contacts.forEach((c,i)=>{setTimeout(()=>window.open(`https://api.whatsapp.com/send?phone=${cleanPhone(c.p)}&text=${encodeURIComponent(msg)}`,'_blank'),i*350)});
 toast(`Dispatched WhatsApp alert to ${contacts.length} contact${contacts.length>1?'s':''}.`);
}
async function cancelSos(id){
 if(!confirm('Are you sure you want to cancel this SOS alert?'))return;
 stopSosLocationWatch();endVoiceCall(id,null,true);
 if(await api('sosCancel',{id})){closeM();toast('SOS cancelled.');render()}
}
function openSosHub(id){
 const s=S.sos.find(x=>x.id===id);if(!s)return toast('SOS request not found');
 const mine=s.mine||(U&&s.who===U.name),contacts=s.contacts||(U?U.contacts||[]:[]),coords=s.coords||liveCoords;
 const trackUrl=location.origin+'/#track='+(s.token||'');
 const shareMsg=`EMERGENCY SOS: I triggered an alert on campus (${s.type}) at ${s.loc}.${coords?' GPS: https://maps.google.com/?q='+coords.lat+','+coords.lng:''} Live tracker & chat: ${trackUrl}`;
 modal(`<div style="display:flex;justify-content:space-between;align-items:center">
  <div><div class="lab">${s.id} · <span class="radar-dot" style="width:8px;height:8px;margin-right:4px"></span>${s.status}</div><h2 style="margin:2px 0">${esc(s.type)}</h2></div>
  <button class="ib" onclick="closeM()" aria-label="Close">✕</button>
 </div>
 <p class="m" style="margin:4px 0 14px">Reporter: <b>${esc(s.who)}</b> · ${esc(s.loc)} · ${ago(s.t)}</p>
 <div style="border-radius:16px;border:1px solid var(--line);background:var(--card);overflow:hidden;margin-bottom:14px">
  <div style="padding:10px 14px;background:var(--in);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
   <div style="display:flex;align-items:center;gap:8px"><span class="radar-dot"></span><b style="font-size:13px">Live GPS Tracking</b></div>
   <span id="sosHubAcc" style="font-size:12px;color:var(--mut)">${coords?`±${Math.round(coords.acc||0)}m accuracy`:'Acquiring…'}</span>
  </div>
  <div id="sosHubMap">
   ${coords?`<iframe width="100%" height="200" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng-0.003}%2C${coords.lat-0.003}%2C${coords.lng+0.003}%2C${coords.lat+0.003}&amp;layer=mapnik&amp;marker=${coords.lat}%2C${coords.lng}"></iframe>`:
   `<div style="height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--mut);gap:6px"><span class="radar-dot" style="width:20px;height:20px"></span><small>Acquiring satellite lock for real-time tracking…</small></div>`}
  </div>
  <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
   <small id="sosHubCoords" style="color:var(--mut)">${coords?`${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E`:esc(s.loc)}</small>
   <div style="display:flex;gap:6px">
    ${coords?`<a class="btn mt" style="font-size:12px;padding:6px 12px;text-decoration:none" href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank" rel="noopener">📍 Google Maps</a>`:''}
    <button class="btn mt" style="font-size:12px;padding:6px 12px" onclick="copySosLink('${s.token}')">📋 Copy Tracker Link</button>
   </div>
  </div>
 </div>
 <div class="call-banner" id="sosCallBanner_${s.id}">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
   <div>
    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🎙️</span><b id="callBannerTitle_${s.id}">${callState==='connected'?'Voice Call Connected':'Direct Audio Connection'}</b></div>
    <div class="m" id="callBannerSub_${s.id}" style="color:#cfd3f5;font-size:13px">${callState==='connected'?'Live audio in progress':`Speak directly with ${mine?'Campus Security':esc(s.who)}`}</div>
   </div>
   <div style="display:flex;gap:8px" id="callBannerActions_${s.id}">
    ${callState==='connected'?`<span class="call-live-timer" style="font-weight:600;font-size:14px;background:#e1403f;padding:4px 10px;border-radius:8px">00:00</span><button class="call-btn call-btn-red" onclick="endVoiceCall('${s.id}')">End Call</button>`:
    callState==='calling'?`<button class="call-btn call-btn-red" onclick="endVoiceCall('${s.id}')">Cancel</button>`:
    `<button class="call-btn call-btn-green" onclick="startVoiceCall('${s.id}')">📞 Voice Call</button><a class="call-btn call-btn-secondary" href="tel:1800123456">☎️ Call 1800 123 456</a>`}
   </div>
  </div>
 </div>
 <div class="card" style="margin:14px 0;background:#fff9f8;border:1px solid #f6cfcb">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
   <b style="color:#c0392b;font-size:14px">🚨 Emergency Contacts (${contacts.length})</b>
   <span class="pill Reopened" style="font-size:11px">Auto-Dispatch</span>
  </div>
  <p class="m" style="margin-top:0;font-size:12px">Instant 1-tap alerts with live GPS location &amp; tracking link:</p>
  <div style="display:flex;flex-direction:column;gap:8px">
   ${contacts.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:12px;border:1px solid var(--line);flex-wrap:wrap;gap:8px">
    <div><b>${esc(c.n)}</b> <span class="m">· ${esc(c.p)}</span></div>
    <div style="display:flex;gap:6px">
     <a class="btn" style="background:#25D366;color:#fff;font-size:12px;padding:6px 12px;text-decoration:none" href="https://api.whatsapp.com/send?phone=${cleanPhone(c.p)}&text=${encodeURIComponent(shareMsg)}" target="_blank" rel="noopener">💬 WhatsApp</a>
     <a class="btn mt" style="font-size:12px;padding:6px 12px;text-decoration:none" href="sms:${cleanPhone(c.p)}?body=${encodeURIComponent(shareMsg)}">📱 SMS</a>
     <a class="btn mt" style="font-size:12px;padding:6px 12px;text-decoration:none" href="tel:${cleanPhone(c.p)}">📞 Call</a>
    </div>
   </div>`).join('')||`<p class="m" style="font-size:13px">No emergency contacts saved yet. Add them in <a onclick="closeM();go('contacts')" style="color:var(--pri);cursor:pointer">Trusted contacts</a>.</p>`}
  </div>
  ${contacts.length?`<div style="margin-top:10px"><button class="btn" style="background:#25D366;color:#fff;width:100%" onclick="alertAllWhatsApp('${s.id}')">📲 WhatsApp SOS to All Contacts</button></div>`:''}
 </div>
 <div style="border-radius:16px;border:1px solid var(--line);background:var(--card);overflow:hidden;margin-bottom:14px">
  <div style="padding:10px 14px;background:var(--in);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
   <div style="display:flex;align-items:center;gap:6px"><span>💬</span><b style="font-size:13px">Real-Time Messaging</b><span class="pill" style="font-size:11px">Live</span></div>
   <span style="font-size:12px;color:var(--mut)">${(s.messages||[]).length} msg</span>
  </div>
  <div id="sosChatMsgs" class="chat-box" style="border:none;border-radius:0;background:var(--card)">
   ${(s.messages||[]).map(m=>renderMsgBubble(m)).join('')||`<p class="m" style="text-align:center;padding:12px 0">No messages yet. Send a message to chat with responders and contacts.</p>`}
  </div>
  <div class="chips" style="padding:6px 12px;background:var(--in);border-top:1px solid var(--line);display:flex;gap:6px;overflow-x:auto">
   ${(mine?['Help is needed urgently','I am safe for now','I am hidden in a room','Cannot speak, text only']:['Security is on the way','What room are you in?','Stay in a safe place','Keep phone with you']).map(chip=>`<button class="chip" style="font-size:12px;padding:4px 10px;white-space:nowrap" onclick="sendQuickMsg('${s.id}','${chip.replace(/'/g,"\\'")}')">${chip}</button>`).join('')}
  </div>
  <div style="padding:10px 12px;display:flex;gap:8px;background:var(--card);border-top:1px solid var(--line)">
   <input type="text" id="sosMsgIn" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendChatMsg('${s.id}')">
   <button class="btn bp" style="width:auto;padding:8px 16px" onclick="sendChatMsg('${s.id}')">Send</button>
  </div>
 </div>
 ${mine&&s.status!=='Resolved'?`<button class="btn dl" style="width:100%" onclick="cancelSos('${s.id}')">I am safe now / Cancel SOS</button>`:''}
 ${(isA()||isR())&&s.status!=='Resolved'?`<div style="display:flex;gap:8px;margin-top:10px">
  ${s.status==='Active'?`<button class="btn bp" style="flex:1" onclick="sosA('${s.id}','ack');openSosHub('${s.id}')">Acknowledge</button>`:''}
  <button class="btn mt" style="flex:1" onclick="sosA('${s.id}','assign');openSosHub('${s.id}')">Assign</button>
  <button class="btn bp" style="flex:1" onclick="sosA('${s.id}','resolve');closeM()">Resolve</button>
 </div>`:''}`);
 setTimeout(()=>{const c=$('#sosChatMsgs');if(c)c.scrollTop=c.scrollHeight},100);
}
function safety(){const u={};S.reports.filter(r=>r.cat==='Safety'&&open1(r)).forEach(r=>u[r.bld]=(u[r.bld]||0)+1);
const act=S.sos.find(s=>s.mine&&s.status!=='Resolved');
return head('Stay safe','Safety centre')+`<div class="card"><h3>Emergency numbers</h3><div class="tel">1800 123 456</div><div class="m">Campus Security · National emergency: <b>112</b></div></div>
${act?`<div class="card" style="border:2px solid #e1403f;background:#fff8f8;margin-bottom:14px">
 <div class="sh"><div><span class="radar-dot"></span> <b style="font-size:18px;color:#c0392b">Active SOS Request (${act.id})</b><div class="m">${esc(act.type)} · ${esc(act.loc)}${act.coords?' · 📍 GPS active':''} · ${ago(act.t)}</div></div></div>
 <div style="display:flex;gap:8px;margin-top:10px">
  <button class="btn bp" onclick="openSosHub('${act.id}')">Open Live Hub (Map, Voice Call &amp; Chat) ›</button>
  <button class="btn dl" style="width:auto" onclick="cancelSos('${act.id}')">I am safe / Cancel</button>
 </div>
</div>`:''}
<div class="card"><h3>My SOS requests</h3>${S.sos.filter(s=>s.mine).map(s=>`<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><b>${s.id} · ${esc(s.type)}</b> ${sp(s.status)}</div><div class="m">${esc(s.loc)} · ${ago(s.t)}</div><div style="margin-top:6px"><button class="btn mt" style="font-size:12px;padding:4px 10px" onclick="openSosHub('${s.id}')">View details &amp; chat ›</button></div></div>`).join('')||'<p class="m">None sent.</p>'}</div>
<div class="card"><h3>Open safety reports by area</h3>${Object.entries(u).map(([b,n])=>`<p><b>${b}</b>: ${n} open</p>`).join('')||'<p class="m">None right now.</p>'}</div>
<div class="card"><h3>How SOS works</h3><p class="m">Hold the red SOS button for one second to send an alert. Your live GPS location is tracked continuously and sent directly to campus security and your saved emergency contacts. You can talk live over voice call and two-way messaging.</p></div>`}
b.onpointerdown=e=>{b.classList.add('hold');tm=setTimeout(()=>{b.classList.remove('hold');sosForm()},1200)};
function sosForm(){
 if(navigator.geolocation&&!liveCoords){navigator.geolocation.getCurrentPosition(pos=>{liveCoords={lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy,t:Date.now()};const b=$('#sosGpsBadge');if(b)b.innerHTML=`<span class="radar-dot" style="width:10px;height:10px"></span> GPS lock: ${liveCoords.lat.toFixed(4)}°, ${liveCoords.lng.toFixed(4)}° (±${Math.round(liveCoords.acc)}m)`},()=>{})}
 modal(`<h2>🚨 Send SOS Emergency Alert</h2>
 <div class="chips">${['Security concern','Medical emergency','Fire','Other'].map(t=>`<button class="chip ${t===sosT?'on':''}" onclick="sosT='${t}';sosForm()">${t}</button>`).join('')}</div>
 <label class="l" for="sl">Campus location</label>
 <select id="sl">${Object.entries(BLD).flatMap(([bb,rs])=>rs.map(r=>`<option>${bb} — ${r}</option>`)).join('')}<option>Elsewhere on campus</option></select>
 <label class="l" for="sd" style="margin-top:14px;display:block">Emergency details (optional)</label>
 <textarea id="sd" rows="2" maxlength="300" placeholder="e.g. Someone is following me, need immediate assistance"></textarea>
 <div id="sosGpsBadge" style="margin:12px 0;padding:10px 14px;border-radius:12px;background:var(--in);border:1px solid var(--line);font-size:13px;display:flex;align-items:center;gap:8px">
  ${liveCoords?`<span class="radar-dot" style="width:10px;height:10px"></span> GPS lock: ${liveCoords.lat.toFixed(4)}°, ${liveCoords.lng.toFixed(4)}° (±${Math.round(liveCoords.acc)}m)`:`<span style="font-size:14px">📡</span> Acquiring live GPS coordinates for security &amp; contacts…`}
 </div>
 <p class="m" style="font-size:12px">🚨 <b>Live location &amp; alerts are transmitted automatically</b> to campus responders and your emergency contacts. Real-time voice calling and chat will open immediately.</p>
 <button class="btn" style="background:#e1403f;color:#fff;font-size:16px;font-weight:600;padding:12px" onclick="sendSos()">Transmit SOS Now ›</button>`)}
async function sendSos(){
 if(!liveCoords&&navigator.geolocation){try{const pos=await new Promise((res,rej)=>{navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:1800})});liveCoords={lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy,t:Date.now()}}catch(e){}}
 const j=await api('sos',{type:sosT,loc:$('#sl').value,desc:$('#sd').value,lat:liveCoords?.lat,lng:liveCoords?.lng,acc:liveCoords?.acc});
 if(j){startSosLocationWatch(j.id);closeM();openSosHub(j.id)}}
function sosq(){return head('Emergency response','SOS queue')+(S.sos.map(s=>{const ack=s.tl.find(t=>t[0]==='Acknowledged'),coords=s.coords;return `<div class="card" style="margin-bottom:12px"><div class="sh"><div><span class="radar-dot" style="margin-right:6px"></span><b style="font-size:18px">${esc(s.type)}</b> · ${s.id} ${sp(s.status)}<div class="m"><b>${esc(s.who)}</b> · ${esc(s.loc)}${coords?` · 📍 ${coords.lat.toFixed(4)}°, ${coords.lng.toFixed(4)}° (±${Math.round(coords.acc||0)}m)`:''} · ${ago(s.t)}${ack?` · first response ${Math.max(1,Math.round((ack[1]-s.t)/6e4))} min`:''}</div></div></div>
 ${s.desc?`<p>${esc(s.desc)}</p>`:''}
 ${coords?`<div style="margin:10px 0;border-radius:12px;overflow:hidden;border:1px solid var(--line)"><iframe width="100%" height="160" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng-0.003}%2C${coords.lat-0.003}%2C${coords.lng+0.003}%2C${coords.lat+0.003}&amp;layer=mapnik&amp;marker=${coords.lat}%2C${coords.lng}"></iframe><div style="padding:6px 12px;background:var(--in);display:flex;justify-content:space-between;align-items:center"><small style="color:var(--mut)">Live GPS coordinates</small><a class="btn mt" style="font-size:11px;padding:4px 8px;text-decoration:none" href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank" rel="noopener">Open in Google Maps</a></div></div>`:''}
 ${s.contacts&&s.contacts.length?`<div style="margin:8px 0;padding:8px 12px;background:var(--in);border-radius:10px;font-size:12px"><b style="color:#c0392b">Emergency contacts:</b> ${s.contacts.map(c=>`${esc(c.n)} (<a href="tel:${cleanPhone(c.p)}" style="color:var(--pri)">${esc(c.p)}</a>)`).join(' · ')}</div>`:''}
 <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
  <button class="btn" style="background:#e1403f;color:#fff;width:auto" onclick="openSosHub('${s.id}')">💬 Open Live Hub &amp; Map</button>
  <button class="btn" style="background:#0b8d7d;color:#fff;width:auto" onclick="startVoiceCall('${s.id}')">📞 Voice Call Student</button>
  ${s.status==='Active'?`<button class="btn bp" style="width:auto" onclick="sosA('${s.id}','ack')">Acknowledge</button>`:''}
  ${s.status!=='Resolved'&&s.status!=='Active'?`<button class="btn mt" onclick="sosA('${s.id}','assign')">Assign</button> <button class="btn bp" style="width:auto" onclick="sosA('${s.id}','resolve')">Record outcome &amp; resolve</button>`:''}
 </div></div>`}).join('')||'<div class="card">No SOS requests.</div>')}
function sosA(id,a){let to,note;if(a==='assign'){to=prompt('Assign to (responder or team name)');if(!to)return}if(a==='resolve'){note=prompt('Outcome / resolution notes');if(note===null)return}api('sosAct',{id,action:a,to,note})}
/* ---------- Public Emergency Contact Tracking View ---------- */
async function renderTrackView(token){
 document.body.innerHTML=`<div style="min-height:100vh;background:#0b0e26;color:#eceefb;padding:16px;font-family:Outfit,system-ui,sans-serif"><div style="max-width:680px;margin:20px auto"><div style="display:flex;align-items:center;gap:12px;margin-bottom:20px"><div style="width:48px;height:48px;border-radius:50%;background:#e1403f;color:#fff;display:grid;place-items:center;font-weight:700;font-size:18px">SOS</div><div><b style="font-size:22px">CARE Emergency Broadcast</b><div style="color:#9ca2cf;font-size:13px">Live tracking &amp; security dispatch for contacts</div></div></div><div id="trackContent" style="background:#161b41;border-radius:24px;border:1px solid #2a3061;padding:24px"><p style="text-align:center;color:#9ca2cf">Connecting to live emergency broadcast…</p></div></div></div>`;
 try{
  const r=await fetch('/api/sos/track/'+token);
  if(!r.ok){$('#trackContent').innerHTML=`<div style="text-align:center;padding:20px"><h2 style="color:#e1403f">Link Expired or Not Found</h2><p style="color:#9ca2cf">This emergency tracking link is invalid or the SOS has been resolved.</p><a href="/" class="btn bp" style="display:inline-block;margin-top:12px;text-decoration:none">Go to CARE Home</a></div>`;return}
  const s=await r.json();window.currentTrackSos=s;sse(token);renderTrackDom(s,token);
 }catch(e){$('#trackContent').innerHTML=`<div style="text-align:center;padding:20px"><h2 style="color:#e1403f">Connection Error</h2><p style="color:#9ca2cf">Could not reach the emergency server.</p></div>`}
}
function renderTrackDom(s,token){
 const coords=s.coords;
 $('#trackContent').innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center">
  <div><div class="lab" style="color:#9ca2cf">${s.id} · <span class="radar-dot" style="width:8px;height:8px;margin-right:4px"></span>${s.status}</div><h2 style="margin:4px 0">${esc(s.type)}</h2></div>
  ${sp(s.status)}
 </div>
 <p style="color:#9ca2cf;margin:6px 0 16px">Reporter: <b style="color:#fff">${esc(s.who)}</b> · ${esc(s.loc)} · ${ago(s.t)}</p>
 <div style="border-radius:16px;border:1px solid #2a3061;background:#10143a;overflow:hidden;margin-bottom:14px">
  <div style="padding:10px 14px;background:#0d1130;border-bottom:1px solid #2a3061;display:flex;justify-content:space-between;align-items:center">
   <div style="display:flex;align-items:center;gap:8px"><span class="radar-dot"></span><b style="font-size:13px">Live GPS Location</b></div>
   <span id="sosHubAcc" style="font-size:12px;color:#9ca2cf">${coords?`±${Math.round(coords.acc||0)}m accuracy`:'Acquiring…'}</span>
  </div>
  <div id="sosHubMap">
   ${coords?`<iframe width="100%" height="220" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng-0.003}%2C${coords.lat-0.003}%2C${coords.lng+0.003}%2C${coords.lat+0.003}&amp;layer=mapnik&amp;marker=${coords.lat}%2C${coords.lng}"></iframe>`:
   `<div style="height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9ca2cf;gap:6px"><span class="radar-dot" style="width:20px;height:20px"></span><small>Waiting for live GPS signal…</small></div>`}
  </div>
  <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
   <small id="sosHubCoords" style="color:#9ca2cf">${coords?`${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E`:esc(s.loc)}</small>
   ${coords?`<a class="btn" style="background:#2a3061;color:#fff;font-size:12px;padding:6px 12px;text-decoration:none" href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank" rel="noopener">📍 Google Maps</a>`:''}
  </div>
 </div>
 <div class="call-banner" id="sosCallBanner_${s.id}" style="background:#1c2468;border:1px solid #323b7e">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
   <div><b id="callBannerTitle_${s.id}">${callState==='connected'?'Voice Call Connected':'Live Emergency Voice'}</b><div style="color:#cfd3f5;font-size:12px" id="callBannerSub_${s.id}">Connect directly with ${esc(s.who)} and Campus Security</div></div>
   <div style="display:flex;gap:8px" id="callBannerActions_${s.id}">
    ${callState==='connected'?`<button class="call-btn call-btn-red" onclick="endVoiceCall('${s.id}','${token}')">End Call</button>`:
    callState==='calling'?`<button class="call-btn call-btn-red" onclick="endVoiceCall('${s.id}','${token}')">Cancel</button>`:
    `<button class="call-btn call-btn-green" onclick="startVoiceCall('${s.id}','${token}')">📞 Voice Call</button><a class="call-btn call-btn-secondary" href="tel:1800123456">☎️ Call Security</a>`}
   </div>
  </div>
 </div>
 <div style="border-radius:16px;border:1px solid #2a3061;background:#10143a;overflow:hidden;margin-bottom:14px">
  <div style="padding:10px 14px;background:#0d1130;border-bottom:1px solid #2a3061;display:flex;justify-content:space-between;align-items:center">
   <b style="font-size:13px">💬 Emergency Chat (Security &amp; Reporter)</b>
  </div>
  <div id="sosChatMsgs" class="chat-box" style="border:none;border-radius:0;background:#10143a;max-height:220px">
   ${(s.messages||[]).map(m=>renderMsgBubble(m)).join('')||`<p style="color:#9ca2cf;text-align:center;padding:12px 0">No messages yet. Send a message to communicate.</p>`}
  </div>
  <div style="padding:10px 12px;background:#0d1130;border-top:1px solid #2a3061;display:flex;flex-direction:column;gap:8px">
   <div style="display:flex;gap:8px">
    <input type="text" id="contactSenderName" placeholder="Your name (e.g. Mom)" style="width:140px;background:#161b41;border:1px solid #2a3061;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px">
    <input type="text" id="sosMsgIn" placeholder="Type a message to reporter & security..." style="flex:1;background:#161b41;border:1px solid #2a3061;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px" onkeydown="if(event.key==='Enter')sendChatMsg('${s.id}','${token}')">
    <button class="btn bp" style="padding:6px 14px;font-size:13px" onclick="sendChatMsg('${s.id}','${token}')">Send</button>
   </div>
  </div>
 </div>
 <div style="text-align:center;color:#9ca2cf;font-size:13px;margin-top:16px">Campus Security Hotline: <a href="tel:1800123456" style="color:#38d2bd">1800 123 456</a> · National Emergency: <a href="tel:112" style="color:#38d2bd">112</a></div>`;
 setTimeout(()=>{const c=$('#sosChatMsgs');if(c)c.scrollTop=c.scrollHeight},100);
}
/* ---------- analytics, audit, QR ---------- */
function analytics(){const A=S.A,st=S.stats,mx=Math.max(1,...A.wk),
bars=(t,p,u)=>`<div class="card"><h3>${t}</h3>${p.map(([k,n])=>`<div class="hs"><div><span>${esc(k)}</span><small>${n}${u||''}</small></div><i><s style="width:${n/p[0][1]*100}%"></s></i></div>`).join('')||'<p class="m">No data yet.</p>'}</div>`;
return head('Insights','Campus analytics')+`<div class="stats">${stc('plus','Total complaints',st.total,'all time','linear-gradient(90deg,#0b8d7d,#7a5be0)','#d9f3ec','#0b8d7d','#17734f')}${stc('bld','Unresolved',st.open,st.awaiting+' unassigned','linear-gradient(90deg,#e29b2d,#e0564f)','#fdebd0','#d98a1a','#b9770e')}${stc('clock','Avg. resolution',st.avg?st.avg+'h':'n/a','from resolved reports','linear-gradient(90deg,#3f8fdc,#7a5be0)','#dce9fb','#3d7ad1','#2557a7')}${stc('check','Overdue',st.overdue,'past deadline','linear-gradient(90deg,#e0564f,#c0392b)','#fbd9d6','#c0392b','#a3302a')}</div>
<div class="g2" style="margin-top:16px">${bars('Issues by category',A.byCat)}${bars('Open issues by building',A.byBld)}</div>
<div class="g2">${bars('Department workload',A.workload,' open')}<div class="card"><h3>Weekly trend</h3><div class="m">New reports per week, last 8 weeks</div><div style="display:flex;gap:8px;align-items:flex-end;height:130px;margin-top:14px">${A.wk.map(n=>`<div style="flex:1;text-align:center"><div style="height:${n/mx*90}px;min-height:3px;background:linear-gradient(180deg,#5b4fc9,#0b8d7d);border-radius:8px 8px 0 0"></div><small>${n}</small></div>`).join('')}</div></div></div>
<div class="card"><h3>Recurring issues</h3><div class="m">Same room and category reported 2+ times in 90 days</div>${A.rec.map(([k,n])=>`<p><b>${esc(k)}</b> · ${n} reports<br><small class="m">Recommend a preventive inspection</small></p>`).join('')||'<p class="m">No repeat problems detected.</p>'}</div>
<div class="card" style="margin-top:16px"><h3>Satisfaction</h3><div class="tel">${A.rating?A.rating+' / 5':'n/a'}</div><div class="m">Average rating from students after resolution</div></div>`}
function audit(){return head('Accountability','Audit log')+`<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>WHEN</th><th>WHO</th><th>ACTION</th></tr></thead><tbody>${S.audit.map(a=>`<tr><td>${new Date(a.t).toLocaleString()}</td><td>${esc(a.who)}</td><td>${esc(a.a)}</td></tr>`).join('')||'<tr><td colspan="3">No actions yet.</td></tr>'}</tbody></table></div>`}
function openQR(){const base=location.origin+'/#loc=',all=Object.entries(BLD).flatMap(([bb,rs])=>rs.map(r=>[bb,r]));
modal(`<div style="display:flex;justify-content:space-between"><div><div class="lab">Room QR codes</div><h2>${isA()?'Links to print as QR codes':'Choose a room code'}</h2></div><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
${isA()?`<p class="m">Put each link into any QR generator and stick the code in that room. Scanning opens the report form with the location prefilled.</p><textarea rows="8" readonly onfocus="this.select()">${esc(all.map(([bb,r])=>`${bb} — ${r}: ${base}${encodeURIComponent(bb)}|${encodeURIComponent(r)}`).join('\n'))}</textarea>`:`<p class="m">This demo can’t use your camera. Pick a room to simulate a scan.</p>`}
<div class="chips" style="margin-top:14px">${all.map(([bb,r])=>`<button class="chip" onclick="openReport({bld:'${bb}',room:'${r}'})">${bb} — ${r}</button>`).join('')}</div>`)}
function qrHash(){const h=decodeURIComponent(location.hash);if(!h.startsWith('#loc=')||!['student','staff'].includes(S.role))return;const[bb,rr]=h.slice(5).split('|');if(BLD[bb])openReport({bld:bb,room:BLD[bb].includes(rr)?rr:BLD[bb][0]})}
/* ---------- Workflow Automation Center (admin) ---------- */
var WFT='list';let WFD=null,WFF={wf:'',res:'',n:30,st:''};
const WFM=()=>S.wfMeta||{triggers:{},fields:{},opsByKind:{},opLabel:{},actions:{},soon:[],vars:[],templates:[],staff:[],priorities:[],statuses:[]};
const DOWN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],hh=h=>String(h).padStart(2,'0')+':00';
function wfCss(){if(document.getElementById('wfcss'))return;document.head.insertAdjacentHTML('beforeend',`<style id="wfcss">
.wfc{margin-bottom:14px}.wfh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.wfflow{display:flex;gap:10px;align-items:stretch;margin:14px 0;flex-wrap:wrap}.wfbox{flex:1 1 210px;min-width:0;border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:var(--in)}
.wfk{font-size:11px;letter-spacing:.08em;font-weight:700;color:var(--mut);margin-bottom:6px}.wfbox.t{border-left:4px solid var(--pri)}.wfbox.c{border-left:4px solid #e29b2d}.wfbox.a{border-left:4px solid var(--teal)}
.wfar{align-self:center;color:var(--mut);font-size:20px}.wfchip{display:block;font-size:13px;padding:3px 0;overflow-wrap:anywhere}
.wfstat{font-size:13px;color:var(--mut)}.wfbad{color:#c0392b}.wfok{color:#17734f}
.wfbtn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 12px;cursor:pointer;font-size:14px;margin:4px 6px 0 0}.wfbtn:hover{border-color:var(--pri)}.wfbtn.d{color:#c0392b}.wfbtn.p{background:var(--pri);color:#fff;border-color:var(--pri)}
.wsw{position:relative;display:inline-block;width:46px;height:26px;flex:none}.wsw input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;z-index:2;width:100%;height:100%}.wsw span{position:absolute;inset:0;background:#c9c6dc;border-radius:99px;transition:.2s}
.wsw span:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.wsw input:checked+span{background:var(--teal)}.wsw input:checked+span:before{transform:translateX(20px)}.wsw input:focus-visible+span{outline:2px solid var(--pri);outline-offset:2px}
.mod.wide{max-width:880px;width:96vw;max-height:92vh;overflow:auto}.wfstep{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--in)}.wfstep.t{border-left:4px solid var(--pri)}.wfstep.c{border-left:4px solid #e29b2d}.wfstep.a{border-left:4px solid var(--teal)}
.wfdown{text-align:center;color:var(--mut);margin:4px 0;font-size:18px}.wfrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.wfrow select,.wfrow input{flex:1 1 140px;min-width:0}
.wfkpi{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.wfkpi>div{flex:1 1 150px;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card)}.wfkpi b{font-size:24px;display:block}.wfkpi small{color:var(--mut)}
.wfdet{margin:10px 0 6px}.wfdet>summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--pri)}.wfdet[open]>summary{margin-bottom:4px}
</style>`)}
const wfSched=s=>!s?'':s.freq==='daily'?`Every day at ${hh(s.hour)}`:s.freq==='weekly'?`Every ${DOWN[s.dow]} at ${hh(s.hour)}`:`On day ${s.dom} of every month at ${hh(s.hour)}`;
function wfTrigText(w){const M=WFM(),b=M.triggers[w.trigger]||w.trigger;return w.trigger==='deadline_approaching'?`${b} (within ${(w.triggerCfg||{}).hours||4} h)`:w.trigger==='schedule'?`${b}: ${wfSched(w.schedule)}`:b}
function wfCondText(c){const M=WFM(),F=M.fields[c.field];if(!F)return esc(c.field);const v=F.kind==='bool'?(c.value===true||c.value==='true'?'yes':'no'):c.value;return`${esc(F.label)} <b>${esc(M.opLabel[c.op]||c.op)}</b> ${esc(v)}`}
function wfActText(a){const M=WFM(),t=a.type,v=a.value;const m={auto_assign:'Assign least busy available staff',assign_staff:'Assign to '+v,reassign:v?'Reassign to '+v:'Reassign to least busy colleague',set_status:'Set status: '+v,set_priority:'Set priority: '+v,escalate:'Escalate',notify_staff:'Notify assignee',notify_student:'Notify reporter',notify_admin:'Notify admins',notify_team:'Notify team',add_timeline_note:'Add timeline note',request_verification:'Request verification',find_recurring:`Find recurring issues (${v}+)`,audit_log:'Write audit log',generate_report:'Generate report: '+(((M.actions.generate_report||{}).p||[{}])[0].optLabels||{})[v],create_google_doc:'Create Google Doc',create_google_sheet:'Create Google Sheet',save_to_drive:'Save to Google Drive'};return esc(m[t]||(M.actions[t]||{}).label||t)}
function wfCard(w){const lr=w.lastRun?`<span class="${w.lastStatus==='error'?'wfbad':'wfok'}">${w.lastStatus==='error'?'✕ Failed':'✓ Succeeded'}</span> ${ago(w.lastRun)} · matched ${w.lastMatched||0}`:'Never run yet';
 return `<div class="card wfc"><div class="wfh"><div><b style="font-size:17px">${esc(w.name)}</b> <span class="pill ${w.active?'Resolved':''}">${w.active?'● Active':'Paused'}</span>${w.desc?`<div class="m">${esc(w.desc)}</div>`:''}</div>
 <label class="wsw" title="${w.active?'Disable':'Enable'} workflow"><input type="checkbox" role="switch" aria-label="Enable ${esc(w.name)}" ${w.active?'checked':''} onchange="wfToggle('${esc(w.id)}',this.checked)"><span></span></label></div>
 <div class="wfstat">Last run: ${lr} · ${w.runs||0} run${w.runs===1?'':'s'}${w.fails?` · ${w.fails} failed`:''}</div>${w.lastStatus==='error'&&w.lastError?`<div class="wfbad" style="font-size:13px;margin-top:4px">Error: ${esc(w.lastError)}</div>`:''}
 <details class="wfdet"><summary>How it works (WHEN → IF → THEN)</summary>
 <div class="wfflow"><div class="wfbox t"><div class="wfk">WHEN</div><span class="wfchip">${esc(wfTrigText(w))}</span></div><div class="wfar">→</div>
 <div class="wfbox c"><div class="wfk">IF</div>${(w.conditions||[]).length?w.conditions.map(c=>`<span class="wfchip">${wfCondText(c)}</span>`).join(''):'<span class="wfchip m">Always (no conditions)</span>'}</div><div class="wfar">→</div>
 <div class="wfbox a"><div class="wfk">THEN</div>${(w.actions||[]).map((a,i)=>`<span class="wfchip">${i+1}. ${wfActText(a)}</span>`).join('')}</div></div>
 </details>
 <div><button class="wfbtn" onclick="wfEdit('${esc(w.id)}')">Edit</button><button class="wfbtn" onclick="wfPrev('${esc(w.id)}')">Preview matches</button><button class="wfbtn" onclick="wfRun('${esc(w.id)}')">Run now</button><button class="wfbtn d" onclick="wfDel('${esc(w.id)}')">Delete</button></div></div>`}
function wfV(){wfCss();const M=WFM(),W=S.workflows||[],L=S.wfLogs||[],d=Date.now()-864e5,l24=L.filter(x=>x.t>d),f24=l24.filter(x=>!x.success).length,I=S.insights||[];
 const rows=L.filter(x=>(!WFF.wf||x.wfId===WFF.wf)&&(!WFF.res||(WFF.res==='ok'?x.success:!x.success)));
 const WL=W.filter(w=>!WFF.st||(WFF.st==='on'?w.active:WFF.st==='off'?!w.active:w.lastStatus==='error')),cnt={'':W.length,on:W.filter(w=>w.active).length,off:W.filter(w=>!w.active).length,err:W.filter(w=>w.lastStatus==='error').length};
 const LIST=`<div class="card"><details><summary style="cursor:pointer;font-weight:600">How workflows work</summary><p class="m">A workflow reacts to something that happens (<b>WHEN</b>), checks conditions (<b>IF</b>) and then does real work (<b>THEN</b>): it assigns staff, escalates, sends notifications and updates the complaint timeline. Workflows run in the background, even when nobody is logged in. Actions taken by a workflow do not start other workflows. Scheduled times use the server clock.</p></details>
 ${typeof hubGo==='function'?'':` <div class="wfkpi"><div><b>${W.filter(x=>x.active).length}/${W.length}</b><small>workflows active</small></div><div><b>${l24.length}</b><small>runs in the last 24 h</small></div><div><b class="${f24?'wfbad':''}">${f24}</b><small>failed in the last 24 h</small></div></div>
 <button class="btn bp" style="width:auto" onclick="wfNew()">+ New workflow</button>`}</div><div style="margin-top:16px"><div class="wfrow">${[['','All'],['on','Active'],['off','Paused'],['err','Failing']].map(([k,l])=>`<button class="wfbtn ${WFF.st===k?'p':''}" onclick="WFF.st='${k}';render()">${l} (${cnt[k]})</button>`).join('')}</div>${WL.map(wfCard).join('')||'<div class="card m">No workflows yet. Create one or start from a template.</div>'}</div>
`;
 const HIST=`<div class="card"><h3>Execution history</h3><div class="wfrow"><select id="wfhf" aria-label="Filter by workflow" onchange="WFF.wf=this.value;WFF.n=30;render()"><option value="">All workflows</option>${W.map(x=>`<option value="${esc(x.id)}" ${WFF.wf===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
 <select aria-label="Filter by result" onchange="WFF.res=this.value;WFF.n=30;render()"><option value="">All results</option><option value="ok" ${WFF.res==='ok'?'selected':''}>Succeeded</option><option value="err" ${WFF.res==='err'?'selected':''}>Failed</option></select>${L.length?`<button class="wfbtn d" onclick="wfRunsClr('failed')">Delete failed runs</button><button class="wfbtn d" onclick="wfRunsClr('old')">Delete runs older than 30 days</button><button class="wfbtn d" onclick="wfRunsClr('all')">Clear all history</button>`:''}</div>
 ${rows.length?`<div style="overflow-x:auto"><table><thead><tr><th>WHEN</th><th>WORKFLOW</th><th>TRIGGER</th><th>COMPLAINTS</th><th>RESULT</th><th>WHAT HAPPENED</th><th></th></tr></thead><tbody>${rows.slice(0,WFF.n).map(x=>`<tr><td title="${esc(new Date(x.t).toLocaleString())}">${ago(x.t)}</td><td>${esc(x.wfName)}${x.manual?' <small>(manual)</small>':''}</td><td>${esc(M.triggers[x.trigger]||x.trigger)}</td><td>${x.reportId?esc(x.reportId):x.matched+' matched'}</td>
 <td>${x.success?'<span class="wfok">✓ OK</span>':'<span class="wfbad">✕ Failed</span>'}</td><td>${(x.executed||[]).length?esc(x.executed.slice(0,3).join('; ')+(x.executed.length>3?' …':'')):'<span class="m">no changes needed</span>'}${x.error?`<div class="wfbad" style="font-size:13px">${esc(x.error)}</div>`:''}</td><td><button class="wfbtn d" style="margin:0" onclick="wfRunDel('${esc(x.id)}')" aria-label="Delete this record" title="Delete this record">🗑</button></td></tr>`).join('')}</tbody></table></div>${rows.length>WFF.n?`<button class="wfbtn" onclick="WFF.n+=30;render()">Show more</button>`:''}`:'<p class="m">Nothing here yet. Runs appear as soon as a workflow fires.</p>'}</div>
`;
 const INS=`<div class="card"><h3>Recurring issues found by workflows</h3>${I.length?I.map(i=>`<p style="margin:8px 0"><b>${i.count} ${esc(i.cat.toLowerCase())} complaints</b> in ${esc(i.bld)} (${i.open} still open; rooms: ${esc(i.rooms.join(', '))}) <span class="m">· ${ago(i.t)} · by ${esc(i.by)}</span><br><small class="m">Complaints: ${esc(i.reportIds.slice(0,8).join(', '))}${i.reportIds.length>8?' …':''}. Suggested next step: inspect the shared cause (pipes, wiring, ventilation) in that building.</small> <button class="wfbtn d" style="margin:0 0 0 6px;padding:2px 8px" onclick="wfInsDel(${i.t})">Delete</button></p>`).join('')+`<button class="wfbtn d" onclick="wfInsDel(0,true)">Clear all findings</button>`:'<p class="m">None yet. Use the “Identify recurring issues” action in a workflow.</p>'}</div>`;
 return head('Automation','Workflow Automation')+(WFT==='history'?HIST:WFT==='insights'?INS:LIST)}
async function wfToggle(id,on){if(!await api('toggleWorkflow',{id,on}))return render();toast(on?'Workflow enabled.':'Workflow paused.');render()}
async function wfRunDel(id){if(await api('deleteRuns',{id}))toast('Record deleted.')}
async function wfRunsClr(m){const msg={failed:'Delete every failed run record?',old:'Delete run records older than 30 days?',all:'Delete the whole run history?'}[m];if(!confirm(msg+'\nWorkflows themselves are not affected. This cannot be undone.'))return;const j=await api('deleteRuns',m==='failed'?{failedOnly:1}:m==='old'?{olderDays:30}:{all:1});if(j)toast(j.deleted+' record'+(j.deleted===1?'':'s')+' deleted.')}
async function wfInsDel(t,all){if(!confirm(all?'Delete all recurring-issue findings?':'Delete this finding?'))return;if(await api('deleteInsight',all?{all:1}:{t}))toast('Deleted.')}
async function wfDel(id){const w=(S.workflows||[]).find(x=>x.id===id);if(w&&confirm(`Delete “${w.name}”? Its past runs stay in the history.`)&&await api('deleteWorkflow',{id}))toast('Workflow deleted.')}
async function wfPrev(id){const j=await api('wfPreview',{id});if(!j)return;const w=(S.workflows||[]).find(x=>x.id===id)||{};modal(wfPrevHtml(j,w.name,w.trigger==='schedule'));}
const wfPrevHtml=(j,name,s)=>`<div class="sh"><h2>${esc(name||'Preview')}</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div><p><b>${j.n}</b> open complaint${j.n===1?'':'s'} meet the conditions right now.${s?' A scheduled run would act on these.':' A new event would be checked the same way. Nothing was changed.'}</p>${j.sample.length?`<div style="overflow-x:auto"><table><thead><tr><th>ID</th><th>ISSUE</th><th>BUILDING</th><th>ASSIGNED</th><th>PRIORITY</th></tr></thead><tbody>${j.sample.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.bld)}</td><td>${esc(r.as)}</td><td>${esc(r.pri)}</td></tr>`).join('')}</tbody></table></div>${j.n>j.sample.length?`<p class="m">Showing the first ${j.sample.length}.</p>`:''}`:''}`;
function wfRun(id){const w=(S.workflows||[]).find(x=>x.id===id);if(!w)return;if(w.trigger==='schedule'){if(confirm(`Run “${w.name}” now on all matching open complaints? Real changes will be made.`))wfRunGo(id,'');return}
 modal(`<div class="sh"><h2>Run “${esc(w.name)}” now</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div><p class="m">This applies the workflow's actions to one real complaint, as if “${esc((WFM().triggers[w.trigger])||w.trigger)}” had just happened.</p><label class="l" for="wfrid">Complaint ID</label><input type="text" id="wfrid" placeholder="CARE-1003" autocomplete="off" onkeydown="if(event.key==='Enter')wfRunGo('${esc(id)}',this.value)"><br><br><button class="btn bp" onclick="wfRunGo('${esc(id)}',$('#wfrid').value)">Run workflow</button>`)}
async function wfRunGo(id,rid){const j=await api('runWorkflow',{id,reportId:String(rid||'').trim().toUpperCase()});if(!j)return;
 modal(`<div class="sh"><h2>${j.ran===false?'Nothing changed':j.success?'Workflow ran':'Ran with errors'}</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>${j.ran===false?`<p>${esc(j.msg)}</p>`:`<p>Matched <b>${j.matched}</b> complaint${j.matched===1?'':'s'}.</p>${(j.executed||[]).length?`<p>What happened:</p><ul>${j.executed.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="m">The conditions were met but no change was needed.</p>'}${j.error?`<p class="wfbad">Error: ${esc(j.error)}</p>`:''}`}<button class="btn bp" style="width:auto" onclick="closeM();render()">Close</button>`)}
/* ----- builder ----- */
const wfBlank=()=>({id:'',name:'',desc:'',trigger:'report_submitted',hours:4,sched:{freq:'daily',hour:9,dow:1,dom:1},conditions:[],actions:[{type:'notify_admin',template:'New complaint {{id}}: {{title}}'}],active:true,tpl:''});
const wfCopy=w=>({id:w.id,name:w.name,desc:w.desc||'',trigger:w.trigger,hours:(w.triggerCfg||{}).hours||4,sched:Object.assign({freq:'daily',hour:9,dow:1,dom:1},w.schedule||{}),conditions:JSON.parse(JSON.stringify(w.conditions||[])),actions:JSON.parse(JSON.stringify(w.actions||[])),active:!!w.active});
function wfNew(){WFD=wfBlank();wfOpen()}
function wfEdit(id){const w=(S.workflows||[]).find(x=>x.id===id);if(!w)return;WFD=wfCopy(w);wfOpen()}
function wfTpl(k){if(!k)return;wfSync();const t=WFM().templates.find(x=>x.key===k);if(!t||t.soon)return;WFD=Object.assign(wfBlank(),{name:t.name,trigger:t.trigger,sched:Object.assign({freq:'daily',hour:9,dow:1,dom:1},t.schedule||{}),conditions:JSON.parse(JSON.stringify(t.conditions)),actions:JSON.parse(JSON.stringify(t.actions)),id:WFD.id,tpl:k});wfOpen()}
const wfDef=(f)=>{const F=WFM().fields[f]||{};return F.kind==='bool'?true:F.kind==='num'?(f==='hours_left'?4:3):(F.opts?F.opts[0]:'')};
function wfSync(){if(!WFD||!$('#wfn'))return;const g=i=>{const e=document.getElementById(i);return e?e.value:undefined};WFD.name=g('wfn');WFD.desc=g('wfd');WFD.active=!!($('#wfa')||{}).checked;
 if(g('wft')!==undefined)WFD.trigger=g('wft');if(g('wfhr')!==undefined)WFD.hours=g('wfhr');if(g('wfsf')!==undefined){WFD.sched={freq:g('wfsf'),hour:+g('wfsh'),dow:+(g('wfsd')??WFD.sched.dow),dom:+(g('wfsm')??WFD.sched.dom)}}
 WFD.conditions.forEach((c,i)=>{if(g('cf'+i)!==undefined){c.field=g('cf'+i);c.op=g('co'+i)||c.op;if(g('cv'+i)!==undefined)c.value=g('cv'+i)}});
 WFD.actions.forEach((a,i)=>{(((WFM().actions[a.type]||{}).p)||[]).forEach(p=>{const v=g('ap'+i+'_'+p.k);if(v!==undefined)a[p.k]=v})})}
const opt=(v,l,s)=>`<option value="${esc(v)}" ${s?'selected':''}>${esc(l)}</option>`;
function wfCondRow(c,i){const M=WFM(),F=M.fields[c.field]||{kind:'text'},ops=M.opsByKind[F.kind]||[];let val;
 if(F.kind==='bool')val=`<select id="cv${i}" aria-label="Value">${opt('true','yes',c.value===true||c.value==='true')}${opt('false','no',c.value===false||c.value==='false')}</select>`;
 else if(F.kind==='num')val=`<input type="number" step="any" id="cv${i}" value="${esc(c.value)}" aria-label="Value">`;
 else if(F.opts&&c.op!=='includes')val=`<select id="cv${i}" aria-label="Value">${F.opts.map(o=>opt(o,o,o===c.value)).join('')}</select>`;else val=`<input type="text" id="cv${i}" value="${esc(c.value)}" maxlength="60" aria-label="Value">`;
 return`<div class="wfrow"><select id="cf${i}" aria-label="Condition field" onchange="wfCF(${i})">${Object.entries(M.fields).map(([k,f])=>opt(k,f.label,k===c.field)).join('')}</select><select id="co${i}" aria-label="Comparison" onchange="wfOP(${i})">${ops.map(o=>opt(o,M.opLabel[o],o===c.op)).join('')}</select>${val}<button class="wfbtn d" onclick="wfRmC(${i})" aria-label="Remove condition">✕</button></div>`}
function wfActRow(a,i){const M=WFM(),A=M.actions[a.type]||{p:[]};const ps=A.p.map(p=>{const v=a[p.k]??'',id=`ap${i}_${p.k}`;
 if(p.kind==='staff'||p.kind==='staff?')return`<select id="${id}" aria-label="${esc(p.label)}">${p.kind==='staff?'?opt('','Least busy colleague in the same team',!v):''}${M.staff.map(s=>opt(s.name,s.name+' ('+s.team+')',s.name===v)).join('')}</select>`;
 if(p.kind==='status')return`<select id="${id}" aria-label="${esc(p.label)}">${M.statuses.map(s=>opt(s,s,s===v)).join('')}</select>`;if(p.kind==='priority')return`<select id="${id}" aria-label="${esc(p.label)}">${M.priorities.map(s=>opt(s,s,s===v)).join('')}</select>`;
 if(p.kind==='choice')return`<select id="${id}" aria-label="${esc(p.label)}">${p.opts.map(o=>opt(o,(p.optLabels||{})[o]||o,o===v)).join('')}</select>`;if(p.kind==='num')return`<input type="number" min="2" max="20" id="${id}" value="${esc(v||p.def)}" aria-label="${esc(p.label)}" title="${esc(p.label)}">`;return`<input type="text" id="${id}" value="${esc(v)}" maxlength="200" placeholder="${esc(p.label)}" aria-label="${esc(p.label)}" style="flex:3 1 260px">`}).join('');
 return`<div class="wfrow"><b style="width:22px">${i+1}.</b><select id="at${i}" aria-label="Action" style="flex:2 1 300px" onchange="wfAT(${i})">${Object.entries(M.actions).map(([k,x])=>opt(k,x.label,k===a.type)).join('')}${M.soon.length?`<optgroup label="Coming next">${M.soon.map(([k,l])=>`<option disabled>${esc(l)}</option>`).join('')}</optgroup>`:''}</select>${ps}
 <button class="wfbtn" onclick="wfMv(${i},-1)" aria-label="Move up" ${i?'':'disabled'}>↑</button><button class="wfbtn" onclick="wfMv(${i},1)" aria-label="Move down" ${i<WFD.actions.length-1?'':'disabled'}>↓</button><button class="wfbtn d" onclick="wfRmA(${i})" aria-label="Remove action">✕</button></div>`}
function wfOpen(){const M=WFM(),D=WFD,sc=D.sched;wfCss();
 modal(`<div class="sh"><h2>${D.id?'Edit workflow':'New workflow'}</h2><button class="ib" onclick="closeM()" aria-label="Close">✕</button></div>
 ${D.id?'':`<label class="l" for="wftp">Start from a template (optional)</label><select id="wftp" onchange="wfTpl(this.value)"><option value="">Blank workflow</option>${M.templates.map(t=>`<option value="${esc(t.key)}" ${t.soon?'disabled':''} ${t.key===D.tpl?'selected':''}>${esc(t.name)}${t.soon?' (coming next)':''}</option>`).join('')}</select><br><br>`}
 <label class="l" for="wfn">Name</label><input type="text" id="wfn" maxlength="80" value="${esc(D.name)}" placeholder="e.g. Critical complaint: notify the team"><br><br><label class="l" for="wfd">Description (optional)</label><input type="text" id="wfd" maxlength="200" value="${esc(D.desc)}"><br><br>
 <div class="wfstep t"><div class="wfk">1 · WHEN THIS HAPPENS (trigger)</div><div class="wfrow"><select id="wft" aria-label="Trigger" onchange="wfSync();wfOpen()">${Object.entries(M.triggers).map(([k,l])=>opt(k,l,k===D.trigger)).join('')}</select></div>
  ${D.trigger==='deadline_approaching'?`<div class="wfrow"><span>Within the last</span><input type="number" step="any" min="0.25" max="168" id="wfhr" value="${esc(D.hours)}" aria-label="Hours before deadline" style="max-width:110px"><span>hours before the deadline</span></div>`:''}
  ${D.trigger==='schedule'?`<div class="wfrow"><select id="wfsf" aria-label="Frequency" onchange="wfSync();wfOpen()">${opt('daily','Every day',sc.freq==='daily')}${opt('weekly','Every week',sc.freq==='weekly')}${opt('monthly','Every month',sc.freq==='monthly')}</select>
   ${sc.freq==='weekly'?`<select id="wfsd" aria-label="Weekday">${DOWN.map((n,i)=>opt(i,n,i===+sc.dow)).join('')}</select>`:''}${sc.freq==='monthly'?`<select id="wfsm" aria-label="Day of month">${Array.from({length:28},(_,i)=>opt(i+1,'Day '+(i+1),i+1===+sc.dom)).join('')}</select>`:''}
   <select id="wfsh" aria-label="Hour">${Array.from({length:24},(_,i)=>opt(i,'at '+hh(i),i===+sc.hour)).join('')}</select></div><div class="m">Scheduled runs act on all open complaints that meet the conditions. Server time.</div>`:''}</div>
 <div class="wfdown">↓</div><div class="wfstep c"><div class="wfk">2 · ONLY IF (conditions, all must be true; leave empty to always run)</div>${D.conditions.map(wfCondRow).join('')}<button class="wfbtn" onclick="wfAddC()" ${D.conditions.length>=8?'disabled':''}>+ Add condition</button></div>
 <div class="wfdown">↓</div><div class="wfstep a"><div class="wfk">3 · THEN DO (actions run in order)</div>${D.actions.map(wfActRow).join('')}<button class="wfbtn" onclick="wfAddA()" ${D.actions.length>=8?'disabled':''}>+ Add action</button>
  <div class="m" style="margin-top:8px">Message variables: ${M.vars.map(v=>'<code>{{'+v+'}}</code>').join(' ')}. In scheduled runs use <code>{{count}}</code> and <code>{{ids}}</code>.</div></div>
 <div class="wfrow" style="margin-top:14px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="wfa" ${D.active?'checked':''} style="flex:none"> Active (runs automatically)</label></div>
 <div><button class="btn bp" style="width:auto" onclick="wfSave()">Save workflow</button> <button class="wfbtn" onclick="wfPrevDraft()">Preview matching complaints</button> <button class="wfbtn" onclick="closeM()">Cancel</button></div><div id="wfmsg" style="margin-top:12px"></div>`);
 const m=document.querySelector('.mod');if(m)m.classList.add('wide')}
function wfAddC(){wfSync();WFD.conditions.push({field:'cat',op:'eq',value:wfDef('cat')});wfOpen()}
function wfRmC(i){wfSync();WFD.conditions.splice(i,1);wfOpen()}
function wfCF(i){wfSync();const c=WFD.conditions[i],F=WFM().fields[c.field];c.op=WFM().opsByKind[F.kind][0];c.value=wfDef(c.field);wfOpen()}
function wfOP(i){wfSync();const c=WFD.conditions[i];if(c.op==='includes'&&(WFM().fields[c.field]||{}).opts)c.value='';wfOpen()}
function wfAddA(){wfSync();WFD.actions.push({type:'notify_admin',template:'{{id}}: {{title}}'});wfOpen()}
function wfRmA(i){wfSync();WFD.actions.splice(i,1);wfOpen()}
function wfMv(i,d){wfSync();const a=WFD.actions,j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];wfOpen()}
function wfAT(i){wfSync();const t=$('#at'+i).value,a={type:t};((WFM().actions[t]||{}).p||[]).forEach(p=>{a[p.k]=p.kind==='staff'?(WFM().staff[0]||{}).name||'':p.kind==='status'?'Assigned':p.kind==='priority'?'High':p.kind==='num'?p.def:p.kind==='choice'?p.opts[0]:p.kind==='staff?'?'':'{{id}}: {{title}}'});WFD.actions[i]=a;wfOpen()}
function wfPayload(){wfSync();const D=WFD;return{id:D.id||undefined,name:D.name,desc:D.desc,trigger:D.trigger,triggerCfg:{hours:+D.hours},schedule:D.sched,conditions:D.conditions,actions:D.actions,active:D.active}}
async function wfSave(){const p=wfPayload();if(await api('saveWorkflow',p)){closeM();render();toast('Workflow saved.')}}
async function wfPrevDraft(){const p=wfPayload(),j=await api('wfPreview',{wf:p});if(!j)return;$('#wfmsg').innerHTML=`<div class="card" style="box-shadow:none;border:1px solid var(--line)"><b>${j.n}</b> open complaint${j.n===1?'':'s'} meet these conditions right now.${j.sample.length?`<div style="overflow-x:auto"><table><tbody>${j.sample.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.bld)}</td><td>${esc(r.as)}</td><td>${esc(r.pri)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`}

load();setInterval(load,30000);
