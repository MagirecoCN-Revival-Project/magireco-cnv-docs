# 引擎数据契约与数据驱动边界（互操作 / schema 级）

本篇回答一个常被问的问题：**引擎 `.so` 里到底有没有"硬编码关卡数据"？游戏数据到底住在哪、
长什么样？** 结论会顺带厘清一条对 [Web 化可行性](/client/web-port-feasibility) 至关重要的分界线——
**哪些是"纯原生运行时"，哪些是"数据驱动"**。

::: danger 来源与边界（务必先读）
- 全文只到 **结构 / schema / 规模** 级：ELF 段大小、导出符号**计数**、JSON 的**字段名与类型**。
- **不含任何值内容**：不导出反汇编、不导出角色名/台词/数值等版权数据。字段名是
  **schema/接口事实**（等同于描述一份数据库表结构），不是受保护的表达。
- 素材来自**本地只读分析**仓库内既有文件（`lib/*.so`、`assets/**` 皆随反编译 APK 附带）
  与项目自有代码，**无反编译产物入库**。
:::

## 一句话结论

**"关卡数据硬编码在 .so 里"基本是把位置搞混了。** `.so` 是**客户端运行时代码本体**
（渲染 / 音频 / 战斗演出 / 网络 / 下载状态机 + 静态中间件），**关卡本身的数据不在里面**；
真正的游戏数据分布在**下载资产包、bundled 资产、服务器响应**三处，且大多是**干净的 JSON**。
所谓"能在 .so 里找到关卡数据"，实为一个 **bundled 的测试关卡 JSON**
（`assets/…/quest/testStageData1.json`，17 KB）——是**资产文件、非二进制内嵌**。

## `.so` 是什么：运行时代码，不是数据库

对 `lib/arm64-v8a/libmadomagi_native.so`（30.5 MB，aarch64，**stripped**）的结构实测：

| 段 | 大小 | 说明 |
|---|--:|---|
| `.text`（代码） | ~14.4 MB | 引擎 + 游戏逻辑 + 静态链入的全部中间件 |
| `.rodata`（只读常量） | ~2.0 MB | 格式串、字段名、资产 key、少量 ID/URL——**是代码常量，不是数据库** |
| `.data.rel.ro` / `.data` | ~1.0 MB | 重定位只读 / 可写数据 |
| `.bss` | ~33 MB | 运行时零初始化，**文件里无内容** |

- **`DT_NEEDED` 只有系统库**（`libGLESv2`/`libEGL` 渲染、`libOpenSLES` 音频、`libc`/`m`/`stdc++`）
  → **Cocos2d-x + CRI ADX2 + Live2D 等中间件全部静态链入这一颗 .so**，无独立中间件库。
- stripped，但仍有 **~59,000 个 C++ 动态符号**可见（这是项目能"按 mangled 名 hook"的前提；
  内部静态函数名已抹除）。按子系统的导出符号**计数**（近似规模）：

| 子系统 | 符号数 | 子系统 | 符号数 |
|---|--:|---|--:|
| CRI ADX2 音频 | ~3700 | 任务 Quest | ~815 |
| 场景 Scene | ~2350 | 剧情 / CG | ~730 |
| Live2D Cubism | ~1350 | 扭蛋 Gacha | ~500 |
| http2 网络栈 | ~1150 | 下载 / 资源 | ~200 |
| | | 战斗 Battle | ~160 |

- 只读串里：JSON **字段名** ~1490、资产 **key** ~520、**硬编码 URL 仅 4 个**、`/magica/` 路径 17 个、
  以及**大量 debug/test 脚手架**（含 test/debug/sample 的串 ~3350）。少量写死**标识符**
  （如序章 `OP020`）。**这些是解析数据的代码常量，不是数据本身。**

## 数据驱动边界（对 Web 化最关键）

把上面的符号规模与资产格局对齐，可以画出这条线：

| 面向 | 归属 | 例子 |
|---|---|---|
| **纯原生运行时**（Web 化的真正壁垒） | 代码，在 `.so` | GLES 渲染、Cocos2d-x 场景框架、**Live2D 播放器**、**CRI 音频引擎**、**战斗演出/播放器**、http2 客户端、资源下载状态机 |
| **数据驱动**（可绕开二进制理解） | JSON / 资产 / 服务器 | **关卡/任务定义**、**战斗结算**、扭蛋结果、编成/账号状态、剧情脚本、master-data |
| **数据资产**（原生播放器消费的素材） | 资产包 | Live2D 模型(`moc3`)、CRI 音频(`hca`/`acb`)、图集(`plist`+`png`)、动画(`ExportJson`)、着色器(`vsh`/`fsh`) |

**要点**：原生那颗是"**播放器 / 渲染器 / 网络与下载机**"，而"**玩什么**"（关卡、结算、剧情、编成）
是**数据**——大多还是**服务端下发**的结构化 JSON。这意味着**理解游戏内容完全可以绕开
二进制**，只从数据契约走（净室友好）。

::: warning "数据驱动"不等于"服务端算"
本节说的是**内容定义**（打什么）是数据；它**不保证结算逻辑**（怎么算）也在服务端。
真机流量已证实**战斗结算在客户端**——见下文 `webData` 一节的更正。
:::

## Bundled 资产格式地图

