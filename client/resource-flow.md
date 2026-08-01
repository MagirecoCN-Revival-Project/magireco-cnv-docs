# 资源下载与离线包

::: danger 本页描述的是已归档的 APK 客户端
Android 客户端已被判定为**中间产物,停止维护**,仓库已归档;本代从未上线,装机量为零。
服务端侧的整包分发面(在线下载的镜像组、离线整包、热更新)也已在 2026-08 删除,
**本页描述的流程不再对应任何在线服务**。

保留本页作历史记录。后续方向是网页版客户端 + 自建 API 后端,资产改由
[边缘 resource 节点](/protocol/client-server#边缘-resource-节点分发面)按需分发。
:::

`ResourceFlow` 负责把游戏资源准备到 `<filesDir>`。构造签名 `ResourceFlow(ctx, reporter, mode, sessionToken)`（`ResourceFlow.java:165`），模式常量 `MODE_ONLINE="online"` / `MODE_OFFLINE="offline"`。`run()` 按 mode 分派。

`BUILD_VERSION` 在静态块里通过反射读 APK `versionName`，用作版本闸门上报值。

## 在线流程 runOnline()

```
1. postMethodSelect(online)            上报下载方式（失败忽略）
2. fetchOnlineDownload()               取镜像组 + S3 资源令牌
3. 构建线路表，多线路时让用户选线路
4. fetchManifestForGroup()             取文件清单
5. filterHotUpdateFiles()              剔除 js/scenario 热更包
6. initSlots(N)                        预建进度槽位
7. requestConcurrency(min(4, 镜像数))  询问并发数
8. downloadAll()                       并发下载
9. writeReadyFlag()                    写就绪标记 + 生成完整性清单
```

### 文件清单的两种来源

`fetchManifestForGroup()`（`:280`）：

- 镜像若 **自带 `files` 列表** → 直接合并（同 key 首现胜）；
- 否则对每个镜像根 URL 用 `Net.getStringWithToken(url, resourceToken, 20s)` 拉 **S3 XML**，经 `S3List.parse` 解析出文件清单后合并。

`filterHotUpdateFiles()` 剔除 `cn_js_update.zip` / `cn_scenario_update.zip`（留给热更流程）。空清单 → fatal。

### downloadAll() 并发下载

固定线程池 `cnv-dl` + `Semaphore` 限流 + `CountDownLatch`。每文件一个 `DownloadState`（含 `currentMirror` / `switchPending`）。

**安全检查**（C-H6）：拒绝 key 以 `/` 开头、含 `\0` / `\n`，并用 canonical-path 校验防路径遍历。

每个 worker 在 `while(true)` 重试循环里调 `Net.downloadResume(fileUrl, target, entry.size, 15s, sink)`。`ProgressSink.isCancelled()` 同时检测 `reporter.isCancelled()` 与 `state.switchPending`：捕获 IOException 后若 `switchPending` 则清标志、换新镜像重试（**心跳换线**），否则上抛。`firstErr` 记录首个异常并最终上抛。

### 下载心跳 HeartbeatSender

守护线程 `cnv-heartbeat`，每 5 秒 POST `/client/heartbeat`，body = 鉴权三件套 + `files` 数组（`name` / `status` / `percent` / `speed_bps`）。响应 `action`：

- `switch_mirrors` —— 读 `assignments`（`mirror` + `files`），对处于 DOWNLOADING 的文件先写 `currentMirror` 再置 `switchPending`（volatile 写序保证可见性）；
- `ban` —— `BanInfo.save(...)` 后 `showFatalAndExit("账号已被封禁", …)`。

## 离线流程 runOffline()

```
1. postMethodSelect(offline)（忽略失败）
2. fetchOfflinePackage()  取云端 downloadUrl / packageVersion（仅供对话框展示）
3. injectFromPicker(cloudUrl, cloudVersion, provisional=false)
```

### 公共注入流水线 injectFromPicker()

```
1. requestOfflineSourceDialog()    来源选择对话框（取消 → fatal）
2. requestFilePick()               系统文件选择器取 content:// URI
3. TOCTOU 防护：一次性拷到私有临时文件 cacheDir/cnv_import_<ts>.zip
4. verifyZipFile()                 ZipInputStream 读首条目验证格式
5. 实时 SHA-256 校验（见下）
6. 第一阶段：解压外层 zip 到 cnv_staging（不剥前缀）
7. 读 cnv_pack_meta.json 的 pack_version
8. 第二阶段：找内层 .zip 逐一解压到 filesDir（剥离 magica/ 前缀）
9. finally 清理 staging + 临时文件
10. 写标记（见下）
```

### 实时 SHA-256 校验

::: tip 设计要点：文件选完后才取指纹
旧实现在启动时预取 SHA-256，文件选完后用 **过期值** 比对。新实现改为：在用户 **选定文件并拷到临时目录之后**，再 `fetchOfflinePackage()` 取 **最新** `sha256`。
:::

- 仅 `!provisional && sessionToken` 非空时执行；
- 取到服务端 SHA-256 则 `sha256HexFromFile()` 计算本地值；
- **不匹配 → 硬失败抛 `FatalConfigException`，不给"继续"选项**（C-L1/C-L2）：`离线包文件与服务端记录不符，请重新下载最新版离线包后重试`；
- 获取服务端 SHA-256 失败仅记 WARN，不阻断（网络抖动不应让注入失败）。

服务端接口字段约定详见 [握手协议](/protocol/client-server)。

### 两阶段解压

外层 zip 可能内嵌多个内层 zip。`Unzip` 是流式 `ZipInputStream`（缓冲 32KB），带 **zip-slip 防御**（canonical-path 必须在 destDir 内）与 **前缀剥离**（默认剥 `magica/`，传空关闭）。CRC32 校验由 JDK `ZipInputStream` 在 `closeEntry()` 隐式执行（CRC 不符抛 `ZipException`）—— 这是临时离线注入"包内逐条校验"的实现基础。

## 临时离线注入 runProvisionalOffline()

应急路径：`injectFromPicker(null, null, true)` —— **不联系服务端**、仅做包内本地校验、写临时标记。用于服务器不可达且本机尚无资源时让玩家应急进入游戏。

## 标记文件

| 方法 | 文件 | 说明 |
|---|---|---|
| `writeReadyFlag()` | `cnv_inject/cn_resources_ready.flag`（内容 `ok:<ts>`） | 正式就绪；同时异步生成完整性清单 |
| `writeProvisionalFlag()` | `cnv_inject/cn_resources_provisional.flag`（`provisional:<ts>`） | 临时；**故意不生成清单**，"不算数" |
| `writeInstalledPackVersion()` | `cnv_inject/installed_pack_version.txt` | 已安装离线包版本 |

## 离线包版本检查

`cnv_pack_meta.json`（离线包根目录）含 `pack_version`，注入成功后写入 `installed_pack_version.txt`。`BootstrapActivity` 在每次 `alreadyReady` 启动时把它与服务端下发的 `offline_pack.min_version`（见 [握手协议](/protocol/client-server)）比较，过低则提示重新注入或在线下载。

## 热更新 runHotUpdate()

非致命。`fetchHotUpdate()` 取 `js` / `scenario` 两包信息。版本存于 SharedPreferences `cnv_hot_update`（`js_version` / `scenario_version`）。`applyHotPatch()`：

- `serverVer ≤ localVer` 或无 URL → 跳过；
- 否则带换线重试循环下载（`fileSize>0` 用 `downloadChunked(...,4线程,30s)`，否则 `downloadResume(...,-1,30s)`）；
- SHA-256 校验（失败标 failed 跳过）；
- `unzipHotPatch()`（`stripPrefix=""` 保留 `magica/` 前缀供 WebViewInterceptor）；
- 更新 prefs 版本号，异步重建完整性清单。

## SHA-256 工具

- `sha256HexFromFile()` —— 失败抛 IOException（用于离线包硬校验）；
- `sha256Hex()` —— 失败返空串（用于非致命的热更校验）。
