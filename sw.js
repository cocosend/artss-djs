const CACHE='artss-live-v15-clean';
const ASSETS=['./','./index.html','./studio.css?v=15.0.0','./studio.js?v=15.0.0','./src/sound-design.js','./src/session.js','./src/engine.js','./src/takes.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('artss-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){
 e.respondWith(fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put('./index.html',r.clone())).catch(()=>{});return r;}).catch(()=>caches.match('./index.html')));
 }else e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));});