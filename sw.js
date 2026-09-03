/* PWA service worker —— 阶段一：稳定静态资源 Cache First，版本化、可更新。
   - /assets/**（图片 / WebP 精灵 / CSS / JS / 字体 / 音乐等稳定素材）：Cache First，
     未命中走网络并写入缓存；命中直接返回。
   - cache:no-store 请求（/status、emotion-manifest.json 等即时/动态数据）：不拦截，保持直通。
   - HTML 页面（index/send-test）：不缓存为离线副本，保持默认网络，更新可靠，避免旧版锁死。
   版本升级：install 安装新缓存、activate 删除旧缓存；skipWaiting + clients.claim 立即生效。 */
var CACHE_VERSION = "emotion-static-v2-e15-2026-09-03";
var CACHE_NAME = CACHE_VERSION;

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (req.cache === "no-store") return;   // 动态/即时数据保持网络直通
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域 API（api.lugu.love 等）不拦截
  var base = self.registration.scope;
  if (url.pathname.indexOf(base + "assets/") === 0) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === "basic") {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          return caches.match(req);
        });
      })
    );
  }
  // 其它（HTML 等）：不拦截，保持默认网络行为，更新可靠
});
