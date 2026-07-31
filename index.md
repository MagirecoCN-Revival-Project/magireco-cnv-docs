---
layout: home

hero:
  name: 魔法纪录复兴计划
  text: 统一文档
  tagline: 客户端 · 服务端 · 协议契约 —— 从「把游戏跑起来」到「自建一整套服务」的全部资料
  image:
    src: /logo.png
    alt: 魔法纪录复兴计划
  actions:
    - theme: brand
      text: 我是玩家，想开始游戏
      link: /player/
    - theme: alt
      text: 我想自建一套服务
      link: /deploy/
    - theme: alt
      text: 我想研究实现
      link: /protocol/
    - theme: alt
      text: 我想参与贡献
      link: /contributing/

features:
  - icon: 🎮
    title: 玩家指南
    details: 如何下载安装游戏、准备资源文件、解决常见问题，以及向开发者反馈。零门槛上手。
    link: /player/
    linkText: 进入玩家指南
  - icon: 🚀
    title: 自建部署
    details: 单个 Go 二进制 + 一个数据库即可跑起来。PostgreSQL / MySQL / SQLite 三选一，节点与面板、反代与域名、日常运维全流程。
    link: /deploy/
    linkText: 从快速部署开始
  - icon: 🔌
    title: 协议与契约
    details: 客户端与服务端之间的 wire 契约、引擎数据契约，以及从历史抓包整理出的上游游戏后端 API 清单。
    link: /protocol/
    linkText: 查看协议文档
  - icon: 🔬
    title: 客户端实现
    details: Smali / Java / Native 三层 Patch 的完整剖析，热更新、多层汉化、WebView 拦截、存档同步等子系统的实现原理。
    link: /client/
    linkText: 阅读客户端文档
  - icon: 🗄️
    title: 服务端实现
    details: 请求生命周期、三套会话体系、多节点协调与签名节点目录、数据模型与多方言存储抽象。
    link: /server/
    linkText: 阅读服务端文档
  - icon: 🛡️
    title: 安全机制
    details: APK 签名闸门、版本化 scrypt 口令哈希、滑动会话、按 IP/会话限流、受信任代理、PoW 人机验证、Ed25519 签名目录。
    link: /security/
    linkText: 查看安全文档
---

<div style="max-width: 820px; margin: 48px auto 0; padding: 0 24px;">

## 这份文档写给谁？

<div class="audience-grid">
  <a class="audience-card" href="/player/">
    <span class="tag">普通玩家</span>
    <h3>只想把游戏跑起来 →</h3>
    <p>按步骤下载、安装、准备资源即可，全程不需要任何技术背景。遇到问题先翻 FAQ。</p>
  </a>
  <a class="audience-card" href="/deploy/">
    <span class="tag">自托管者</span>
    <h3>想跑一个自己的服务器 →</h3>
    <p>不关心源码，只想把节点与面板部署起来、配好数据库与域名、登录管理后台。从「快速部署」照抄即可。</p>
  </a>
  <a class="audience-card" href="/protocol/">
    <span class="tag">研究者</span>
    <h3>想搞清楚它是怎么做到的 →</h3>
    <p>协议契约是两端的交汇点，也是最适合的入口；再从那里分别深入客户端与服务端的实现。</p>
  </a>
  <a class="audience-card" href="/contributing/">
    <span class="tag">贡献者</span>
    <h3>想真正参与进来 →</h3>
    <p>按技术深度分级，从「不懂代码也能帮忙」到「独立改动核心模块」，客户端与服务端各有上手路径。</p>
  </a>
</div>

## 为什么两端文档合在一起

原本客户端与服务端各有一个文档站，靠 Cloudflare Worker 反代拼在同一个域名下。
那个 Worker 是**单点**：它一失效，两边文档同时从 `docs.magireco.top` 消失；某些地区对
Cloudflare 的访问稳定度本来也不好。

这份文档的设计目标是「**服务器全死、没人维护了，也要作为社区成果留下来**」。合成一个
仓库后只需一个 GitHub Pages 直接绑定域名，链路里不再有 Worker——少一个单点，就少一份
消失的可能。

顺带解决的是归类问题：wire 契约这类**跨两端**的内容原先两边各写一份，会互相漂移；
现在统一收在[协议契约](/protocol/)下，只有一份。

::: warning 版权与用途声明
本项目仅作学习研究使用，不用于任何商业用途。

**文档正文**以 [CC BY-NC-SA 4.0](/about/license) 授权（因为引用了中文 Wiki 的整理成果，
而该站为 BY-NC-SA，copyleft 要求相同许可）；**代码部分**以 GPLv3 开源；原版代码与素材
版权归属原版权方。本项目与魔法少女小圆、魔法纪录的版权方没有任何关联，如有侵权请联系
我们删除。
:::

</div>
