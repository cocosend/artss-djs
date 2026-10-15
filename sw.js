const VERSION='artss-djs-v7.6.0';
const ASSETS=['./','./index.html','./styles.css?v=7.6.0','./app.js?v=7.6.0','./midi-controller.js','./music-composer.js','./creative-pack.js','./icons/icon-180.png','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('artss-')&&k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 e.respondWith((async()=>{
  const cache=await caches.open(VERSION),cached=await cache.match(req),fallback=cached||(req.mode==='navigate'?await cache.match('./index.html'):null);
  if(self.navigator.onLine===false&&fallback)return fallback;
  try{const response=await fetch(req);if(response.ok){await cache.put(req,response.clone()).catch(()=>{});return response}return fallback||response}
  catch{return fallback||Response.error()}
 })());
});
