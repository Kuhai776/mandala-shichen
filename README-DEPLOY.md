# 曼陀罗时辰 · Windows 一键部署

## 方案 A：PowerShell 一键启动（强烈推荐，功能最全）

**前提**：Windows 7 SP1 及以上（自带 PowerShell 5.1）

**操作**：
1. 下载 zip 包并解压
   - 完整包：https://github.com/Kuhai776/mandala-shichen/releases/download/v2.3.10/mandala-shichen-web-v2.3.10.zip
   - 或克隆仓库：`git clone https://github.com/Kuhai776/mandala-shichen.git`
2. 进入项目根目录（与 `www` 文件夹同级）
3. 双击 `start-mandala-launcher.bat`，或右键 `start-mandala.ps1` → "使用 PowerShell 运行"
4. 浏览器自动打开 http://localhost:8080/

**特色功能**：
- ✅ 零依赖，无需安装 Python/Node
- ✅ 自动检测端口占用并切换
- ✅ 自动获取局域网 IP（手机可同 WiFi 访问）
- ✅ **自动生成二维码**（手机扫码访问，不用手输 URL）
- ✅ 自动打开浏览器
- ✅ 完整 MIME 类型支持（含 woff2/wasm/webmanifest）
- ✅ 禁用缓存（调试时永远看到最新版本）
- ✅ 路径越权防护

**停止服务**：按 Ctrl+C 或关闭窗口

**首次运行提示**：若提示"无法绑定 0.0.0.0"，以管理员身份运行一次即可（手机访问需要）：
```
netsh http add urlacl url=http://+:8080/ user=Everyone listen=yes
```

---

## 方案 B：纯 .bat 启动（最简单）

**前提**：Windows 7 及以上

**操作**：双击 `start-mandala.bat`，浏览器自动打开 http://localhost:8080/

（适合极简需求，没有二维码、局域网 IP 显示等功能）

---

## 方案 C：Node.js 启动（开发推荐）

**前提**：已安装 Node.js 14+（https://nodejs.org）

```bat
cd mandala-shichen
npm install
npm run serve
```

浏览器打开 http://localhost:8080/

---

## 方案 D：Python 启动

**前提**：已安装 Python 3（https://python.org）

```bat
cd mandala-shichen\www
python -m http.server 8080
```

浏览器打开 http://localhost:8080/

---

## 部署到公网（可选）

### Cloudflare Pages（推荐，免费 + 自动部署 + 全球 CDN）

1. 打开 https://dash.cloudflare.com → Workers & Pages
2. Create application → Pages → Connect to Git
3. 选择 GitHub 仓库 `Kuhai776/mandala-shichen`
4. 配置：
   - Project name: `mandala-shichen`
   - Production branch: `main`
   - Framework preset: None
   - Build command: （留空）
   - Build output directory: `www`
5. Save and Deploy → 等 1 分钟
6. 访问 https://mandala-shichen.pages.dev

**绑定自定义域名**（如 lz-oc.xyz）：
- Pages 项目 → Custom domains → Set up a custom domain → 输入域名

### GitHub Pages

```bat
:: 在项目根目录执行
git push origin main
```
然后在 GitHub 仓库 Settings → Pages → Source 选 main 分支 → /www 目录

---

## 常见问题

**Q: 双击 .bat 后窗口闪退？**
A: 右键 .bat → 以管理员身份运行；或先打开 cmd，cd 到目录后输入 `start-mandala.bat`

**Q: 浏览器没自动打开？**
A: 手动访问 http://localhost:8080/

**Q: 端口 8080 被占用？**
A: 编辑 `start-mandala.bat`，把里面的 `8080` 改成 `8888` 或其他端口

**Q: 手机怎么访问本机服务？**
A: 手机和电脑连同一个 WiFi，浏览器访问 `http://电脑IP:8080/`（电脑 IP 在 cmd 输入 `ipconfig` 查看 IPv4 地址）
