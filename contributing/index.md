# 参与贡献 · 从这里开始

两端的贡献路径不同——客户端是 Android 补丁工程（Java + smali + native），服务端是 Go
后端。**先选一边**，再按各自的上手路径走。

<div class="audience-grid">
  <a class="audience-card" href="/contributing/client/">
    <span class="tag">客户端</span>
    <h3>Android 补丁工程 →</h3>
    <p>按技术深度分三级：Lv.1 汉化校对与资源整理（不需要代码基础）、Lv.2 美术与脚本、
       Lv.3 深入 Java / smali / native。每一级都有明确的上手任务。</p>
  </a>
  <a class="audience-card" href="/contributing/server/">
    <span class="tag">服务端</span>
    <h3>Go 后端工程 →</h3>
    <p>开发环境搭建、代码库导览、如何跑测试，以及一个「从零新增一个接口」的完整动手示例；
       再往深处是存储方言抽象、调度器、打包器与发布流程。</p>
  </a>
</div>

## 不确定该从哪边开始？

| 你想做的事 | 去哪边 |
|---|---|
| 校对翻译、补充术语、修文档错别字 | [客户端 Lv.1](/contributing/client/beginner)（汉化流程在那边） |
| 做界面图、立绘、UI 素材 | [客户端 Lv.2](/contributing/client/intermediate) |
| 改启动流程、下载器、WebView 注入 | [客户端 Lv.3](/contributing/client/advanced) |
| 加一个 API、改数据库、写管理后台 | [服务端](/contributing/server/) |
| 部署一套自己的服务（不改代码） | 这不算贡献路径，看[自建部署](/deploy/) |

## 两边共同的规矩

无论改哪一边，有几条是一致的：

::: danger 改了协议就是改了两端
`/client/*` 与 `/account/*` 的任何字段变动都会同时影响客户端与服务端。动手前先读
[握手协议](/protocol/client-server)与[协议保真原则](/contributing/server/protocol-fidelity)，
并且**两个仓库都要改**——已发布的 APK 不会跟着服务端一起更新。
:::

- **文档与代码要一起更新**。代码仓库与文档仓库现在是分开的，无法在同一个 commit 里改完，
  所以约定是：**改代码的 PR 里必须写明对应的文档改动**（链接到本仓库的 PR，或说明为何
  不需要改文档）。两边 CI 都会提醒。详见各自的贡献规范
  （[客户端](/contributing/client/workflow) / [服务端](/contributing/server/discipline)）。
- **commit 信息用中文**，一功能一 commit，说清「改了什么、为什么」。
- **不提交你无权授权的代码或素材**。代码贡献以 GPLv3 授权，文档贡献以 CC BY-NC-SA 4.0
  授权，详见[版权与许可](/about/license)。

## 报告问题

- 一般问题、bug、建议 → 对应仓库的 GitHub Issues；
- **安全漏洞** → 走私密渠道联系维护者，给出修复时间后再公开，不要直接开 Issue；
- 玩家侧的使用问题 → 先看[玩家 FAQ](/player/faq)，再走[反馈渠道](/player/feedback)。
