"use strict";
/* ============================================================
   BUZZER — Phase-1 Backend (Spielgeld)
   - Serviert die App (../index.html) und spricht WebSocket
   - Accounts + Guthaben serverseitig (JSON-Persistenz)
   - Öffentliche Buzzer: gleiche deterministische Engine wie der
     Client (Lockstep über synchronisierte Uhr) — der Server ist
     autoritativ für Einsätze, Taps und Ergebnisse
   - Private Lobbys: komplett real (nur echte Mitglieder, 0% Gebühr,
     Einladungscode, Creator gibt das GO, geheimer Jitter)
   Start:  node server.js   (PORT env, Standard 8787)
   ============================================================ */

const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {WebSocketServer}=require("ws");

const PORT=process.env.PORT||8787;
const APP_FILE=path.join(__dirname,"..","index.html");
const DATA_FILE=path.join(__dirname,"data.json");
const BUILD="phase1-v0";

/* ---------- Engine-Konstanten (identisch zum Client!) ---------- */
const STAKES=[1,3,5,10,20,50,75,100,200,300,400,500,600,700,800,900,1000,10000,20000];
const N=STAKES.length;
const TARGET={1:120,3:95,5:85,10:65,20:48,50:32,75:26,100:21,200:14,300:12,400:11,500:9,600:8,700:7,800:7,900:6,1000:5,10000:3,20000:2};
const JP=101;
const JP_STAKE=10;
const RND_BASE=110;
const RND_STAKES=[1,5,10,20,50,100];
const RND_TARGET={1:60,5:45,10:34,20:24,50:14,100:9};
const isRnd=i=>i>=RND_BASE&&i<RND_BASE+RND_STAKES.length;
const RND_PERIOD=180000;
const PERIOD=240000; // Online läuft im Demo-Tempo (4 min)
const RAKE=0;
const MINMS=92;
const NAMES=["NovaStrike","Mike_87","luna.exe","QuickFingerz","BlitzKid","jonas_hh","Vexx","MsMillisekunde","turbo_tim","GhostTap","Kira","FlashF1n","NeoJ","SpeedyGnz","0xRapid","HannaBanana","ClickCzar","piXelPete","MiaMoneyy","TapGod","Chr1s","ZoeZoom","Rudi_R","VelvetViper","OTTO","fastlane_","JuliaW","BigPotBob","tiny_tina","Maximus","ping_9ms","AnnikaZ","Der_Daumen","Ricochet","MoneyMika","SnapZ","Elif_x","Timo_x","LagLordLee","frieda.f","BeepBoop","Cassia","Nordlicht","TTV_Blur","paul_pkr","Skrrt","Wrz","Dash_Dee"];

