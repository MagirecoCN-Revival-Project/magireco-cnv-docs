# 版权与许可

## 项目用途声明

本项目 **仅作学习研究使用，不用于任何商业用途**。

- **本文档站的全部内容** 按照 **[CC BY-NC-SA 4.0](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-docs/blob/main/LICENSE)** 授权——散文、表格、图示、代码示例一律如此，**没有例外条款**。原因见下节；许可原文见 [`LICENSE`](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-docs/blob/main/LICENSE)，项目侧说明见 [`NOTICE.md`](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-docs/blob/main/NOTICE.md)；
- 本项目的 **代码部分**（客户端 `patch/`、`cnv-native/`、`tools/`，服务端 `cmd/`、`internal/` 等我方原创代码）在**代码仓库里**按照 **[GPLv3](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client/blob/main/LICENSE)** 协议开源，涉及哪些仓库见下文「要复用代码，请从代码仓库取」；
- **原版代码部分**（反编译得到的 smali、原版 assets、原版 `.so` 等）仅供参考，版权归属原版权方；
- 本项目 **与魔法少女小圆、魔法纪录游戏的版权方和著作权方没有任何联系**。如有侵权，请联系我们删除。

## 文档为什么与代码不同协议

本站会引用中文 Wiki（[magireco.moe](https://magireco.moe/)）的整理成果，而该站内容采用
**CC BY-NC-SA 4.0** 授权。BY-NC-SA 是 copyleft——引用其内容的作品**必须**以相同许可发布。
所以这不是偏好问题，是引用带来的必然结果。

## 转载本站内容时如何署名

CC BY-NC-SA 的「BY」要求给出适当署名。直接用这段即可：

```
《魔法纪录复兴计划 · 文档》 by 魔法纪录复兴计划贡献者
https://docs.magireco.top
以 CC BY-NC-SA 4.0 授权
```

若你对内容做了修改，请一并说明改了什么，并以**相同许可**发布你的版本。

::: warning NC 意味着什么
CC BY-NC-SA **不是**自由文化许可：它禁止商业性使用。这与本项目「仅作学习研究、不用于
商业用途」的立场一致，但代价是第三方不能把本站内容用于任何商业场景（含带广告的镜像站、
付费整理集等）。转载请保留署名、链接到许可，并以相同许可发布。
:::

::: tip 要复用代码，请从代码仓库取
文档里的代码示例同样以 CC BY-NC-SA 授权，但这**不影响**同一段代码在代码仓库里的
GPLv3 许可——GPLv3 授予的权利不可撤销，抄进文档并不能收回它。

所以：本站的 NC 限制**不会传染**给代码仓库里的代码。要复用请从下列仓库取，那里是 GPLv3：

- [安卓客户端 `magireco-cnv-client`](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client)
- [网页客户端 `magireco-web-client`](https://github.com/MagirecoCN-Revival-Project/magireco-web-client)
- [资源分发服务端 `magirecocn-resource-server`](https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server)
- [API 服务端 `magirecocn-api-server`](https://github.com/MagirecoCN-Revival-Project/magirecocn-api-server)

部分仓库另带 GPLv3 第 7 条允许的附加条款（`LICENSE.additional-terms`，限于出处标注与
名称使用），以各仓库自身的 `LICENSE*` 文件为准。
:::

::: warning 游戏原始素材不在授权范围内
游戏文本、角色、图像、音频、商标等的权利归各自权利人所有。本仓库**不对这些第三方
内容重新授予任何许可**——我们无权授予自己不拥有的东西。文档中对游戏格式、符号名、
命令码等的引述属于互操作性描述，不改变其权利归属。
:::

原先这些文档分散在两个 GPLv3 代码仓库内。GPLv3 不允许对 GPLv3 作品叠加额外限制
（NC 即是一种额外限制），因此本次变更不是「把 GPLv3 作品改成 BY-NC-SA」，而是
**著作权人对自己撰写的文档正文另行授权**。已按 GPLv3 取得这些文档的人，其既有权利
不受影响——GPLv3 授予的许可不可撤销。

## 给玩家的提醒

- 本客户端 **完全免费**，不含任何真实货币内购；
- 游戏界面中的"宝石/付费"等是原版残留，**不涉及真实付费**；
- 任何向你收费的"代充、代练、破解版"都与本项目无关，请勿上当；
- 请只从 [官方 Releases](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client/releases) 下载，第三方修改版可能盗取账号。

## 给贡献者的提醒

- 向本项目提交代码，即表示你同意你的贡献以 **GPLv3** 协议授权；
- 向**本文档站**提交文档，即表示你同意你的贡献以 **CC BY-NC-SA 4.0** 授权；
- 请勿提交受其他不兼容协议约束、或你无权授权的代码/素材；
- 汉化、美术等资源贡献请确保不侵犯第三方权利。

## GPLv3 要点（非正式摘要）

::: warning 以 LICENSE 原文为准
以下仅为帮助理解的简述，法律效力以仓库根目录的 [LICENSE](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client/blob/main/LICENSE) 原文为准。
:::

- 你可以 **自由使用、修改、分发** 本项目的补丁部分；
- 分发（含修改版）时必须 **同样以 GPLv3 开源**，并保留版权与许可声明；
- 不提供任何担保。

## 联系与反馈

- 一般问题、bug、建议 → [GitHub Issues](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client/issues)；
- 安全漏洞 → 走私密渠道联系维护者，给出修复时间后再公开；
- 侵权相关 → 请联系项目维护者处理。
