// 曼陀罗时辰 Service Worker
// 策略：network-first（优先网络，失败回退缓存），避免缓存旧资源导致页面卡死
const CACHE_NAME = "mandala-v92"; // v92 导图节点AI对话体系(多轮+省token) // v91 节点关联文章+AI综合拆解+见解精要(省token) // v90 画板操作条+侧边栏+双向跳转+滑动丝滑+备注 // v89 时间流向图+转长期任务 // v88 自动上板+上板动效 // v87 关系图谱+FAB上移+AI助手入口+主线支线简化 // v86 导图导出HTML+关联线点击删除 // v85 放射布局+优先级+版本历史 // v84 节点完成+跨分支关联线+导图模板 // v83 导图库管理+节点聚焦+转任务+save upsert // v82 备份补全+版本自动迁移+快照导出 // v81 独立导图入口+对话意图分类 // v80 81宫格与对照分开展示+导图面板抽屉
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
