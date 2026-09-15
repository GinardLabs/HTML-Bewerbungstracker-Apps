'use strict';
const CACHE='bewerbungs-coach-web-1.0.2';
const ROOT=new URL('./',self.location.href);
const ASSETS=['./','index.html','app.js','coach-web.js','manifest.webmanifest','icon.svg','../index.html'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bewerbungs-coach-web-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!ASSETS.includes(event.request.url))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
