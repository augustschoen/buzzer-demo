"use strict";
/* Headless-Freund: tritt einer Lobby bei, tippt automatisch beim GO. Args: CODE [name] [ms] */
const WebSocket=require("ws");
const CODE=(process.argv[2]||"").toUpperCase();
const NAME=process.argv[3]||"Bob";
const MS=parseInt(process.argv[4]||"200",10);
const ws=new WebSocket("ws://localhost:8787/ws");
let token=null;
ws.on("open",()=>ws.send(JSON.stringify({t:"hello",name:NAME})));
ws.on("message",raw=>{
  const m=JSON.parse(raw);
  if(m.t==="welcome"){ token=m.token; console.log(NAME+" verbunden ("+m.balance+"€), trete "+CODE+" bei"); ws.send(JSON.stringify({t:"privjoin",code:CODE})); }
  if(m.t==="priv")console.log(NAME+" in Lobby "+m.code+": "+m.members.join(", ")+(m.startAt?" [START gegeben]":""));
  if(m.t==="privgo"){ console.log(NAME+" GO → tippt "+MS+"ms"); ws.send(JSON.stringify({t:"privtap",code:CODE,ms:MS})); }
  if(m.t==="privresult"){ console.log(NAME+" Ergebnis: Gewinner "+(m.winner?m.winner.name:"—")+", eigenes Guthaben "+m.balance+"€"); process.exit(0); }
  if(m.t==="privfail")console.log(NAME+" FEHLER: "+m.reason);
});
setTimeout(()=>{ console.log(NAME+" Timeout"); process.exit(1); },120000);
