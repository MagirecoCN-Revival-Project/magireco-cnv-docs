# 序章完成后静默进主页（设计草案）

::: warning 这是设计草案，尚未实现
本篇描述一个**计划中**的功能，目前仓库里**只落地了"信号采集"脚手架**
（`notifyJs` 日志），抑制与导航部分尚未实现。文内代码块均为**自撰示意性伪代码**，
不含任何反编译产物；落地前需先用真机采集回答下文「关键未知」。
:::

## 背景与目标

复刻服对任何账号都下发"满级存档"，正常登录流程**永不进新手教程**。CNV 增设了一个
**可选的**"重看序章"入口（见 [Native Hook · 强制新手教程](/client/native-hook#强制新手教程)）：

```
标题画面选"是" → BootstrapActivity 写 force_tutorial.flag
   → pushSceneTop hook 一次性消费 flag → 改进序章(Prologue, OP020)
```

但**序章播完之后该怎么办**目前是缺口。原版里，完成新手序章属于新手引导的一环，
通常会**向服务端回写教程进度 / 发放初始奖励**。而在满级账号上，这种回写要么报错、
要么与既有存档冲突、要么毫无意义。我们希望这个入口是**纯粹的"重看一遍 CG"**、对账号
**零副作用**。

**目标（三条）**

1. 序章自然播完后，**回到主页(TopScene)**；
2. 全程**不向服务端回写**任何教程/进度/奖励；
3. 对账号状态**零副作用**、可**重复触发**，且**绝不误伤**普通玩家的正常流程。

## 现状脚手架（已在代码里）

| 已具备 | 位置 | 作用 |
|---|---|---|
| `g_tutorialForced` 置位 | `pushSceneTopNew` | 标记"本次是强制序章"，作为后续一切判断的总开关 |
| `notifyJs` 信号日志 | `notifyJsNew` | 仅在 `g_tutorialForced` 时，把序章发往前端的每条信号打到 logcat（`[Tutorial::notifyJs] arg=…`），**正在采集完成信号** |
| 一次性闸门 | `consumeForceTutorial()` | flag 消费即删，保证只强制一次；**序章结束后引擎再次 `pushSceneTop` 不再被拦** |

::: tip 一个关键观察：回主页可能"本就会发生"
闸门是一次性的——序章结束、引擎**再次** `pushSceneTop` 时 flag 已消费，会**照常进主页**。
也就是说目标①很可能**无需我们主动驱动**，引擎自己的二次 `pushSceneTop` 就完成了导航。
那么真正要解决的，是目标②——**掐掉那次服务端回写**，而**不破坏**这条自然的回主页路径。
:::

## 关键未知（落地前必须先回答）

这些只能靠**真机采集**确定（用现有 `notifyJs` 日志 + `verbose_net_log` 调试开关）：

| # | 未知 | 怎么测 |
|---|---|---|
| U1 | 序章完成时 `notifyJs` 的**确切信号串**是什么（可能有多条，需区分"完成"与中途事件） | 看 logcat `[Tutorial::notifyJs]` 序列 |
| U2 | 完成后的**回写走哪条路**：WebView 前端发 `/magica/api/…`，还是 native `http2::Http2Session`？**具体端点**？ | `verbose_net_log` + 抓包，对比两条路径 |
| U3 | 前端收到完成信号后的**动作链**：自己发请求？自己导航？还是等 native 再发信号？ | 结合 U1/U2 时序 |
| U4 | 目标①是否**已自然成立**（二次 `pushSceneTop` 真能回主页），还是需要我们补一手 | 真机走一遍、看是否卡在序章后 |

**U2 是分水岭**：回写走前端 → 选项 B 最干净；走 native → 选项 A/C。

## 设计选项

### 选项 A — Native 在 `notifyJs` 处截断

命中"完成"信号时不向前端转发（或转发一个良性信号），从源头让前端**不知道**序章完成、
因而不发起回写。

```text
# —— 示意性伪代码，非引擎源码 ——
hook notifyJs(self, signal):
    if g_tutorialForced and signal == PROLOGUE_DONE_SIGNAL:   # 见 U1
        g_tutorialForced = false                              # 复位
        # 不转发完成信号；视 U3/U4 决定是否需要主动驱动回主页
        return
    原版 notifyJs(self, signal)
```

- ✅ 全在 native，不依赖"回写端点"知识。
- ⚠️ **吞掉 `notifyJs` 可能让前端逻辑挂起**（它可能在等这个信号推进 UI）。
- ⚠️ 若目标①依赖"前端收到信号后再导航"，吞了信号反而回不去主页——届时要自己驱动导航，
  但 `notifyJs` hook 手里只有 `PrologueSceneLayer*`，**拿不到 `SceneCommand` 实例**，
  主动 `pushSceneTop` 不像 `forceEnterPrologue` 那样现成，需另解 `SceneCommand` 单例/实例。

### 选项 B — WebView/API 层拦掉回写（**推荐方向**）

若回写是前端发的 `/magica/api/…`（U2 大概率如此——序章是 native CG，但账号进度通常由
WebView 前端驱动），则**复用既有拦截架构**
（[`WebViewInterceptor` + `PlayerStateCache`](/client/webview)）：识别该教程完成端点，
**返回合成的成功响应**（或缓存的满级状态），**不转发给服务端**。

```text
# —— 示意性伪代码，非引擎源码 ——
in WebViewInterceptor.shouldInterceptRequest(req):
    if tutorialForcedActive() and req.path matches TUTORIAL_COMPLETE_ENDPOINT:   # 见 U2
        log("拦截序章完成回写，返回合成成功，不触达服务端")
        return synthesizedOkResponse()      # 前端拿到 200 → 照常导航回主页
    ... 原有逻辑 ...
```

- ✅ **副作用最小**：前端流程不被破坏（它拿到成功响应），引擎自然 `pushSceneTop` 回主页，
  服务端**零变更**。
- ✅ 复用现有架构，不必在 native 里解额外符号。
- ⚠️ 必须**精确**锁定端点（U2），且**仅在** `g_tutorialForced` 期间生效，避免误伤真实请求。
- ⚠️ 若回写其实走 **native http2**（非 WebView），本选项不适用 → 退选项 C。

### 选项 C — Native `http2` 抑制（仅当回写走 native）

若 U2 证明回写经 `http2::Http2Session`，则在 `setURI`/`onResponse` 识别该 URI，
重定向到 no-op 或直接合成成功回调。最底层、最脆，仅作兜底。

## 推荐路径与判定流程

```
1. 真机选 force-tutorial，播序章
2. 采集：notifyJs 信号序列(U1) + verbose_net_log/抓包(U2,U3) + 是否自然回主页(U4)
3. 据 U2 分流：
     回写走 WebView 前端  ──→ 选项 B（首选，最小副作用）
     回写走 native http2  ──→ 选项 C（或 A）
4. 若 U4 显示回不去主页 ──→ 叠加"主动驱动导航"（解 SceneCommand 单例，类比 forceEnterPrologue）
```

默认倾向 **B**：让序章自然播完、引擎自然回主页，我们只**静默吞掉那一次回写**。
选项 A 的价值在"连信号都不让前端看到"，但有挂起风险，仅当 B 的端点无法干净隔离时再考虑。

## 边界与风险

- **中途跳过/退出序章**：用户 skip 时也要能干净回主页、**同样不回写**——抑制条件应绑定
  "强制序章会话"而非"播放到结尾"。
- **App 切后台/被杀（序章进行中）**：`g_tutorialForced` 是**进程内**状态，重启即丢；但
  `force_tutorial.flag` 已被消费 → 重启**不会再次强制**，玩家正常进主页。可接受，但需在
  文档/测试里明确这一行为。
- **可重复触发**：每次走该入口都必须纯净；复位 `g_tutorialForced`、不残留状态。
- **绝不误伤普通玩家**：所有抑制逻辑**必须**门控在 `g_tutorialForced`/`tutorialForcedActive()`
  之下；无 flag 的普通启动，`notifyJs`/API **一律透传**。
- **信号/端点随版本漂移**：`PROLOGUE_DONE_SIGNAL` / `TUTORIAL_COMPLETE_ENDPOINT` 集中为常量；
  匹配失败时**保守降级**（宁可不抑制也不要误伤），并打 warning 便于发现漂移。

## 测试方案

| 场景 | 期望 |
|---|---|
| 选 force-tutorial → 播完序章 | logcat 出现完成信号；抓包确认**零回写**；回到主页；复查账号状态**未变** |
| 选 force-tutorial → 中途 skip | 干净回主页；同样零回写、零副作用 |
| 普通启动（无 flag） | 全程透传：`notifyJs`/API/导航**均不受影响**，教程不被触发 |
| 序章中杀进程后重启 | 不再强制序章，正常进主页 |

## 落地与灰度

- **调试 flag 门控**：对齐既有调试体系（`skip_to_tutorial` / `verbose_net_log`，见
  [启动引导流程](/client/bootstrap)），先以开关形式灰度，稳定后再考虑默认开启。
- **分两步合入**：① 信号采集 + 端点判定（部分已在）；② 抑制 + （必要时）导航驱动。
- **代码 → 文档同步**：实现时按对照表更新 [Native Hook 层](/client/native-hook)（若动 `MagiaClient.cpp`）
  或 [WebView 拦截](/client/webview)（若走选项 B），并回填本草案的"已落地"状态。

## 交叉链接

- 场景层与序章构造 → [Native 引擎逻辑 · 场景层系统](/client/native-engine)
- 现有强制教程 hook → [Native Hook · 强制新手教程](/client/native-hook#强制新手教程)
- 选项 B 依赖的拦截架构 → [WebView 拦截与状态重放](/client/webview)
- 账号/存档状态语义 → [账号、存档与心跳](/client/account-save)
- 调试开关体系 → [启动引导流程](/client/bootstrap)
