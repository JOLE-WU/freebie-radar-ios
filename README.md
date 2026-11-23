# Fresource · iOS 套壳客户端

一个「原生壳 + 远端网页」的 iOS 方案：原生部分只是固定的 WebView 外壳，所有界面与数据都来自 `docs/` 里的 PWA。因此后续改 UI、改数据、改交互，**只需要更新 `docs/` 并推送**，不需要重新打包 IPA，也不消耗 GitHub Actions 额度。

## 目录说明

```
docs/                  PWA 网页（GitHub Pages 直接发布这个目录）
  index.html           界面（iOS 风格交互预览）
  manifest.webmanifest PWA 清单
  sw.js                离线缓存
  icons/               应用图标
ios/                   Capacitor 生成的 iOS 原生工程（Xcode 打开即可 Archive）
capacitor.config.json  指向远端 Pages 地址，套壳核心配置
```

## 现在就能用（无需出包）

仓库已开启 GitHub Pages，访问：

**https://jole-wu.github.io/freebie-radar-ios/**（需在仓库 Settings → Pages → Source 选 "Deploy from a branch" → main /docs，一次即可）

iPhone Safari 打开 → 分享 → **添加到主屏幕**，即可全屏运行、有独立图标、可离线打开。

## 出 IPA（GitHub Actions 云端编译，无需 Mac）

推送后到 Actions → "Build Fresource IPA" → Run workflow，macOS runner 会自动编译并产出 \`Radar-v*-unsigned.ipa\` 作为 artifact 下载，可直接用 AltStore / Sideloadly / 巨魔 等侧载。

如需签名版，在仓库 Settings → Secrets 配置 \`APPLE_TEAM_ID\` / \`APPLE_CERTIFICATE_P12\` / \`APPLE_CERTIFICATE_PASSWORD\` / \`APPLE_PROVISIONING_PROFILE\`。

## 原生安装包（本地 macOS + Xcode，可选）

1. 在 Mac 上克隆仓库。
2. 用 Xcode 打开 `ios/App/App.xcworkspace`。
3. 选择签名 Team（个人 Apple ID 可用于真机调试/TestFlight）。
4. 连接 iPhone 点 Run，或 Product → Archive 导出 IPA。

因为 `capacitor.config.json` 里配置了 `server.url`，App 启动后加载的是 Pages 上的网页，**本地界面改动不会打包进 IPA**——这正是「少出包」的关键。

## 什么时候才需要重新出包

- 修改 App 名称、图标、Bundle ID、版本号
- 增加原生能力（推送、相机、文件系统、登录 SDK 等）
- App Store 审核要求变更

日常改界面、改列表、改配色、接新数据源：只改 `docs/`，`git push` 后页面立即更新，已安装的用户下次打开就是新版。

## 本地开发

```bash
npm install
npx cap sync ios
```

网页文件放在 `docs/`，修改后执行 `npx cap copy ios` 可同步到 Xcode 工程（仅在需要更新内置兜底页面时执行）。
