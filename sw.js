// 曼陀罗时辰 Service Worker
// 策略：network-first（优先网络，失败回退缓存），避免缓存旧资源导致页面卡死
const CACHE_NAME = "mandala-v26"; // 版本号升级，激活时自动清除旧缓存（v25→v26 强制刷新）
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  // 跳过缓存预装，直接进入激活态，避免阻塞
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((k) => caches.delete(k)) // 删除所有旧缓存（含 v1）
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域不拦截

  // 导航请求（HTML）始终走网络优先，确保拿到最新页面
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return resp;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // 静态资源：network-first，网络失败再用缓存
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
