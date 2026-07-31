# Lv.2 进阶贡献者

你会编辑文件、能用基本的 Git、愿意装一些工具。这一级你可以 **亲手改汉化、改资源，并在本地验证**。

## 前置技能

- 会用 **文本编辑器**（VS Code 等）改 JSON / JS；
- 懂基本 **Git**（clone、branch、commit、push、PR）—— 不熟可看 [协作流程](/contributing/client/workflow)；
- 汉化图集还需要 **图像处理**（Photoshop / GIMP / Aseprite 等）。

建议先读 [多层汉化体系](/client/localization)，理解 A/B/C 三类汉化的分工。

## 你能做的事

### 1. C 类 UI 词表扩充（最容易上手）

商店/扭蛋等 WebView 页面的日译中词表是 **外置文件** `patch/src/main/assets/cnv/ui_dict.json`（按业务分组的 JSON 对象，已不再写在 `cnv_shadow.js` 里）。发现没汉化的 UI 文字时，在对应分组下加一行 `"日文": "中文"` 即可：

```json
{
  "商店": {
    "ショップ": "商店",
    "交換": "兑换"
  }
}
```

::: warning 注意长词优先
脚本加载时会把所有分组摊平、按源串长度降序排序，确保长短语先被整体替换。你只管加条目（分组只是给人看的组织方式），**不用手动排序**，但要避免加入会破坏其他词的歧义短串。加完后在真机/模拟器验证不会误替换。
:::

::: tip 改 JSON 不会搞崩脚本
词表是纯数据文件，写错顶多这一条不生效，不会波及 `cnv_shadow.js` 的其它功能。注意用 **英文半角** 的引号 `"`、逗号 `,` 与花括号，并以 **UTF-8** 保存。
:::

详见 [C 类 DOM 替换](/client/localization#c-类-dom-文本实时替换)。

### 2. A 类 UI JSON 文本汉化

原生 UI 把文字写在 JSON 的 `text` 字段。找到对应文件（如 `assets/package/selectURL/select_url_ui.json`），逐字段改：

```diff
- "text":"リソースを削除する"
+ "text":"删除资源"
```

**只改 `text` 内容，不要动 `posX/posY/itemType` 等结构字段**，否则会破坏布局。

### 3. A 类图集文字帧汉化

图集里烘焙的文字（按钮、标题图等）需要用图像工具 **在原位重绘为中文**：

- 保持 **画布尺寸、文字帧坐标不变**（配套 `.plist` 切图坐标依赖它）；
- 尽量匹配原字体风格与配色；
- 改完连同 `.png` 一起提交。

### 4. 战斗/剧情数据 JSON 汉化

如 `testStageData1.json` 这类含角色名、技能名、台词的数据文件，逐字段翻译。注意：

- **语气贴合人设**（见 [Lv.1 的校对窍门](/contributing/client/beginner#_2-校对汉化报告日文残留)）；
- **术语与全游戏统一**。

### 5. 本地构建验证

改完资源后，最好在本地验证能正常打包运行。基本流程（具体以仓库 `tools/` 和 README 为准）：

```bash
# 1. 安装 apktool、Android SDK build-tools、JDK 17
# 2. 编译 Java 补丁（如改了 Java）
# 3. apktool b 重组、zipalign、用调试 keystore 签名
# 4. adb install 到设备验证
```

本地构建默认是 `normal` 渠道、不注入签名 pin，所以 `IntegrityGuard` 的签名层会跳过（前两层仍生效），方便调试。

### 6. 用调试开关辅助测试

在设备的 `<filesDir>/debug/` 下放 `<开关名>.flag`（内容 `true`）可启用调试行为，详见 [启动流程的调试开关](/client/bootstrap#调试开关机制)。常用：

- `verbose_net_log` —— 打印详细网络日志；
- `skip_to_tutorial` —— 直接测试教程弹窗；
- `display_ui_only` —— 只看启动 UI。

## 汉化工作的质量准则

| 准则 | 说明 |
|---|---|
| **不漏结构字段** | JSON 只改文本，不动坐标/类型/id |
| **术语统一** | 维护一份术语对照，避免同词多译 |
| **长度可控** | UI 框固定，译文别溢出 |
| **语气贴人设** | 台词翻译要像角色会说的话 |
| **真机验证** | C 类字典改动尤其要在页面上确认不误替换 |
| **态度到位** | 调试/测试文件里的日文也要汉化 |

## 提交你的改动

走标准 PR 流程，见 [协作流程](/contributing/client/workflow)。提交信息建议用中文、说清"改了什么、为什么"。

## 成长路径

当你开始想理解"字典是怎么被注入页面的""资源是怎么落盘的""为什么要拦 API" —— 你已经在向 [Lv.3 资深贡献者](/contributing/client/advanced) 迈进了。
