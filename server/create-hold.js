"use strict";
/* Erstellt eine Lobby und hält sie offen; meldet Beitritte. Args: [stake] [name] */
const WebSocket=require("ws");
const STAKE=parseInt(process.argv[2]||"10",10);
const NAME=process.argv[3]||"HostAugust";
const ws=new WebSocket("ws://localhost:8787/ws");
ws.on("open",()=>ws.send(JSON.stringify({t:"hello",name:NAME})));
ws.on("message",raw=>{
  const m=JSON.parse(raw);
  if(m.t==="welcome"){ console.log(NAME+" verbunden → erstelle Lobby ("+STAKE+"€)"); ws.send(JSON.stringify({t:"privcreate",stake:STAKE})); }
  if(m.t==="priv")console.log("LOBBY "+m.code+" | Mitglieder: "+m.members.join(", "));
});
setTimeout(()=>process.exit(0),180000);