function rng(seed){ let a=seed>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function seedOf(i,c,salt){ return (Math.imul(i+1,2654435761)^Math.imul((c%1000000)+1,1597334677)^Math.imul(salt,374761393))>>>0; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>Date.now();

const offsetOf=i=>Math.round(i*PERIOD/N);
const modeOf=stake=>(stake>=200&&stake<=1000)?"top3":"wta";
const stakeOf=i=>isRnd(i)?RND_STAKES[i-RND_BASE]:i===JP?JP_STAKE:STAKES[i];
const modeOfIdx=i=>i>=100?"wta":modeOf(STAKES[i]);
function phaseOf(t,tClose,tCount,tGoBase,tGo){
  if(t>=tGo+3000)return "result";
  if(t>=tGo)return "live";
  if(t>=tGoBase)return "suspense";
  if(t>=tCount)return "countdown";
  if(t>=tClose)return "locked";
  return "open";
}
function times(i,t){
  if(isRnd(i)){
    const P=RND_PERIOD,off=Math.round((i-RND_BASE)*P/RND_STAKES.length);
    const c=Math.floor((t-off)/P),start=c*P+off,end=start+P;
    const tGo=start+20000+rng(seedOf(i,c,11))()*(P-60000);
    const tClose=tGo-1200,tCount=tGo-1100,tGoBase=tGo-1000;
    return {i,c,start,end,tClose,tCount,tGoBase,tGo,phase:phaseOf(t,tClose,tCount,tGoBase,tGo),key:i+":"+c};
  }
  if(i===JP){
    const d=new Date(t);
    let base=new Date(d.getFullYear(),d.getMonth(),d.getDate(),20,15,0,0).getTime();
    if(t>=base+60000)base+=86400000;
    const c=Math.round(base/86400000);
    const start=base-86400000+120000,end=base+60000;
    const tClose=base-15000,tCount=base-12000,tGoBase=base-9000;
    const tGo=tGoBase+800+rng(seedOf(JP,c,11))()*1800;
    return {i,c,start,end,tClose,tCount,tGoBase,tGo,phase:phaseOf(t,tClose,tCount,tGoBase,tGo),key:JP+":"+c};
  }
  const P=PERIOD,off=offsetOf(i);
  const c=Math.floor((t-off)/P),start=c*P+off,end=start+P;
  const tClose=end-15000,tCount=end-12000,tGoBase=end-9000;
  const tGo=tGoBase+800+rng(seedOf(i,c,11))()*1800;
  return {i,c,start,end,tClose,tCount,tGoBase,tGo,phase:phaseOf(t,tClose,tCount,tGoBase,tGo),key:i+":"+c};
}
function targetOf(i,c){
  const r=rng(seedOf(i,c,22))();
  if(isRnd(i))return Math.max(3,Math.round((RND_TARGET[stakeOf(i)]||10)*(0.7+r*0.6)));
  if(i===JP)return Math.round(900+r*1700);
  const base=TARGET[STAKES[i]]||6;
  return Math.max(2,Math.round(base*(0.7+r*0.6)));
}
const resolvedCache={};
function resolveRound(i,c){
  const key=i+":"+c; if(resolvedCache[key])return resolvedCache[key];
  const r=rng(seedOf(i,c,33));
  const players=targetOf(i,c);
  const n=Math.min(players,300);
  const arr=[];
  for(let k=0;k<n;k++){
    const u=Math.max(r(),1e-9),v=r();
    const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    arr.push(clamp(Math.exp(Math.log(285)+0.32*z),152,900));
  }
  arr.sort((a,b)=>a-b);
  const nm=()=>NAMES[Math.floor(r()*NAMES.length)];
  const out={players,times:arr,winner:nm(),winnerMs:arr[0]};
  resolvedCache[key]=out;
  if(Object.keys(resolvedCache).length>500)for(const k of Object.keys(resolvedCache).slice(0,200))delete resolvedCache[k];
  return out;
}

/* ---------- E-Mail-Versand (Brevo oder Resend; ohne Config → Demo-Fallback) ---------- */
let MAIL=null;
if(process.env.MAIL_API_KEY){ // Hosting: Zugang über Umgebungsvariablen (empfohlen)
  MAIL={provider:process.env.MAIL_PROVIDER||"brevo",apiKey:process.env.MAIL_API_KEY,from:process.env.MAIL_FROM,fromName:process.env.MAIL_FROM_NAME||"BUZZER"};
  console.log("Mail-Versand aktiv über "+MAIL.provider+" (ENV)");
}else{
  try{ MAIL=JSON.parse(fs.readFileSync(path.join(__dirname,"mail-config.json"),"utf8")); console.log("Mail-Versand aktiv über "+MAIL.provider+" (Datei)"); }
  catch(e){ console.log("Keine Mail-Config — E-Mail-Codes im Demo-Fallback (Code wird angezeigt)"); }
}
async function sendMail(to,subject,text){
  if(!MAIL||!MAIL.apiKey)return false;
  try{
    if(MAIL.provider==="brevo"){
      const r=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",
        headers:{"api-key":MAIL.apiKey,"content-type":"application/json"},
        body:JSON.stringify({sender:{name:MAIL.fromName||"BUZZER",email:MAIL.from},to:[{email:to}],subject,textContent:text})});
      if(!r.ok)console.error("brevo:",r.status,await r.text().catch(()=>""));
      return r.ok;
    }
    if(MAIL.provider==="resend"){
      const r=await fetch("https://api.resend.com/emails",{method:"POST",
        headers:{"Authorization":"Bearer "+MAIL.apiKey,"content-type":"application/json"},
        body:JSON.stringify({from:(MAIL.fromName||"BUZZER")+" <"+MAIL.from+">",to:[to],subject,text})});
      if(!r.ok)console.error("resend:",r.status,await r.text().catch(()=>""));
      return r.ok;
    }
  }catch(e){ console.error("sendMail:",e.message); }
  return false;
}
const EMAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/* ---------- Persistenz ---------- */
let DB={users:{}};
try{ DB=JSON.parse(fs.readFileSync(DATA_FILE,"utf8")); if(!DB.users)DB.users={}; }catch(e){}
let dirty=false;
function save(){ dirty=true; }
setInterval(()=>{ if(!dirty)return; dirty=false; try{ fs.writeFileSync(DATA_FILE,JSON.stringify(DB)); }catch(e){ console.error("save:",e.message); } },5000);
process.on("SIGINT",()=>{ try{ fs.writeFileSync(DATA_FILE,JSON.stringify(DB)); }catch(e){} process.exit(0); });

function dayKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
function ensureDay(u){ if(!u.day||u.day.k!==dayKey())u.day={k:dayKey(),best:null,won:0,bets:0}; }

/* ---------- Verbindungen ---------- */
const conns=new Set(); // {ws, token, name, alive}
function userOf(token){ return DB.users[token]||null; }
function send(c,obj){ try{ if(c.ws.readyState===1)c.ws.send(JSON.stringify(obj)); }catch(e){} }
function broadcast(obj,filter){ const s=JSON.stringify(obj); for(const c of conns){ if(c.token&&(!filter||filter(c))){ try{ if(c.ws.readyState===1)c.ws.send(s); }catch(e){} } } }
function sanitizeName(s){ return String(s||"").replace(/[^\wäöüÄÖÜß.\-_ ]/g,"").trim().slice(0,16)||("Player"+Math.floor(1000+Math.random()*9000)); }
function sanitizeText(s){ return String(s||"").replace(/\s+/g," ").trim().slice(0,80); }

/* ---------- Öffentliche Runden: echte Einsätze & Taps ---------- */
const roundBets=new Map();   // key -> Map(token -> {ms:null|number})
function betsFor(key){ if(!roundBets.has(key))roundBets.set(key,new Map()); return roundBets.get(key); }
const lastPhase={};          // i -> "key|phase"
const resolvedRounds=new Set();

function publicIdx(){ const a=[]; for(let i=0;i<N;i++)a.push(i); for(let k=0;k<RND_STAKES.length;k++)a.push(RND_BASE+k); a.push(JP); return a; }

function resolvePublic(i,T){
  const key=T.key;
  if(resolvedRounds.has(key))return;
  resolvedRounds.add(key);
  if(resolvedRounds.size>800){ const it=resolvedRounds.values(); for(let k=0;k<300;k++)resolvedRounds.delete(it.next().value); }
  const R=resolveRound(i,T.c);
  const stake=stakeOf(i);
  const bets=roundBets.get(key)||new Map();
  const reals=[];
  for(const [token,b] of bets){ const u=userOf(token); if(!u)continue; reals.push({token,name:u.name,ms:(typeof b.ms==="number")?Math.max(MINMS,b.ms):null}); }
  const playersTotal=R.players+reals.length;
  const potGross=playersTotal*stake, potNet=potGross*(1-RAKE);
  const mode=modeOfIdx(i);
  // Ränge: Bots (sortiert) + echte Zeiten gemeinsam
  const botArr=R.times;
  function rankOf(ms){
    let faster=0;
    for(const b of botArr){ if(b<ms)faster++; else break; }
    faster=Math.round(faster*(R.players/botArr.length));
    for(const r of reals){ if(r.ms!=null&&r.ms<ms)faster++; }
    return 1+faster;
  }
  let bestReal=null;
  for(const r of reals){ if(r.ms!=null&&(bestReal==null||r.ms<bestReal.ms))bestReal=r; }
  const humanWins=bestReal&&bestReal.ms<R.winnerMs;
  const winnerName=humanWins?bestReal.name:R.winner;
  const winnerMs=humanWins?bestReal.ms:R.winnerMs;
  const shares={1:mode==="wta"?1:0.6,2:mode==="top3"?0.25:0,3:mode==="top3"?0.15:0};
  const results=[];
  for(const r of reals){
    const u=userOf(r.token); if(!u)continue;
    ensureDay(u);
    let rank=null,prize=0;
    if(r.ms!=null){
      rank=rankOf(r.ms);
      if(rank<=3&&shares[rank])prize=potNet*shares[rank];
      if(u.day.best==null||r.ms<u.day.best)u.day.best=r.ms;
      if(u.stats.best==null||r.ms<u.stats.best)u.stats.best=r.ms;
    }
    u.stats.plays++; u.day.bets++;
    if(prize>0){ u.balance+=prize; u.stats.net+=prize; u.day.won+=prize; if(rank===1)u.stats.wins++; }
    results.push({token:r.token,rank,prize,ms:r.ms});
  }
  save();
  const pub={t:"result",key,i,c:T.c,winnerName,winnerMs,playersTotal,potGross,potNet,mode,realCount:reals.length};
  for(const c of conns){
    if(!c.token)continue;
    const mine=results.find(x=>x.token===c.token);
    send(c,Object.assign({},pub,mine?{you:{rank:mine.rank,prize:mine.prize,ms:mine.ms},balance:userOf(c.token).balance}:{}));
  }
  roundBets.delete(key);
}

