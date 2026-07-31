# 上游游戏后端 API 清单

::: warning 这一页描述的不是本服务端
本仓库的服务端是**带认证的代理壳子**，真正的游戏后端（Totentanz / 官方 `magica` API）
不由我们掌控。本页记录的是**上游那套 API 的形状**，来源是社区留存的历史流量抓包。

它的用途只有一个：万一将来要自建游戏后端（而不是继续代理），这份清单就是规格基线。
本仓库现有的 `/client/*`、`/account/*` 契约与本页**完全无关**，不要混淆——
那些契约见 [客户端握手协议](/protocol/client-server)。
:::

## 数据来源与可信度

| 项 | 值 |
|---|---|
| 来源 | 社区公开发布的历史流量归档（`puella-historia.tsv.xz`，1.03 GB 压缩 / 86.4 GiB 明文） |
| 时间跨度 | 2024-06-05 — 2024-07-30 |
| 请求条数 | 293,217（另有 2,192 行字段数不符，计为 malformed 丢弃） |
| 独立设备 | 190 |
| 响应体总量 | 92.3 GB |
| 归一化端点 | 205 |

**这是一次性、不可再生的资料**：官方服务端已不可达，抓包没了就没了。所以本页与
`spec/upstream-api/` 的机器可读规格一并入库，而不是只活在某次分析的临时目录里。

### 归一化与隐私处理

- **路径归一化**：路径里嵌的 ID 会被折叠，否则端点清单会被稀释成几万条——
  UUID → `{uuid}`，纯数字段 → `{n}`，24 位以上 hex → `{hex}`。
  例：`/magica/api/friend/user/0127be0d-…` → `/magica/api/friend/user/{uuid}`。
- **入库的是结构不是数据**：`spec/upstream-api/` 里只有键路径、类型、数组长度区间、
  数值区间，以及**标识符型**短字符串的枚举值（`HEAL` / `CONNECT` / `RANK_1` 这类）。
  自由文本（台词、技能描述）一律不收集——它既不是 schema 的一部分，也会把玩家可
  关联的内容带进来。UUID 与 32 位 hex 显式排除在枚举之外（设备与会话标识长这样）。
- **原始响应体不入库**。抓包里含真实玩家的 `User-Id-…` / `Client-Session-Id`，
  完整响应体只在离线分析时用，仓库里不留。

## 端点分布：96% 的流量压在 93 个 `/page/*` 上

| 类别 | 端点数 | 调用数 | 流量 |
|---|---|---|---|
| `/magica/api/page/*` | 93 | 152,969 | **88.7 GB（96%）** |
| 其它 `/magica/api/*` | 111 | 119,476 | 3.4 GB（4%） |
| `/search/friend_search/_search`（Elasticsearch） | 1 | 20,772 | — |

`/page/*` 是"把渲染这个界面所需的**全部**状态一次性吐给我"的聚合端点。流量前几名：

| 端点 | 调用 | 平均响应 | 最大响应 |
|---|---|---|---|
| `page/SupportSelect` | 14,527 | 1.98 MB | 13.2 MB |
| `page/MyPage` | 4,882 | 2.54 MB | 7.2 MB |
| `page/ShopTop` | 528 | **10.1 MB** | 22.7 MB |
| `page/GachaHistory` | 38 | **31.2 MB** | **79.4 MB** |

::: danger 这是"存档单向膨胀"的根源
`/magica/api/quest/native/resume/check` 平均响应 5.3 MB、最大 13 MB。拆开一次
3.5 MB 的响应看：

```
userQuestBattleList   2,316,055 bytes   list[1730]   ← 每关通关记录，只增不减
userSectionList         403,192 bytes   list[376]
userCharaList           399,432 bytes   list[41]
userCardList            263,771 bytes   list[77]
```

每次续战检查都把 1,730 条关卡记录**整包重传**，没有分页也没有增量。玩得越久越大，
且这是**服务端侧**的设计，不只是客户端存储问题。

若将来自建后端，`/page/*` 这 93 个端点是唯一值得重新设计的地方——届时前端也由我们
自己写，可以改成分页 / 增量契约，不必继承这个包袱。
:::

## 战斗定义是**逐场下发**的

`/magica/api/quest/native/get`（24,116 次调用，平均 39 KB）返回的是**这一场解析完的**
战斗定义，而不是让客户端去查表：

```json
{"artId":200400401,"code":"HEAL",     "target":"CONNECT","sub":"HP",                   "effect":300,"growPoint":20}
{"artId":700218701,"code":"OTHER",    "target":"SELF",   "sub":"FORMATION_DEFENSE_UP","effect":100,"growPoint":0}
{"artId":200100601,"code":"RESURRECT","target":"ONE",                                  "effect":200,"growPoint":10}
```

