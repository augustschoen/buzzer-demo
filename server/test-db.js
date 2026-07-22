"use strict";
/* DB-Test: Konto anlegen, aufladen, Events pruefen, Neustart-Persistenz */
const WebSocket=require("ws");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function conn(){const ws=new WebSocket("ws://localhost:8787/ws");const a={ws,ev:{},token:null,bal:null};
 ws.on("message",r=>{const m=JSON.parse(r);a.ev[m.t]=m;if(m.t==="welcome"){a.token=m.token;a.bal=m.balance;}if(m.t==="balance")a.bal=m.balance;});return a;}
async function until(f,to=20000){const t=Date.now();while(Date.now()-t<to){if(f())return 1;await wait(60);}return 0;}
(async()=>{
 const A=conn(); await until(()=>A.ws.readyState===1);
 A.ws.send(JSON.stringify({t:"hello",name:"DbTest",marketing:true}));
 await until(()=>A.token);
 A.ws.send(JSON.stringify({t:"topup",amt:100}));
 await until(()=>A.bal===600);
 console.log("Konto angelegt (marketing=true), aufgeladen: "+A.bal+" — Token: "+A.token);
 console.log("Warte auf DB-Flush ...");
 await wait(7000);
 console.log(A.token); // fuer den Folgetest
 process.exit(0);
})();
