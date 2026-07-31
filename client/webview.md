# WebView 拦截与状态重放

游戏的商店、扭蛋、菜单等大量界面是 **WebView 页面**（`/magica/` 路径）。本项目通过 smali 补丁在 `WebViewClient` 回调里挂入 `WebViewInterceptor`，配合 `CnvJsBridge` 与 `PlayerStateCache` 实现资源拦截、脚本注入、状态持久化与回放。

## 为什么需要状态重放？

游戏后端 Totentanz 是 **无状态** 的：每次会话从空白开始，玩家提交过的状态（编队、昵称等）不被服务端记住。因此客户端需 **自行持久化** 玩家提交过的状态，并在下次会话 **回放** 重建。这是整个 WebView 子系统存在的根本原因。

## 来源闸（受信任来源）

`WebViewInterceptor` 的三项能力——**本地文件供给**、**GET 缓存注入**、**`CnvBridge` 注入**——一律只对**受信任来源**开放。受信任来源 = 服务端下发的 `services.game_server_host` 或 `services.proxy_backends[]` 中任一项的 host（`ProxyBackends` 持有），逐条按 host 精确比对（大小写不敏感）。

::: danger 与服务端 services 配置强耦合
信任列表**完全来自** `/client/init` 的 `services`。若服务端既没下发 `game_server_host` 也没下发 `proxy_backends[]`，信任列表为空 → **一切来源都不受信** → WebView 汉化（B/C 类）与状态捕获/回放会全部静默失效。此时 logcat 会打一条 `MagiaHook-URL` 的 error（只打一次）指明是配置问题。部署新服务端时务必确认这两个字段至少下发其一。
:::

**两种形态都要能吃**：`proxy_backends[]` 是含协议的完整 URL，而 `game_server_host` 服务端会归一化成**纯 host**（无 scheme/路径/尾斜杠，见服务端 `normalizeGameServerHost`），历史配置里也可能残留完整 URL。纯 host 直接喂 `Uri.parse` 会被当成 path、`getHost()` 返回 null，故 `configHost()` 对无 scheme 的值先补 `https://` 再解析。

**页面 URL 与配置值走不同解析路径**：页面 URL 来自 WebView、可能受攻击者控制，一律交给 `Uri.parse()`（与 WebView 判定同源同一套语法），避免手写解析被 `https://evil.example\@good.example/` 这类畸形写法骗过；只有配置值才走补 scheme 的宽松路径。

::: warning 为什么必须有这道闸
`addJavascriptInterface` 的作用域是**整个 WebView**，不是某一个页面。只要该 WebView 后续导航到任意第三方来源（外链、广告位、被劫持的明文来源…），那个页面的 JS 同样能拿到 `window.CnvBridge`，进而：

- `loadAllState()` —— 拖走玩家**全部**缓存状态；
- `saveState()` —— 向缓存投毒，污染下次回放；
- `getAccountId()` —— 拿到账号标识。

端点白名单 `isValidEndpoint` 只约束 key 的**形状**，拦不住这件事。

同理，本地文件供给若不看来源，`https://evil.example/magica/<路径>` 这类请求会让我们把私有目录里的文件当成**该攻击来源自己的同源响应**返回回去，等同于跨源文件读取——路径穿越防御 `isWithinLocalDir` 只保证不越出 `<filesDir>/magica/`，同样拦不住。
:::

**信任状态如何更新**：`CnvJsBridge` 持有一个 `volatile boolean trusted`，默认 **false**（注入即不可信），由两处更新：

1. `interceptFull` 中 `request.isForMainFrame()` 为真时——主文档请求**早于该页任何 JS 执行**，是最可靠的时机；
2. `onPageFinished` 再确认一次——覆盖主文档被 WebView 内部缓存短路、未走 `shouldInterceptRequest` 的情况。

非受信来源时桥的四个方法全部降级为空操作（`loadAllState` 返回 `{}`、`getAccountId` 返回空串）。

## WebViewInterceptor 的四个入口

### (a) 静态文件拦截 intercept / interceptFull

只处理含 `/magica/` 的 URL。提取 `/magica/` 之后的相对路径、去 query：

