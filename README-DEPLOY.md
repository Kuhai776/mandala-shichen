# 曼陀罗时辰 · Windows 一键部署

## 方案 A：零依赖启动（推荐，双击即可）

**前提**：Windows 7 及以上（自带 PowerShell）

**操作**：
1. 下载仓库 zip 并解压
   - 下载地址：https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip
2. 进入解压后的文件夹
3. 双击 `start-mandala.bat`
4. 浏览器自动打开 http://localhost:8080/

**停止服务**：关闭弹出的命令行窗口即可

---

## 方案 B：Node.js 启动（开发推荐）

**前提**：已安装 Node.js 14+（https://nodejs.org）

**操作**：
```bat
:: 进入项目目录
cd mandala-shichen

:: 安装依赖
npm install

:: 启动服务
npm run serve
```

浏览器打开 http://localhost:8080/

---

## 方案 C：Python 启动

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
