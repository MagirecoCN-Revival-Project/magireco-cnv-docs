# 安全机制与防篡改

客户端要保护玩家账号与存档，需抵御重打包、组件注入、版本伪造检测等攻击。本页讲安全相关的几个类。

::: tip 安全边界声明
客户端自防篡改 **终可被有 smali 能力者绕过**，本门禁的价值是 **抬高门槛**。重打包的根因防御在 **服务端**：`ClientSignature` 摘要随 `/client/init` 上送，服务端对不匹配的签名 **拒发会话令牌**。
:::

## 防篡改门禁 IntegrityGuard

启动最早期运行（早于任何 token/存档访问），`check(ctx)` 按序跑四层，任一判定篡改即返回 `Verdict{tampered, reason}`。

### ① 包名 pin（始终生效）

运行时 `getPackageName()` 必须等于 `EXPECTED_PACKAGE = "moe.magireco.cnvclient"`。原生 `libMagiaClient.so` 的路径也硬编码此包名，因此即便签名 pin 关闭（本地构建）也能挡"换包名重打包"。

### ② Provider 注入审计（始终生效）

枚举本包全部 `ContentProvider`，对每个 authority：

- 不在白名单 → 篡改（"未授权 ContentProvider"）；
- 在白名单但实现类与期望不符 → 篡改（"实现类被替换"，挡"借用合法 authority 换恶意实现"）；
- 被改成 `exported=true` → 篡改。

白名单 `ALLOWED_PROVIDERS`：

| authority | 期望实现类 |
|---|---|
| `…cnvupdate` | `io.kamihama.cnv.UpdateProvider` |
| `…androidx-startup` | `androidx.startup.InitializationProvider` |
| `…firebaseinitprovider` | `com.google.firebase.provider.FirebaseInitProvider` |

PackageManager 异常时 **保守拦截**（不 fail-open）。该层正面防御"注入 DocumentsProvider 撬私有数据"这一威胁。

### ③ debuggable 检测（仅发布构建）

仅当签名 pin 已注入时强制：运行时 `FLAG_DEBUGGABLE` 被置位 → 篡改。本地/CI 未签名构建跳过。

### ④ 签名 pin（仅当 EXPECTED_SIGNATURE_SHA256 非空时）

比对 `ClientSignature.get(ctx)` 与发布签名 SHA-256。该常量默认空串，由 CI 编译前从 keystore 注入；空 = 本地开发构建，跳过此层（前两层仍生效）。

## 客户端签名 ClientSignature

`get(ctx)` 双检锁 + `volatile cached`，进程内只算一次。`compute(ctx)`：

- API 28+ 用 `GET_SIGNING_CERTIFICATES` + `SigningInfo.getApkContentsSigners()`；
- **不能用 `getSigningCertificateHistory()`** —— 后者返回 v3 旋转血缘历史链头的旧 cert，永远不变，达不到"签名变→hash 变"的目的；前者是"此刻实际生效的签名者"，任何重签都会变；
- 退化路径（API <28）用 `GET_SIGNATURES` + `pi.signatures`；
- 把所有签名者证书 bytes 按序喂进同一个 SHA-256，输出 64 字符小写十六进制。

它是鉴权三件套的 `signature` 字段，也是签名 pin 的数据源。

## 设备指纹 DeviceId

`get(ctx)` 双检锁 + `volatile cached`，**仅进程级缓存，不写 SharedPreferences**。`generate(ctx)`：

- 拼接硬件指纹 `MANUFACTURER|BRAND|MODEL|DEVICE|BOARD|HARDWARE|` + `Settings.Secure.ANDROID_ID`，UTF-8 后 SHA-256 转 64 位十六进制；
- **特性**：硬件绑定、匿名；清数据/卸载重装后不变（Android 8+ ANDROID_ID 按应用签名密钥作用域），仅出厂重置会变；
- **不读** IMEI/MAC/序列号等特权或可定位真人的信息；永不返回 null。

它是鉴权三件套的 `device_id`。

## 本地封禁记录 BanInfo

- 路径 `<filesDir>/cnv_inject/ban.json`，schema `{ "reason": "...", "expire_time": 0 }`（Unix 秒，0=永久）；
- `isActive()`：永久或当前时间 < `expireTime` 时为真；
- `save(...)` **原子写入**：先写 `ban.json.tmp` 并 `fd.sync()`，再 `renameTo`，rename 失败则删临时文件抛异常 —— 避免崩溃导致半写文件 fail-open；
- 用法链路：心跳响应 `action=ban` 时写入，**下次启动 init 握手前读取** 并据 `isActive()` 决定是否拦截进入。

## 版本伪造 Spoof