响应顶层结构：

```
artList[]                 本场用得到的全部 art，数值已按等级解析完
magiaList[].artList       只是 artId 引用，如 [100300101, 200100601]
connectList[].artList     同上
waveList[].enemyList[]    每波敌人的 hpStart / mpStart / miniMagiaId
playerList[]              每个出战位的 cardId / hpStart / mpStart / magiaId
scenario, doppelList, memoriaList, formationJsonObjectList,
noDamagedEnemies, limitMp, isHalfSkill, canTripleSpeed, continuable
```

**含义**：客户端只跑状态机，所有数值由服务端算好推下来。自建后端必须**生成**这个
payload——它本质上是 master data（cards / pieces / enemies）的一次 join，不是开放式
逆向；而且有 24,116 份真实调用把 schema 钉死了。

`code` / `sub` / `target` 用的是与 master data 的 `verbCode` / `effectCode` / `targetId`
同一套**有界**词汇表。在全部 293k 行上聚合后（不是单次抓包的样本）实测：

| 字段 | 种类 | 取值 |
|---|---|---|
| `code` | 15 | `ATTACK` `BUFF` `BUFF_DIE` `BUFF_DYING` `BUFF_HPMAX` `BUFF_PARTY_DIE` `CONDITION_BAD` `CONDITION_GOOD` `DEBUFF` `ENCHANT` `HEAL` `IGNORE` `OTHER` `RESURRECT` `REVOKE` |
| `target` | 7 | `ALL` `CONNECT` `LIMITED` `ONE` `RANDOM5` `SELF` `TARGET` |
| `sub` | 60 | `ACCEL` `BLAST` `CHARGE` `CRITICAL` `CURSE` `GUTS` `POISON` `PROVOKE` `STUN` `SURVIVE` `ATTACK_DARK/FIRE/TIMBER/WATER` … 见规格文件 |

**这就是战斗引擎的规模上界**：15 × 60 × 7 是个可穷举的状态机，重写它是一份规格明确
的活，不是开放式逆向。注意属性专用效果（`ATTACK_DARK` 等）只有聚合后才看得到，
单次抓包会严重低估词汇表。

## 机器可读规格

规格放在仓库根的 `spec/upstream-api/`（205 个端点 / 64,961 条响应侧键路径 / 11 MB），
**不在 `docs/` 内**——它有十几 MB，放进文档站会被打包进构建产物，而它的读者是写代码
的人不是看站的人。格式约定与使用注意见
[`spec/upstream-api/README.md`](https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server/blob/main/spec/upstream-api/README.md)。

```
spec/upstream-api/
  index.json              端点索引：路径 / 调用次数 / 方法 / 键路径条数
  schemas/<endpoint>.json 每个端点的请求与响应结构
```

单个 schema 文件的形状：

```json
{
 "_meta":    { "path": "...", "calls": 24116, "methods": ["POST"], "request_headers": [...] },
 "request":  { "request.userQuestBattleResultId": { "types": {"str": 24116} } },
 "response": { "response.artList[].code": { "types": {"str": 118432},
                                            "values": ["ATTACK","BUFF","DEBUFF","HEAL", "..."] } }
}
```

键路径约定：

| 写法 | 含义 |
|---|---|
| `response.foo.bar` | 对象字段 |
| `response.list[]` | 数组元素（每次调用只采样前 6 个，同构数组够用） |
| `response.map.{key}` | 以 ID 为键的字典（排行榜按玩家 id 之类） |
| `response.slotN#` | 同级多个「同基名 + 数字后缀」字段折叠而成，实际下标见 `indices` |

最后一条值得解释：`opponentUserArenaBattleInfo1/2/3` 是三棵完全相同的深子树，各约
1,700 条键路径；`placeSkill1..9`、`missionStatus1..3`、`userCardId1..4` 同理。不折叠
的话规格文件会膨胀数倍且完全不可读，折叠后语义不丢（下标记在 `indices` 里）。

## 已知局限

- **只是一个 55 天的窗口**：期间没出现的端点、没触发的分支不在清单里。205 这个数字是
  **下界**。
- **枚举同理是下界**：标了 `"values_open": true` 的字段表示取值种类超过采集上限，
  只留了样例，不可当作完整取值集。
- **190 个设备的行为不覆盖全部玩法**：低频端点（如 `user/delete` 只有 1 次）的
  schema 仅由极少数样本得出，字段可选性判断不可靠。
- 抓包时间是 2024 年年中，与最终服务端版本可能有出入。
