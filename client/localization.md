# 多层汉化体系

魔法纪录的文字分散在 **静态图集、UI JSON、剧情/战斗数据、线上 API 响应、运行时 DOM** 多个层面。没有任何单一手段能覆盖全部，因此本项目采用 **三类汉化策略** 分工协作。

## 总览：三类汉化的分工

| 类型 | 作用对象 | 实现层 | 时机 |
|---|---|---|---|
| **A 类** | 静态资源（图集 PNG、UI JSON、剧情/战斗数据 JSON） | 文件替换（assets → `filesDir/magica` 覆盖） | 离线打包 / 热更落盘 |
| **B 类** | 战斗结算台词（`charaMessageList.json`） | `cnv_shadow.js` 拦截 API 响应体改写 | 运行时（XHR/fetch load 阶段） |
| **C 类** | WebView 页面日文 UI 文字（商店/扭蛋等 DOM） | `cnv_shadow.js` 的 `UI_DICT` + `MutationObserver` | 运行时（DOM 文本节点） |

底层基础设施由 [WebView 拦截与状态重放](/client/webview) 提供。

## A 类 —— 静态资源替换

游戏资源根在仓库 `assets/`，运行时落盘到 `<filesDir>/magica/`（即 `WebViewInterceptor.LOCAL_DIR`）。`ResourceFlow` 把离线包/热更 zip 解压进 `filesDir`，CN 版资源以此 **覆盖** 日服原文件。

主要资源目录：

- `assets/package/` —— 引擎打包的图集/动画（Cocos 风格 `.png` + `.plist` + `.ExportJson`），按场景细分：`quest`（战斗）、`story`（剧情）、`gacha_v2`、`web`、`top`、`startup`、`selectURL`、`debug` 等；
- `assets/resource/image_native/` —— 原生图集与 UI 数据：`chara/`、`memoria/`、`card/frame/`、`scene/quest/` 等；
- `assets/resource/scenario/json/` —— 剧情脚本 JSON（`general/`、`oneShot/`）；
- `assets/fonts/`、`assets/resource/sound_native/` 等。

A 类汉化有三种子形态：

### A-1 图集文字帧的位图替换

把图集贴图中 **烘焙好的文字帧** 重绘为中文，配套 `.plist` 切图坐标不变。涉及如 `package/quest/quest_image0.png`、`story/story_ui_sprites00.png` 等。

::: warning
早期曾有一批"汉化日服独有图集英文文字帧"的提交，随后被 Revert，当前工作树以国服原包替换为主。
:::

### A-2 UI 文本型 JSON 的字符串替换

原生 UI 布局把可见文字直接写在 JSON 的 `text` 字段（`itemType` + `posX/posY` + `text` 结构）。逐字段改写，例如 `package/selectURL/select_url_ui.json`：

```diff
- "text":"リソースを削除する"
+ "text":"删除资源"
- "text":"-- 接続するサーバーの環境を選択してください --"
+ "text":"-- 请选择要连接的服务器环境 --"
```

### A-3 战斗/剧情数据 JSON 的全字段汉化

如 `image_native/mini/quest/testStageData1.json` 内嵌角色名、奥义/技能名、结算台词：

```json
{"playerList":[
  {"endMessageId":45,"endMessage":"赢啦！…这样就可以了吧？","name":"相野未都"},
  {"endMessageId":43,"endMessage":"又捡回一条命啊…","name":"七海八千代"}
]}
```

注意 `endMessageId`/`endMessage` 这对字段，正是 B 类台词汉化在运行时针对 **线上 API 响应** 所处理结构的"静态文件版"对照。剧情脚本 JSON（如 `scenario/json/`）只含 `chara/face/motion/voice` 等演出指令，不含正文文本。

## B 类 —— 战斗结算台词汉化（API 响应拦截）

实现全部在 `cnv_shadow.js`。

### 词表加载

脚本注入后异步拉取本地词表（由 WebViewInterceptor 从本地文件提供）：

```js
fetch('/magica/js/libs/charaMessageList.json')
  .then(r => r.ok ? r.json() : [])
  .then(list => {
    var m = {};
    for (...) m[e.charaNo + '_' + e.messageId] = e.message; // key = charaNo_messageId
    _msgMap = m;
  });
```

词表格式 `[{charaNo, messageId, message}, ...]`，编译为 `_msgMap`，键 `charaNo + '_' + messageId`。`_msgMap` 为 `null`=未就绪、`{}`=已就绪。

::: tip
`charaMessageList.json` 不在仓库内 —— 它随 CN 资源包落盘到 `filesDir/magica/js/libs/`，仓库只含 fetch 引用。
:::

### 响应改写

`_applyMsgLocale(obj, depth)` 递归遍历响应 JSON（`MAX_DEPTH=12` 防超大响应阻塞），命中含 `charaNo`/`messageId`/`message` 三字段的节点时替换 `message`：

```js
if ('charaNo' in obj && 'messageId' in obj && 'message' in obj) {
  var cn = _msgMap[obj.charaNo + '_' + obj.messageId];
  if (cn) obj.message = cn;
}
```