- 两个 `volatile` 静态字段 `fakeVersion` / `fakeName`；
- `set(name, version)`：空串视同未设置；**版本号必须匹配正则 `\d+\.\d+\.\d+`**，否则记日志并置 null 拒绝；
- 数据来源是 `/client/init` 的 `spoof.fake_version` / `fake_name`；
- 机制：smali 已 patch `NativeBridge.getAppVersion` —— 方法体最前先调 `getFakeVersion()`，非 null 直接 return。效果：桌面/设置看到真实版本，游戏 native / 服务端握手上报伪造版本。S3/服务端未配置时返回 null，spoof 自动关闭。

## 代理后端 ProxyBackends

- `volatile String[] items` + `volatile String gameServerHost`；
- `set(List)` / `setGameServerHost(String)` 在握手成功后由 `handleCloudInit` 写入（数据来自 `services.proxy_backends` / `game_server_host`）；
- `get()` / `getGameServerHost()` 供 native JNI 读取；
- 机制：`libMagiaClient.so` 的 `setURI` 钩子首次触发时经 JNI 读此列表，完成"原版后端 → 代理后端"的 URL 替换。详见 [Native Hook 层](/client/native-hook#端点重定向)。

## 签名节点目录信任锚 NodeDirectory + Ed25519Verify

把"后端地址"从静态信任升级为**可验证的动态信任**：服务端用离线 Ed25519 私钥签发节点目录，客户端用钉死在 APK 里的根公钥验签后才采信。

- **信任锚**：`CloudEndpoint.DIRECTORY_PUBKEY`（32 字节 Ed25519 公钥，64 位十六进制），与 `EXPECTED_SIGNATURE_SHA256` 同级——源码空串、CI 从 Variable `CNV_DIRECTORY_PUBKEY` 注入、私钥**永不上线**。空 = 无法验证 → **忽略目录、回退 `API_HOST`**（安全侧，绝不"跳过校验直接信任"）。
- **验签实现** `Ed25519Verify`：移植自公有领域 TweetNaCl 的 `crypto_sign_open`，SHA-512 取自 `java.security.MessageDigest`，**纯 Java 无第三方依赖、兼容 minSdk 21**（避开 API 33+ 才有的 `java.security` EdDSA）。以 RFC 8032 §7.1 向量 + 真实密钥 interop 本地单测验证。
- **标量规范性检查（`S < L`）**：TweetNaCl 的 `crypto_sign_open` **不检查** `S` 是否小于群阶 `L`，而 RFC 8032 §5.1.7 要求拒绝。少了这一步签名是**可延展**的——拿到任一合法签名的人无需私钥即可构造出 `S' = S + L` 的另一个同样能通过验证的签名。由于目录的 `(payload, sig)` 会落盘并在下次启动重新验签、服务端侧也可能以 `sig` 作幂等/去重键，可延展性在这些位置会被用来绕过。`verify()` 因此在做群运算前先比较 `S`（`sig[32..64)`，小端序）与 `L`，`S >= L` 一律拒绝。
- **方案 B（JWS 风格）**：签名覆盖 base64url 后的 `payload` **字符串字节**，客户端对收到的字节直接验签、验过再解码，无需重序列化 → 消除跨语言字节对齐风险。
- **防回滚**：持久化见过的最大 `seq`（`cnv_node_directory/max_seq`），拒绝 `seq` 更小的目录；合法签名的更高 `seq` 才抬高地板。**抬高地板与落盘 `payload`/`sig` 是同一次写入**，以维持不变量「落盘目录的 `seq` == `max_seq`」——否则一份 `seq` 更高但已过期的目录会把地板抬上去、却留下旧 `payload`，下次启动 `load()` 便因缓存 `seq` 低于地板而判其无效，等于让一份过期目录**永久废掉**本地缓存（只能回退 `API_HOST`，白白丢掉按 `caps` 的能力隔离）。
- **过期**：`now > expires_at` 的目录作废，回退缓存/内置地址。
- **能力隔离（核心安全收益）**：每个节点声明 `caps`，客户端只把对应类请求发给被授权节点——登录/账号/存档凭证**永远不会**发给只有 `resource` 能力的边缘节点。即便攻击者把流量导向边缘节点，凭证也拿不到。
- **持久化再验签**：下次启动 `load()` 时对落盘的 `payload/sig` **重新验签**，防本地文件被篡改。

详见 [握手协议 · 签名节点目录](/protocol/client-server#签名节点目录-directory-按能力路由)。

## 更新 APK 安装 FileProvider UpdateProvider

为给系统安装器递交 APK 而自实现的极简 `ContentProvider`（不依赖 androidx 的 `FileProvider`，减小 dex 体积与合并冲突）：

- `AUTHORITY = "moe.magireco.cnvclient.cnvupdate"`，文件 `cacheDir/client_update.apk`；
- `query` 只回报 `DISPLAY_NAME` 与 `SIZE`；`getType` 固定 `application/vnd.android.package-archive`；`openFile` 只读返回 PFD；
- 更新 APK 的 SHA-256 由 `/client/init` 的 `client.update_apk_sha256` 下发校验。
