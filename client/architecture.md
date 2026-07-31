# 三层 Patch 架构

这是理解整个项目的 **总纲**。客户端把 **Totentanz 客户端 APK**（日服原版客户端的二开，其自身包名为 `io.kamihama.totentanz`）反编译后，以三个相互配合的层注入复刻逻辑，再重组签名——即在 Totentanz 客户端之上再做一层二开。本项目**把包名改回 `moe.magireco.cnvclient`** 作为自身标识（换底包时需一并重放这项迁移，详见 [安全机制 · 包名 pin](/security/client#①-包名-pin-始终生效)）。游戏后端同为 **Totentanz**（无状态）；资源分发与账号/存档服务则是复刻计划自建的云端，不属于 Totentanz。

## 三层概览

| 层 | 载体 | 作用 | 注入方式 |
|---|---|---|---|
| **① Smali 字节码注入层** | `smali/`、`smali_classes2/` | 在原版 Java 类的关键方法里插入对自有类的静态调用，作为"挂钩点" | 手工编辑 smali（已固化在仓库） |
| **② Java 业务逻辑层** | `patch/src/main/java/` | 复刻服的全部高层逻辑：云端握手、资源下载/校验、代理后端、WebView 拦截、版本伪造、自更新、签名自校验 | CI 编译为 `classes3.dex` → baksmali → `smali_classes3/` |
| **③ Native C++ Hook 层** | `cnv-native/src/MagiaClient.cpp` → `libMagiaClient.so` | inline hook 拦截引擎 `libmadomagi_native.so` 的 C++ 符号：跳过资源下载场景、API 端点重定向、强制教程、性能调优 | ShadowHook 编译为 `.so`，运行时链式加载 |

## 三层如何咬合

一条完整的启动链路：

1. **Smali 层挂上 Native 层**：`smali_classes2/org/cocos2dx/lib/Cocos2dxActivity.smali` 在原版 `loadLibrary("madomagi_native")` 之后链式追加 `loadLibrary("MagiaClient")`。
2. **Native 层装 hook 并缓存 Java 引用**：`libMagiaClient.so` 的 `JNI_OnLoad` 通过 ShadowHook 安装钩子，并 `NewGlobalRef` 缓存 Java 层 `ProxyBackends` 类引用（供跨线程 JNI 调用）。
3. **Java 层准备资源并写信号**：`BootstrapActivity` 完成资源准备后，`ResourceFlow` 写出 `cn_resources_ready.flag`；Native 层每个 hook 用 `resourcesReady()` 读这个 flag 决定行为。
4. **Java→Native 数据通道**：`ProxyBackends.set()` 在云端握手后写入代理后端列表；Native 层 `setURI` hook 通过 JNI 读取它做端点重定向。

::: tip 层间通信的本质
三层之间 **不依赖共享内存**，而是靠两种机制：
- **文件 flag**（如 `cn_resources_ready.flag`、`force_tutorial.flag`）—— Java 写、Native 读，作为"文件信号量"；
- **JNI 静态方法调用**（如 `ProxyBackends.get()`、`Spoof.getFakeVersion()`）—— Native 主动向上读取 Java 配置。
:::

## ① Smali 补丁层：5 处关键注入

所有注入都调用 `io.kamihama.*` 自有类，原逻辑作为 fallback 保留。

| 注入点（smali 文件） | 改动 | 目的 |
|---|---|---|
| `Cocos2dxActivity.smali` | 加载 `madomagi_native` 后链式 `loadLibrary("MagiaClient")`（包在独立 try/catch） | 挂载 Native hook 层；失败仅丢 hook 不影响引擎 |
| `NativeBridge.smali` 的 `getAppVersion()` | 方法入口先 `invoke-static Spoof.getFakeVersion()`，非 null 直接返回 | 向服务端上报伪造版本号，绕过原版强更检查 |
| `WebViewImpl$WebViewClientImpl.smali` 的 `shouldInterceptRequest`（新旧两个重载） | 先问 `WebViewInterceptor`，返回 null 才走原版 `super` | 拦截 WebView 资源请求，喂回本地汉化资源 |
| `WebViewImpl.smali` 的 `initWebView` | 注册原版 JS 接口后追加 `WebViewInterceptor.installJsBridge(...)` | 注入自有 `CnvBridge` JS 桥 |
| `WebViewImpl$WebViewClientImpl.smali` 的 `onPageFinished` | 注入 `WebViewInterceptor.onPageFinished(...)` | 在页面加载完后注入 `cnv_shadow.js` |

详见 [WebView 拦截](/client/webview) 与 [Native Hook 层](/client/native-hook)。

## ② Java 业务逻辑层：类清单

源码在 `patch/src/main/java/`，编译后作为第三个 dex（`classes3.dex`）注入。

### `io.kamihama.cnv` —— 客户端主逻辑

| 类 | 职责 |
|---|---|
| `BootstrapActivity` | LAUNCHER 入口；启动引导 UI、下载进度、BGM、贡献者页、账号登录；编排整个启动流程 |
| `ResourceFlow` | 在线分片下载 / 离线包两阶段注入；写就绪标记；热更新 |
| `Net` | 基于 `HttpURLConnection` 的 HTTP 工具；断点续传、多线程分片、`.cnvprog` 元数据 |
| `ClientInit` | 各云端接口的请求构造与响应解析；鉴权三件套 |
| `CloudEndpoint` | 集中存放所有端点常量（`API_HOST` 由 CI 注入） |
| `TotentanzDiscovery` | 上游 Totentanz 端点发现的**客户端侧兜底**：离线模式（服务端不可达）时直接问引导端点要真实游戏后端地址。只读不信——任何异常都安静返回 `null`，交由调用方回退写死的默认值，绝不让上游可用性影响启动 |
| `S3List` | 正则解析 S3 `ListBucketResult` XML，发现镜像文件清单 |
| `Unzip` | 流式解压，带 zip-slip 防御与前缀剥离 |
| `OfflineModeManager` | 标记"服务器不可达"全局状态 |
| `SaveOverlayService` | 前台服务；悬浮存档按钮 + 5 秒游戏心跳 |
| `SaveSyncHelper` | 本地 SQLite 与云端存档的比对与双向同步 |
| `CapWorkerSolver` | 隐藏 WebView 内完成 cap-worker PoW 验证 |
| `IntegrityGuard` | 防篡改门禁（包名/Provider/debuggable/签名） |
| `ClientSignature` / `DeviceId` | 鉴权三件套的签名与设备指纹 |
| `BanInfo` | 本地封禁记录的原子持久化与判定 |
| `Spoof` / `ProxyBackends` | 供 native 读取的版本伪造与代理后端配置 |
| `BuildChannel` / `UpdateChannel` | 构建期渠道（normal/internal-test）/ 用户运行时所选更新渠道 |
| `NodeDirectory` / `Ed25519Verify` | 握手签名节点目录的验签（纯 Java Ed25519）+ 防回滚 + 按能力路由 |
| `UpdateProvider` | 给系统安装器递交更新 APK 的 FileProvider |
| `ResourceIntegrityChecker` | 生成/校验资源完整性清单 |

### `io.kamihama.magianative` —— WebView 拦截与桥

| 类 | 职责 |
|---|---|
| `WebViewInterceptor` | 静态文件拦截 + GET API 缓存注入 + JS 注入 + JS 桥安装 |
| `CnvJsBridge` | `window.CnvBridge` JS↔Java 桥；端点白名单 |
| `PlayerStateCache` | `cnv_state.db` SQLite 持久化层 |

## ③ Native C++ Hook 层

`MagiaClient.cpp`（约 668 行）通过 [ShadowHook](https://github.com/bytedance/android-inline-hook)（字节跳动维护的 inline hook 库，arm64 + armv7 双支持）在运行时拦截 `libmadomagi_native.so` 内的若干 **未导出 C++ 符号**，按 mangled 符号名查址装钩。主要做四类事：

1. **跳过资源下载场景** —— 资源就绪时让引擎的所有"下载/校验"检查直接返回"已完成"，跳过原版那套需要重下十几 GB 的下载流程；
2. **API 端点重定向** —— 把引擎硬编码的已停服域名替换为指向游戏后端 Totentanz 的代理后端；
3. **强制新手教程** —— 消费一次性 flag，从标题画面直接构造序章场景压栈；
4. **性能调优** —— 修正采样率、提高初始连接数。

详见 [Native Hook 层](/client/native-hook)。

## 持久化位置速查

| 位置 | 内容 |
|---|---|
| `<filesDir>/cnv_inject/cn_resources_ready.flag` | 正式资源就绪标记 |
| `<filesDir>/cnv_inject/cn_resources_provisional.flag` | 临时离线注入标记 |
| `<filesDir>/cnv_inject/installed_pack_version.txt` | 已安装离线包版本 |
| `<filesDir>/cnv_inject/ban.json` | 本地封禁记录（原子写） |
| `<filesDir>/cnv_inject/force_tutorial.flag` | 一次性强制教程信号 |
| `<filesDir>/magica/` | 落盘的游戏资源（WebView 本地根目录） |
| `<filesDir>/debug/<name>.flag` | 调试开关 |
| SQLite `cnv_state.db` | 玩家状态缓存（POST 回放 / GET 注入） |
| SharedPreferences `cnv_account` | account_id / account_token / session_token |
| SharedPreferences `cnv_hot_update` | js / scenario 热更版本号 |
| SharedPreferences `cnv_launch_state` | 崩溃循环检测 |
