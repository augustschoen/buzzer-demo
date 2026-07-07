"use strict";
/* Headless-Test: 2 Spieler, echte private Lobby, Server zahlt Gewinner aus */
const WebSocket=require("ws");
const URL="ws://localhost:8787/ws";
const log=[];
function mk(name){
  const ws=new WebSocket(URL);
  const api={ws,name,token:null,balance:null,code:null,events:[]};
  ws.on("message",raw=>{ const m=JSON.parse(raw); api.events.push(m.t);
    if(m.t==="welcome"){api.token=m.token;api.balance=m.balance;}
    if(m.t==="balance")api.balance=m.balance;
    if(m.t==="priv")api.code=m.code;
    if(m.t==="privresult"){api.result=m;api.balance=m.balance;}
  });
  return api;
}
const send=(a,o)=>a.ws.send(JSON.stringify(o));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,to=5000){ const t0=Date.now(); while(Date.now()-t0<to){ if(fn())return true; await wait(50);} return false; }

(async()=>{
  const A=mk("Alice"),B=mk("Bob");
  await until(()=>A.ws.readyState===1&&B.ws.readyState===1);
  send(A,{t:"hello",name:"Alice"}); send(B,{t:"hello",name:"Bob"});
  await until(()=>A.token&&B.token);
  log.push("Verbunden — Alice "+A.balance+"€, Bob "+B.balance+"€");

  send(A,{t:"privcreate",stake:20});
  await until(()=>A.code);
  log.push("Alice erstellt Lobby "+A.code+" (Einsatz 20€) → Alice "+A.balance+"€");

  send(B,{t:"privjoin",code:A.code});
  await until(()=>B.code===A.code&&B.balance===480);
  log.push("Bob tritt via Code bei → Bob "+B.balance+"€");

  send(A,{t:"privstart"});
  log.push("Alice gibt START — warte auf GO …");
  const goA=until(()=>A.events.includes("privgo"),40000);
  await goA;
  log.push("GO empfangen (beide)");

  // Bob tippt schneller
  send(B,{t:"privtap",code:A.code,ms:150});
  send(A,{t:"privtap",code:A.code,ms:220});
  log.push("Getippt: Bob 150ms, Alice 220ms");

  await until(()=>A.result&&B.result,8000);
  log.push("ERGEBNIS — Gewinner: "+B.result.winner.name+" ("+B.result.winner.ms+"ms), Pot "+B.result.pot+"€");
  log.push("Kontostände: Alice "+A.balance+"€ (soll 480), Bob "+B.balance+"€ (soll 520)");
  log.push(A.balance===480&&B.balance===520&&B.result.winner.name==="Bob" ? "✅ TEST BESTANDEN" : "❌ FEHLER");
  console.log(log.join("\n"));
  process.exit(0);
})();
