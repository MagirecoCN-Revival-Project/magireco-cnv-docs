# 账号、存档与心跳

本页讲存档同步、悬浮存档按钮、5 秒心跳与登录验证码。

## 本地存档存储

存档的本质是 [玩家状态缓存](/client/webview#playerstatecache-sqlite-持久化)：`PlayerStateCache.loadAll(accountId)` 把该账号所有端点序列化为：

```json
{ "/magica/api/user/deck": { "req": "...", "resp": "..." }, ... }
```

这就是云存档的 `data` 字段格式。

## SaveSyncHelper —— 比对与同步

### 数据模型

- `SaveData = { String json; boolean empty; }`；
- `SyncState` 四态：`IN_SYNC`、`CLOUD_ONLY`（本地空云端有）、`LOCAL_ONLY`（本地有云端空，静默上传）、`CONFLICT`（两端都有且内容不同）。

### 读取与拉取

- `loadLocal(ctx, accountId)` —— 调 `PlayerStateCache.loadAll`，`json==null||"{}"` 视为空；
- `fetchCloud(ctx, accountToken)` —— POST `/account/save/get`，body 用 `JSONObject` 构造 `{token}`（避免手工拼接 untrusted token）。`success=false` 或 `data` 为 `"{}"`/空 视为云端空档。

### 上传

`upload(ctx, accountId, accountToken)`：先查限速，再 `loadAll` 取本地全量，构造 `{token, data:<JSONObject>}` POST `/account/save/put`。响应 `success=false` 抛 IOException 携带服务端消息。

**限速**：滑动窗口 `UPLOAD_WINDOW_MS=60_000` + `UPLOAD_MAX_CALLS=2`，即 **60 秒最多 2 次上传**，超限抛 `RateLimitedException`（携带剩余等待秒数）。

::: warning 时间基准必须是单调时钟
窗口用 `SystemClock.elapsedRealtime()`，**不能**用 `System.currentTimeMillis()`。墙钟会被用户手改或 NTP 校时跳变，两个方向都出错：往前调 → 窗口被整个清空、限速形同虚设；往回调 → 差值为负、窗口永远清不掉，且剩余等待秒数算出远大于 60 的荒谬值，玩家被**长期锁死**无法上传存档。

该窗口只存活在进程内（静态 `ArrayDeque`，不持久化），所以不存在"设备重启后 `elapsedRealtime` 归零"的问题——重启即新进程，队列本就是空的。
:::

### 应用云端到本地

`applyCloud(ctx, accountId, cloudJson)`：先 `clearAccount` 清空，再逐 endpoint 写入。**关键安全点**：对每个 endpoint 用 `CnvJsBridge.isValidEndpoint()` 白名单过滤 —— 即使是己方云端，也拒绝非法/越界/超长 key，防止污染 WebView 注入逻辑。

### 比对与错误翻译

- `compare(local, cloud)` 按 empty 标志与 `json.equals` 字符串相等判定四态；
- `friendlyUploadError(e)` 把异常映射为单行中文（覆盖 `RateLimitedException`、超时、`UnknownHostException`、`ConnectException`、`SSLException`，及 IOException 内嵌的 `HTTP 503/429/401/403/5xx`）。

## SaveOverlayService —— 悬浮按钮 + 心跳

一个 `START_STICKY` **前台 Service**，承担两件事。关键常量：`CYCLE_MS=600_000`（10 分钟自动存档）、`HEARTBEAT_MS=5_000`（5 秒心跳）。

### 前台通知

`startForegroundCompat()`：API 26+ 建低重要度 `NotificationChannel`（标题"存档同步"，`IMPORTANCE_MIN`），通知文案"魔法纪录 CNV / 存档同步运行中"。

### 悬浮存档按钮与存档管理面板

`createOverlayView()` 通过 `WindowManager` 添加自绘 `SaveButtonView`：

- 窗口类型 API26+ 用 `TYPE_APPLICATION_OVERLAY`，否则 `TYPE_PHONE`；flags `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_NO_LIMITS`；
- `SaveButtonView` 自绘粉红进度环（`0xFFFF6BAF`）+ **云端上传图标**（白云 + 镂空上箭头；自动存档=上传到云端，故用"上传"语义）；`setProgress` 反映自动存档周期进度，自动存档关闭时进度环显示为暗粉满圈"暂停"；
- `DragTouchListener`：拖动阈值 8dp²。**未拖动的抬起 = 点击 → 展开/收起存档管理面板**（`togglePanel`）；**拖动后抬起 = 把位置写回 SharedPreferences `cnv_save_overlay`（x/y）**。

**存档管理面板**（`buildPanelView`，开在按钮一侧），✕ 用 `TextView`（非 `Button`，避免默认 minWidth/minHeight 把它挤离右上角）：

| 控件 | 行为 |
|---|---|
| `立即存档` | `performSave(false)` → `cnv-save-upload` 线程 `SaveSyncHelper.upload`（本地 → 云端） |
| `恢复云端存档` | `performRestore`（二次确认）→ `cnv-save-restore` 线程 `fetchCloud` + `applyCloud`（云端 → 本地，**覆盖本地**，**需重启游戏才生效**）；云端为空则不改动 |
| `自动存档` 开关 | 落地 `cnv_save_overlay/auto_save_enabled` |
| `间隔` 5 / 10 / 30 分 | 落地 `auto_save_interval`（默认 10） |
| `退出账号` | `performLogout`（二次确认）→ 清 `cnv_account` 后 `stopSelf` |

退出账号 / 恢复存档共用 `showConfirmDialog(...)` 覆盖窗口（`FLAG_DIM_BEHIND`）。

### 自动存档（间隔可调，默认 10 分钟）

`saveTicker` 每 100ms 刷新进度环；`elapsed ≥ 所选间隔` 时 `resetCycle()`（用 `SystemClock.elapsedRealtime()`）并 `performSave(true)` 上传。`performSave(isAuto)` 从 `cnv_account` 读 `account_id`/`account_token`，开 `cnv-save-upload` 线程调 `SaveSyncHelper.upload(...)`，成功/失败弹 Toast。

## 心跳与实时封禁/维护处理

游戏阶段每 5 秒一次心跳，能 **实时** 接收封禁/维护指令（不依赖客户端刚发的那个包，任何心跳响应均有效）。

`sendGameHeartbeat()`：开 `cnv-game-heartbeat` 线程，body = 鉴权三件套 + `files: []`（游戏阶段无下载），POST `/client/heartbeat`，超时 10s。`handleHeartbeatResponse(resp)` 读 `action`：

| action | 处理 |
|---|---|
| `ban` | 用 `fatalShown` 去重；停心跳；读 `reason`/`expire_time`；`BanInfo.save(...)`；主线程弹模态覆盖层"账号已被封禁"（`expire_time>0` 格式化"解封时间"，否则"永久"） |
| `maintenance` | 同样去重停心跳；读 `message`/`end_time`；弹"服务器维护中" |
| `ok` / `switch_mirrors` | 游戏阶段无关，忽略 |

**致命覆盖层** `showFatalOverlay()`：`WindowManager` 加全屏暗化层（`FLAG_DIM_BEHIND`）捕获所有触摸，中央卡片唯一"确定"按钮回调里 `removeView` 后 `Process.killProcess(myPid())` 直接终止进程。

## 登录与验证码

### 账号登录

`/account/login` body `{username, password, cap_token}`，成功返回 `{success, account_id, token}`。登录成功后 `account_id`/`account_token` 写入 `cnv_account`。

### cap-worker PoW 验证 CapWorkerSolver

在 **隐藏 WebView**（1×1 像素）里完成计算型人机验证，token 回传 Java。

- WebView 收紧权限：`JavaScriptEnabled=true` 但关闭 `DomStorage`/`AllowFileAccess`/`AllowContentAccess`/`Universal/FileAccessFromFileURLs`，`MixedContentMode=NEVER_ALLOW`；
- `addJavascriptInterface(new JsBridge(...), "Android")`，JS 侧通过全局 `Android` 对象回调；
- `shouldOverrideUrlLoading` 只允许导航到与 `capUrl` 同 host 的 https 页面；
- 用 `loadDataWithBaseURL(capUrl, html, ...)` 把页面置于 **安全上下文**，使 `crypto.subtle` 可用；
- 用后即焚：拿到 token/error 后 `removeView` + `destroy`。

**PoW 算法**（内嵌 HTML 的 `run()`）：

```
1. POST {CAP}/api/challenge → {token, challenge:{c,s,d}, expires}
2. 对每个子挑战 i∈[0,c)：从 nonce=0 递增，算 SHA-256(token+"."+i+"."+nonce)，
   直到前导零比特 ≥ d，记最小 nonce 入 solutions
3. POST {CAP}/api/redeem {token, solutions} → {success, token}
4. success → Android.onToken(token)，否则 Android.onError
```

`capUrl` 用 `JSONObject.quote` 做完整 JS 字符串转义（防手工 replace 被反斜杠/换行绕过）。cap-worker URL 优先取 `/client/init` 的 `services.cap_worker_url`，回退 `CloudEndpoint.CAP_WORKER_URL`。token 作为 `/account/login` 的 `cap_token` 提交。

## 离线状态悬浮标签 OfflineStatusOverlayService

离线模式下在屏幕左下角常驻一个 **不可触摸**（`FLAG_NOT_TOUCHABLE`）状态标签：

- 普通离线：粉色"离线模式 v版本号"；
- 临时离线注入：红色警告"临时离线注入，未经过校验，请仔细核对游戏内容"。
