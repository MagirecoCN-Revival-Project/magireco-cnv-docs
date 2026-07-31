# Native Hook 层

`cnv-native/src/MagiaClient.cpp`（约 668 行）编译为 `libMagiaClient.so`，在运行时拦截游戏引擎 `libmadomagi_native.so` 内的 C++ 符号。它由 smali 补丁在 `Cocos2dxActivity` 加载 `madomagi_native` 之后链式加载。

::: tip 想先搞懂"被拦的引擎本身怎么运作"？
本篇讲的是**我们拦了什么、怎么拦**。若想先理解**引擎自身的逻辑**（资源下载状态机、
HTTP/2 网络栈、场景层系统等被 hook 的那一侧），见
[Native 引擎逻辑（互操作重建）](/client/native-engine)。
:::

## 框架：ShadowHook

通过 [bytedance/android-inline-hook](https://github.com/bytedance/android-inline-hook)（tag v1.1.1）实现 inline hook。

::: tip 为什么选 ShadowHook 而非 Dobby？
- Dobby 上游对 armv7 已停维护、arm64 汇编对 Android 工具链不友好；
- ShadowHook 由字节跳动持续维护、**arm64 + armv7 双支持**。

`CMakeLists.txt` 通过 `FetchContent` 拉取，并用 `PATCH_COMMAND sed` 把上游 `PUBLIC -std=c17 / -Oz` 改 `PRIVATE`、去掉 `-Werror`/`-Weverything`（否则污染消费者编译、lld18 strict 报错）。
:::

`JNI_OnLoad` 调用 `shadowhook_init(SHADOWHOOK_MODE_UNIQUE, false)`（每地址只能 hook 一次），通过统一 lambda `H()` 调 `shadowhook_hook_sym_name(LIB, sym, fn, old)` —— 在 `.so` 的符号表（含 `.symtab` 非导出 C++ 方法）里按 **mangled 符号名** 查地址装钩，原函数指针存到 `...Old`。

## 四类 hook

### 资源下载跳过（核心）

所有这类 hook 都先 `resourcesReady()`（`stat` 检查 `<filesDir>/cnv_inject/cn_resources_ready.flag`，由 Java 层写出）。flag 存在 = 资源已就位，则 **短路引擎下载流水线**，避免引擎重下十几 GB：

| hook 目标 | 行为 |
|---|---|
| `DownloadAssetJsonState::checkParseJson` | flag 缺失返回空列表 `[]`；存在且 JSON 含 `asset_optimize` 时把 `:1` 改 `:0`（栈上 `string_view` 有界搜索，规避越界与竞态） |
| `SelectURLGetResourceListState::onResponse/onError` | 静默丢弃（无需选 URL） |
| `DownloadAssetJsonState::onResponse/onError/onResponseError` | 静默 |
| `QbSceneJsonGetServer::onResponse`、`QuestStoredDataSceneLayer::onResponse` | flag 缺失时静默 |
| **下载场景三连** | `DownloadSceneLayerInfo::C2` 截获并存下完成回调到 map；`DownloadSceneLayer::C1` 记录 layer→info 映射；`DownloadSceneLayer::onEnter` 在 GL 主线程 **直接调用完成回调，完全跳过下载 UI**（flag 不存在则放行原版，首次安装走正常下载） |
| `AssetLoadState::onDownloaded` | 仅透传 + 日志 |

引擎自带的资源完整性核查由 [tools/patch_libmadomagi.py](/client/build#patch-libmadomagi-py) 在二进制层额外封死。

### 端点重定向

| hook 目标 | 行为 |
|---|---|
| `http2::Http2Session::setURI` | 首次触发用 `std::call_once` 经 JNI 调 `loadProxyConfig`，从 Java `ProxyBackends.get()` / `getGameServerHost()` 拉代理后端与游戏 host。判断是否需代理：`host==g_gameServerHost`（精确）**或** URI 含 `/magica/api/`（路径前缀兜底，因原 .so 硬编码已停服域名）。命中则保留 path、把前缀换成 `g_proxyBackends[g_proxyIdx]`；代理耗尽回退 `g_gameServerHost` |
| `http2::Http2Session::onResponse` | 仅 body<512B 时打印日志（调试） |
| `MainScene::onError` | 游戏运行时 API 错误调 `advanceProxy()`，`g_proxyIdx` 自增，下个请求换下一条代理 |
| `MainScene::onResponse` | 透传 |

::: warning JNI 跨线程关键点
`ProxyBackends` 类引用 **必须在 `JNI_OnLoad`** 阶段（持 App ClassLoader 的 loadLibrary 线程）`NewGlobalRef` 缓存。因为 `setURI` 跑在引擎网络线程，`AttachCurrentThread` 后 `FindClass` 走系统 ClassLoader **看不到 App 类**。
:::

### 强制新手教程

`web::SceneCommand::pushSceneTop` hook：消费一次性 flag `force_tutorial.flag`（`consumeForceTutorial()` 删文件保证只触发一次），命中时不进主页而是 `forceEnterPrologue()` —— `operator new(0x58)` 构造 `PrologueSceneLayerInfo(type=9, "OP020", "{}")`（逐字段复刻调试菜单"播放序章"），再经 `SceneLayerManager::getInstance()` 的虚表 `vptr[3]`（+0x18 = pushSceneLayer）压栈。flag 由 Java `BootstrapActivity.writeForceTutorialFlag` 在标题画面用户选"是"时写出。命中时同时置位全局 `g_tutorialForced`。

`PrologueSceneLayer::notifyJs` hook（诊断用，全程透传）：仅当 `g_tutorialForced` 置位时，把序章向前端发出的每条 `notifyJs` 参数打到 logcat（tag `MagiaCN_LiveOps`，`[Tutorial::notifyJs] arg=…`）。用途：抓取序章完成的真机信号，为后续"序章结束后静默进主页、不向服务端回写"提供精确匹配依据。

::: warning 该 hook 曾因符号名写错而长期静默失效
mangled name 里 `std::__ndk1` 的替换编号必须是 **`NS0_`** 而非 `NS1_`：Itanium mangling 的 `S_`/`S0_`/`S1_` 按名字首次出现顺序编号，本符号在 `std::__ndk1` 之前只出现过 `PrologueSceneLayer` 一个名字（`S_`），故 `std::__ndk1` 是 `S0_`。

不能照抄同文件里的 `web::SceneCommand::pushSceneTop`——那个用 `NS1_` 是对的（`web`=`S_`、`web::SceneCommand`=`S0_`、`std::__ndk1`=`S1_`）。

写错时 `shadowhook_hook_sym_name` 在符号表里查不到、返回 `NULL`，而注册用的 `H()` 只打一行 `LOGE` 就继续（**非致命**），于是 `[Tutorial::notifyJs]` 日志从未出现过，"序章完成后静默进主页"所需的信号也就一直没抓到。已修正为 `NS0_`。
:::

### 性能调优（从 libuwasa 逆向移植）

| hook 目标 | 行为 |
|---|---|
| `criNcv_GetHardwareSamplingRate_ANDROID` | 强制返回 `48000`（修部分设备返回 44100 导致 ADX2 重采样音调偏移） |
| `http2::Http2Session::setMaxConnectionNum` | 入参为 `4` 时改 `10`，加快初次资产加载 |

::: tip libuwasa.so 已被本库完全取代，随底包一并移除
底包自带的 `libuwasa.so` 与本库**重叠且冲突**，因此在换底包时一并删除：`lib/*/libuwasa.so` 与只为加载它而存在的 `com.loadLib.libLoader`（`MyApplication.onCreate` 里的 `loadLib()` 调用点）全部移除，`libMagiaClient.so` 成为唯一的 hook 持有者。

- **重叠**：上表两个性能 hook 本就是从 libuwasa 逆向移植过来的。两套 hook 引擎同时 inline-hook 同一个符号，且 libuwasa 走 `Handler.postDelayed` 延迟加载、本库在 `Cocos2dxActivity` 链式加载，**装载顺序不确定**，属于实打实的竞态。
- **冲突**：libuwasa 另外还 hook 了对话/剧情文本渲染（`StoryLogUnit`、`StoryMessageUnit`、`StoryNarrationUnit`、`StoryCharaUnit`、`cocos2d::Label::createWithTTF` / `setMaxLineWidth`、`LbUtility::initLabelCenterWidthOutline`）与 `UrlConfig::resource`。这些与本项目二次修改后的对话/剧情文本渲染路径冲突，**丢弃是有意为之**，不是遗漏。
:::

## 层间信号小结

```
Java 写 cn_resources_ready.flag  ──→  Native resourcesReady() 读 → 跳过下载场景
Java 写 force_tutorial.flag       ──→  Native consumeForceTutorial() 读 → 强制序章
Java ProxyBackends.set(...)       ──→  Native loadProxyConfig() JNI 读 → 端点重定向
```
