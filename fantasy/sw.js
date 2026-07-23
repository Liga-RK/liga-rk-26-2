const CACHE="rk-fantasy-shell-v14";
const ASSET_VERSION="20260723-popular";
const BASE=new URL("./",self.location.href);
const SHELL=["./","fantasy.html","offline.html",`assets/fantasy.css?v=${ASSET_VERSION}`,`assets/fantasy.js?v=${ASSET_VERSION}`,"assets/fantasy-config.js","assets/branding/logo-liga-rk.png","assets/branding/logo-rk-fantasy.png","assets/branding/favicon-rk-fantasy.png","assets/branding/wallpaper-rk.png"].map(path=>new URL(path,BASE).href);
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{const url=new URL(event.request.url);if(url.pathname.startsWith("/api/")||event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(new URL("offline.html",BASE).href))));});
