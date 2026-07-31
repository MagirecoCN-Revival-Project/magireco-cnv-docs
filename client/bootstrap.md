# 启动引导流程

`BootstrapActivity` 是 LAUNCHER 入口，在 Cocos2dx 引擎接管之前完成所有资源准备工作。它同时是 `ResourceFlow.Reporter` 的 UI 实现端。

## 工作线程模型

`onCreate` 启动一个名为 `cnv-bootstrap` 的守护线程执行 `runWork()`（`BootstrapActivity.java:1524`）。所有阻塞型对话框（`askXxx` / `showFatalAndExit`）通过 `ui.post(...)` + `Object.wait/notify` 在工作线程上 **同步等待** UI 结果 —— 即工作线程发起弹窗后阻塞，用户点击后被 `notify` 唤醒并取回结果。

## 调试开关机制

`isDebugFlag(name)`（`:1855`）读取 `<filesDir>/debug/<name>.flag`，**文件存在且内容 trim 后等于字符串 `"true"`** 才返回 true（仅读前 16 字节）。

| flag | 作用 |
|---|---|
| `skip_to_tutorial` | **最高优先级，绕过安全门禁**：直接弹教程弹窗，选完退出，不进游戏。仅用于测试教程 UI |
| `verbose_net_log` | 启用 `Net` 层详细网络日志（URL、状态码、耗时、headers） |
| `display_ui_only` | 仅展示 UI，跳过所有启动逻辑 |
| `skip_integrity_check` | 跳过资源完整性后台校验 |
| `skip_ban_check` | 跳过本地封禁记录检查 |
| `skip_cloud_init` | 跳过 `/client/init` 握手，使用默认功能开关 |
| `skip_hot_update` | 跳过热更新 |
| `force_online_mode` / `force_offline_mode` | 强制下载模式 |

::: warning skip_to_tutorial 为何能绕过门禁
该 flag 在 `IntegrityGuard` 之前检查，是有意为之：它只弹教程弹窗然后退出、**永远不会进入游戏**，因此绕过完整性门禁不会暴露 token / 存档等敏感数据。
:::

## runWork() 有序步骤

```
0.  skip_to_tutorial 短路（如置位）
1.  初始化 Net verbose log
2.  【第 0 步】完整性门禁 IntegrityGuard.check()   ← 无跳过开关
3.  display_ui_only 短路（如置位）
4.  【第 0a 步】资源就绪检查 + 崩溃循环检测
5.  【第 0a 后置】并行启动资源完整性校验（与握手并行）
6.  播放标题音效序列
7.  【第 0b 步】本地封禁记录检查
8.  【第 0b 末】首次启动选择更新渠道（UpdateChannel，早于握手/版本检查）
9.  【第 0c 步】云端 /client/init 握手（循环，可重试/离线）
10. 【第 0c 后置】清理失效的临时离线资源
11. 【第 0c-3 步】离线包版本兼容性检查
12. 【第 0d 步】资源已齐 → 跳过下载，直接热更 + 登录
13. 【第 0e 步】否则按功能开关/调试 flag 选择下载模式
14. 【第 0f 步】执行资源下载 ResourceFlow.run()
15. 【第 0g 步】下载后热更 + 登录
```

### 第 0 步：完整性门禁

`IntegrityGuard.check(this)` 返回 `Verdict`；`tampered==true` 时 `showFatalAndExit("客户端完整性校验失败", …)` 并 return。**没有调试跳过开关**，因为它必须早于任何 token / 存档访问。详见 [安全机制](/security/client)。

### 第 0a 步：资源就绪 + 崩溃循环检测

- `isResourcesAlreadyReady()`（`:1884`）：主标记 `<filesDir>/cnv_inject/cn_resources_ready.flag`，兼容旧版 `madomagi/magica/cn_base_done.flag`。
- **崩溃循环检测**：用 SharedPreferences `cnv_launch_state`。读 `last_launch_ms`，若距今 **在 `[0, 20_000ms)` 之间** 视为"快速重启"，`rapid_restart_count` 自增；累计 `≥3` 时弹 `askCrashRecovery()`（三按钮：查看日志 / 继续启动 / 重新注入资源）。选重新注入则 `deleteReadyFlag()` 并令 `alreadyReady=false`。`last_launch_ms` 由 `launchGame()` 写入。

  这里**只能用墙钟**（`System.currentTimeMillis()`）：`last_launch_ms` 要跨进程、跨设备重启持久化，而 `SystemClock.elapsedRealtime()` 在设备重启后归零、不可比。代价是墙钟会跳变，所以必须显式挡掉 **`elapsed < 0`**——玩家手动把系统时间往回调（或 NTP 回拨）后差值为负，同样满足 `< 20_000`，会把正常启动误判成快速重启，攒够 3 次就无端弹出崩溃恢复对话框、诱导玩家清掉已就绪的资源重下 15GB。

### 第 0a 后置：并行完整性校验

仅当 `alreadyReady && !skip_integrity_check`。清单文件存在则用单线程 `ExecutorService` 提交 `ResourceIntegrityChecker.check(...)` 到 `integrityFuture`，**与握手/热更并行**；不存在则后台生成基线清单（把"删清单=永久跳过校验"收敛为"仅本次跳过"）。

### 第 0b 步：本地封禁检查