- `relPath.startsWith("api/")` → 返回 `null`，API 走网络（GET 缓存注入除外）；
- 否则优先读本地文件 `<filesDir>/magica/ + relPath` —— 这正是 **A 类汉化资源** 被提供的途径。该根目录由 `Context.getFilesDir()` 推导，**不再**写死 `/data/data/<包名>/files/magica/`：写死的路径在换包名重打包/改名分发后会直接失效（A 类汉化静默不生效），且多用户、工作资料、设备保护存储等场景下 `/data/data/...` 并不等于本进程的 `filesDir`；
- 本地不存在且 `relPath.startsWith("cnv/")` → 回退到 APK `assets/cnv/`（内置脚本与词表，如 `cnv_shadow.js`、C 类词表 `ui_dict.json`）；
- 命中后用 `guessMimeType` 按扩展名给 MIME。

**路径穿越防御** `isWithinLocalDir(f)`：`getCanonicalPath()` 规范化后必须仍在 `LOCAL_DIR` 内（zip-slip 同款防御）。否则恶意服务端页面可请求 `/magica/../../shared_prefs/cnv_account.xml` 把账号 token 读出回传。

### (b) GET API 缓存注入 interceptFull

对 `GET /magica/api/user/` 请求，先按 `normalizeEndpoint(url)` 查 `PlayerStateCache.loadRespJson(accountId, endpoint)`，命中则直接返回缓存的 JSON：

```java
if ("GET".equals(method) && url.contains("/magica/api/user/")) {
    String accountId = resolveAccountId(view.getContext());
    String cached = PlayerStateCache.get(...).loadRespJson(accountId, endpoint);
    if (cached != null)
        return new WebResourceResponse("application/json", "utf-8",
            new ByteArrayInputStream(cached.getBytes(UTF_8)));
}
```

::: warning accountId 必须与写入端一致
登录后 JS 桥用 `cnv_account/account_id` 写缓存，这里若退化成 DeviceId 查就会 **命名空间错配、永远查不到**。这解决了"回放时序问题"：POST 回放是异步链式的，而 GET 可能在回放完成前发出，故 GET 直接从 SQLite 取已确认状态。
:::

### (c) JS 注入 onPageFinished

在所有 `/magica/` 页面注入引导片段，创建 `<script src='/magica/cnv/cnv_shadow.js'>`（该 src 又会被 `intercept` 命中、从本地或 asset 提供），以 `window.__cnvShadowLoaded` 去重：

```java
private static final String SHADOW_JS =
  "(function(){if(window.__cnvShadowLoaded)return;" +
  "var s=document.createElement('script');s.src='/magica/cnv/cnv_shadow.js';" +
  "document.documentElement.appendChild(s);})()";
```

### (d) JS 桥安装 installJsBridge

在 `addJavascriptInterface("androidCommand")` 之后由 smali 补丁调用，注入 `CnvBridge`：

```java
CnvJsBridge bridge = new CnvJsBridge(PlayerStateCache.get(ctx), resolveAccountId(ctx));
view.addJavascriptInterface(bridge, "CnvBridge");
```

`resolveAccountId` 优先级：SharedPreferences `cnv_account/account_id`（登录后写入）→ `DeviceId.get(ctx)`（匿名）→ `"default"`。

## CnvJsBridge —— window.CnvBridge JS 接口

| 方法 | 作用 |
|---|---|
| `saveState(endpoint, reqJson, respJson)` | POST 成功后保存请求体+响应体 |
| `loadAllState()` → JSON | 当前账号全部缓存 |
| `deleteState(endpoint)` | 删除某条缓存。**`cnv_shadow.js` 不再自动调用它**（见下方「重放失败不删数据」），保留作手动清理用 |
| `getAccountId()` | 当前账号 ID |

**端点白名单** `isValidEndpoint`：非空、`length ≤ 512`、以 `/magica/api/` 开头、不含 `..`。这是防止 JS 把任意 key 写进缓存的安全闸。该方法 `public static`，供云端存档下行路径 `SaveSyncHelper.applyCloud` 复用同一套校验。

