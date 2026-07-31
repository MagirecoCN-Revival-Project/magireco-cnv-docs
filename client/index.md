# 技术文档导读

这一章面向 **想搞清楚"它是怎么做到的"** 的读者 —— 无论你是出于好奇、想学习逆向/汉化工程，还是准备成为 [资深贡献者](/contributing/client/advanced)。

## 项目本质

魔法纪录 CNV 客户端 **不是从零写的游戏**，而是对 **Totentanz 客户端 APK**（日服原版客户端的二开）的 **再二开（patch）**：

```
Totentanz 客户端 APK（日服原版二开）
    │  apktool 反编译
    ▼
smali 字节码 + assets/ + lib/*.so
    │
    ├─ Layer 1: Smali 补丁      —— 在原版字节码的关键方法插入挂钩
    ├─ Layer 2: Java 业务逻辑   —— 编译成第三个 dex 注入，承载复刻服全部高层逻辑
    └─ Layer 3: Native C++ Hook —— 运行时拦截引擎 .so 内的 C++ 符号
    │
    ▼  apktool 重打包 + d8 + zipalign + apksigner
改造后的 APK
```

整个改造 **不修改 Totentanz 客户端源码**（我们也没有源码），而是在字节码、资源和 native 三个层面做精确注入。

## 阅读路径建议

文档按子系统组织，推荐这样读：

### 必读：先建立全局观

- **[三层 Patch 架构](/client/architecture)** —— 三层各做什么、如何咬合。**所有人都应先读这一篇。**

### 启动与资源

- **[启动引导流程](/client/bootstrap)** —— `BootstrapActivity` 从启动到进游戏的完整有序步骤与所有调试开关。
- **[资源下载与离线包](/client/resource-flow)** —— `ResourceFlow` 的在线分片下载、离线包两阶段注入、标记文件、SHA-256 校验。
- **[网络层与断点续传](/client/network)** —— `Net` 基于 `HttpURLConnection` 的单线程续传、多线程分片、`.cnvprog` 断点元数据。
- **[握手协议与云端接口](/protocol/client-server)** —— `/client/init` 等接口的请求体、响应 schema、鉴权三件套。

### 汉化与渲染

- **[多层汉化体系](/client/localization)** —— A 类静态资源 / B 类台词注入 / C 类 DOM 实时替换三管齐下。
- **[WebView 拦截与状态重放](/client/webview)** —— `WebViewInterceptor` + `CnvJsBridge` + `PlayerStateCache` 如何拦截请求、注入脚本、持久化并回放玩家状态。

### 账号与安全

- **[账号、存档与心跳](/client/account-save)** —— 存档同步、悬浮按钮、5 秒心跳与实时封禁/维护处理。
- **[安全机制与防篡改](/security/client)** —— `IntegrityGuard`、签名校验、设备指纹、本地封禁记录。

### 底层与构建

- **[Native Hook 层](/client/native-hook)** —— `MagiaClient.cpp` 用 ShadowHook 拦截了哪些引擎函数、为什么。
- **[Native 引擎逻辑（互操作重建）](/client/native-engine)** —— 从互操作视角重建引擎 `.so` 的资源下载状态机、HTTP/2 网络栈、场景层系统与音频子系统（不含任何反编译产物）。
- **[引擎数据契约与数据驱动边界](/protocol/engine-data-contracts)** —— `.so` 是运行时代码而非数据库；游戏数据（关卡/结算/剧情）是数据驱动的 JSON，含战斗关卡 schema 实证（仅 schema 级，无值内容）。⚠️ 早期"服务器权威回放"的推测已被真机流量证伪，见文内更正。
- **[Web 化可行性评估（Phase 0 已落地）](/client/web-port-feasibility)** —— 能不能搬进浏览器、走什么路线：R1–R4 路线权衡，以及 Phase 0 结论——**战斗结算在客户端**，纯 Web 化需自行实现结算引擎；好在社区 wiki 已提供**实现级规格**（与 API 同 schema），并有两万余场真实战斗可作验收基准。
- **[序章完成后静默进主页（设计草案）](/client/prologue-return)** —— ⚠️ 未实现的设计提案：让"重看序章"入口在播完后静默回主页、零服务端副作用；含选项权衡与待采集的未知点。
- **[构建系统与 CI](/client/build)** —— GitHub Actions 全流程、版本规则、所需 Secrets/Variables。

## 代码地图

| 路径 | 内容 |
|---|---|
| `patch/src/main/java/io/kamihama/cnv/` | 客户端主逻辑（引导、下载、网络、账号、安全） |
| `patch/src/main/java/io/kamihama/magianative/` | WebView 拦截、JS 桥、状态缓存 |
| `patch/src/main/assets/cnv/cnv_shadow.js` | 注入到所有 `/magica/` 页面的汉化 + 状态重放脚本 |
| `cnv-native/src/MagiaClient.cpp` | Native 运行时 hook 库 |
| `smali/`、`smali_classes2/` | 原版反编译字节码 + 我们的注入点 |
| `tools/patch_libmadomagi.py` | 对引擎 `.so` 的二进制补丁工具 |
| `.github/workflows/build-apk.yml` | CI 构建与发布流水线 |

::: tip 约定
本章引用源码时使用 `文件:行号` 的形式（如 `BootstrapActivity.java:1524`）。行号对应撰写时的代码状态，可能随版本漂移，但类名/方法名是稳定的锚点。
:::
