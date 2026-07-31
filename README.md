# magireco-cnv-docs

「魔法纪录复兴计划」的**统一文档站**——客户端与服务端的文档合并于此。

线上地址：<https://docs.magireco.top>

## 为什么是一个仓库

原本客户端（`magireco-cnv-client/website/`）与服务端（`magirecocn-resource-server/docs/`）
各有一个 VitePress 站，两个 GitHub Pages 要挂在同一个域名下，必须经 Cloudflare Worker
按路径反代。

那个 Worker 是**单点**：它一失效，两边文档同时从 `docs.magireco.top` 消失；某些地区对
Cloudflare 的访问稳定度本来也不好。而这份文档的设计目标是「**服务器全死、没人维护了，
也要作为社区成果留下来**」——少一个单点，就少一份消失的可能。

合成一个仓库后：一个 Pages 直接绑定自定义域名（`public/CNAME`），链路里不再有 Worker。

顺带解决了归类问题：wire 契约这类跨两端的内容原先两边各写一份、会互相漂移，现在统一收在
`protocol/` 下，只有一份。

## 目录

按**主题**组织，而不是按「来自哪个仓库」：

| 目录 | 内容 |
|---|---|
| `player/` | 玩家指南：安装、资源、账号、FAQ |
| `deploy/` | 自建部署与运维 |
| `protocol/` | **跨两端的契约**：握手协议、引擎数据契约、上游 API 清单 |
| `client/` | 客户端内部实现 |
| `server/` | 服务端内部实现 |
| `security/` | 安全机制（含客户端与服务端两侧） |
| `contributing/` | 贡献指南（`client/` 与 `server/` 两个子节） |
| `about/` | 术语表、版权与许可 |
| `public/` | 静态资源（logo、CNAME） |

## 本地开发

```bash
npm ci
npm run docs:dev      # 本地预览
npm run docs:build    # 构建验证（提交前必跑）
```

> **注意**：VitePress 配置里开了 `ignoreDeadLinks: true`，构建**不会**因断链失败。
> 改动涉及大量链接时请自行核对，不要只看构建是否通过。

## 与代码仓库的关系

文档已从代码仓库中移出，因此**无法**在同一个 commit 里同时改代码与文档。约定改为：

> 改代码的 PR 里必须写明对应的文档改动——链接到本仓库的 PR，或说明为何不需要改文档。

代码仓库的 CI 会就此提醒。相关仓库：

| 仓库 | 是什么 |
|---|---|
| [`magireco-cnv-client`](https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client) | 安卓客户端（反编译 + 补丁 + native hook） |
| [`magireco-web-client`](https://github.com/MagirecoCN-Revival-Project/magireco-web-client) | 网页版客户端 |
| [`magirecocn-resource-server`](https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server) | **资源分发服务端**：代理 + 账号认证 + 资源分发，适合没有自己后端的部署者 |
| [`magirecocn-api-server`](https://github.com/MagirecoCN-Revival-Project/magirecocn-api-server) | **API 服务端**：自建的游戏后端内核，适合能搭完整服务器的部署者 |
| [`magirecocn-homepage`](https://github.com/MagirecoCN-Revival-Project/magirecocn-homepage) | 项目主页 |

> 站内目前写的「服务端」默认指 `magirecocn-resource-server`；`magirecocn-api-server`
> 的文档尚未并入本站。

## 许可

**本仓库全部内容以 CC BY-NC-SA 4.0 授权**——散文、表格、图示、代码示例一律如此，
没有例外条款。

- [`LICENSE`](./LICENSE) —— CC BY-NC-SA 4.0 **官方原文，一字未改**（法律效力以此为准）
- [`NOTICE.md`](./NOTICE.md) —— 项目侧的说明：为什么选这个许可、两点事实陈述、第三方内容出处

两个文件分开是为了让 `LICENSE` 保持纯净——不会有「附加的中文段落算不算修改了许可
条款」这种歧义。

> **GitHub 的仓库页会把许可显示成「Other」，这是正常的，不是配置错误。**
> GitHub 用 `licensee` 匹配 [choosealicense.com 的清单](https://choosealicense.com/appendix/)，
> 该清单只收录 CC0-1.0、CC-BY-4.0、CC-BY-SA-4.0 三个 CC 许可，**不含任何 NC 变体**
> ——因为 NC 不属于自由文化许可。`LICENSE` 写得再标准也不会被识别。
>
> 机器可读的标识请以 `NOTICE.md` 里的 `SPDX-License-Identifier: CC-BY-NC-SA-4.0` 为准。

面向读者的版本见文档站的 [版权与许可](./about/license.md)。
