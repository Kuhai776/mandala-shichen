// 曼陀罗时辰 Service Worker
// 策略：network-first（优先网络，失败回退缓存），避免缓存旧资源导致页面卡死
const CACHE_NAME = "mandala-v61"; // v61 任务互链↔ + 关系图互链边/孤立节点入图/图例统计升级
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

  // 带版本号的静态资源（app.js?v=x、styles.css?v=x）与图片/字体：cache-first 秒开
  // 版本号变化时由 index.html 强制换 URL，天然避免陈旧缓存
  const versioned = /[?&]v=\d+/.test(url.search);
  const immutableExt = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|eot|json|ics)$/.test(url.pathname);
  if (versioned || immutableExt) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

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

  // 其余静态资源：network-first，网络失败再用缓存
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