上表四个方法**均先过 [来源闸](#来源闸-受信任来源)**：非受信来源一律空操作。端点白名单管 key 的形状，来源闸管「谁有资格调用」，两者缺一不可。

## PlayerStateCache —— SQLite 持久化

数据库 `cnv_state.db`（version 1），表 `player_state`：

```sql
CREATE TABLE player_state(
  account_id TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  req_json   TEXT,
  resp_json  TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, endpoint))
```

`onUpgrade` 为 DROP + 重建（无迁移）。`account_id` 复合主键为多租户/账号系统预留。核心方法：

- `save(...)` —— `insertWithOnConflict(..., CONFLICT_REPLACE)`（upsert），写 `updated_at`；
- `loadRespJson(accountId, endpoint)` —— 取 `resp_json`，供 GET 注入；
- `loadAll(accountId)` —— 按 `updated_at ASC` 取全部，序列化为 `{ "/magica/api/user/deck": {"req":"...","resp":"..."}, ... }`（仅放非空字段），供存档同步；
- `delete` / `clearAccount`。单例 `get(ctx)` 双检锁。

## 状态捕获与回放

实现在 `cnv_shadow.js`。

### 捕获

`shouldCapture(url)` 要求 URL 含 `/magica/api/user/` 且不匹配 `SKIP_PATTERNS`（排除 `login` 及 `get|list|check|search|top|ranking|notice|announce|gift|gacha|draw` 等非幂等/无状态端点）。仅对 **POST** 捕获。命中后 `persist(url, reqBody, respText)`：调 `CnvBridge.saveState`，**同时** 写 `localStorage`（key `cnv_shadow_v1`）作为桥不可用时的回退。

### 回放

`replayAll()` 用 `sessionStorage`（key `cnv_shadow_session`）保证每会话只回放一次。`loadAll()` 优先从 `CnvBridge.loadAllState()` 读，否则读 localStorage。然后把各 endpoint 的 `req` 体 **串行**（Promise 链）按原 endpoint 重新 POST 回放，重建服务端状态。

### 重放失败不删数据

::: danger 远端返回什么，都不能成为删除本地存档的依据
早前的实现是「回放拿到非 2xx 就 `evict(endpoint)`」——同时删掉 SQLite 和 localStorage 两份。这是错的：游戏后端 Totentanz **不受我们控制**，它临时 500、限流 429、或者改了端点路径，都会让回放失败，于是客户端**主动销毁玩家存档**，悄无声息且不可恢复。一次线上故障就足以让所有玩家的存档停摆。
:::

现在按失败性质区分，且**任何情况下都不删数据**：

| 回放结果 | 处理 |
|---|---|
| 2xx | 清零该条失败计数 |
| **5xx / 429 / 408** | 服务端此刻不行，与存档内容无关——**不计数、不标记**，下个会话原样重试 |
| 网络层失败（断网 / 超时 / DNS） | 同上，不计数 |
| 其余 4xx（语义拒绝） | 失败计数 +1；累计 ≥ `MAX_REPLAY_FAILURES`(3) 时**停止重放**该条 |

达到阈值只是不再重放（省掉每次启动的白跑），**数据依旧保留**——GET 注入照常读得到，玩家看到的状态不受影响。中途任意一次成功都会清零计数、自动恢复重放。

失败计数存在独立的 localStorage key `cnv_replay_health_v1`（`{endpoint: {fail, last, status}}`），**不碰存档数据结构，也不碰 SQLite schema**——`PlayerStateCache.onUpgrade` 是 DROP + 重建，动 schema 会把玩家存档整个清掉。

::: tip POST 回放 + GET 注入 = 完整时序覆盖
- **POST 写操作** 由 `replayAll()` 异步串行回放；
- **GET 读状态** 由 `WebViewInterceptor` (b) 在拦截层即时从 SQLite 注入。

二者配合，即使 GET 在 POST 回放完成前发出，也能拿到正确状态。
:::

## 双向数据流

```
玩家 POST /magica/api/user/deck (成功)
   ↓ cnv_shadow.js capture
   ↓ CnvBridge.saveState  →  PlayerStateCache (cnv_state.db)
   ↓ SaveSyncHelper.upload →  /account/save/put (云端)

下次会话 / 换设备
   ↓ /account/save/get →  SaveSyncHelper.applyCloud（经 isValidEndpoint 白名单）
   ↓ PlayerStateCache
   ↓ cnv_shadow.js replayAll  →  重新 POST 重建状态
   ↓ WebViewInterceptor GET 注入  →  即时返回已确认状态
```

存档上行/下行的细节见 [账号、存档与心跳](/client/account-save)。
