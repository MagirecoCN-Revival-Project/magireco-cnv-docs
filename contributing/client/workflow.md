# 贡献规范与协作流程

这一页对 **所有级别** 通用，讲怎样把你的改动提交进项目。

## 总体流程

```
Fork / clone  →  建分支  →  改动  →  本地验证  →  提交（中文信息）
→  push  →  开 Pull Request  →  评审  →  合并
```

## 第一步：拿到代码

```bash
git clone https://github.com/MagirecoCN-Revival-Project/magireco-cnv-client.git
cd magireco-cnv-client
```

没有写权限的外部贡献者请先在 GitHub 上 **Fork**，再 clone 你自己的 fork。

## 第二步：建分支

不要直接在 `main` 上改。建一个描述性分支：

```bash
git checkout -b l10n/shop-ui-fix      # 汉化类
git checkout -b fix/download-resume   # bug 修复
git checkout -b feat/xxx              # 新功能
```

## 第三步：改动与本地验证

- 汉化/资源类：按 [Lv.2 指南](/contributing/client/intermediate) 改文件并尽量真机验证；
- 代码类：按 [Lv.3 指南](/contributing/client/advanced)，确保能 `apktool b` 重组、双 ABI 通过；
- 文档类：在 `website/` 下改，可本地预览（见下）。

### 本地预览文档站

```bash
cd website
npm install        # 首次
npm run docs:dev   # 启动本地预览，浏览器打开提示的地址
```

## 第四步：提交

提交信息用 **中文**，建议带类型前缀，言简意赅说清"做了什么"：

```
l10n: 汉化商店界面"兑换"等遗漏 UI 文字
fix: 修复分片下载 .cnvprog 元数据被误删导致重复下载
feat(debug): 新增 verbose_net_log 调试开关
docs: 补充离线包版本检查的玩家说明
```

::: tip 好的提交信息
- 一句话讲清 **改了什么、为什么**；
- 一个提交只做一件事，便于 review 和回滚；
- 触及安全/协议/构建的改动，在正文里说明 **风险与验证方式**。
:::

::: danger 代码与文档同步提交（硬性要求）
**凡是改变客户端行为、协议、构建或安全机制的代码，必须在同一个提交里更新对应
文档。** 滞后的文档会误导读者，比没有文档更糟。判据：若你的改动让某篇文档的描述
变得不准确或不完整，就在本次一起改掉它。代码区域 ↔ 文档的对照表见
`.claude/CLAUDE.md`。改完文档记得 `cd website && npm run docs:build` 验证能构建。
:::

## 第五步：开 Pull Request

```bash
git push -u origin <你的分支>
```

然后到 GitHub 开 PR：

- **标题** 清晰概括；
- **正文** 说明动机、改动点、如何验证、影响面；
- 关联相关 Issue（`Closes #123`）；
- 附截图/录屏（UI/汉化类尤其需要）。

## 评审与合并

- 维护者会 review，可能提出修改意见 —— 在同一分支继续提交即可，PR 会自动更新；
- 触及核心模块的改动可能需要更多讨论，**建议大改动先开 Issue 对齐设计**；
- 合并后，改动会随下次构建发布。

## CI 会做什么

合并到主分支后，GitHub Actions 会 **全自动**：

- 编译 Java 补丁 → d8 → baksmali；
- 编译 native 库（双 ABI）；
- 二进制补丁引擎 `.so`；
- apktool 重组 → zipalign → 签名；
- 发布 GitHub Release。

文档站（`website/`）的改动则由 [文档部署工作流](/about/glossary) 自动构建并发布到 GitHub Pages。所以：**你的改动要能通过 CI 全自动出包**，不要引入需要手动干预的步骤。

## 行为准则

- **友善**：耐心对待新人和提问者；
- **就事论事**：评审针对代码不针对人；
- **尊重定位**：本项目仅供学习研究、非商业（见 [版权](/about/license)）；
- **安全负责**：发现安全问题走私密渠道，别公开 PoC。

## 需要帮助？

- 不确定怎么做 → 先开一个 Issue 问；
- 流程卡住 → 在 PR 里 @ 维护者；
- 感谢每一位贡献者 —— 你们的名字会出现在客户端的贡献者署名区 ❤️
