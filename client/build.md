# 构建系统与 CI

构建的核心是把 Totentanz 客户端 APK（日服原版二开）反编译后注入三层补丁，再重组签名。完整流程跑在 GitHub Actions 上。

## 触发与版本规则

工作流 `.github/workflows/build-apk.yml`：

- **触发**：`push` 到 `main`/`internal-test` 分支（白名单限定核心分支防 fork 误触发），或 `workflow_dispatch`（带布尔输入 `bump_major`）；
- `concurrency` 按 workflow+ref 分组并 `cancel-in-progress`；
- `permissions: contents:write + actions:write`（后者用于持久化版本号 Variables）。

**版本规则**（从 GitHub Variables 读 `APK_VERSION`/`APK_VERSION_CODE`，默认 `4.0.0`/`1`）：

| 触发方式 | 版本变化 |
|---|---|
| `push` | patch +1 |
| `workflow_dispatch` 不勾选 | minor +1，patch 归零 |
| 勾选 `bump_major` | major +1，minor/patch 归零 |

三种情况 VersionCode 一律 +1。产出 `tag_name`(`v<ver>`) 与 `apk_name`(`magireco-cn-v<ver>.apk`)。同步写 `assets/cnv_build_channel.txt`：手动触发=`normal`，push=`internal-test`。

## CI 步骤逐条

| # | 步骤 | 说明 |
|---|---|---|
| 1 | 🛡️ 安全护栏 | 仓库白名单校验，只允许 `MagirecoCN-Revival-Project/magireco-cnv-client` |
| 2 | 🔑 验证访问令牌 | 验证 `GH_TOKEN`，区分 PAT 与内置 token |
| 3 | 📦 检出仓库 | `actions/checkout@v4` |
| 4 | 🔢 计算新版本号 | 上述版本规则 |
| 5 | ☕ 设置 JDK 17 | temurin |
| 6 | 🔧 安装构建工具 | apktool 2.9.3、baksmali 3.0.9、Android build-tools 34.0.0（d8/apksigner/zipalign）、OkHttp 编译期依赖 |
| 7 | 🌐 注入 API Host 与 URL 常量 | 正则替换 `CloudEndpoint`/`BootstrapActivity` 的空串常量；从 keystore 导证书算 SHA-256 注入 `IntegrityGuard.EXPECTED_SIGNATURE_SHA256`；`CNV_DIRECTORY_PUBKEY`（64 位十六进制）注入 `CloudEndpoint.DIRECTORY_PUBKEY`；可选 `CNV_GAME_SERVER_HOST` 覆盖 `FALLBACK_GAME_SERVER_HOST`（不设则用源码默认值）。`CNV_API_HOST` 缺失则 fail |
| 8 | ☕ 编译 Java 补丁 | `javac -source 8 -target 8`（兼容 minSdk 21），classpath = android.jar + OkHttp |
| 9 | 📦 jar→classes3.dex | `d8 --min-api 21`，输出重命名为 `classes3.dex` |
| 10 | 🔍 baksmali → smali_classes3/ | apktool 重组时编进 APK 第 3 个 dex |
| 11 | 🛠 编译 libMagiaClient.so | 对 arm64-v8a / armeabi-v7a 各跑 cmake+ninja（NDK，android-21，Release），`llvm-strip` |
| 12a | 📄 同步出厂兜底资源 | 把 `patch/src/main/assets/` 整树复制进 `assets/`。`cnv_shadow.js` / `ui_dict.json` 的唯一真相源在 `patch/src/main/assets/cnv/`，而 apktool 只打包仓库根的 `assets/`——**此前没有任何步骤对接二者，这两个文件从未进过 APK**，`WebViewInterceptor` 的 assets 兜底必然 miss（详见 [WebView 拦截](/client/webview)）。同步 0 个文件即 fail |
| 12 | 🛡 patch libmadomagi_native.so | `python3 tools/patch_libmadomagi.py`（除非 Variable `PATCH_ENGINE_DOWNLOAD_CHECK == 'false'`） |
| 13 | ✏️ 更新 apktool.yml | 写 versionCode/versionName |
| 14 | 🎵 HCA→OGG | vgmstream 解密(type-56)解码为 WAV → ffmpeg 转 OGG（libvorbis q5），供 `BootstrapActivity` 播启动 BGM/音效。**ffmpeg 不走 apt**，直接从 GitHub 拉 BtbN 预编译静态构建（`releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz`，codec 静态编入含 libvorbis，仅依赖 glibc），下载后校验带 libvorbis 编码器（缺则 `::error::`，与 vgmstream-cli 同套路）；转换不吞 stderr，收尾逐个核对 OGG，缺失则 `::warning::`（音频非关键，**不阻断发版**） |
| 15 | 🔨 重组 APK | `apktool b . -o build/modified.apk` |
| 16 | 📐 zipalign | `zipalign -v -p 4` |
| 17 | 🔏 签名 | base64 解码 keystore，`apksigner sign`（**shell=False**，密码独立参数传递防注入）；无 keystore 则跳过 |
| 18 | 🚀 发布 Release | 仅当已签名。push→prerelease，手动→正式；Compare API 生成 changelog（404 时降级，见下）；用 `github.token` 以 bot 身份发布 |
| 19 | 💾 保存版本号 | REST API 写回 `APK_VERSION`/`APK_VERSION_CODE` |
| 20 | 📊 Job Summary | `if: always()`，判定顺序见下 |

