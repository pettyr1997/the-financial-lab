// Financial Lab 4.1.21.0 — Payday Continuity
const CACHE='financial-lab-v4.1.21.0';
const CORE=['./','./index.html','./styles.css?v=4.1.21.0','./app.js?v=4.1.21.0','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./logo-full.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('financial-lab-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  // HTML/navigation must check the network first so an installed iPhone app
  // does not remain trapped on an older shell after a GitHub Pages deploy.
  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>response)
        .catch(()=>caches.match('./index.html').then(hit=>hit||caches.match('./')))
    );
    return;
  }

  // Versioned app assets are network-first, then cached for offline use.
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