`localizeApiResponse(text, url)` 仅对 `/magica/api/` 响应生效。

### 拦截点：XHR 与 fetch 双覆盖

- **XHR**：覆写 `open/send`，在 `addEventListener('load', ..., true)` 中以 **useCapture=true** 抢在游戏自身 load 监听器之前执行，用 `Object.defineProperty` 重定义只读的 `responseText`/`response`，使游戏读到的已是中文；
- **fetch**：包裹 `window.fetch`，消费一次 `response.text()`，改写后用原 `status/statusText/headers` 构造新 `Response` 返还。

同一段逻辑同时承担 B 类汉化（`localize`）与状态捕获（`capture`，见 [状态重放](/client/webview#状态捕获与回放)）。

## C 类 —— DOM 文本实时替换

适用于所有 `/magica/` 的 SPA WebView 页面（扭蛋、商店、活动、编队、设置等）。这些页面文字由游戏 JS 动态写入 DOM，无法用静态文件替换，只能在文本节点层运行时翻译。

### 词表：外置 `ui_dict.json`

词表是 **外置文件** `patch/src/main/assets/cnv/ui_dict.json` —— 按业务分组的 JSON 对象（约 100 条），便于非技术同学维护，也能随资源包热更：

```json
{
  "商店": {
    "ショップ": "商店",
    "所持ジュエル": "持有宝石",
    "ジュエル": "宝石"
  },
  "状态提示": {
    "読み込み中": "加载中…",
    "しばらくお待ちください": "请稍候…"
  }
}
```

`cnv_shadow.js` 注入后异步 `fetch` 该文件，把分组对象 **摊平** 成 `[日文, 中文]` 列表再编译进 `UI_DICT`：

```js
fetch('/magica/cnv/ui_dict.json')
  .then(r => r.ok ? r.json() : {})
  .then(groups => {
    var list = [];
    for (var g in groups)                 // 遍历"商店/扭蛋/…"各分组
      for (var jp in groups[g]) list.push([jp, groups[g][jp]]);
    list.sort((a, b) => b[0].length - a[0].length);   // 长词优先
    UI_DICT = list;
    uiTranslatePage();                    // 词表晚到时补跑一次整页翻译
  });
```

::: tip 文件从哪来、为何能热更
`/magica/cnv/ui_dict.json` 由 `WebViewInterceptor` 提供：**filesDir 优先、APK assets 兜底**（与 `cnv_shadow.js` 同路）。出厂兜底的真相源是 `patch/src/main/assets/cnv/ui_dict.json`，由 CI 步骤 12a 复制进 `assets/` 后随 APK 打包（见 [构建流水线](/client/build#ci-步骤逐条)）；仓库根的 `assets/cnv/` **不**手工存放该文件，避免两份副本漂移，落盘到 `filesDir/magica/cnv/` 的同名文件会覆盖它，故词表可随资源包热更、无需重打包。加载失败/为空时 `UI_DICT` 保持空数组，C 类静默跳过，不影响 A/B 类与状态回放。
:::

### 长词优先排序（关键设计）

摊平后按源串长度降序排序：

```js
list.sort(function(a, b) { return b[0].length - a[0].length; });
```

替换是子串替换（`split(jp).join(...)`）。若先替换短词会破坏长词 —— 例如同时有 `ジュエル→宝石` 与 `所持ジュエル→持有宝石`，先替短词会把长短语切碎导致长词永远匹配不到。**长词优先** 保证最具体的短语先被整体替换；分组只是给人看的组织方式，加载时已摊平统一排序，故 **跨分组** 的长短词也能正确排序。

### 翻译与遍历

- `uiTranslate(text)` —— 遍历整个 `UI_DICT`，对每个出现的日文键做全量子串替换；
- `uiProcessNode(node)` —— 递归：文本节点（`nodeType===3`）翻译 `nodeValue`；元素节点（`nodeType===1`）跳过 `UI_SKIP_TAGS`（`SCRIPT/STYLE/TEXTAREA/INPUT`）后递归子节点；
- `uiTranslatePage()` —— 从 `document.body` 起整页处理一次。

### MutationObserver（关键设计）

```js
_uiObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
```

游戏是 SPA，页面切换、扭蛋结果弹窗、列表懒加载都是运行时动态插入/修改 DOM，初次整页翻译无法覆盖之后出现的内容。回调里：`childList` 变更对每个 `addedNodes` 调 `uiProcessNode`；`characterData` 变更就地重译 `nodeValue`。启动时机：`readyState==='loading'` 等 `DOMContentLoaded`，否则立即执行。

## 三类如何互补

```
静态、能预先替换的       → A 类（最彻底，进游戏前已是中文）
线上下发、结构固定的台词 → B 类（拦 API 响应，按 id 查表替换）
运行时动态渲染的 UI 文字 → C 类（拦 DOM，按字典实时替换）
```

A 类与 B 类在 `endMessage` 这类字段上有结构重叠：离线静态数据走 A 类，线上同结构 API 走 B 类，两条路径覆盖"静态打包数据"与"线上 API 数据"两种来源。