### changelog 生成与「无共同祖先」降级

Release 描述里的「功能更改」默认用 GitHub **Compare API**（`/compare/{上次同类型 Release 的 tag}...{本次提交}`）。

::: warning Compare API 对「无共同祖先」返回 404，不是权限问题
换底包时若把分支重建（例如 `main` 以 orphan 方式新建），旧 tag 会留在老分支上，与新分支**没有任何共同提交**。此时 Compare API 一律返回 **404**——重试、换 token 都没用，日志里只会看到一句 `获取提交记录失败`，Release 的更新日志变成「无法获取提交记录」。

现在遇到 404 会降级：改调 `/repos/{repo}/commits?sha={本次提交}` 列出**本分支**最近 50 条提交，并在开头写明「上一版本与本版本无共同提交历史（分支重建 / 更换底包）」。其它错误码（权限、限流等）仍按原样报 `无法获取提交记录`，不与这种情况混淆。
:::

::: tip 为什么不用 `fetch-depth: 0` 改走本地 git
本仓库是反编译后的 APK 树，`assets/`、`lib/`、`res/` 全是二进制，完整历史的 blob 体积很大，拉全量历史会显著拖慢每一次构建。降级路径纯走 API，不需要本地历史。
:::

### Job Summary 的状态判定顺序

该步骤是 `if: always()`，构建失败时同样会跑，因此**必须先看 `job.status`**（经 env `JOB_STATUS` 传入），顺序为：

1. 有签名 APK 产物 → `✅ 构建成功`
2. `job.status == cancelled` → `⏹️ 构建已取消`
3. 没算出版本号 → `❌ 构建失败（版本计算阶段中止）`
4. `job.status == failure` → `❌ 构建失败（见上方标红的失败步骤日志）`
5. 确实跑完但没配 keystore → `⚠️ APK 未签名（KEYSTORE_BASE64 未配置）`
6. 其余 → `❌ 构建失败（未产出签名 APK）`

::: warning 别把「没有签名 APK」一律归因为 keystore 没配
「没有签名 APK」有多种原因，keystore 没配只是其中一种。早前的分支表把「算出了版本号但没有签名 APK」直接归因成 `KEYSTORE_BASE64` 未配置，于是任何中途失败（如 javac 编译错误）都会在 Job Summary 里显示成 `⚠️ APK 未签名（KEYSTORE_BASE64 未配置）`——keystore 明明配好好的，真正的编译错误反而被这条假线索盖住，排查时先去查了一圈 Secrets。

第 4 条（先判 `job.status == failure`）就是为了堵这个：作业本身失败时如实报告失败，不去猜签名。
:::

## 所需 Secrets / Variables

**Secrets**：

| 名称 | 用途 |
|---|---|
| `GH_TOKEN` | contents:write + variables:write 的 PAT（缺省回退 `github.token`） |
| `KEYSTORE_BASE64` | base64 编码的签名 keystore |
| `KEY_STORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` | 签名密钥参数 |
| `CNV_API_HOST` | **必填**，云端 API 主机 |

**Variables**：

| 名称 | 用途 |
|---|---|
| `CNV_CAP_WORKER_URL` / `CNV_HOME_URL` / `CNV_GITHUB_URL` | 注入到客户端常量 |
| `CNV_DIRECTORY_PUBKEY` | 签名节点目录的 Ed25519 根公钥（64 位十六进制 = 32 字节，公开非密）；缺省则目录验证关闭、回退 `API_HOST` |
| `CNV_GAME_SERVER_HOST` | **可选**。离线模式兜底直连的 Totentanz 后端纯 host。此值随**底包**走而非随部署走，源码已有可用默认值；仅当默认值与当前底包的后端域名不符时才设置。带协议/路径会被自动剥离，非法字符则 fail |
| `CNV_TOTENTANZ_DISCOVERY_URL` | **可选**。上游 Totentanz 引导端点完整 URL；随底包走，源码已有默认值。留空即关闭客户端自主发现（离线模式只剩写死的兜底 host） |
| `CNV_TOTENTANZ_CLIENT_VERSION` | **可选**。向引导端点上报的版本号（底包 `rNNN` 的 NNN，须为整数） |
| `PATCH_ENGINE_DOWNLOAD_CHECK` | 设 `false` 可跳过 native 二进制补丁 |
| `APK_VERSION` / `APK_VERSION_CODE` | 版本号持久化（首次自动从 4.0.0/1 起） |

