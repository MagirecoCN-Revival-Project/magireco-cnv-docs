import { defineConfig } from 'vitepress'

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  魔法纪录复兴计划 —— 统一文档站                                        ║
// ║                                                                      ║
// ║  客户端与服务端文档合并于此。合并的直接原因是可用性：两个仓库各自的      ║
// ║  GitHub Pages 要挂在同一个域名下，必须经 Cloudflare Worker 反代，       ║
// ║  而 Worker 是单点——它一失效两边文档同时从 docs.magireco.top 消失，      ║
// ║  某些地区对 Cloudflare 的访问稳定度本来也不好。                         ║
// ║                                                                      ║
// ║  合成一个仓库后：一个 Pages 直接绑定自定义域名，链路里不再有 Worker。    ║
// ║  文档的设计目标是「服务器全死、没人维护了也要作为社区成果留下来」，      ║
// ║  少一个单点就是少一份消失的可能。                                       ║
// ║                                                                      ║
// ║  base 为 '/'：本仓库 Pages 直接绑 docs.magireco.top（见 public/CNAME）。║
// ╚══════════════════════════════════════════════════════════════════════╝

export default defineConfig({
  lang: 'zh-CN',
  title: '魔法纪录复兴计划',
  description:
    '魔法纪录复兴计划 · 统一文档 —— 玩家指南、自建部署、协议契约、客户端与服务端技术架构、贡献者手册',

  base: '/',

  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,

  // 仓库元文件不是文档页：不排除的话它们会被建成 /README、/NOTICE 两个页面，
  // 出现在站内搜索里，且内容（构建命令、许可声明）对读者是噪音。
  // 它们的读者在 GitHub 上，不在文档站上。
  srcExclude: ['README.md', 'NOTICE.md'],

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#D63384' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '魔法纪录复兴计划 · 文档' }],
    ['meta', { property: 'og:description', content: '玩家指南 · 自建部署 · 协议契约 · 技术架构' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: '首页', link: '/' },
      { text: '玩家指南', link: '/player/', activeMatch: '/player/' },
      { text: '自建部署', link: '/deploy/', activeMatch: '/deploy/' },
      { text: '协议契约', link: '/protocol/', activeMatch: '/protocol/' },
      {
        text: '技术架构',
        items: [
          { text: '客户端实现', link: '/client/' },
          { text: '服务端实现', link: '/server/' },
          { text: '安全机制', link: '/security/' },
        ],
      },
      { text: '参与贡献', link: '/contributing/', activeMatch: '/contributing/' },
      {
        text: '更多',
        items: [
          { text: '术语表', link: '/about/glossary' },
          { text: '玩家常见问题', link: '/player/faq' },
          { text: '部署常见问题', link: '/deploy/faq' },
          { text: '版权与许可', link: '/about/license' },
          { text: '问题反馈', link: '/player/feedback' },
        ],
      },
    ],

    sidebar: {
      '/player/': [
        {
          text: '玩家指南',
          items: [
            { text: '从这里开始', link: '/player/' },
            { text: '下载与安装游戏', link: '/player/install' },
            { text: '下载游戏资源文件', link: '/player/resources' },
            { text: '账号、存档与离线模式', link: '/player/account' },
            { text: '常见问题解答 (FAQ)', link: '/player/faq' },
            { text: '向开发者反馈问题', link: '/player/feedback' },
          ],
        },
      ],

      '/deploy/': [
        {
          text: '自建部署',
          items: [
            { text: '概述：这是什么', link: '/deploy/' },
            { text: '部署前准备', link: '/deploy/prerequisites' },
            { text: '快速部署', link: '/deploy/quick-start' },
            { text: '选择数据库', link: '/deploy/database' },
            { text: '环境变量参考', link: '/deploy/configuration' },
            { text: '节点与面板', link: '/deploy/nodes' },
            { text: '反向代理与域名', link: '/deploy/reverse-proxy' },
          ],
        },
        {
          text: '运维',
          items: [
            { text: '管理后台使用', link: '/deploy/admin-panel' },
            { text: '日常运维', link: '/deploy/operations' },
            { text: '安全加固清单', link: '/deploy/security-checklist' },
            { text: '常见问题', link: '/deploy/faq' },
          ],
        },
      ],

      '/protocol/': [
        {
          text: '协议与契约',
          items: [
            { text: '总览', link: '/protocol/' },
            { text: '客户端 ↔ 服务端握手协议', link: '/protocol/client-server' },
            { text: '网页客户端 ↔ API 服务端', link: '/protocol/api-server' },
            { text: '引擎数据契约', link: '/protocol/engine-data-contracts' },
            { text: '上游游戏后端 API 清单', link: '/protocol/upstream-api' },
          ],
        },
      ],

      '/client/': [
        {
          text: '总览',
          items: [
            { text: '客户端技术导读', link: '/client/' },
            { text: '三层 Patch 架构', link: '/client/architecture' },
          ],
        },
        {
          text: '启动与资源',
          items: [
            { text: '启动引导流程', link: '/client/bootstrap' },
            { text: '资源下载与离线包', link: '/client/resource-flow' },
            { text: '网络层与断点续传', link: '/client/network' },
          ],
        },
        {
          text: '汉化与渲染',
          items: [
            { text: '多层汉化体系', link: '/client/localization' },
            { text: 'WebView 拦截与状态重放', link: '/client/webview' },
          ],
        },
        {
          text: '账号与存档',
          items: [{ text: '账号、存档与心跳', link: '/client/account-save' }],
        },
        {
          text: '底层与构建',
          items: [
            { text: 'Native Hook 层', link: '/client/native-hook' },
            { text: 'Native 引擎逻辑（互操作重建）', link: '/client/native-engine' },
            { text: 'Web 化可行性评估', link: '/client/web-port-feasibility' },
            { text: '序章完成后静默进主页（草案）', link: '/client/prologue-return' },
            { text: '构建系统与 CI', link: '/client/build' },
          ],
        },
      ],

      '/server/': [
        {
          text: '服务端实现',
          items: [
            { text: '系统总览', link: '/server/' },
            { text: '请求生命周期', link: '/server/request-lifecycle' },
            { text: '多节点协调', link: '/server/multi-node' },
            { text: '三套会话体系', link: '/server/sessions' },
            { text: '数据模型', link: '/server/data-model' },
          ],
        },
      ],

      '/security/': [
        {
          text: '安全机制',
          items: [
            { text: '威胁模型与总览', link: '/security/' },
            { text: '客户端安全与防篡改', link: '/security/client' },
            { text: '防改包闸门', link: '/security/anti-tamper' },
            { text: '版本闸门与软提示', link: '/security/version-gates' },
            { text: '节点 PKI 与证书链', link: '/security/node-pki' },
            { text: '会话与令牌', link: '/security/sessions-tokens' },
            { text: '口令哈希 (scrypt)', link: '/security/password-hashing' },
            { text: 'PoW 人机验证', link: '/security/captcha-pow' },
            { text: '限流与防爆破', link: '/security/rate-limiting' },
            { text: '受信任代理与来源 IP', link: '/security/trust-proxy' },
          ],
        },
      ],

      '/contributing/': [
        {
          text: '参与贡献',
          items: [{ text: '从这里开始', link: '/contributing/' }],
        },
        {
          text: '客户端',
          collapsed: false,
          items: [
            { text: '贡献者总览', link: '/contributing/client/' },
            { text: 'Lv.1 零基础贡献者', link: '/contributing/client/beginner' },
            { text: 'Lv.2 进阶贡献者', link: '/contributing/client/intermediate' },
            { text: 'Lv.3 资深贡献者', link: '/contributing/client/advanced' },
            { text: '贡献规范与协作流程', link: '/contributing/client/workflow' },
          ],
        },
        {
          text: '服务端',
          collapsed: false,
          items: [
            { text: '从这里开始', link: '/contributing/server/' },
            { text: '开发环境搭建', link: '/contributing/server/dev-setup' },
            { text: '代码库导览', link: '/contributing/server/codebase-tour' },
            { text: '动手：新增一个接口', link: '/contributing/server/adding-endpoint' },
            { text: '代码规范', link: '/contributing/server/conventions' },
            { text: '契约纪律与文档绑定', link: '/contributing/server/discipline' },
            { text: '协议保真原则', link: '/contributing/server/protocol-fidelity' },
            { text: '运行与编写测试', link: '/contributing/server/testing' },
            { text: '存储层与多方言抽象', link: '/contributing/server/store-dialects' },
            { text: '调度器与后台任务', link: '/contributing/server/scheduler' },
            { text: '资产分发面', link: '/contributing/server/resource-plane' },
            { text: '发布流程与 CI', link: '/contributing/server/release-ci' },
          ],
        },
      ],

      '/about/': [
        {
          text: '关于',
          items: [
            { text: '术语表', link: '/about/glossary' },
            { text: '版权与许可', link: '/about/license' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/MagirecoCN-Revival-Project' },
    ],

    editLink: {
      pattern:
        'https://github.com/MagirecoCN-Revival-Project/magireco-cnv-docs/edit/main/:path',
      text: '在 GitHub 上编辑此页',
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },

    docFooter: { prev: '上一页', next: '下一页' },

    outline: { label: '本页目录', level: [2, 3] },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    footer: {
      message:
        '文档正文以 CC BY-NC-SA 4.0 授权 · 代码部分以 GPLv3 开源 · 本项目仅作学习研究使用，与版权方无任何关联',
      copyright: '© 魔法纪录复兴计划 (MagirecoCN-Revival-Project)',
    },
  },
})
