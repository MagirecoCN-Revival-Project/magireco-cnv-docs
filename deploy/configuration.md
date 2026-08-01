# 环境变量参考

所有运行时配置都走 `CNV_*` 环境变量，**不读配置文件、不硬编码敏感值**。本页是完整速查。

加载逻辑见 `internal/config/config.go`。带 ⭐ 的是必填；带 🔒 的与安全强相关，生产务必正确设置。

## 通用（节点与面板共用）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_ADDR` | `:8080`（节点）/ `:8090`（面板） | HTTP 监听地址 |
| `CNV_TLS_CERT` / `CNV_TLS_KEY` | — | 进程内 TLS 证书/私钥；两者都设才启用 HTTPS |
| `CNV_TRUST_PROXY` 🔒 | — | 是否解析 `X-Forwarded-For`/`X-Real-IP`。详见下文 |
| `CNV_SKIP_MIGRATE` | `false` | 设 `1` 时跳过启动时的自动迁移 |

## 节点（`magireco-node`）

### 角色与通用

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_NODE_ROLE` | `business` | 节点角色：`business`（全功能）或 `edge`（仅资源） |
| `CNV_NODE_ID` | hostname | 节点唯一标识，用于管控通道身份上报 |
| `CNV_NODE_KEY_FILE` | `./data/node.key` | 节点自持密钥文件路径。首次启动自动生成，管理员将密钥复制到面板注册表 |
| `CNV_CONTROL_ADDR` | `127.0.0.1:9090` | 管控 WS 监听地址（面板拨号到此）。**跨机部署时改为 `:9090` 并用防火墙限制** |
| `CNV_PUBLIC_URL` | — | 节点对外基准 URL，用于拼接资源地址 |

### 业务节点专用（`CNV_NODE_ROLE=business`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_DB_URL` ⭐ | — | 数据库连接串，按前缀识别驱动。见 [选择数据库](/deploy/database) |
| `CNV_ADMIN_JWT_SECRET` ⭐🔒 | — | 管理后台 cookie 完整性密钥，**≥16 字符** |
| `CNV_RESOURCE_TOKEN_SECRET` | — | 资产令牌（`asset_auth`）的 HMAC 签名根密钥，≥ 16 字节。**业务节点**不设则首次启动自动生成并持久化（写入 `config` 表 `resource_token_secret`，重启复用）；**边缘节点没有数据库，必须显式配置**，且与业务节点一致 |
| `CNV_PANEL_PUBLIC_URL` | — | 面板对外 URL（如 `https://panel.example.com`）。设置后：客户端入口页 `/account/register`、`/account/forgot`、`/account/verify-email` **302 跳转到面板**；并作为 **CORS 放行来源**，允许面板托管的前端跨域直连本节点 API。**留空**=单机回落：节点本地托管入口页（零跨域）。见 [节点与面板](/deploy/nodes#面板托管前端与跨域直连) |
| `CNV_WEB_DIR` | `./web` | 前端静态目录。**面板**用它托管全部人类前端（登录/注册/管理后台/用户中心）；**业务节点**仅在未接入面板（`CNV_PANEL_PUBLIC_URL` 留空）时回落用它服务客户端入口页 |
| `CNV_DIRECTORY_FILE` | — | 已签名节点目录 JSON 文件路径；设置后随 `/client/init` 下发给客户端。**节点启动时会自检**：文件读不到、不是合法 `{payload,sig}`、或能力分配违规（如边缘节点持有 `save`）一律**拒绝启动**（退出码 2）；已过期只告警仍启动。详见 [多节点架构 · 节点启动自检](/server/multi-node#节点启动自检-cnv-directory-file) |
| `CNV_TOTENTANZ_DISCOVERY_URL` | — | 上游 Totentanz 端点发现接口的完整 URL(形如 `https://<引导端点>/magica/api/snaa`)。设置后服务端会后台周期拉取真实游戏后端地址,经 `services.game_server_base` / `game_server_host` / `game_max_threads` 下发给客户端。空 = 不启用,完全沿用 KV 配置。详见 [客户端协议 · 上游端点发现](/protocol/client-server) |
| `CNV_TOTENTANZ_CLIENT_VERSION` | `0` | 向发现接口上报的版本号,对应底包的 `rNNN`(如 128) |
| `CNV_TOTENTANZ_REFRESH_SEC` | `300` | 发现结果的后台刷新间隔(秒) |

### 安全闸门 🔒

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_SIGNATURE_WHITELIST` 🔒 | — | APK 签名证书 SHA-256 白名单（64 位小写 hex，逗号分隔）。为空时放行所有签名并打 WARN |
| `CNV_REQUIRE_SIGNATURE` 🔒 | `false` | `true` 时强制 `/client/init` 必须带非空 signature |
| `CNV_CHANNEL_WHITELIST` | — | 渠道白名单，空=放行所有。常用 `normal,internal-test` |

> **自动封禁**没有环境变量：启用开关与各路阈值都存 `config` 表，在后台「设备封禁」页运行时调整（改完即时生效，无需重启），见 [限流与防爆破 · 自动封禁](/security/rate-limiting#自动封禁)。

### `CNV_TRUST_PROXY` 取值

| 取值 | 含义 |
|---|---|
| 空 / `off` / `false` | 不信任任何转发头，只用 TCP 对端（默认，最安全） |
| `all` / `true` / `*` | 信任所有上游（仅在确有可信前置网关时） |
| `loopback` | 信任 `127.0.0.0/8` 与 `::1` |
| CIDR 列表 | 仅信任列出的网段，如 `10.0.0.0/8,192.168.0.0/16` |

### 会话有效期

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_CLIENT_SESSION_TTL` | `7d` | `/client/init` 签发的 access_token 有效期 |
| `CNV_CLIENT_TOKEN_ISSUER` | 取 `CNV_NODE_ID` | 本节点签发会话令牌时写进 `iss` 的标识。校验方按它挑公钥，同一部署内须稳定唯一 |
| `CNV_CLIENT_TOKEN_SEED` | 自动生成并持久化 | 会话令牌签名私钥种子（32 字节十六进制）。留空则首次启动自动生成、存进 config 表。**这把钥匙必须在线**，与离线的目录私钥/根 CA 私钥是不同的钥匙，不可复用 |
| `CNV_CLIENT_TOKEN_TRUSTED_KEYS` | — | 额外信任的签发方公钥，`标识:公钥hex,标识:公钥hex`。配了即进入**联邦模式**：本节点接受 API 服务端签发的身份，自己不再是身份的唯一来源 |
| `CNV_PKI_ANCHORS` | — | 钉住的[根证书](/security/node-pki)文件，逗号分隔。**可配多把**——根轮换的重叠期要同时信任现用与下一把，只配一把的话轮换那天所有旧链一起失效 |
| `CNV_PKI_CERT` | — | 本节点证书文件 |
| `CNV_PKI_CHAIN` | — | 中间证书，自底向上、不含根，逗号分隔。由根直签的子 CA 留空；边缘节点须填上级那张 |
| `CNV_PKI_KEY` | `./data/pki.key` | 本节点身份私钥种子，由 `node emit-csr` 生成。**绝不外传** |
| `CNV_ADMIN_SESSION_TTL` | `7d` | 管理员 cookie 有效期 |

时长可写秒数（纯数字）或 Go duration（如 `720h`、`30m`）。

::: tip 这两组变量在 API 服务端上同名同义，但取值该反过来
`CNV_CLIENT_TOKEN_*` 与 `CNV_PKI_*` 两组在两个服务端上是同一套实现，差别在部署里的角色：

| | API 服务端 | 资源分发服务端 |
|---|---|---|
| `CNV_CLIENT_TOKEN_SEED` | **必须有**——它是身份源头，签出的令牌下游只验签 | 独立部署时自签自认；接上 API 服务端后仍会签自己那份 |
| `CNV_CLIENT_TOKEN_TRUSTED_KEYS` | 通常留空 | 填 API 服务端的公钥 |
| PKI 角色 | 固定 `api`，**不看** `CNV_NODE_ROLE` | 由 `CNV_NODE_ROLE` 翻译：`business`→`resource`、`edge`→`edge` |

角色不是配出来的，是**写在证书里**的：进程启动时会拿证书里的 `role` 跟自己该是的角色对一遍，对不上直接拒绝启动。这条自检是三项里唯一可能长期无症状的一项——角色配反不会报错，只会安静地让一台本该只发资源的机器收下凭证类请求。
:::

### 资产分发

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_PRIMARY_RES_DIR` | — | 本地资源目录（业务/边缘节点均可设）。空 = 本节点不提供资产分发 |
| `CNV_SECONDARY_RES_DIR` | `$CNV_PRIMARY_RES_DIR` | 边缘节点资源目录（优先级高于 `CNV_PRIMARY_RES_DIR`） |
| `CNV_PRIMARY_RES_PATH` | `/res` | 资产对外 URL 前缀（清单与文件都挂在它下面） |
| `CNV_RESOURCE_TOKEN_WINDOW_SEC` | `300` | 资产令牌的时间桶长度（秒）。**签发方与校验方必须配成同一个值**，见下方警告 |
| `CNV_BODY_LIMIT_MB` | `8` | 全局请求体大小上限初值（MiB）；管理后台「服务器控制 → 上限」可运行时调整，无需重启 |

::: danger 边缘节点必须配 `CNV_RESOURCE_TOKEN_SECRET`
边缘节点没有数据库,密钥**只能来自环境变量**——它不像业务节点那样能在 `config` 表里
自动生成一把。配漏了的表现是每个资产请求都 401(fail-closed),但那要等客户端来了
才暴露,所以节点启动时会先明确报一次错。

密钥要求 ≥ 16 字节,且业务节点与它下面所有边缘节点**必须一致**。
:::

::: danger `CNV_RESOURCE_TOKEN_WINDOW_SEC` 两边必须一致
时间桶 = `unix秒 / 窗口`。两边窗口不一致就会算出不同的桶,结果是**每个资产请求都
401**——而错误信息只会说"令牌签名校验失败",完全指不到这里。

签发方包括 API 服务端(它下发 `asset_auth`)与业务节点;校验方是所有边缘节点。
改的时候一起改。
:::

::: warning 离线整包与热更新的配置项已删除(2026-08)
`CNV_OFFLINE_DIR`、`CNV_OFFLINE_URL_PATH`、`CNV_HOTUPDATE_DIR`、
`CNV_HOTUPDATE_URL_PATH`、`CNV_HOTUPDATE_MAX_MB` 五项随 APK 整包分发面一并删除,
设了也不再有任何效果(节点不会报错,只是忽略)。升级后可以从部署脚本里清掉。

对应的端点、打包器与数据表见
[协议记录:已删除的 APK 整包分发面](/protocol/client-server#协议记录-已删除的-apk-整包分发面)。
:::

### SMTP 邮件

::: warning 已移交 API 服务端
`CNV_SMTP_*` 与 `CNV_ACCOUNT_SESSION_TTL` 已从本服务端**移除**——账号系统整体归 API 后端，
资源分发服务端不再发任何邮件、也不再持有玩家会话。这些变量请配在 API 服务端上。
:::

## 面板（`magireco-panel`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_PANEL_KEY` ⭐🔒 | — | 面板 cookie HMAC 签名密钥，**≥16 字符** |
| `CNV_PANEL_DB_FILE` | `./data/panel.db` | 面板本地 SQLite 路径（节点注册表 + 面板管理员） |
| `CNV_WEB_DIR` | `./web` | 面板托管的游戏前端静态目录（与业务节点同一套 `web/`）。存在即托管；缺失时根路径回落到内置节点状态页 |
| `CNV_ADDR` | `:8090` | 面板 HTTP 监听地址（面板默认改为 8090） |
| <span id="cnv_node_bin">`CNV_NODE_BIN`</span> | — | 安装向导第 4 步勾"本机也装业务节点"时找的 `magireco-node` 二进制路径。**默认**：面板自身二进制所在目录的 `magireco-node`(Windows 是 `.exe`)。设此变量为绝对路径可覆盖；版本必须与面板**字符串严格相等**才放过 |

## 校验规则

启动时会校验：

- **业务节点**（`MustValidateNode`）：`CNV_DB_URL` 必填；`CNV_ADMIN_JWT_SECRET` 必须 ≥16 字符。
- **边缘节点**（`MustValidateNode`，`CNV_NODE_ROLE=edge`）：无强制必填，但需有资源目录。
- **面板**（`MustValidatePanel`）：`CNV_PANEL_KEY` 必须 ≥16 字符。

校验不过直接 `exit(2)` 并打印缺什么。

## 生产推荐基线

```bash
# ── 业务节点 ──
export CNV_DB_URL='postgres://user:pass@db:5432/magireco?sslmode=require'
export CNV_ADMIN_JWT_SECRET="$(openssl rand -hex 32)"
export CNV_SIGNATURE_WHITELIST='<APK 签名 sha256>'
export CNV_REQUIRE_SIGNATURE=true
export CNV_CHANNEL_WHITELIST='normal,internal-test'
export CNV_TRUST_PROXY='loopback'
# 跨机管控时取消注释：
# export CNV_CONTROL_ADDR=:9090

# ── 面板 ──
export CNV_PANEL_KEY="$(openssl rand -hex 32)"
export CNV_ADDR=:8090
```

上生产前请对照 **[安全加固清单](/deploy/security-checklist)** 逐项确认。

## 向后兼容（已废弃变量）

以下变量已从代码中移除（不再读取），仅列出迁移去向：

| 废弃变量 | 替代方案 |
|---|---|
| `CNV_SECONDARY_SHARED_KEY` | 节点自持密钥，面板通过注册表管理 |
| `CNV_PRIMARY_URL` | 不再需要；面板通过注册表管理节点地址 |
| `CNV_HEARTBEAT_SEC` | 不再需要；管控 WS 长连接替代心跳 |
| `CNV_NODE_ROLE=primary` | 改为 `CNV_NODE_ROLE=business` |
| `CNV_NODE_ROLE=secondary` | 改为 `CNV_NODE_ROLE=edge` |

## API 服务端专有

以下配置项只属于 [API 服务端](https://github.com/MagirecoCN-Revival-Project/magirecocn-api-server)，
资源分发服务端没有它们。

| 变量 | 默认 | 说明 |
|---|---|---|
| `CNV_DEV_MODE` 🔒 | `false` | `true` 时允许下发协议的**开发期临时值**（📝 草案形状）。**生产必须为 false**，见下。当前无端点受管辖 |
| `CNV_SCENE_MANIFEST_FILE` | — | 场景资产清单文件路径。空 = 场景清单未启用，`/client/scene-manifest` 返回 503。**加载失败拒绝启动**，格式见[契约登记表 R5a](/protocol/contract-register#r5a-场景资产清单-✅) |
| `CNV_BOOTSTRAP_ENDPOINT` | — | Android 底包引导端点 `/magica/api/snaa` 下发的业务服务器地址。留空 = 不接管底包，该端点返回 503 |
| `CNV_BOOTSTRAP_MAX_THREADS` | `4` | 下发给底包的并发下载线程数建议值 |
| `CNV_BOOTSTRAP_VERSION` | `0` | 当前底包版本号（`r128` → `128`） |

### `CNV_DEV_MODE`：生产守卫 🔒

协议里有若干**开发期临时值**——待决项定稿前的占位形状，让客户端与服务端能先并行
开工。协议文档的「生产守卫」要求：**生产环境不得下发任何临时值**。这个开关就是
那道守卫在服务端侧的落点。

**当前没有任何端点受它管辖。** 原先管辖 `/client/scene-manifest`——清单的最小形状
（只含 `path`）是 R2 定稿前的临时值。R2 已于 2026-08 定稿（见
[契约登记表](/protocol/contract-register)），守卫随之撤除。

守卫留着不撤等于永久禁用一个已经定稿的功能，而且没人知道为什么——所以定稿的同时
必须把对应的守卫拆掉。开关本身保留:下一个 📝 草案形状还要用它。

::: danger 默认 false 是有意的
临时值的危险不在于它们存在，而在于**它们可能不被发现地留在生产里**。一个只含
`path` 的清单在生产里跑得好好的，直到某天需要靠内容哈希做缓存失效，才发现它
从来没有过。

忘了配这个变量的后果是**功能不可用（显眼）**，而不是临时值悄悄泄进生产（不显眼）。
:::

