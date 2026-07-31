# Lv.3 资深贡献者

你是开发者或逆向工程师，准备改动 **核心代码**：Java 业务逻辑、smali 注入、native hook、协议、构建系统。这一页假设你 **已通读 [技术文档](/client/) 全部章节**。

## 前置要求

- 扎实的 **Android / Java**（重点：`HttpURLConnection`、SQLite、Service、WebView、SharedPreferences）；
- **apktool / smali** 基础，能读懂字节码注入点；
- 改 native 层还需 **C++ / JNI / inline hook / ELF** 知识；
- 理解本项目的 **安全模型**（见 [安全机制](/security/client)）。

## 模块认领地图

按你的专长选择切入点：

| 方向 | 主要文件 | 配套文档 |
|---|---|---|
| 启动编排 | `BootstrapActivity.java` | [启动流程](/client/bootstrap) |
| 资源/离线包/热更 | `ResourceFlow.java`、`Unzip.java` | [资源下载](/client/resource-flow) |
| 网络/断点续传 | `Net.java` | [网络层](/client/network) |
| 协议/接口 | `ClientInit.java`、`CloudEndpoint.java`、`S3List.java` | [握手协议](/protocol/client-server) |
| WebView/汉化运行时 | `WebViewInterceptor.java`、`CnvJsBridge.java`、`PlayerStateCache.java`、`cnv_shadow.js` | [WebView](/client/webview)、[汉化](/client/localization) |
| 账号/存档/心跳 | `SaveSyncHelper.java`、`SaveOverlayService.java`、`CapWorkerSolver.java` | [账号存档](/client/account-save) |
| 安全 | `IntegrityGuard.java`、`ClientSignature.java`、`DeviceId.java`、`BanInfo.java`、`Spoof.java`、`ProxyBackends.java` | [安全机制](/security/client) |
| Native hook | `cnv-native/src/MagiaClient.cpp`、`CMakeLists.txt` | [Native Hook](/client/native-hook) |
| smali 注入 | `smali/`、`smali_classes2/` | [三层架构](/client/architecture#-smali-补丁层5-处关键注入) |
| 构建/CI | `.github/workflows/`、`tools/patch_libmadomagi.py` | [构建系统](/client/build) |

## 改动各层的注意事项

### 改 Java 业务逻辑层

- 编译目标是 `-source 8 -target 8`（兼容 minSdk 21），**不要用 Java 9+ API**；
- 运行时网络用系统栈（OkHttp 仅编译期），别引入运行时网络依赖以免 dex 膨胀；
- 涉及 token/存档/校验的改动遵循既有安全注释（代码里的 `C-Lx`/`C-Mx`/`C-Hx` 是历史安全修复编号，**改前先读懂它防的是什么**）；
- 新增持久化优先放 `<filesDir>/cnv_inject/` 或既有 SharedPreferences 命名空间，保持一致。

### 改 smali 注入点

- 注入点要 **包在 try/catch 或留 fallback**，确保我方代码失败时退回原版行为（参考 `Cocos2dxActivity` 加载 native 的独立 try/catch）；
- 注入的是对 `io.kamihama.*` 静态方法的调用，**业务逻辑写在 Java 里**，smali 只做最小挂钩；
- 改完务必本地 `apktool b` 验证能重组。

### 改 Native Hook 层

- hook 目标按 **mangled 符号名** 定位，上游引擎更新可能改符号 —— 写 hook 时考虑符号缺失的降级（找不到就不装，别 crash）；
- 跨线程 JNI 必须在 `JNI_OnLoad` 缓存类的 `GlobalRef`（见 [JNI 跨线程关键点](/client/native-hook#端点重定向)）；
- 字符串搜索/改写要 **有界**，避免越界与多线程竞态（参考 `checkParseJson` 的 `string_view` 写法）；
- 改完要在 arm64 与 armv7 双 ABI 上验证。

### 改协议 / 云端接口

- 客户端与服务端是 **契约关系**：改请求/响应字段要 **同步服务端**，并保持 **向后兼容**（参考 `offline_pack.min_version` 同时兼容旧顶层 `required_pack_version` 的写法）；
- 字段以 **代码解析为准**（历史注释里有 `md5`/`sha256` 不一致的情况）；
- 端点常量留空由 CI 注入，**不要把真实 host 提交进仓库**。

### 改构建 / CI

- 改 `build-apk.yml` 要保证 **可重复构建**，不破坏版本号持久化与签名步骤；
- 密码/密钥相关命令保持 `shell=False`、参数独立传递（防注入，见 C-H3/C-H5）；
- 改 `patch_libmadomagi.py` 的字节签名要带 **找不到就保守 skip** 的降级，不强改。

## 设计原则

1. **失败要安全**：宁可保守拦截、退回原版，也不 fail-open 暴露数据；
2. **分层不越界**：高层逻辑在 Java，smali/native 只做必要挂钩；
3. **可观测**：关键路径打日志（走 reporter / logcat tag），方便玩家反馈时定位；
4. **不丢存档**：任何触及存档的改动都要考虑冲突、回放时序、限速；
5. **态度即细节**：调试/测试产物也按正式标准对待（含汉化）。

## 提交规范

- 在指定开发分支上工作，遵循 [协作流程](/contributing/client/workflow)；
- 提交信息用 **中文**，说清动机与影响面；
- 触及安全/协议/构建的 PR 请在描述里 **显式说明风险与验证方式**，方便 review；
- 大改动建议先开 Issue 讨论设计，避免返工。

## 评审会重点看什么

- 是否破坏既有安全约束（看 `C-*` 注释）；
- 是否保持可重复构建与双 ABI；
- 是否有 fallback / 降级路径；
- 是否影响存档一致性；
- 协议改动是否与服务端对齐。
