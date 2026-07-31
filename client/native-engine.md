# Native 引擎逻辑（互操作重建）

本篇从**互操作（interoperability）视角**重建游戏 native 引擎 `libmadomagi_native.so`
的关键运行逻辑：它在启动时如何决定"要不要下十几 GB 资源"、如何收发游戏 API、
如何驱动场景切换。理解这些，才能看懂 [Native Hook 层](/client/native-hook) 与
[`patch_libmadomagi.py`](/client/build#patch-libmadomagi-py) 究竟在拦什么、改什么。

::: danger 来源与边界（务必先读）
- 本文**不含、也永不附带任何反编译 / 反汇编产物或引擎源码**。
- 所有描述的素材只有两类，且都是**本项目自有的 GPLv3 代码**与**可观测的运行时行为**：
  1. 运行时 hook 伴侣 `cnv-native/src/MagiaClient.cpp`；
  2. 静态 patcher `tools/patch_libmadomagi.py`。
  二者为了"挂钩子"本就需要引用引擎的符号名与少量 ABI 事实，这些是**接口事实**
  （互操作所必需），不是受版权保护的表达。
- 文内所有代码块均为**我们自己撰写的示意性伪代码**，用来说明"行为契约"，
  **不是**引擎的真实实现，可能与真实控制流有出入。带 ⓘ 标记处为**据行为推断**。
- 引擎 `libmadomagi_native.so` 的著作权归原版权方所有；本项目与其版权方无任何关联。
  本篇仅作互操作与研究之用。
:::

## 引擎构成

`libmadomagi_native.so` 大致由三块拼成：

| 组成 | 性质 | 本篇处理方式 |
|---|---|---|
| **Cocos2d-x** 框架（场景图、GL 主线程、`Data`/`SceneLayer` 等基类） | 上游开源（MIT 系） | 可自由按公开知识描述 |
| **游戏自有类**（`DownloadAssetMap`、`MainScene`、`PrologueSceneLayer`、各 `*State` …） | 原方专有 | **仅在行为/接口层描述**，不展开实现 |
| **CRI ADX2**（`criNcv_*` 音频中间件）、自研 `http2::*` 网络栈 | 第三方/原方专有 | 同上，仅接口层 |

下面按"启动主线 → 四个子系统"展开。

## 启动主线：从 asset.json 到主菜单

原版引擎的冷启动，核心是一条**"资源完备性"门禁链**——只要它认为本地资源不全，
就会拉起下载场景、阻塞玩家进主菜单。重建出的主线如下：

```
AppActivity 启动 → 加载 libmadomagi_native.so
        │
        ▼
解析 asset.json（资源清单）   ← DownloadAssetJsonState::checkParseJson
        │
        ▼
对清单逐项问"下好了吗？"      ← DownloadAssetMap::isDownloadComplete(key)
        │  存在未完成项
        ▼
选 CDN、取资源列表            ← SelectURLGetResourceListState（http2）
        │
        ▼
进入"下载场景"，显示进度条     ← DownloadSceneLayer（一个 SceneLayer）
        │  全部下完，触发完成回调
        ▼
进入主菜单 / 主场景           ← MainScene、web::SceneCommand::pushSceneTop
```

CNV 的目标是：**资源已由 Java 层（`ResourceFlow`）按需备齐后，让这条门禁链整体"短路"**，
不再触发十几 GB 重下、直接放行进主菜单。这通过三个互补手段实现，下一节展开。

## 子系统一：资源下载状态机

### 正常行为（重建）

引擎把"下载一类资源"抽象成若干 `*State` / `*SceneLayer` 对象。把它们的协作
关系重建成伪代码，大致是：ⓘ

```text
# —— 示意性伪代码，非引擎源码 ——
state DownloadFlow:
    manifest = checkParseJson(read("asset.json"))      # 解析清单
    todo = [a for a in manifest if not DownloadAssetMap.isDownloadComplete(a.key)]
    if todo.isEmpty():
        proceedToMainMenu()                             # 资源齐全，直接进主菜单
        return
    urls = SelectURLGetResourceListState.fetch()        # 选 CDN、取下载列表（http2）
    scene = DownloadSceneLayer(DownloadSceneLayerInfo(
                type      = DOWNLOAD,
                onComplete= () -> proceedToMainMenu(),   # 完成回调：下完后进主菜单
                category  = "...",
                running   = NORMAL))
    scene.onEnter():                                     # GL 主线程
        for a in todo:
            download(a) ; AssetLoadState.onDownloaded()  # 逐项下载
        scene.onComplete()                               # 全下完 → 回调
```

要点（均由 hook 行为佐证）：

- **`DownloadAssetJsonState::checkParseJson(Data)`** 解析资源清单 `asset.json`，
  其中字段 `asset_optimize` 影响清单的取舍策略。
- **`DownloadAssetMap::isDownloadComplete(key)`** 是逐项门禁：返回 `false` 即认为
  该资源缺失、需要下载。
- **`DownloadSceneLayerInfo`** 携带一个 `std::function<void()>` **完成回调**，
  下载场景在全部下完后调用它，引擎据此继续往主菜单走。
- **`DownloadSceneLayer::onEnter()`** 在 **GL 主线程**驱动整套下载 UI 与流程。

### CNV 如何短路它（三层）

| 层 | 手段 | 落点 |
|---|---|---|
| ① 运行时拦截 | `cn_resources_ready.flag` 存在时，`checkParseJson` 喂空清单 `[]`、`SelectURL`/`DLJson` 系列回调静默、`DownloadSceneLayer::onEnter` **跳过 UI 直接调完成回调** | `MagiaClient.cpp` |
| ② 二进制封死 | 把 `DownloadAssetMap::isDownloadComplete` 的返回值**永久改成 `true`**，从根上消灭"某项没下好"的判断 | `patch_libmadomagi.py` |
| ③ 清单纠偏 | 清单含 `asset_optimize` 时把 `:1` 改 `:0`，规避优化路径带来的额外下载判定 | `MagiaClient.cpp` |

①是"运行时让流程走完但不真下载"，②是"让引擎压根不认为需要下载"，二者**双保险**：
即便某条 hook 未命中（符号被上游改名等），另一手仍能兜住。`onEnter` 跳过 UI 时，
之所以要"先存回调、再直接调用"，是因为完成回调是构造 `DownloadSceneLayerInfo` 时
传入的 `std::function` 副本——hook 在 `Info::ctor` 时把它存进 `info→callback` 映射、
在 `Layer::ctor` 时记 `layer→info` 映射，`onEnter` 时两跳取回再执行（详见
[Native Hook 层](/client/native-hook#资源下载跳过-核心)）。

::: tip 为什么需要 ②（二进制 patch）而不只靠运行时 hook？
运行时 hook 是"事件驱动"的——只有引擎走到那条调用才生效。而 `isDownloadComplete`
可能在多处、多线程被调用，且是引擎"要不要重下"的总闸。直接把它焊死成 `true`，
等于把闸门从源头拆掉，杜绝任何遗漏路径触发 15GB 重下。
:::

## 子系统二：HTTP/2 网络栈与游戏 API

### 请求—回调契约（重建）

引擎自带一套 `http2::Http2Session` 客户端。每个游戏功能（主场景、任务板、任务数据、
资源清单……）都是一个**实现了 `onResponse(resp)` / `onError(code)` 一对回调的"State"对象**，
向 session 发一次请求，再在回调里消费结果。契约可重建为：ⓘ

```text
# —— 示意性伪代码，非引擎源码 ——
interface RequestHandler:
    onResponse(session, Http2Response resp)   # 成功：resp.getResponseData()/...Size()
    onError(session, int code)                # 失败

class Http2Session:
    setURI(uri)                 # 设置目标 URL
    setMaxConnectionNum(n)      # 并发连接数（资产流式下载用）
    send(handler)               # 异步发出，结果回调给 handler

# 各功能各自实现一对回调：
MainScene, QbSceneJsonGetServer, QuestStoredDataSceneLayer,
DownloadAssetJsonState, SelectURLGetResourceListState  ⟶  都是 RequestHandler
```

### 关键事实与 CNV 的介入

- **`setURI` 里硬编码的是已停服的官方域名。** 复刻服必须把游戏 API 请求**重定向**到
  自建后端。CNV 在 `setURI` hook 里判断"这是不是要代理的游戏 API"——
  精确匹配握手下发的 `game_server_host`，或路径前缀兜底 `/magica/api/`——命中则
  **保留 path、把 host 前缀换成授权代理后端**。
- **多代理 + 故障切换。** 代理后端是一个列表；`MainScene::onError` 等错误回调会
  推进 `g_proxyIdx`，让后续请求换下一条；全部耗尽则回退私服 host。详见
  [Native Hook 层 · 端点重定向](/client/native-hook#端点重定向)与
  [安全机制](/security/client)里的 `ProxyBackends` / `NodeDirectory`。
- **`onResponse` 的响应体**经 `Http2Response::getResponseData()` /
  `getResponseDataSize()` 取出；CNV 仅在调试时打印小体积响应，不改内容。
- **`setMaxConnectionNum(4)` → `10`**：把资产流式下载的并发连接数调高，加快首屏加载。

::: warning 重定向只动 URL、不碰协议
CNV 在网络层只重写**目标 host**（端点），请求体、签名、协议时序一概透传给原版
`setURIOld`。游戏 API 的"线格式"仍由引擎与服务端约定，客户端不参与解释——这与
WebView 层"缓存重放"是两条独立路径（见 [WebView 拦截](/client/webview)）。
:::

## 子系统三：场景层（SceneLayer）系统

### 结构（重建）

引擎用 **`SceneLayerManager` 单例 + 场景栈**管理 UI。每个场景是一个 `SceneLayer`，
由一个 `*SceneLayerInfo` 描述其类型与参数；`ESceneLayerType` 枚举标识种类
（如 `9` = 序章 Prologue）。导航由 `web::SceneCommand` 下发：ⓘ

```text
# —— 示意性伪代码，非引擎源码 ——
class SceneLayerManager (singleton):
    stack: Stack<SceneLayer>
    pushSceneLayer(info)        # 虚函数；按 info.type 造层并压栈

class SceneCommand:
    pushSceneTop(jsonArg)       # "回到/进入主页(TopScene)"，参数是前端下发的 JSON
    # 还有 pushScenePrologue(...) 等具体跳转，参数同样来自前端 JSON

# 场景可经 JS 桥反向通知前端：
PrologueSceneLayer.notifyJs(signal)   # 序章把"完成"等信号发给 WebView 前端
```

要点：

- **`pushSceneTop(jsonArg)`** 是"进主页"命令，参数为前端下发的账号/场景 JSON。
- **`pushSceneLayer`** 是 `SceneLayerManager` 的**虚函数**（实测位于虚表第 4 槽，
  即 `vptr + 0x18`）；按 `info` 造出对应场景并压栈。
- **`PrologueSceneLayerInfo(type=9, "OP020", "{}")`** 描述"播放序章 OP020、空参数"；
  `"OP020"` 是序章脚本 ID。
- **`notifyJs(signal)`** 是 native 场景→WebView 前端的单向通知通道（如序章播完）。

### CNV 如何借它实现"强制新手教程"

复刻服对任何账号都下发"满级存档"，正常流程**永不进新手教程**。CNV 想让玩家可选地
体验序章，于是在"进主页"这条命令上设闸：

```text
# —— 示意性伪代码，非引擎源码 ——
hook pushSceneTop(self, jsonArg):
    if force_tutorial.flag 存在(一次性消费):       # Java 在标题画面写出
        info = PrologueSceneLayerInfo(type=9, "OP020", "{}")   # 逐字段写死
        SceneLayerManager.getInstance().pushSceneLayer(info)   # 经 vptr+0x18
        g_tutorialForced = true                                # 置位，供 notifyJs 识别
        return                                                  # 不进主页，改进序章
    原版 pushSceneTop(self, jsonArg)                            # 否则照常进主页
```

之所以**不调引擎自带的 `pushScenePrologue`**，是因为它的两个字符串参数来自前端
下发的 JSON（受账号状态影响）；CNV 直接复刻调试菜单"播放序章"的构造、把参数**写死**，
才能"无视账号状态"稳定进序章。标记一次性消费（消费即删文件），保证只在本次启动的
首个 `pushSceneTop` 触发一次；序章结束、引擎再次 `pushSceneTop` 时就正常进主页。
`notifyJs` hook 仅在 `g_tutorialForced` 置位时记录序章发往前端的信号，为后续"序章
完成后静默进主页、不向服务端回写"留精确匹配依据。完整描述见
[Native Hook 层 · 强制新手教程](/client/native-hook#强制新手教程)。

## 子系统四：CRI ADX2 音频与并发调优

两个"无害性能 hook"，与上面三块解耦：

| 引擎接口 | 行为 | CNV 介入 |
|---|---|---|
| `criNcv_GetHardwareSamplingRate_ANDROID()` | ADX2 初始化时查询设备硬件采样率 | 部分设备误报 44100 致 ADX2 重采样、音调偏移；hook 强制返回 `48000` 与母带一致 |
| `http2::Http2Session::setMaxConnectionNum(n)` | 设定资产下载并发连接数（默认 4） | 命中 `4` 时改 `10`，缩短首次资产加载耗时 |

::: tip 这俩 hook 与"启动 BGM"无关
启动画面的标题 BGM/音效是 **Java 层 `BootstrapActivity` 用 `MediaPlayer` 播 OGG**
（见 [启动引导流程](/client/bootstrap)）；ADX2 是**进游戏后**引擎自己的音频栈。两者
不在一个生命周期。
:::

## 符号 ABI 速查表

下表是 CNV 各层接触到的引擎接口（**接口事实，非实现**），及交互方式。
mangled 符号名见 `MagiaClient.cpp` 的 `JNI_OnLoad`。

| 引擎接口（demangled） | 角色 | CNV 交互 |
|---|---|---|
| `DownloadAssetJsonState::checkParseJson(Data&)` | 解析资源清单 | hook：纠偏 / 喂空 |
| `DownloadAssetMap::isDownloadComplete(string)` | 逐项下载门禁 | **二进制 patch → 恒 true** |
| `SelectURLGetResourceListState::onResponse/onError` | 选 CDN、取列表 | hook：就绪时静默 |
| `DownloadAssetJsonState::onResponse/onError/onResponseError` | 下载清单 JSON | hook：就绪时静默 |
| `AssetLoadState::onDownloaded()` | 单资源下载完成 | hook：透传 + 日志 |
| `DownloadSceneLayerInfo::ctor(...)` | 下载场景描述 + 完成回调 | hook：截获回调副本 |
| `DownloadSceneLayer::ctor/init/onEnter` | 下载 UI 场景 | hook：跳过 UI、直调完成回调 |
| `http2::Http2Session::setURI(string)` | 设请求 URL | hook：端点重定向 |
| `http2::Http2Session::onResponse/onError` | HTTP/2 回调 | hook：日志 / 推进代理 |
| `http2::Http2Session::setMaxConnectionNum(int)` | 并发连接数 | hook：4→10 |
| `http2::Http2Response::getResponseData()/...Size()` | 取响应体 | 仅取指针、调试打印 |
| `MainScene::onResponse/onError` | 主场景网络回调 | hook：错误时切代理 |
| `QbSceneJsonGetServer::onResponse` | 任务板服务器 | hook：就绪时透传 |
| `QuestStoredDataSceneLayer::onResponse` | 任务数据场景 | hook：就绪时透传 |
| `web::SceneCommand::pushSceneTop(string)` | 进主页命令 | hook：强制教程闸门 |
| `SceneLayerManager::getInstance()` | 场景管理单例 | 取址：压序章层 |
| `PrologueSceneLayerInfo::ctor(...)` | 序章场景描述 | 取址：构造写死参数 |
| `PrologueSceneLayer::notifyJs(string)` | 序章→前端 JS 通知 | hook：信号日志 |
| `criNcv_GetHardwareSamplingRate_ANDROID()` | ADX2 采样率查询 | hook：→48000 |

## 与各层的衔接

```
Java 层 (patch/)                 Native 引擎 (libmadomagi_native.so)
─────────────────────────────────────────────────────────────────
ResourceFlow 备齐资源
  └ 写 cn_resources_ready.flag ──→ resourcesReady() 读 → 短路下载状态机（子系统一）
BootstrapActivity 标题画面
  └ 写 force_tutorial.flag      ──→ consumeForceTutorial() → 强制序章（子系统三）
握手成功 → ProxyBackends.set()  ──→ loadProxyConfig() JNI 读 → 端点重定向（子系统二）
build：patch_libmadomagi.py     ──→ isDownloadComplete 焊死 true（子系统一·②）
```

- 运行时 hook 的安装/线程/JNI 细节 → [Native Hook 层](/client/native-hook)
- Java 侧资源准备与离线包 → [资源下载与离线包](/client/resource-flow)
- 二进制 patcher 的实现 → [构建系统与 CI](/client/build#patch-libmadomagi-py)
- 三层 Patch 总览 → [三层 Patch 架构](/client/architecture)
