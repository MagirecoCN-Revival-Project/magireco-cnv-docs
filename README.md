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
| `public/` | 静态资源 + **旧链接重定向页**（见下） |

## 旧链接不会失效

合并前社区流传的链接形如 `docs.magireco.top/client/tech/bootstrap`、
`/server/self-host/quick-start`。GitHub Pages 是纯静态托管、没有服务端重定向能力，
所以 `public/client/**` 与 `public/server/**` 下放了 **69 个 HTML 重定向页**
（`<meta http-equiv="refresh">` + `<link rel="canonical">` + 人类可读说明）。

旧站每一篇文档都有对应重定向，**零遗漏**。这些页面请勿删除。

生成脚本的逻辑记录在页面注释里；若将来再次重排目录，需要同步补新的重定向。

## 本地开发

```bash
npm ci
npm run docs:dev      # 本地预览
npm run docs:build    # 构建验证（提交前必跑）
```

::: 注意
VitePress 配置里开了 `ignoreDeadLinks: true`，构建**不会**因断链失败。改动涉及大量
链接时请自行核对，不要只看构建是否通过。
:::

## 与代码仓库的关系

文档已从代码仓库中移出，因此**无法**在同一个 commit 里同时改代码与文档。约定改为：

> 改代码的 PR 里必须写明对应的文档改动——链接到本仓库的 PR，或说明为何不需要改文档。

两个代码仓库的 CI 会就此提醒。相关仓库：

- 客户端 <https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client>
- 服务端 <https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server>

## 许可

**文档正文以 [CC BY-NC-SA 4.0](./LICENSE) 授权**，而非 GPLv3——因为本站引用中文 Wiki
（magireco.moe）的整理成果，该站为 CC BY-NC-SA 4.0，copyleft 要求衍生作品采用相同许可。

文档中引述的**源代码片段随其原始项目走 GPLv3**，不因被本文档收录而改变许可。

游戏原始素材版权归各自权利人所有。本项目仅作学习研究使用，与《魔法少女小圆》《魔法纪录》
的版权方没有任何关联。详见 [版权与许可](./about/license.md)。
