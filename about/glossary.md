# 术语表

按拼音/英文首字母大致排序，方便速查。

## 项目与游戏

| 术语 | 含义 |
|---|---|
| **魔法纪录 / マギアレコード / Magia Record** | 基于《魔法少女小圆》的手游，日服与国服均已停运 |
| **复刻计划 / Revival Project** | 民间重建该游戏服务端与客户端的社区项目 |
| **CNV 客户端** | 本项目，CN 版客户端（CN + Client/Revival） |
| **Totentanz** | 复刻计划的上游：既提供 **Totentanz 客户端**（本项目的二开基础），也是本项目的 **游戏后端**（无状态）。注意：资源分发与账号服务器是复刻计划自建的云端，**不属于** Totentanz |
| **Totentanz 客户端** | Totentanz 对日服原版客户端的二开；本项目反编译它后再做一层二开（不持有其源码） |
| **日服原版 / 原版客户端** | f4samurai 的原版日服客户端，是 Totentanz 客户端的二开来源、本项目的"祖辈"；已停运 |

## 架构与构建

| 术语 | 含义 |
|---|---|
| **三层 Patch** | Smali 字节码层 / Java 业务层 / Native C++ Hook 层 |
| **apktool** | 反编译/重组 APK 的工具 |
| **smali** | Dalvik 字节码的汇编文本形式 |
| **baksmali** | 把 dex 反汇编为 smali |
| **d8** | 把 `.class` 编译为 dex |
| **zipalign / apksigner** | APK 对齐与签名工具 |
| **ShadowHook** | 字节跳动的 inline hook 库，用于 native 层 |
| **JNI** | Java 与 native 互调的接口 |
| **构建渠道 / channel** | `normal`（本地构建）/ `internal-test`（CI 构建），决定自更新来源 |
| **VersionCode / VersionName** | Android 的内部版本号 / 显示版本号 |

## 资源与下载

| 术语 | 含义 |
|---|---|
| **在线下载** | 多镜像并发分片下载游戏资源 |
| **离线包注入** | 用本地 zip 两阶段解压准备资源 |
| **临时离线注入 / provisional** | 服务器不可达时的应急注入，仅本地校验、不算正式安装 |
| **断点续传** | 中断后从断点继续，依赖 HTTP Range |
| **`.cnvprog`** | 分片下载的断点元数据文件 |
| **镜像 / mirror** | 同一资源的多个 CDN 节点 |
| **线路 / group** | 一组镜像 |
| **换线 / switch_mirrors** | 心跳指挥客户端切换镜像 |
| **热更新 / hot-update** | js / scenario 包的增量更新 |
| **就绪标记** | `cn_resources_ready.flag`，资源已正式安装的标志 |
| **SHA-256** | 文件指纹，用于完整性校验 |
| **CRC32** | zip 每个条目的校验和，解压时隐式验证 |

## 汉化

| 术语 | 含义 |
|---|---|
| **A 类汉化** | 静态资源替换（图集/UI JSON/数据 JSON） |
| **B 类汉化** | 拦 API 响应改写战斗台词 |
| **C 类汉化** | 拦 DOM 文本节点实时替换 UI 文字 |
| **`cnv_shadow.js`** | 注入所有 `/magica/` 页面的汉化 + 状态重放脚本 |
| **`ui_dict.json` / `UI_DICT`** | C 类汉化的日译中词表（外置分组 JSON，运行时摊平编译为 `UI_DICT`）|
| **MutationObserver** | 监听 DOM 变化，翻译动态内容 |
| **`charaMessageList.json`** | B 类台词词表（随资源包落盘，不在仓库） |
| **图集 / atlas** | 多张小图拼成的大 PNG，配 `.plist` 切图 |

## 账号与安全

| 术语 | 含义 |
|---|---|
| **鉴权三件套** | `device_id` + `access_token` + `signature` |
| **会话令牌 / session token** | 服务端签发的登录凭证，可被撤销 |
| **设备指纹 / DeviceId** | 硬件信息 + ANDROID_ID 的 SHA-256，匿名 |
| **客户端签名 / ClientSignature** | APK 签名证书的 SHA-256，防重打包 |
| **完整性门禁 / IntegrityGuard** | 启动时的防篡改检查（包名/Provider/debuggable/签名） |
| **版本伪造 / Spoof** | 向 native 上报服务端指定的版本号 |
| **代理后端 / ProxyBackends** | 把引擎硬编码域名重定向到复刻服 |
| **心跳 / heartbeat** | 周期性请求，接收封禁/维护/换线指令 |
| **云存档同步** | 本地 SQLite 与云端存档的双向同步 |
| **悬浮存档按钮** | 游戏中可点击/拖动的存档悬浮窗 |
| **cap-worker** | 计算型（PoW）人机验证码服务 |
| **PoW** | Proof of Work，通过计算哈希证明工作量 |

## 调试

| 术语 | 含义 |
|---|---|
| **调试开关 / flag** | `<filesDir>/debug/<名>.flag`（内容 `true`）启用的调试行为 |
| **`skip_to_tutorial`** | 直接测试教程弹窗（绕过门禁、完后退出） |
| **`verbose_net_log`** | 启用详细网络日志 |
| **`display_ui_only`** | 仅展示启动 UI |

## 部署

| 术语 | 含义 |
|---|---|
| **VitePress** | 本文档站使用的静态站点生成器 |
| **GitHub Pages** | 托管本文档站的静态网页服务 |
| **GitHub Actions** | CI/CD，自动构建 APK 与文档站 |
| **文档部署工作流** | `.github/workflows/deploy-docs.yml`，自动构建并发布文档站 |
