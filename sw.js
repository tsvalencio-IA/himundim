'use strict';
const CACHE='himundim-radio-install-v1';
const STATIC=['/offline','/icons/radio-192.png','/icons/radio-512.png','/icons/radio-maskable-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('himundim-radio-install-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||/^\/(admin|api|docs)(\/|$)/.test(url.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/offline')));return;
  }
  if(STATIC.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(request)));
});
