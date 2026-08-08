# 曼陀罗时辰 · APK 构建指南

PWA → APK（Capacitor 方案），支持全屏沉浸式 + 震动反馈。

## 前置环境（本地机器）

```bash
# 1. Node.js 18+ 和 JDK 17
node --version    # v18+
java -version     # 17

# 2. Android Studio（含 Android SDK）
# 下载：https://developer.android.com/studio
# 安装后打开 SDK Manager，装 Android SDK Platform 34 + Build-Tools 34

# 3. Capacitor CLI
npm install -g @capacitor/cli
```

## 构建步骤

```bash
# 1. 拉取仓库
git clone https://github.com/Kuhai776/mandala-shichen.git
cd mandala-shichen

# 2. 安装依赖
npm install

# 3. 添加 Android 平台（首次）
npx cap add android

# 4. 同步 Web 资源到 Android 工程
npm run sync        # = cap sync android

# 5. 打开 Android Studio 构建
npm run open:android # = cap open android
# 在 Android Studio 里：
#   Build → Build Bundle(s)/APK(s) → Build APK(s)
#   输出：android/app/build/outputs/apk/release/app-release.apk

# 或命令行直接构建
npm run build:debug   # Debug APK（无需签名）
npm run build:android # Release APK（需签名配置）
```

## 签名配置（Release 构建）

首次构建 Release 需要生成签名 keystore：

```bash
# 1. 生成 keystore（仅首次）
keytool -genkey -v -keystore mandala.keystore -alias mandala \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. 配置 android/app/build.gradle（cap add 后自动生成）
# 在 android 块内添加：
signingConfigs {
    release {
        storeFile file('../../mandala.keystore')
        storePassword '你的密码'
        keyAlias 'mandala'
        keyPassword '你的密码'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

## 安装到手机

```bash
# 方式 A：adb 安装
adb install android/app/build/outputs/apk/release/app-release.apk

# 方式 B：复制 APK 到手机安装
# APK 路径：android/app/build/outputs/apk/release/app-release.apk
```

## 已接入的原生能力

| 能力 | 实现 | 触发场景 |
|---|---|---|
| 全屏沉浸式 | @capacitor/status-bar | APK 启动时状态栏融合主题色 |
| 震动反馈 | @capacitor/haptics | 时辰切换、Hermes switch_realm、toast 提示 |

**浏览器兼容**：app.js 自动检测环境，APK 用原生 Haptics，浏览器用 `navigator.vibrate`，无 Capacitor 时静默降级，不影响 PWA 正常使用。

## 更新 APK

代码更新后重新打包：

```bash
git pull
npm run sync          # 同步最新 Web 资源
npm run build:android # 重新构建 APK
adb install -r android/app/build/outputs/apk/release/app-release.apk  # 覆盖安装
```

## 配置说明（capacitor.config.json）

- `appId`: `com.kuhai.mandala`
- `appName`: 曼陀罗时辰
- `webDir`: `.`（仓库根目录，PWA 静态文件直接作为 Web 资源）
- `server.url`: `https://mandala.lz-oc.xyz`（可选，让 APK 从远程加载最新版，而非打包的本地文件）

**server.url 模式**：APK 启动时从 `https://mandala.lz-oc.xyz` 加载，代码更新后无需重新打包 APK。
**本地打包模式**：注释掉 `server.url`，APK 使用打包时的 Web 资源，离线可用，但更新需重新打包。

## 故障排查

| 问题 | 解决 |
|---|---|
| `cap add android` 失败 | 检查 ANDROID_HOME 环境变量，确认 Android SDK 已装 |
| 构建报 SDK 版本错误 | 在 Android Studio SDK Manager 装 Platform 34 |
| APK 白屏 | 检查 capacitor.config.json 的 webDir 路径，确认 index.html 在根目录 |
| 震动不生效 | 确认手机未开省电模式，检查 @capacitor/haptics 是否已 install |
| 状态栏不隐藏 | 检查 @capacitor/status-bar 插件版本，6.0+ 需 Capacitor 6 |