## 签名密钥生成 gen-signing-key.yml

配套工作流，`workflow_dispatch` 输入 `key_alias`（默认 `magirecocn-public-client`）、`store_password`（留空自动生成 32 位）、`validity_years`（默认 30）等。用 `keytool -genkeypair` 生成 RSA-2048 JKS，base64 编码；勾选 `auto_save_secrets` 则用 `gh secret set` 写入 Secret，否则仅在 Job Summary 展示（密码不入日志）。

## patch_libmadomagi.py

对 `lib/{arm64-v8a,armeabi-v7a}/libmadomagi_native.so` 做最小二进制 patch，把 `DownloadAssetMap::isDownloadComplete(string)` 的返回值强制改为 `true`，让引擎自带的资源核查把每份资源都当作"已下载完成"，从根上杜绝重下。

实现：内置最小 ELF 解析器（读 section headers + `.dynsym`/`.symtab` + strtab），按 mangled 符号查 `st_value` 换算文件偏移，在函数体范围内按指令对齐扫描返回指令并替换：

- arm64：`mov w0,w20`(`e0 03 14 2a`) → `mov w0,#1`(`20 00 80 52`)；
- Thumb：`mov r0,r5`(`28 46`) → `movs r0,#1`(`01 20`)。

支持多 return 出口；**找不到符号或字节签名不匹配（被上游更新）则保守 skip**，不强改。退出码 0=至少一份成功 / 1=全 skip / 2=致命。`--dry-run` 只验证不写，每处 patch 都打印偏移与原值→新值供审计。

## 构建渠道 BuildChannel

决定客户端从哪个 URL 拉自更新 APK：

- `NORMAL = "normal"` —— 本地手动构建默认；
- `INTERNAL_TEST = "internal-test"` —— CI（push 触发）打出的包。

APK 内带 `assets/cnv_build_channel.txt`，运行时经 `AssetManager` 读取并缓存（双检锁）。**容错默认安全侧**：读不到/IO 异常/空行/未知值一律按 `NORMAL`，且只承认这两个字面值。决定用 `Response.updateUrlNormal` 还是 `updateUrlInternalTest`。

## 本地构建

```bash
python3 tools/build.py   # 若仓库提供
```

本地构建的 `cnv_build_channel.txt` 保持 `normal`，且不注入签名 pin（`IntegrityGuard` 签名层跳过，前两层仍生效）。

### 改完 Java 先跑 `tools/verify-compile.sh`

```bash
tools/verify-compile.sh    # 成功退出 0
```

用**与 CI 完全一致**的 classpath（`android.jar` + OkHttp + OkIO，`-source/-target 8`）编译 `patch/src/main/java`。依赖缓存在 `.cache/compile-deps/`（已 gitignore），首次运行需联网拉 android.jar。

::: danger 不要用 grep 过滤 javac 输出来判断成败
本地直接 `javac` 而不带 android.jar，会刷屏 `cannot find symbol`。此时很容易顺手 `grep -v "cannot find symbol"` 把噪音滤掉——**但真正的错误报的是同一句话**：写错变量名、改名后漏改引用，javac 报的同样是 `cannot find symbol`，于是被一起滤掉，直到推上去才被 CI 抓出来（v4.0.101 就是这么挂的：`WebViewInterceptor` 里 `localPath` 改成 `localFile` 后漏了一处引用）。

判断成败要看**退出码**，不要看过滤后的输出。本脚本的职责就是把依赖备齐，让退出码可信。

另外 `android.jar` 必须走 `-cp` 而**不能**走 `-bootclasspath`：放进 bootclasspath 后 JDK 找不到 `java.lang.invoke.LambdaMetafactory`，所有用了 lambda 的类（如 `SaveOverlayService`）都会报 `Unable to find method metafactory`——那是本地环境搭错，不是代码的错。CI 用的也是 `-cp`。
:::

## 文档同步检查 doc-sync-check.yml

强制约定「改客户端代码必须同 commit 更新文档」（见 `.claude/CLAUDE.md`）的**自动兜底**，两道：

- **事前拦截**（Claude Code 提交钩子）：`.claude/hooks/doc-sync-check.py` 注册为 `PreToolUse` 钩子，`git commit` 前检查暂存/将提交的改动——含 `patch/`·`cnv-native/`·`assets/cnv/`·`.github/workflows/` 却无 `website/`·`README`·`.claude/CLAUDE.md` 改动时**阻止提交**（`exit 2`）；确需跳过在提交信息加 `[skip-doc-check]`。钩子自身异常一律放行（fail-open）。
- **事后提示**（CI）：`doc-sync-check.yml` 在每次 push 用 `github.event.commits` 载荷分析（无需 checkout），若代码改动无文档相随，在 Job Summary 红字提示并打 `::warning::`。**非阻断**（直推 main 无法事前 gate）。

两者的代码/文档路径判定保持一致。
