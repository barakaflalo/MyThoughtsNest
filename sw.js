/* ── AppNest · Cloudflare Pages fix (Oct 2026) ──
Cloudflare redirects *.html to clean URLs (/index.html -> /). Chrome refuses a
"redirected" response that a Service Worker hands to a page load (ERR_FAILED).
This strips the redirect flag from every response the SW fetches or reads from cache. */
(function(){
var NB={101:1,204:1,205:1,304:1};
function clean(r){
if(!r||!r.redirected||NB[r.status])return r;
return r.blob().then(function(b){return new Response(b,{status:r.status,statusText:r.statusText,headers:r.headers});});
}
var _fetch=self.fetch.bind(self);
self.fetch=function(input,init){
if(input&&typeof input==='object'&&input.mode==='navigate')input=input.url;
return _fetch(input,init).then(clean);
};
var cm=Cache.prototype.match;
Cache.prototype.match=function(){return cm.apply(this,arguments).then(clean);};
var sm=CacheStorage.prototype.match;
CacheStorage.prototype.match=function(){return sm.apply(this,arguments).then(clean);};
})();

/* MyThoughtsNest service worker — bump VERSION on every release */
var VERSION='mythoughtsnest-v1.6.2';
var CORE=['./','./appnest-assistant.js?v=161','./manifest.json','./icon-192.png','./icon-512.png','./privacy_policy.html'];
var OFFLINE='<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyThoughtsNest</title><body style="font-family:system-ui;background:#0b0b0d;color:#f2efe6;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:3rem">🪺</div><h2>אין חיבור כרגע</h2><p>הנתונים שלך שמורים במכשיר.</p><button onclick="location.reload()" style="font-size:1.1rem;padding:12px 22px;border-radius:12px;border:0;background:#d4af37;color:#1a1400;font-weight:800">נסה שוב</button></div></body></html>';

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.allSettled(CORE.map(function(u){return c.add(new Request(u,{cache:'reload'}));}));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k.indexOf('mythoughtsnest-')===0&&k!==VERSION;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
function timeout(ms){return new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'));},ms);});}
/* Web Share Target: receive shared audio/text, park it in a cache, redirect into the app */
function handleShare(req){
  return req.formData().then(function(fd){
    var id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    var meta={title:String(fd.get('title')||''),text:String(fd.get('text')||''),url:String(fd.get('url')||''),files:[]};
    var fs=fd.getAll('media');
    return caches.open('mtn-share').then(function(c){
      var p=Promise.resolve();
      fs.forEach(function(f,i){
        if(!f||typeof f==='string')return;
        var key='/__share/'+id+'/'+i;
        meta.files.push({k:key,name:f.name||'',type:f.type||'',size:f.size||0});
        p=p.then(function(){return c.put(key,new Response(f,{headers:{'Content-Type':f.type||'application/octet-stream'}}));});
      });
      return p.then(function(){return c.put('/__share/'+id+'/meta',new Response(JSON.stringify(meta),{headers:{'Content-Type':'application/json'}}));});
    }).then(function(){return Response.redirect(new URL('./?shared='+id,self.registration.scope).href,303);});
  }).catch(function(){return Response.redirect(new URL('./?shared=err',self.registration.scope).href,303);});
}
self.addEventListener('fetch',function(e){
  var req=e.request;
  var url=new URL(req.url);
  if(req.method==='POST'&&url.origin===location.origin&&/\/share\/?$/.test(url.pathname)){e.respondWith(handleShare(req));return;}
  if(req.method!=='GET')return;
  if(url.origin!==location.origin)return;               /* never touch AI / API calls */
  if(req.mode==='navigate'){
    e.respondWith(
      Promise.race([fetch(req.url),timeout(4000)]).then(function(r){
        if(r&&r.ok){var cp=r.clone();caches.open(VERSION).then(function(c){c.put('./',cp);});return r;}
        throw new Error('bad status');
      }).catch(function(){
        return caches.match('./').then(function(m){
          return m||new Response(OFFLINE,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(m){
      var net=fetch(req).then(function(r){
        if(r&&r.ok){var cp=r.clone();caches.open(VERSION).then(function(c){c.put(req,cp);});}
        return r;
      }).catch(function(){return m;});
      return m||net;
    })
  );
});
self.addEventListener('notificationclick',function(e){
  var d=e.notification.data||{},act=e.action||'open';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
    if(cs.length){
      cs[0].postMessage({type:'rem',action:act,id:d.id});
      return cs[0].focus();
    }
    return self.clients.openWindow('./?rem='+encodeURIComponent(d.id||'')+'&act='+encodeURIComponent(act));
  }));
});