setInterval(()=>{
  const t=now();
  for(const i of publicIdx()){
    const T=times(i,t);
    const sig=T.key+"|"+T.phase;
    if(lastPhase[i]!==sig){
      lastPhase[i]=sig;
      if(T.phase==="result")setTimeout(()=>resolvePublic(i,times(i,T.tGo+3100)),900); // kleine Gnadenfrist für späte Taps
    }
  }
  // Private Lobbys fortschreiben
  for(const code of Object.keys(lobbies)){
    const L=lobbies[code];
    if(L.goAt&&!L.goSent&&t>=L.goAt){ L.goSent=true; lobbyCast(L,{t:"privgo",code}); }
    if(L.goAt&&!L.resolved&&t>=L.goAt+3800)resolveLobby(L);
    if(!L.goAt&&t-L.createdAt>3600000){ refundLobby(L,"Lobby abgelaufen — Einsatz zurück"); } // 1 h ohne Start → auflösen
  }
},250);

/* ---------- Private Lobbys ---------- */
const lobbies={}; // code -> {code,stake,creator,members:[{token,name}],createdAt,startAt,goAt,goSent,taps:{token:ms},resolved}
function makeCode(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let k=0;k<5;k++)s+=A[crypto.randomInt(A.length)]; return lobbies[s]?makeCode():s; }
function lobbyState(L){ return {t:"priv",code:L.code,stake:L.stake,creator:L.creatorName,members:L.members.map(m=>m.name),startAt:L.startAt||null,done:!!L.resolved}; }
function lobbyCast(L,obj){ const tokens=new Set(L.members.map(m=>m.token)); broadcast(obj,c=>tokens.has(c.token)); }
function refundLobby(L,msg){
  for(const m of L.members){ const u=userOf(m.token); if(u){ u.balance+=L.stake; } }
  save();
  lobbyCast(L,{t:"privend",code:L.code,msg});
  for(const c of conns){ if(L.members.some(m=>m.token===c.token)){ const u=userOf(c.token); if(u)send(c,{t:"balance",balance:u.balance}); } }
  delete lobbies[L.code];
}
function resolveLobby(L){
  L.resolved=true;
  const pot=L.members.length*L.stake; // 0% Gebühr — kompletter Pot
  const ranked=L.members.map(m=>({name:m.name,token:m.token,ms:(typeof L.taps[m.token]==="number")?Math.max(MINMS,L.taps[m.token]):null}))
    .sort((a,b)=>(a.ms==null?1e9:a.ms)-(b.ms==null?1e9:b.ms));
  const winner=ranked[0]&&ranked[0].ms!=null?ranked[0]:null;
  if(winner){ const u=userOf(winner.token); if(u){ u.balance+=pot; u.stats.wins++; ensureDay(u); u.day.won+=pot; } }
  for(const m of L.members){ const u=userOf(m.token); if(u){ u.stats.plays++; ensureDay(u); u.day.bets++; if(typeof L.taps[m.token]==="number"){ const ms=Math.max(MINMS,L.taps[m.token]); if(u.day.best==null||ms<u.day.best)u.day.best=ms; if(u.stats.best==null||ms<u.stats.best)u.stats.best=ms; } } }
  save();
  for(const c of conns){
    const me=ranked.find(r=>r.token===c.token);
    if(me){ const u=userOf(c.token); send(c,{t:"privresult",code:L.code,pot,winner:winner?{name:winner.name,ms:winner.ms}:null,ranking:ranked.map(r=>({name:r.name,ms:r.ms})),you:{ms:me.ms,won:winner&&winner.token===c.token?pot:0},balance:u?u.balance:0}); }
  }
  setTimeout(()=>{ delete lobbies[L.code]; },60000);
}