受 `skip_ban_check` 控制。`BanInfo.load(this)`，若 `isActive()` 则 `showFatalAndExit("账号已被封禁", …)`。本地封禁记录由下载/游戏心跳的 `ban` action 写入，详见 [安全机制](/security/client#本地封禁记录-baninfo)。

### 第 0c 步：云端握手

受 `skip_cloud_init` 控制，在 `cloudInitLoop` 中调 `handleCloudInit()`（详见 [握手协议](/protocol/client-server)）。返回 false 且 `OfflineModeManager.isActive()`（握手连续失败）时：

- **资源已就绪** → `askOfflineModeChoice()`：重试 / 离线模式 / 退出；
  选离线模式走 `enterOfflineMode()`：清空代理列表，把游戏 host 设为
  `CloudEndpoint.FALLBACK_GAME_SERVER_HOST` 直连。**这里只能用写死值**——上游端点发现拿到的是
  **资源基址**而非 API 地址，而游戏 API 的真实域名在 APK 里静态不存在、是运行时获取的，
  离线时无从推断（详见 [握手协议 · 上游端点发现](/protocol/client-server#上游-totentanz-端点发现)）。
  因此这个兜底 host 必须与当前底包配套，写错就直连到不存在的地址；
- **资源未就绪** → `askOfflineInjectChoice()`：重试 / 临时离线注入 / 退出。

若 `handleCloudInit` 因封禁/维护等 **业务原因** 返回 false（`OfflineModeManager` 未激活），则直接退出。

### 更新渠道与软更新提示

**渠道概念两层**：`BuildChannel` 是构建期事实（CI 打的是 `normal` 还是 `internal-test`，来自 `assets/cnv_build_channel.txt`）；`UpdateChannel` 是**用户运行时选择**（持久化于 `cnv_update_channel`，未选时回退 `BuildChannel`）。握手 `channel` 字段、更新下载 URL、版本显示统一走 `UpdateChannel`。

**首次启动选渠道**（第 0b 末，早于握手/版本检查）：`UpdateChannel.isChosen()` 为否时 `askUpdateChannelChoice()` 阻塞弹窗让用户选「正式版 / 内测版」，落盘后不再询问。

**软更新提示**（在 `handleCloudInit` 内，区别于 `force_update`/`allowed_versions` 硬闸门）：服务端下发 `client.latest_version` 时，按所选渠道决定是否提示——

- **正式版**：仅当最新版本**前两位**（major.minor）高于当前才提示（补丁号变化不打扰）；
- **内测版**：**任意**版本位升高即提示。

`askOptionalUpdate()` 弹「立即更新 / 暂不更新」，选"暂不更新"继续启动（非阻断）。版本比较见 `compareVersions` / `majorMinorOf`。

### 第 0c-3 步：离线包版本检查

仅当 `alreadyReady && serverRequiredPackVersion` 非空。`readInstalledPackVersion()` 读 `installed_pack_version.txt`，`isPackVersionOutdated()` 逐段比较版本（点分或整数格式，未记录视为过期）。过低则弹 `askPackVersionOutdated()`：

- 重新注入离线包（`deleteReadyFlag()` + 设 `packUpgradeMethod=offline`）；
- 在线下载（`deleteReadyFlag()` + 设 `packUpgradeMethod=online`）；
- 暂时忽略。

详见 [资源下载](/client/resource-flow#离线包版本检查)。

### 第 0d 步：资源已齐

- `runHotUpdate()`（除非 `skip_hot_update`）；
- `handleIntegrityResult()`：`integrityFuture.get(5s)`，超时则放行，未通过则弹 `askIntegrityWarning()`（忽略继续 / 重新下载）；
- `showLoginDialog(this::checkSavesBeforeLaunch)`。

### 第 0e–0g 步：下载模式与执行

模式优先级：`force_online_mode` > `force_offline_mode` > (两功能均开 → 沿用 `packUpgradeMethod` 或 `askDownloadMethod()`) > 仅在线 → online > 仅离线 → offline。然后 `new ResourceFlow(this, this, userMethod, sessionToken).run()`，捕获 `FatalConfigException` 弹可重试错误框。下载后再热更，最后登录。

## 进游戏前的最后两道闸门

### 登录

`showLoginDialog(onSuccess)`（`:2306`）使用 SharedPreferences `cnv_account`，`remember_login` 默认 true。开启且存有 `account_id`+`account_token` 时用 token 静默恢复，跳过登录表单。

### 存档检查

`checkSavesBeforeLaunch()` →（必要时先申请悬浮窗权限）→ `doSaveCheck()`：后台 `SaveSyncHelper.loadLocal` + `fetchCloud`，`compare` 得 `SyncState`。详见 [账号、存档与心跳](/client/account-save)。

### 启动游戏

`launchGame()`（`:2546`）：`launched` 幂等保护；`maybeShowTutorialPrompt()` 是最后一道闸门；写 `last_launch_ms`；停 BGM/SFX；用显式 Intent `setClassName(pkg, "jp.f4samurai.AppActivity")` 启动引擎，仅转发白名单 deep-link scheme（`magireco.com` / `magireco.reward`）。

#### 新手教程询问弹窗

`maybeShowTutorialPrompt()`（SharedPreferences `cnv_tutorial`）：未勾选「不再提示」时弹「是否进入新手教程」（是 / 否 + 不再提示）。选「是」→ `writeForceTutorialFlag()` 写一次性 `force_tutorial.flag`，由 native 在首个"进主页"命令处消费、改播序章（**无视满级账号**，机制见 [Native Hook · 强制新手教程](/client/native-hook#强制新手教程)）；选「否」→ 清除该 flag 正常进入。勾选「不再提示」永久落盘后续不再弹。
