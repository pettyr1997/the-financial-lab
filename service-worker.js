// Financial Lab 4.4.0.0 — Notifications + Next Phase
const CACHE='financial-lab-v4.4.0.0';
const CORE=['./','./index.html','./styles.css?v=4.4.0.0','./app.js?v=4.4.0.0','./lab-next.js?v=4.4.0.0','./lab-next.css?v=4.4.0.0','./lab-pro.js?v=4.4.0.0','./lab-plus.js?v=4.4.0.0','./invoice.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./logo-full.svg','./dexx-character-clean.jpg','./dexx-character-business.jpg'];

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

/* 4.4.0.0 — Notifications. The page pre-computes a 14-day alert schedule
   (titles/bodies never contain dollar amounts) into the existing IndexedDB.
   Where the phone supports Periodic Background Sync, the worker fires the
   day's alert — still one per day max. */
function flNotifyDb(){return new Promise((res,rej)=>{const r=indexedDB.open('financial-lab-memory',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('snapshots'))r.result.createObjectStore('snapshots')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function flDailyAlert(){
  const db=await flNotifyDb();
  const v=await new Promise(res=>{const tx=db.transaction('snapshots','readonly');const q=tx.objectStore('snapshots').get('notify');q.onsuccess=()=>res(q.result);q.onerror=()=>res(null)});
  const d=new Date();d.setHours(12,0,0,0);const today=d.toISOString().slice(0,10);
  if(!v||!v.enabled||v.lastSent===today){db.close();return}
  const hit=(v.schedule||[]).find(x=>x.date===today);
  if(!hit){db.close();return}
  await self.registration.showNotification(hit.title,{body:hit.body,tag:'financial-lab-daily',icon:'icon-192.png',badge:'icon-192.png',data:{url:'./#'+(hit.view||'laboratory')}});
  v.lastSent=today;
  await new Promise(res=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(v,'notify');tx.oncomplete=res;tx.onerror=res});
  db.close();
}
self.addEventListener('periodicsync',event=>{if(event.tag==='financial-lab-daily')event.waitUntil(flDailyAlert().catch(()=>{}))});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL((event.notification.data&&event.notification.data.url)||'./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){c.navigate&&c.navigate(url);return c.focus()}}
    return self.clients.openWindow(url);
  }));
});

/* 4.4.0.0 — Server push (cloud accounts). Payload: {title, body, view}. No amounts. */
self.addEventListener('push',event=>{
  let d={};try{d=event.data?event.data.json():{}}catch(_){d={body:event.data&&event.data.text()}}
  event.waitUntil(self.registration.showNotification(d.title||'Financial Lab',{body:d.body||'Dexx has an update for you.',tag:'financial-lab-daily',icon:'icon-192.png',badge:'icon-192.png',data:{url:'./#'+(d.view||'laboratory')}}));
});