/* ---------- WebSocket ---------- */
function handleMsg(c,m){
  const t=now();
  if(m.t==="hello"){
    let token=m.token&&DB.users[m.token]?m.token:null;
    if(!token){
      token=crypto.randomUUID();
      DB.users[token]={name:sanitizeName(m.name),balance:500,createdAt:t,stats:{plays:0,wins:0,net:0,best:null},day:{k:dayKey(),best:null,won:0,bets:0}};
      save();
    }else if(m.name){ DB.users[token].name=sanitizeName(m.name); save(); }
    c.token=token; c.name=DB.users[token].name;
    send(c,{t:"welcome",token,name:c.name,balance:DB.users[token].balance,serverNow:t,build:BUILD,online:[...conns].filter(x=>x.token).length});
    return;
  }
  if(!c.token)return;
  const u=userOf(c.token); if(!u)return;

  if(m.t==="ping"){ send(c,{t:"pong",serverNow:now(),e:m.e}); return; }

  if(m.t==="emailcode"){
    const email=String(m.email||"").trim().toLowerCase();
    if(!EMAIL_RE.test(email)||email.length>80){ send(c,{t:"emailsent",real:false,error:"invalid"}); return; }
    c.mailTries=(c.mailTries||0)+1;
    if(c.mailTries>5){ send(c,{t:"emailsent",real:false,error:"limit"}); return; }
    const code=String(crypto.randomInt(100000,1000000));
    c.mailCode={email,code,exp:t+10*60000};
    sendMail(email,"Dein BUZZER-Code: "+code,"Dein Bestätigungscode: "+code+"\n\nGültig für 10 Minuten.").then(ok=>{
      if(ok)send(c,{t:"emailsent",real:true});
      else send(c,{t:"emailsent",real:false,code}); // Demo-Fallback: Code anzeigen
    });
    return;
  }
  if(m.t==="emailverify"){
    const email=String(m.email||"").trim().toLowerCase();
    const code=String(m.code||"").trim();
    const mc=c.mailCode;
    if(mc&&mc.email===email&&mc.code===code&&t<mc.exp){
      c.mailCode=null;
      u.email=email; save(); // verifizierte E-Mail am Konto speichern
      send(c,{t:"emailok"});
    }else send(c,{t:"emailbad"});
    return;
  }

  if(m.t==="bet"){
    const i=m.i|0;
    if(!((i>=0&&i<N)||isRnd(i)||i===JP))return;
    const T=times(i,t);
    if(T.phase!=="open"){ send(c,{t:"betfail",key:T.key,reason:"closed"}); return; }
    const stake=stakeOf(i);
    const bets=betsFor(T.key);
    if(bets.has(c.token))return;
    if(u.balance<stake){ send(c,{t:"betfail",key:T.key,reason:"balance"}); return; }
    u.balance-=stake; u.stats.net-=stake; save();
    bets.set(c.token,{ms:null});
    send(c,{t:"betok",key:T.key,i,balance:u.balance});
    broadcast({t:"join",i,key:T.key,name:u.name,amt:stake,real:betsFor(T.key).size});
    return;
  }
  if(m.t==="tap"){
    const key=String(m.key||"");
    const bets=roundBets.get(key);
    if(bets&&bets.has(c.token)){
      const b=bets.get(c.token);
      if(b.ms==null&&typeof m.ms==="number"&&m.ms>=0&&m.ms<10000)b.ms=m.ms;
    }
    return;
  }
  if(m.t==="chat"){
    const i=m.i|0;
    if(t-(c.lastChat||0)<1500)return;
    c.lastChat=t;
    const txt=sanitizeText(m.text); if(!txt)return;
    broadcast({t:"chat",i,name:u.name,text:txt});
    return;
  }
  if(m.t==="topup"){
    const amt=Math.min(1000,Math.max(1,m.amt|0));
    u.balance+=amt; save();
    send(c,{t:"balance",balance:u.balance,topup:amt});
    return;
  }
  if(m.t==="privcreate"){
    const stake=Math.min(1000,Math.max(1,m.stake|0));
    if(u.balance<stake){ send(c,{t:"betfail",reason:"balance"}); return; }
    for(const code of Object.keys(lobbies)){ if(lobbies[code].creator===c.token&&!lobbies[code].resolved){ send(c,{t:"privfail",reason:"exists"}); return; } }
    u.balance-=stake; save();
    const code=makeCode();
    lobbies[code]={code,stake,creator:c.token,creatorName:u.name,members:[{token:c.token,name:u.name}],createdAt:t,startAt:null,goAt:null,goSent:false,taps:{},resolved:false};
    send(c,{t:"balance",balance:u.balance});
    send(c,lobbyState(lobbies[code]));
    return;
  }
  if(m.t==="privjoin"){
    const L=lobbies[String(m.code||"").toUpperCase()];
    if(!L||L.resolved){ send(c,{t:"privfail",reason:"notfound"}); return; }
    if(L.startAt){ send(c,{t:"privfail",reason:"started"}); return; }
    if(L.members.some(x=>x.token===c.token)){ send(c,lobbyState(L)); return; }
    if(L.members.length>=12){ send(c,{t:"privfail",reason:"full"}); return; }
    if(u.balance<L.stake){ send(c,{t:"privfail",reason:"balance"}); return; }
    u.balance-=L.stake; save();
    L.members.push({token:c.token,name:u.name});
    send(c,{t:"balance",balance:u.balance});
    lobbyCast(L,lobbyState(L));
    lobbyCast(L,{t:"privchat",code:L.code,name:u.name,sys:false,join:true,amt:L.stake});
    return;
  }
  if(m.t==="privstart"){
    for(const code of Object.keys(lobbies)){
      const L=lobbies[code];
      if(L.creator===c.token&&!L.startAt&&!L.resolved){
        L.startAt=t+30000;
        L.goAt=L.startAt+800+Math.random()*1800; // geheimer Jitter — kennt nur der Server
        lobbyCast(L,lobbyState(L));
      }
    }
    return;
  }
  if(m.t==="privcancel"){
    for(const code of Object.keys(lobbies)){
      const L=lobbies[code];
      if(L.creator===c.token&&!L.startAt&&!L.resolved)refundLobby(L,"Der Ersteller hat abgebrochen — Einsatz zurück");
    }
    return;
  }
  if(m.t==="privtap"){
    const L=lobbies[String(m.code||"").toUpperCase()];
    if(!L||!L.goSent||L.resolved)return;
    if(!L.members.some(x=>x.token===c.token))return;
    if(L.taps[c.token]==null&&typeof m.ms==="number"&&m.ms>=0&&m.ms<10000)L.taps[c.token]=m.ms;
    return;
  }
  if(m.t==="privchat"){
    for(const code of Object.keys(lobbies)){
      const L=lobbies[code];
      if(L.members.some(x=>x.token===c.token)){
        if(t-(c.lastChat||0)<1500)return;
        c.lastChat=t;
        const txt=sanitizeText(m.text); if(!txt)return;
        lobbyCast(L,{t:"privchat",code:L.code,name:u.name,text:txt});
      }
    }
    return;
  }
}

/* ---------- HTTP ---------- */
const server=http.createServer((req,res)=>{
  const url=(req.url||"/").split("?")[0];
  if(url==="/api/info"){
    res.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
    res.end(JSON.stringify({buzzer:true,build:BUILD,serverNow:now(),online:[...conns].filter(x=>x.token).length}));
    return;
  }
  if(url==="/"||url==="/index.html"){
    fs.readFile(APP_FILE,(err,data)=>{
      if(err){ res.writeHead(500); res.end("App nicht gefunden"); return; }
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end("404");
});

const wss=new WebSocketServer({server,path:"/ws"});
wss.on("connection",ws=>{
  const c={ws,token:null,name:null,lastChat:0};
  conns.add(c);
  ws.on("message",raw=>{
    let m=null;
    try{ m=JSON.parse(String(raw).slice(0,4000)); }catch(e){ return; }
    try{ handleMsg(c,m); }catch(e){ console.error("msg:",e.message); }
  });
  ws.on("close",()=>conns.delete(c));
  ws.on("error",()=>conns.delete(c));
});

server.listen(PORT,()=>console.log("BUZZER-Server läuft auf Port "+PORT+" ("+BUILD+")"));
