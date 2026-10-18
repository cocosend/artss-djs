const CACHE='artss-live-v19.0.0',SHELL=['/','/studio.css','/app/main.js','/app/model.js','/app/sounds.js','/app/engine.js','/app/smart.js','/app/clock.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith(caches.match(req).then(found=>found||fetch(req).then(response=>{if(response.ok&&new URL(req.url).pathname.startsWith('/samples/')){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(req,clone)).catch(()=>{});}return response;})));
});