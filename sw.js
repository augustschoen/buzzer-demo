"use strict";
/* BUZZER Service Worker — Netz zuerst (immer neueste Version), Cache nur als Offline-Fallback */
const CACHE="bz-sw-v1";
self.addEventListener("install",e=>{ self.skipWaiting(); });
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.protocol!=="http:"&&url.protocol!=="https:")return;
  e.respondWith(
    fetch(req).then(res=>{
      if(res.ok&&url.origin===location.origin){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); }
      return res;
    }).catch(()=>caches.match(req).then(hit=>hit||new Response("Offline",{status:503})))
  );
});
