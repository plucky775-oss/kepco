const CACHE='safety-checklist-standalone-v1.8.2-r3';
const PDF_CACHE='safety-checklist-pdf-downloads-v1';
const CORE=[
  './',
  './index.html',
  './app.css?v=20260725r3',
  './styles-checklist.css?v=20260725r3',
  './app.js?v=20260725r3',
  './data/research-checklists-v1.js?v=20260725r3',
  './components/research-checklist.js?v=20260725r3',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/menu/tbm.png',
  './assets/menu/risk.png',
  './assets/menu/calendar-3d.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE && key!==PDF_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.pathname.includes('/__safety_checklist_pdf__/')){
    event.respondWith(caches.open(PDF_CACHE).then(cache=>cache.match(request)).then(response=>response || new Response('PDF not found',{status:404})));
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response && (response.ok || response.type==='opaque')){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy));
    }
    return response;
  }).catch(()=>caches.match(request,{ignoreSearch:true})));
});