`assets/` 里随包附带的基础集（下载包之外的启动/兜底/测试资产）：

- **`assets/package/`** 顶层分区：`quest · story · movie · memoria · evolution · top · web ·
  window · loading · startup · tap · selectURL · download · debug · live2dViewer · anotherQuest ·
  shaders · spacer` —— 一眼可见"每个游戏子系统一个目录"，含 `debug` / `live2dViewer` 等**开发/调试**分区。
- **`assets/resource/`**：`image_native`（图集/场景图）、`scenario`（剧情脚本）、`sound_native`（BGM/SE，HCA/ACB）。

按扩展名的形态（bundled 部分）：`plist`(Cocos 图集) ·`png/jpg` ·`ExportJson`(Cocos Studio 动画) ·
`json`(UI/数据) ·`vsh`/`fsh`(GLSL 着色器) ·`js`/`html`(WebView 前端片段)。**这些格式本身多为公开
格式**，可自由据其结构解析；游戏专有的取值内容留在原资产、不复制。

## 战斗关卡数据契约（关键实证）

那份 bundled 测试关卡 `testStageData1.json`（17 KB）的 **schema**（**仅字段名/类型，无任何值**）：

```text
根 object（13 键）
├─ battleType            : str          # 战斗种类
├─ scenario              : object       # 关卡元数据
│    keys: auto, bgm, bgmBoss, cost, difficulty, missionList,
│          questType, sheetType, title, titleExtend
├─ playerList            : array        # 我方编成（每个元素 ~数十字段）
│    elem keys: ai, align, attack, defence, blast, charge,
│               charId, cardId, diskId, connectId, doppelId,
│               discType1..5, endMessageId, friend, helper, …
├─ waveList              : array        # 敌人波次
│    elem keys: boss, effect, enemyList, field
├─ artList               : array        # "art"=光碟/技能效果
│    elem keys: artId, code, growPoint, rate, sub, target, turn
├─ memoriaList           : array        # 记忆（装备）
│    elem keys: artList, cost, description, displayType, icon,
│               level, memoriaId, name, type, voice
├─ magiaList             : array        # 魔法（必杀）
│    elem keys: artList, description, icon, level, magiaId, name
├─ connectList           : array        # connect 技
├─ doppelList            : array        # doppel（变身）
├─ webData               : object       # ★ 见下
│    keys: gameUser, resultCode, userItemList,
│          userQuestBattleResultList, userStatusList
├─ isHalfSkill / continuable : bool
└─ attackAlignmentRateTable  : array    # 属性克制表
```

::: danger ★ 关于 `webData` 的推测已被证伪（更正）
`webData` 的键是 `gameUser / resultCode / userQuestBattleResultList / userStatusList`——
这是一份**服务器 API 响应的形状**（战斗结算 + 玩家状态）。本篇早期版本据此推测
"战斗 = 服务端算好、客户端回放"。**这个推测是错的。**

真机流量的结论是**战斗结算完全在客户端**：服务端只在 `quest/start` 建档（计数器全零）、
在 `quest/native/get` 下发**战斗定义**，然后由客户端把**算好的结果**通过
`quest/native/result/send` **上报**；全程**无随机种子**、**无逐回合轨迹**，
服务端无从复现或校验。

**为什么形状会骗人**：这些结算类字段确实存在于响应中，但它们是
**"为客户端上报的结果记账"**，不是"服务端算出来的战斗"。判断权威性
**不能只看响应里有没有结算字段**，必须看**方向与时序**。完整证据链、
正确判据与由此修订的路线权衡见
[Web 化可行性评估 · Phase 0 结论](/client/web-port-feasibility#phase-0-结论-战斗是客户端权威)。
:::

## 综合结论

1. **`.so` = 运行时代码**（渲染/音频/演出/网络/下载 + 静态中间件），**不是游戏数据库**；
2. **游戏数据是数据驱动的干净 JSON/资产**，分布在下载包、bundled 资产、服务器响应三处；
3. **数据驱动边界**清晰：原生是"播放器"，内容是"数据"——**理解内容无需碰二进制**；
4. **战斗结算在客户端**（真机流量证实，非本篇早期推测的"服务端权威回放"）：服务端下发
   **定义**、客户端算完**上报结果**。因此纯 Web 化除表现层外，还需**自行重写结算引擎**——
   范围有界但工作量实在，详见 [Web 化可行性评估](/client/web-port-feasibility)。

::: warning 合规再强调
本篇只刻画**结构/schema/规模**。任何进一步实现都应延续净室口径：可据**公开格式**与**自采数据契约**
自行实现解析/渲染，但**不得**照搬引擎反编译产物，也**不得**再分发提取出的游戏美术/音频/文本内容。
:::

## 交叉链接

- 引擎四子系统运行逻辑 → [Native 引擎逻辑（互操作重建）](/client/native-engine)
- 运行时 hook 如何拦这些子系统 → [Native Hook 层](/client/native-hook)
- 资源下载与离线包（数据从哪来） → [资源下载与离线包](/client/resource-flow)
- WebView 前端与 API 缓存重放 → [WebView 拦截与状态重放](/client/webview)
- 战斗权威性结论与 Web 化路线 → [Web 化可行性评估](/client/web-port-feasibility)
- 序章重看入口的下游设计 → [序章完成后静默进主页（设计草案）](/client/prologue-return)
