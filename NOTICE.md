# NOTICE — 许可说明与权利归属

> 本文件是**说明**，不是许可条款。具有法律效力的是 [`LICENSE`](./LICENSE)
> 中的 CC BY-NC-SA 4.0 原文，本文件不修改、不限制、不扩展其中任何一条。
>
> 之所以分成两个文件：`LICENSE` 保持官方原文一字不动，不会有「附加的中文段落算不算
> 修改了许可条款」这种歧义。

## 本仓库的许可

**全部内容以 CC BY-NC-SA 4.0 授权**——散文、表格、图示、代码示例、VitePress 配置与
主题，一律如此，**没有例外条款**。

`SPDX-License-Identifier: CC-BY-NC-SA-4.0`

Copyright (c) 魔法纪录复兴计划 (MagirecoCN-Revival-Project) contributors

### 关于 GitHub 显示「Other」

GitHub 仓库页把本仓库的许可显示为 **Other**，这是**正常现象，不是配置错误**。

GitHub 用 `licensee` 比对 [choosealicense.com 的许可清单](https://choosealicense.com/appendix/)，
而该清单只收录 **CC0-1.0、CC-BY-4.0、CC-BY-SA-4.0** 三个 CC 许可，**不包含任何
NonCommercial 变体**——因为带 NC 的许可不属于自由文化 / 开源许可。因此无论 `LICENSE`
文件多标准，GitHub 都无法把它识别成 CC-BY-NC-SA-4.0。

需要机器可读的许可标识时，请用上面那一行 SPDX 标识符，而不是 GitHub 的显示结果。

### 如何署名（转载 / 引用本站内容时）

CC BY-NC-SA 的「BY」要求给出适当署名。建议直接用下面这段：

```
《魔法纪录复兴计划 · 文档》 by 魔法纪录复兴计划贡献者
https://docs.magireco.top
以 CC BY-NC-SA 4.0 授权
```

若你对内容做了修改，请一并说明改了什么，并以相同许可发布你的版本。

### 贡献

向本仓库贡献文档，即表示你同意你的贡献以 CC BY-NC-SA 4.0 授权。

## 为什么是 BY-NC-SA

本站引用中文 Wiki（<https://magireco.moe/>）的整理成果，而该站内容采用
CC BY-NC-SA 4.0 授权。BY-NC-SA 是 copyleft——引用其内容的作品**必须**以相同许可发布。

所以这不是偏好问题，是引用带来的必然结果。

需要明确的代价：**CC BY-NC-SA 不是自由文化许可，它禁止商业性使用**。这与本项目
「仅作学习研究、不用于任何商业用途」的立场一致，但意味着第三方不能把本站内容用于
任何商业场景（含带广告的镜像站、付费整理集等）。

## 两点事实陈述

以下不是对许可的例外或限制，而是无论选什么许可都成立的事实。

### 1. 文档里的代码示例，不影响代码仓库里同一段代码的 GPLv3 许可

本项目的代码以 GPLv3 开源：

- 安卓客户端 <https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client>
- 网页客户端 <https://github.com/MagirecoCN-Revival-Project/magireco-web-client>
- 资源分发服务端 <https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server>
- API 服务端 <https://github.com/MagirecoCN-Revival-Project/magirecocn-api-server>

其中部分仓库另带 GPLv3 第 7 条允许的附加条款（`LICENSE.additional-terms`，限于出处
标注与名称使用），以各仓库自身的 `LICENSE*` 文件为准。

把一段代码抄进文档并以 CC 授权，**不会也无法收回**它在代码仓库里已经给出的 GPLv3
许可——GPLv3 授予的权利不可撤销。

**实践含义：要复用代码，请从代码仓库取。** 那里是 GPLv3，允许商业使用；本站的 NC
限制不会传染给代码仓库里的同一段代码。

### 2. 游戏原始素材不在本仓库的授权范围内

游戏文本、角色、图像、音频、商标等的权利归各自权利人所有。本仓库**不对这些第三方
内容重新授予任何许可**——我们无权授予自己不拥有的东西。

文档中对游戏格式、符号名、命令码、接口字段等的引述属于**互操作性描述**，不改变其
权利归属，也不构成对原始素材的再许可。

本项目与《魔法少女小圆》《魔法纪录》的版权方和著作权方**没有任何联系**，仅作学习
研究使用。如有侵权，请联系项目维护者处理。

## 第三方内容出处

| 内容 | 出处 | 许可 |
|---|---|---|
| 部分资料整理、术语、数据表 | 中文 Wiki <https://magireco.moe/> | CC BY-NC-SA 4.0 |
| 引述的本项目源码 | 上列各代码仓库 | GPLv3（在其仓库中） |
| 游戏格式 / 符号 / 命令码等的引述 | 游戏客户端（互操作性描述） | 权利归原权利人，未再许可 |
| 游戏文本 / 美术 / 音频 | 原版权方 | 权利归原权利人，未再许可 |
