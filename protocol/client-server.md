# 客户端 ↔ 服务端握手协议

::: warning 玩家账号端点已移交 API 服务端
本页中的 `/account/login`、`/account/save/*` 以及注册 / 找回 / 邮箱验证码,
**已不在资源分发服务端上**——账号系统整体归 API 后端([为什么](/server/data-model))。

资源分发服务端现在只保留 `/client/*`(握手与心跳)、`/auth/login`(**仅管理员**)
与 `/admin/*`。下文关于这些端点的字段与语义描述仍然准确;账号类端点的部分请当作
**协议记录**读,它们在 API 服务端上继续成立。
:::

::: danger APK 整包分发面已删除(2026-08)
`/client/method-select`、`/client/online-download`、`/client/offline-package`、
`/client/hot-update` 四个端点**已从服务端删除**,心跳里的 `files[]` 与
`switch_mirrors` 也一并去掉。

它们服务的是 APK 客户端"先把整包资源下完再进游戏"的模型:服务端维护镜像组、
按文件把设备分派到线路、盯着进度决定换线。网页端不这样工作——它按需逐个取资产,
取哪个由运行时决定,服务端既不知道也不需要知道。

**资产分发改由[边缘 resource 节点](#边缘-resource-节点分发面)承担**:`/client/init`
下发 `asset_auth`,客户端拿它作 Bearer 令牌直接向边缘节点要清单与文件。

下文中这四个端点的小节保留为**协议记录**(说明 Android 专有 API 曾经长什么样),
并逐个标注了废弃状态。不要照着它们实现新客户端。
:::

`/client/*` 与 `/account/*` 是游戏客户端与复兴计划服务端之间的契约。现役的 `/client/*` 只剩 2 个端点(`init` / `heartbeat`),另 4 个见上方废弃说明。

::: warning 铁律换了保护对象,不是取消了
原文写的是"唯一真理是已发布的 APK":客户端是已签名已分发的包,字段名钉死在里面,
所以服务端只增不改。**这个前提已经不成立**——本代 APK 从未上线、装机量为零,
仓库已归档。为零个用户维护的兼容层不是保险,是一直要维护还平白多一条降级入口的
死代码。

铁律本身仍在,只是保护对象变成**网页客户端与将来任何有真实在线用户的客户端**:

- 对**有活跃用户**的客户端:JSON 字段只增不改,不可删除 / 改名 / 改类型 / 改语义;
  新增字段必须可选;变更走「先加新 → 客户端适配 → 双跑过渡 → 再废旧」。
- 对 **APK 客户端**:无此义务。可以直接删端点、改语义、去兼容层——本页那四个
  端点就是这么删的。

判据不是"这个客户端存不存在",而是"**有没有人正在用它**"。
:::

| 这一侧 | 实现位置 |
|---|---|
| 客户端：请求构造与响应解析 | `patch/src/main/java/io/kamihama/cnv/ClientInit.java`，端点常量在 `CloudEndpoint.java` |
| 服务端：响应生成 | `internal/api/client/handlers.go` + `state.go` |
| 服务端：保真测试 | `internal/api/client/protocol_test.go`——任何改动都要让它继续通过 |

改这些响应前请先读 [协议保真原则](/contributing/server/protocol-fidelity)：一个字段名拼错、
一个 `null` 发错，真机就会崩或行为异常，而服务端测试如果没覆盖到就发现不了。

## 端点全景

```mermaid
flowchart TB
    INIT["POST /client/init<br/>握手:签发 access_token + asset_auth"]
    INIT --> HB["POST /client/heartbeat<br/>保活 / 收封禁与维护通知"]
    INIT -.asset_auth 作 Bearer.-> EDGE["边缘 resource 节点<br/>GET 清单 / 取文件(Range)"]

    style INIT fill:#d6336c,color:#fff
    style EDGE fill:#1c7ed6,color:#fff
```

`/client/heartbeat` 要带**鉴权三件套**;`/client/init` 是握手起点,不带。

资产不再经由 `/client/*` 协商——客户端拿 `asset_auth` 直接向边缘节点索取,
那条路径的契约见[边缘 resource 节点分发面](#边缘-resource-节点分发面)。

### 客户端的端点常量

`API_HOST` 在源码中为**空字符串**，由 CI 在编译前从 Secret `CNV_API_HOST` 注入；
所有端点都是 `API_HOST + 路径`。同理 `CAP_WORKER_URL` 由 `CNV_CAP_WORKER_URL` 注入，
`DIRECTORY_PUBKEY`（签名节点目录的 Ed25519 根公钥）由 Variable `CNV_DIRECTORY_PUBKEY` 注入。

| 常量 | 路径 |
|---|---|
| `CLIENT_INIT` | `/client/init` |
| `CLIENT_HEARTBEAT` | `/client/heartbeat` |
| ~~—（method-select）~~ | ~~`/client/method-select`~~ **已删除** |
| ~~—（online-download）~~ | ~~`/client/online-download`~~ **已删除** |
| ~~—（offline-package）~~ | ~~`/client/offline-package`~~ **已删除** |
| ~~—（hot-update）~~ | ~~`/client/hot-update`~~ **已删除** |
| `ACCOUNT_LOGIN` | `/account/login` |
| `ACCOUNT_REGISTER` / `ACCOUNT_FORGOT` | `/account/register` / `/account/forgot` |
| `ACCOUNT_SAVE_PUT` / `ACCOUNT_SAVE_GET` | `/account/save/put` / `/account/save/get` |

::: tip 为什么硬编码进 APK 而不放 assets？
这些 URL 被视为**客户端可信链的一部分**，与 APK 同寿命。刻意**不放进 `assets/`**
做运行时可改，以防 init API 被替换后整套客户端被劫持。
:::

::: warning `FALLBACK_GAME_SERVER_HOST` 是唯一**不能留空**的常量
它是离线模式直连 Totentanz 后端的兜底 host（纯 host，无协议无路径）。用在「服务端不可达」
这条路径上——那时候恰恰拿不到 `/client/init` 下发的 `services.game_server_host`，只能靠它。
留空 = 离线模式直接失效。

它**随底包走而不是随部署走**：底包换一次、Totentanz 后端域名换一次，这个值就要跟一次。
所以源码里保留可用默认值（当前对应 totentanz 1.2.0_r128 的 `totentanz-9b.magi-reco.com`），
只在默认值与当前底包不符时才用 Variable `CNV_GAME_SERVER_HOST` 覆盖。正常联网时它不生效。
:::

运行时并非固定打 `API_HOST`：握手成功拿到[签名节点目录](#签名节点目录)后，
登录/账号/存档/资源等请求会按节点声明的能力（`caps`）改路由；无目录或验签失败时一律回退
`API_HOST`。

## 鉴权三件套 authTriple

```json
{
  "device_id":    "<DeviceId.get 的 SHA-256 设备指纹>",
  "access_token": "<服务端签发的会话令牌>",
  "signature":    "<ClientSignature.get 的 APK 签名证书摘要>"
}
```

服务端校验链：token 合法 → 绑定该 `device_id` → **`signature` 与握手时一致** → 未封禁。
`signature` 中途变化会作废会话（疑似换包）。

三个字段在客户端如何生成详见[客户端安全机制](/security/client)；服务端如何校验详见
[会话与令牌](/security/sessions-tokens)。

## `/client/init` 握手

### 请求

```json
{
  "version":   "4.0.0",
  "device_id": "玩家设备唯一标识",
  "signature": "APK 签名证书 SHA-256（小写 hex）",
  "channel":   "normal"
}
```

| 字段 | 说明 |
|---|---|
| `version` | 客户端版本号，点分格式 |
| `device_id` | 设备指纹，贯穿封禁/会话/审计 |
| `signature` | **防改包核心**，与服务端白名单比对 |
| `channel` | `UpdateChannel.get`——用户所选渠道 `normal` / `internal-test`，未选时回退 `BuildChannel` 构建期默认。决定更新提示频率与下载哪个 APK |

字段缺失时服务端支持 `X-Device-Id` / `X-Client-Version` / `X-Signature` 头兜底
（便于老客户端与调试）。

握手本身**尚无会话令牌**，服务端凭 `device_id + signature` 验证合法性后在响应里签发
`access_token`。

### 响应字段

```json
{
  "success": true,
  "banned": false,
  "access_token": "32 字节 hex",
  "server":   { "status": "ok", "message": "", "end_time": 0 },
  "client":   {
    "allowed_versions": ["4.0.0"],
    "latest_version": "4.1.0",
    "update_url_normal": "https://.../v4.1.0.apk",
    "update_url_internal_test": "https://.../v4.1.0-test.apk",
    "update_apk_sha256": "<对应渠道 APK 的 sha256>"
  },
  "spoof":    { "fake_version": "1.0.0", "fake_name": "マギレコ" },
  "features": { "account_enabled": true },
  "services": { "cap_worker_url": "...", "game_server_host": "..." },
  "asset_auth": { "type": "bearer", "token": "cnva1.…", "expires_at": 1785090420 }
}
```

| JSON 字段 | 含义 |
|---|---|
| `banned` / `ban_reason` | 封禁标志与原因 |
| `force_update` | 版本被服务端拒绝 |
| `access_token` | 会话令牌 |
| `server.status` / `.message` / `.end_time` | `normal`/`maintenance`/`error` + 维护文案 + 结束时间（Unix 秒） |
| `client.allowed_versions[]` | 允许的版本列表（空 = 不限制） |
| `client.update_url_normal` / `.update_url_internal_test` / `.update_apk_sha256` | 更新 APK 地址（按渠道）与指纹 |
| `client.latest_version` | **软更新提示**，见[三道更新闸门](#三道更新闸门) |
| `spoof.fake_version` / `.fake_name` | 向 native 伪造的版本 / 应用名，绕过日服客户端检测 |
| `features.account_enabled` / `.disabled_message` | 账号系统总开关（默认 true）+ 关闭提示；`false` 时客户端跳过登录/存档/悬浮窗等全部账号逻辑。<br/>~~`online_download`~~ / ~~`offline_package`~~ **已删除**——它们控制的端点已不存在,继续下发只会让客户端以为还有那条路可走 |
| `services.cap_worker_url` / `.game_server_host` / `.proxy_backends[]` | cap-worker 端点、游戏 host、代理后端列表 |
| `services.game_server_base` | **可选**。游戏 **API** 后端的完整 base URL（含路径）。仅来自运维配置——`game_server_host` 只能装纯 host、会把路径丢掉，故补此字段。native 层优先用本值，缺省回退 host 拼接 |
| `services.resource_base` | **可选**。上游 Totentanz 的**资源**基址（来自端点发现）。与 `game_server_base` **严格区分**，见[上游端点发现](#上游-totentanz-端点发现) |
| `services.game_max_threads` | **可选**。上游建议的 HTTP/2 并发数（实测会动态变化）；缺省或 ≤0 时客户端沿用自身默认 |
| ~~`offline_pack.min_version`~~ | **已删除**,随离线整包端点一并去掉 |
| `asset_auth` | 取资产用的短时凭证信封,见[下节](#asset-auth-取资产的钥匙)。缺省 = **拿不到资产**,不是不需要鉴权 |
| `contributors[]` | 贡献者名单（`name`/`contribution`/`url`/`avatar_url`/`color`） |
| `directory.payload` / `directory.sig` | **可选**。[签名节点目录](#签名节点目录)；字段缺省 = 不下发，客户端按旧逻辑回退 `API_HOST` |

### 服务端：三类「不放行」分支

```mermaid
flowchart TB
    REQ["/client/init"] --> SIG{签名/渠道<br/>校验}
    SIG -->|不过| F403["403 signature/channel_rejected<br/>（这两个是 4xx）"]
    SIG -->|过| BAN{设备封禁?}
    BAN -->|是| RB["200 {banned:true, ban_reason, expire_time}"]
    BAN -->|否| VER{版本在<br/>allowed_versions?}
    VER -->|否| RF["200 {force_update:true, update_url_*}"]
    VER -->|是| OK["200 完整握手响应 + access_token"]

    style RB fill:#ffd43b
    style RF fill:#ffd43b
    style OK fill:#51cf66
```

**为什么封禁 / 版本闸门是 HTTP 200 而非 4xx？**
客户端的 `Net.postJson` 在 HTTP ≥ 400 时会抛 `IOException`，拿不到 body。如果用 403
返回封禁，客户端就读不到 `ban_reason` 和 update URL。所以这两类「业务拒绝」用 200 +
顶层 flag 表达，只有签名 / 渠道这种「协议级拒绝」才用 4xx。

### 服务端：空值处理是省略而非 null

::: danger 绝不发送 JSON null
所有可选**字符串**字段未设置时**必须省略 key**。Android `org.json` 的 `optString` 对显式
`null` 会返回字符串 `"null"`，导致客户端拿到字面量 `"null"` 当成有效值。
:::

实现上用 `putIfNonEmpty`（字符串非空才写）和 `putIfNonZero`（整数非 0 才写）。
bool 字段不受此约束（`false` 是合法业务值）。

### `services` 同时是客户端 WebView 的信任锚

`services.game_server_host` 与 `services.proxy_backends[]` 除了给 native 层做端点重写，
还被客户端 `WebViewInterceptor` 当作 **WebView 来源闸的唯一受信任来源清单**。

客户端 1.2.0 起，WebView 的三项能力——本地文件供给（A 类汉化）、GET 缓存注入、
`CnvBridge` 注入——只对这两个字段所列 host 开放。原因：`addJavascriptInterface` 的作用域
是**整个 WebView 而非单个页面**，不设闸时该 WebView 一旦导航到任意第三方来源，那个页面
就能调 `CnvBridge.loadAllState()` 拖走玩家全部缓存状态。

::: danger 两者都不配 = 客户端汉化与存档回放静默失效
信任列表为空时客户端把**所有**来源判为不受信，B/C 类汉化与状态捕获/回放全部关闭，
而 HTTP 层一切正常、无任何报错——症状离原因很远。

服务端 `getServicesConfig` 会在两者皆空时打一条 `slog.Warn` 作为线索（只打一次）。
部署时务必至少配置其一。
:::

**形态约定**（客户端两种都能吃，但服务端保持现有归一化不要改）：

| 字段 | 服务端下发形态 |
|---|---|
| `game_server_host` | **纯 host**，无 scheme / 路径 / 尾斜杠（`normalizeGameServerHost` 归一化，兼容老配置里的完整 URL） |
| `game_server_base` | **完整 base URL，含路径**（`normalizeGameServerBase`：补协议、去尾斜杠、**保留路径**） |
| `proxy_backends[]` | **完整 URL**，含协议、不带尾斜杠 |
| `game_max_threads` | 整数；0 或缺省 = 不下发 |
| `resource_base` | 上游**资源**基址；与上面两个 API 字段严格区分 |

### 客户端：handleCloudInit() 处理顺序

::: tip 这一段描述的是**已归档的 APK 客户端**
保留作实现参考——处理顺序本身(先判封禁、再判强更、最后才碰业务字段)是合理的,
新客户端可以照这个骨架来。但末尾那两步涉及已删除的字段。
:::

最多重试 3 次，指数退避 `1000 << (attempt-1)`；3 次全失败 → `OfflineModeManager.activate()`
返回 false。成功后把 `access_token` 存 `cnv_account/session_token`，然后依次处理：

```
封禁 → force_update（弹应用内更新）→ maintenance/error
→ allowed_versions 版本闸门 → latestVersion 软更新提示 → Spoof.set
→ ProxyBackends.set/setGameServerHost → NodeDirectory.ingest（验签+激活目录）
→ 填充贡献者 → 写功能开关字段
```

最后一步在 APK 时代还有一条「`online_download` 与 `offline_package` 两功能均关时
按维护处理」——那两个开关已随整包分发面删除。现在功能开关只剩 `account_enabled`。

握手开始前会先 `NodeDirectory.load()` 从持久化恢复目录与防回滚地板（重新验签）；
首个 `/client/init` 走 `API_HOST` 锚点、**不**参与路由。

## 三道更新闸门

`client` 对象里有三种「催更新」机制，优先级与行为各不同：

| 机制 | 字段 | 行为 | 优先级 |
|---|---|---|---|
| 强制更新 | `force_update:true` + `update_url_*` | 版本被拒，必须更新或退出 | 高（握手中先判） |
| 版本白名单 | `allowed_versions` | 当前版本不在列表 → 强制更新 | 高 |
| **软提示** | `latest_version` | 按渠道提示，可「暂不更新」 | 低（软） |

软提示按渠道有不同策略：

- **正式版（`normal`）**：仅当 `latest_version` 的 **major.minor** 高于当前才提示。
  补丁号变化（4.0.0→4.0.5）不打扰。
- **内测版（`internal-test`）**：任意版本位升高即提示（含补丁号）。

过滤完全在客户端做，服务端只需告诉它「最新版本号是多少」。
详见[版本闸门与软提示](/security/version-gates)与[启动引导](/client/bootstrap#更新渠道与软更新提示)。

## 签名节点目录

服务端可在 `/client/init` 响应里下发一份**用离线 Ed25519 私钥签名的节点表**。客户端用
钉死在 APK 里的根公钥（`CloudEndpoint.DIRECTORY_PUBKEY`）验签后，按每个节点声明的能力
`caps` 决定「哪类请求发给哪个节点」。客户端实现见 `NodeDirectory` + `Ed25519Verify`，
服务端实现见 `internal/directory/directory.go`。

::: tip 信任模型：钉公钥，不钉地址
地址是可变数据，信任建立在「离线私钥的签名」上。攻击者能返回任意字节，但没有私钥就签不出
合法目录 → 客户端拒绝。即便流量被导向某个只有 `resource` 能力的边缘节点，客户端也**不会**
把登录/账号/存档凭证发过去（该节点无对应能力）——凭证类请求被锁在被授权的业务节点上。
:::

### 线格式（JWS 风格透传 payload）

```jsonc
"directory": {
  "payload": "<base64url(UTF-8 紧凑JSON)，无 = 填充>",
  "sig":     "<standard_base64(Ed25519_sign(私钥, payload 字符串的 UTF-8 字节))>"
}
```

`payload` base64url 解码后的 JSON：

```jsonc
{
  "seq": 7,                  // int64，单调递增，防回滚
  "issued_at": 1735660800,   // 签发时间（Unix 秒，信息性）
  "expires_at": 1735833600,  // 过期时间（Unix 秒）；now > expires_at 即作废
  "nodes": [
    { "id": "biz-tokyo-01", "role": "business",
      "api": "https://api.magi-reco.top",
      "caps": ["init","login","account","save"], "region": "ap-northeast-1", "weight": 100 },
    { "id": "edge-hk-01", "role": "edge",
      "api": "https://cdn-hk.magi-reco.top", "caps": ["resource"], "weight": 80 }
  ]
}
```

::: warning 签名覆盖的是 payload 字符串本身
服务端对 **base64url 后的 `payload` 字符串的 UTF-8 字节**做 Ed25519 签名；客户端对**收到的
payload 字符串字节**直接验签，验过再 base64url 解码取 JSON。**无需重序列化**，彻底规避
跨语言紧凑序列化的字节对齐问题。

```go
inner, _ := json.Marshal(dir)
payload  := base64.RawURLEncoding.EncodeToString(inner)
sig      := ed25519.Sign(priv, []byte(payload))
```
:::

### 客户端校验顺序（`NodeDirectory.ingest`）

任一步失败即丢弃整份，保留旧缓存 / 回退内置地址：

1. **Ed25519 验签**（根公钥）——失败丢弃；
2. **防回滚** `seq ≥ 本地记住的最大值`——否则丢弃（合法签名的更高 seq 会抬高地板并持久化）；
3. **未过期** `now ≤ expires_at`——否则不激活，等待刷新；
4. 通过 → 替换内存目录并落盘（`cnv_node_directory`：`max_seq`/`payload`/`sig`），
   下次启动 `load()` 时重新验签恢复（防本地文件篡改）。

::: tip 未注入根公钥 = 安全回退
本地 / 未注入 `CNV_DIRECTORY_PUBKEY` 的构建**无法验证**目录 → 一律忽略目录、回退
`API_HOST`（而非「跳过校验直接信任」）。
:::

### 目录签名的标量必须规范（`S < L`）

客户端 `Ed25519Verify` 按 RFC 8032 §5.1.7 拒绝 `S >= L` 的签名，消除签名可延展性——否则
任何人无需私钥即可由一个合法签名构造出 `S' = S + L` 的另一个合法签名，而目录的
`(payload, sig)` 会被客户端落盘、下次启动重新验签。

Go 的 `crypto/ed25519` 本就只产出规范 `S`，服务端当前实现无需改动；`internal/directory`
已加回归测试 `TestDirectory_SignatureScalarIsCanonical` 钉住这条跨端契约，防止将来换签名
实现（自研 / HSM / 第三方库）时产出非规范签名而不自知——那会导致已发布客户端集体拒绝目录、
退回 `API_HOST`。

### 按 caps 路由

| 请求 | 路由到含此 cap、`weight` 最大的节点（无则回退 `API_HOST`） |
|---|---|
| `/client/init` 握手 | （锚点，固定 `API_HOST`，不路由） |
| `/client/heartbeat` | `init`（业务节点） |
| `/account/login` | `login` |
| `/account/save/get`·`/account/save/put` | `save` |
| 资产清单与文件下载 | `resource`（边缘节点，见[边缘 resource 节点分发面](#边缘-resource-节点分发面)） |

**能力分配是安全关键**：业务节点 `caps` 为 `["init","login","account","save"]`，
边缘节点**仅** `["resource"]`。凭证类请求（login/account/save）绝不能指向只有
`resource` 能力的节点。

## 上游 Totentanz 端点发现

上游 Totentanz 不把后端地址写死在客户端里，而是提供一个引导端点换取地址：

```
POST https://<引导端点>/magica/api/snaa
Content-Type: application/json; charset=utf-8
{"version": 128}

→ {"message":"snaa","status":200,
   "response":{"endpoint":"https://xxx.example/en","max_threads":19,"version":128}}
```

原客户端由 `libuwasa` + `RestClient` 完成这件事，本项目已移除那一层，改由**服务端代劳**
（`internal/totentanz`）：后台周期拉取，结果经 `services` 下发。这样上游换后端时客户端一行
代码都不用改，地址变更也能在我们这一侧被观测到（日志里会打「Totentanz 上游端点/版本已变更」）。

::: danger 这个 `endpoint` 是**资源基址**，不是游戏 API 地址
逆向 libuwasa 可以确认它的用途只有资源：

- libuwasa **只 hook 了 `UrlConfig::resource`**（外加两个音频/连接数性能 hook），
  **没有** hook 任何 API 相关函数；
- 它内部的 endpoint type 共三个，全是资源路径：`/magica/resource`、
  `/download/asset/master`、`/resource/scenario`；
- 上游给的域名本身就叫 `ttz`**`strg`**（totentanz **storage**）。

因此发现结果只填 `services.resource_base`，**不碰** `game_server_host` / `game_server_base`
（那是游戏 API 语义，native 层拿它做 setURI 匹配与代理耗尽后的回退目标）。把资源 CDN 填进
API 字段，会让代理全挂时的 API 请求打到一台只服务静态文件的机器上。
:::

::: warning 游戏 API 的真实域名在 APK 里静态不存在
引擎 `UrlConfig::Impl::setUrl()` 只硬编码**路径**（`/magica/api/user/login`、
`/magica/api/system/native/getDomainPath`、`/chat/*` 等），`setServer(DomainType)` 与
`loadDefault()` **没有任何字符串引用**；`assets/` 与 `res/values` 里也没有。域名是纯运行时
获取的（`SelectURLGetResourceListState` 接受 `map<DomainType, vector<string>>` 那套多线路
选择）。

因此离线模式（服务端不可达）下**无法自主推断** API 地址，只能用与底包配套的
`FALLBACK_GAME_SERVER_HOST`。
:::

::: tip 上游不可控，这条链路只增强不削弱
- 拉取只在**后台**进行，绝不放在 `/client/init` 请求路径上——上游一慢，我们的握手不能跟着慢；
- 拉取失败**保留上次成功的结果**（stale-while-error），不清空；
- 从未成功过时完全沿用 KV 配置值，等于该功能未启用。

客户端侧的 `TotentanzDiscovery` 保留作查询资源基址之用，对上游**只读不信**：任何异常都
安静返回 `null`。上游挂掉最坏情况是「地址不再自动跟随」，不会让握手出任何问题。
:::

上游那套 API 本身的形状（205 个端点）见[上游游戏后端 API 清单](/protocol/upstream-api)。

## `asset_auth`:取资产的钥匙

`/client/init` 在握手响应里下发一枚**短时资产凭证**,客户端拿它当 Bearer 令牌
直接向边缘节点索取文件。

```json
"asset_auth": { "type": "bearer", "token": "cnva1.<设备>.<时间桶>.<MAC>", "expires_at": 1785090420 }
```

`type` 是**判别字段**,其余字段的形状由它决定;当前唯一取值 `bearer`。
`expires_at` 是 **Unix 秒**。

::: tip 它和 `access_token` 是两把不同的钥匙
`access_token` 证明"这个设备是谁",生命周期以天计;`asset_auth.token` 只证明
"可以读资产",生命周期以分钟计。

**刻意不让边缘节点拿到 `access_token`**:边缘节点是信任树里最外一层(小时级证书,
可能是第三方镜像),把身份凭证交给它,等于每取一个文件就把身份泄露一次。拆成两把
之后,边缘节点最多知道"某个设备正在取文件"。
:::

### 令牌对客户端不透明

客户端**只负责原样放进 `Authorization: Bearer`**——不解析、不缓存派生值、不自己
重算。下面的内部结构写在这里是给服务端两侧看的(签发在 API/业务节点、校验在边缘
节点,两边必须字节级一致),不是给客户端解析用的。

```
cnva1.<base64url(device_id)>.<时间桶>.<base64url(HMAC-SHA256)>
```

- MAC 覆盖前三段拼成的字符串(**含 `cnva1.` 前缀**),与 `access_token` 同一条纪律:
  版本前缀签进去,将来出 `cnva2` 时不能把新载荷搬到旧前缀下复用签名;
- 令牌**自描述**:校验方从令牌本身取回 `device_id`,不必让客户端额外送一个头,
  也不必让边缘节点连数据库;
- 时间桶 = `unix秒 / 窗口`,窗口由 `CNV_RESOURCE_TOKEN_WINDOW_SEC` 决定(默认 300);
- 校验方接受**当前桶与上一个桶**两格——只认当前桶的话,签发方与校验方之间哪怕
  几秒的时钟差,都会让恰好在桶边界签出的令牌当场失效,而这类失败在日志里看起来
  就是随机的、无法复现的 401。

::: danger 签发方与校验方的窗口值必须一致
桶号是 `unix秒/窗口` 算出来的。两边窗口不一致就会算出不同的桶,结果是**每个资产
请求都 401**——而错误信息只会说"令牌签名校验失败",完全指不到这里。业务节点与它
下面所有边缘节点要一起改。

实现在 `internal/resourceauth`,该包在 API 服务端与资源分发服务端各有一份**完全
相同的拷贝**(两个仓库不共享 Go module)。两边的测试里各钉了一枚跨仓库测试向量,
谁单方面改了算法,测试当场红。
:::

### 缺省 = 拿不到资产,不是不需要鉴权

**`asset_auth` 整个缺省时,客户端必须视为"当前无法取用资产"并明确失败**,
不得改为不带鉴权直接请求边缘节点。

服务端侧据此 fail-closed:签名密钥未配置或过短(< 16 字节)时**不下发
`asset_auth`**,而不是用弱密钥算一个令牌。空密钥的 HMAC 照样能算出"看起来正常"的
令牌,而那个令牌任何人都能自己算出来。

> 安全机制的默认值必须落在"失效时拒绝服务"那一侧。把缺省定义成"边缘节点当前不
> 要求鉴权",意味着**任何让服务端签不出凭据的故障**都会在客户端表现为"那就不用
> 鉴权了"——而且没有任何症状:客户端照常拿到资产、日志里一切正常,只有鉴权悄悄
> 没了。

## 边缘 resource 节点分发面

客户端拿 `asset_auth.token` 直接向边缘节点要文件。这条路径三件事:

```
Authorization: Bearer <asset_auth.token>   每个请求都要,只认这个头
GET  <base>/                               S3 风格 ListBucketResult XML 清单
GET  <base>/<key>                          按 key 取文件,支持 HTTP Range
```

服务端实现在 `internal/api/resource`(校验用 `internal/resourceauth`)。
`<base>` 默认 `/res`,由 `CNV_PRIMARY_RES_PATH` 决定。

::: warning 令牌只认 `Authorization` 头,不认查询串
进了 URL 就会进访问日志、Referer、浏览器历史,而这类泄漏事后无从追溯。
:::

### 清单

对 `<base>/` 或任意目录 GET,返回 S3 `ListBucketResult` XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>assets</Name>
  <Prefix>scenario/</Prefix>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>scenario/main_chapter_8.dat</Key>
    <LastModified>2026-08-01T00:00:00.000Z</LastModified>
    <Size>1048576</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>
```

支持的查询参数(与 S3 同义):

| 参数 | 说明 |
|---|---|
| `prefix` | 只列以此开头的 key |
| `marker` | 续页锚点,取上一页的 `NextMarker`;**严格大于**才收,不会重复 |
| `max-keys` | 单页上限,默认 1000,**硬上限 5000** |

::: tip 刻意不发 `ETag`
S3 的 `ETag` 是文件 MD5。为了一次清单去读完整棵资产树算摘要,代价与收益完全不成
比例;但也不能编一个——客户端会拿它做完整性判断。宁可不给。需要校验时用单文件的
sha256 契约,不走这里。
:::

::: warning 截断如实上报
key 数超过 `max-keys` 时 `IsTruncated=true` 并给出 `NextMarker`。谎报 `false` 会让
客户端以为资产就这么多,少下的那些要到运行时才暴露。
:::

### 取文件

按 key 取,支持 HTTP Range(客户端用单线程续传 + 多线程分片),由
`http.ServeContent` 处理,因此 `If-Modified-Since`、206 应答、后缀范围
(`bytes=-N`)、越界钳制都是标准行为。

::: tip 目录穿越用 `os.Root` 挡,不是自己查 `..`
手写检查挡得住 `../`,挡不住指向资源根目录外的**符号链接**,而后者恰恰是这类漏洞
的常见形态。`os.Root` 在系统调用层面拒绝逃逸,不依赖我们把每种写法都想全。两种
情形都有回归测试。
:::

### 限流

按**已验签令牌里的设备**计,默认每分钟 600 次。中间件顺序是**先验令牌再限流**——
反过来的话未鉴权请求也占配额,任何人都能凭空把某个设备的额度耗光。

按设备而非按 IP:同一出口 IP 后面可能是整个校园网,按 IP 会让他们互相拖累;而设备
是令牌签过的,伪造不了。

## 现役端点:`/client/heartbeat`

每 5 秒上报一次。body = 鉴权三件套。

响应 `action`:

| action | 时机 | 含义 |
|---|---|---|
| `ok` | 常态 | 继续 |
| `maintenance` | 服务器维护 | 顶层带 `message` / `end_time` |
| `ban` | 运行中被封 | 顶层 `reason` / `expire_time`,客户端会**本地持久化**封禁 |

心跳只回答一件事:**这个设备还活着**。它是保活、封禁下发与维护通知的通道,
管理后台的「在线设备」页也读它。

::: warning `files[]` 与 `switch_mirrors` 已删除
请求体的 `files[]`(逐文件下载进度)与响应的 `switch_mirrors`(管理员入队的换线
指令)随 APK 整包分发面一并去掉,由 `files[]` 聚合出的 `progress` / `speed_bps` /
`current_file` 也不再存在。

网页端按需逐个取资产,不存在"整体下载进度"这个概念,也就没有可换的线。
管理后台 `/admin/heartbeats` 现在只下发 `device_id` 与 `last_heartbeat`。
:::

## 协议记录:已删除的 APK 整包分发面

::: danger 以下四节是历史记录,不是现役契约
这些端点**已从服务端删除**。保留描述是为了说明 Android 专有 API 曾经长什么样,
便于理解旧客户端代码与旧数据库表。**不要照着它们实现任何新东西。**
:::

### ~~`/client/online-download`~~(已删除)

body = 鉴权三件套。响应:

```json
{
  "success": true,
  "resource_token": "HMAC 短时签名",
  "groups": [
    { "name": "线路A", "mirrors": [ {"url": "...", "files": [{"key":"...","size":1024}]} ] },
    { "name": "主节点本地", "mirrors": ["https://.../res"] }
  ]
}
```

- `resource_token`——S3/CDN 资源令牌,与会话令牌独立(现由 `asset_auth` 承担);
- `groups[]`:每组 `name` + `mirrors[]`,mirror 可为字符串或 `{url, files[]}`,
  file 可为字符串或 `{key, size}`;
- 旧格式平铺 `mirrors[]` 字符串数组,客户端包装为单组「默认线路」;
- mirror 无内联 `files` 时,客户端 GET 该根 URL 期望得到标准 S3 `ListBucketResult` XML。

服务端三个来源按优先级拼接:管理后台镜像组 → 主节点本地 → 活跃副节点。镜像组、
日流量限额与速度上限存在 `mirrors` / `mirror_groups` / `mirror_traffic` 三张表——
这些表已由 `0005` 迁移删除。

### ~~`/client/offline-package`~~(已删除)

body = 鉴权三件套。

```json
{ "success": true, "download_url": "...", "package_version": "20250501", "sha256": "...", "size": 4096 }
```

字段名是 `sha256` 不是 `md5`(部分历史注释写错了,以当时的客户端解析代码为准)。
配套的打包器 `internal/packer` 与 `offline_package` 表已一并删除。

### ~~`/client/hot-update`~~(已删除)

body = 鉴权三件套。

```json
{
  "success": true,
  "js":       { "version": 42, "sha256": "...", "download_url": "...", "size": 999 },
  "scenario": { "version": 23, "sha256": "...", "download_url": "...", "size": 888 }
}
```

`version` 为 int,`size` 客户端默认 -1。配套的 `hot_bundles` 表与管理后台热更新页
已一并删除。

### ~~`/client/method-select`~~(已删除)

body = 鉴权三件套 + `method`(`online` / `offline`)。客户端忽略响应,仅用于上报玩家
选择的下载方式。网页端没有"选下载方式"这一步,该端点自然消失。

## 客户端侧的 S3 清单解析

APK 客户端 `S3List` 用纯正则解析 `ListBucketResult` XML(不依赖 SAX/DOM):`CONTENTS`
正则抓每个 `<Contents>` 块,块内 `KEY` / `SIZE` 正则取 `<Key>` / `<Size>`。`parse()`
返回 `List<Entry>`(key + size,size 解析失败为 -1),输入空 / 无块返回空 list,
不抛异常。

这段实现是 APK 时代的产物,但**服务端这一侧的契约没变**:边缘节点仍然提供标准
`ListBucketResult` XML(见[边缘 resource 节点分发面](#边缘-resource-节点分发面))。
写新客户端时按那一节的形状实现即可,不必照抄这里的正则做法。

## 字段真理的来源

现役契约的真理在**服务端实现与它的保真测试**里(APK 已归档,不再是仲裁者):

| 现役端点 | 服务端实现 | 保真测试 |
|---|---|---|
| `/client/init` | `internal/api/client/handlers.go` + `state.go` | `protocol_test.go` |
| `/client/heartbeat` | 同上 | 同上 |
| 边缘分发面 | `internal/api/resource` + `internal/resourceauth` | 各自的 `_test.go` |

历史对照(APK 客户端 Java 文件 ↔ 已删除的端点):

| 客户端 Java 文件 | 对应服务端端点 |
|---|---|
| `ClientInit.java` | `/init`、~~`/online-download`~~、~~`/offline-package`~~、~~`/hot-update`~~、`authTriple()` |
| `ResourceFlow.java` | `/heartbeat`(ban / ~~switch_mirrors~~) |
| `SaveSyncHelper.java` | `/account/save/{put,get}`(已移交 API 服务端) |
