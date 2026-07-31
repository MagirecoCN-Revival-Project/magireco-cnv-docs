# 网络层与断点续传

`Net` 是基于 `HttpURLConnection` 的 HTTP 工具类，不引入第三方网络库（OkHttp 仅在 **编译期** 作为依赖，运行时用系统栈）。

## 通用连接配置

`UA = "Magireco-CNV-Bootstrap/1.0"`。`openConnection()`（`Net.java:571`）统一设置：

- connectTimeout（默认 10s）、readTimeout 60s；
- `setInstanceFollowRedirects(true)`；
- `User-Agent` + `Accept: */*`；
- HTTPS 交给系统 TLS 栈。

内存读取上限 `MAX_IN_MEMORY_RESPONSE = 64MB`（超限抛 IOException），由 `readCapped()` 执行。`verboseLog` 由 `setVerboseLog()` 控制，打印 URL / 方法 / 状态码 / 耗时 / 分片进度（对应调试开关 `verbose_net_log`）。

## 文本请求方法

| 方法 | 说明 |
|---|---|
| `getString(url, timeout)` | GET UTF-8 文本，`≥400` 抛异常 |
| `postJson(url, body, timeout)` | `Content-Type: application/json; charset=utf-8`，`setFixedLengthStreamingMode`；`≥400` 时把 errorStream 内容拼进异常 message（便于把服务端拒绝理由透传给用户） |
| `getStringWithToken(url, token, timeout)` | 附 `Authorization: Bearer <token>`，用于 S3/CDN 资源清单 |

## 单线程断点续传 downloadResume()

`downloadResume(url, target, expectedTotal, timeout, sink)`（`:166`）：

1. 若同目录存在 `<target>.cnvprog` 残骸（上次是分片下载留下的预分配占位），先 `setLength(0)` + 删 meta，**从头来过**；
2. **"已完成"判定严格**：仅 `expectedTotal>0 && existing==expectedTotal`（避免半下载文件误判为完成）。`existing > expectedTotal` 则截断重来；
3. `existing>0` 时发 `Range: bytes=existing-`：服务端返 **206** 则 `seek(existing)` 续写，返 **200** 则截断从头；
4. 500ms 节流回调 `onProgress`；
5. 收尾健全性检查 `soFar ≥ expectedTotal`。

## 多线程分片下载 downloadChunked()

`downloadChunked(url, target, expectedTotal, chunks, timeout, sink)`（`:275`）：

1. `chunks≤1 || expectedTotal≤0` → 回退 `downloadResume`；
2. `serverSupportsRange()`（HEAD 探测 `Accept-Ranges: bytes` 且 `Content-Length>0`）不支持 → 回退；
3. **早退判定**：`target.length()==expectedTotal && !meta.exists()` 视为上次完整跑完；
4. 计算每分片 `[start, end]`，`loadProgressMeta()` 恢复进度，`RandomAccessFile.setLength(expectedTotal)` **预分配**，并 **立即 `saveProgressMeta()`**（早退判定正确性的前提）；
5. 固定线程池 `cnv-chunk`，每分片独立 `RandomAccessFile` seek 到自己起点 **并发写**（区域不重叠，对 ext4/F2FS 安全）；
6. 每分片 `downloadOneChunk()` 发 `Range: bytes=startByte-chunkEnd`，每 2 秒及 `finally` 里 `saveProgressMeta()`；
7. 任一分片失败 → 保留 meta 抛 IOException（下一轮断点续传）；全成功后严格校验文件大小，删 meta。

## .cnvprog 断点元数据

下载循环里每写满 **2 秒** 落盘一次进度。计时用 `System.nanoTime()`，与同一循环里的测速窗口共用同一套单调时钟——**不用墙钟**：`System.currentTimeMillis()` 被用户手改或 NTP 回拨后差值为负，"距上次落盘 > 2s" 会长时间不成立，元数据迟迟不写，中途崩溃或断网就得从头重下。

UTF-8 文本格式：

```
<total> <chunks>
<分片0 已下字节数>
<分片1 已下字节数>
...
```

- **原子写**：先写 `<meta>.tmp` 再 `renameTo`；
- `loadProgressMeta()` 在 schema（total/chunks）不匹配或损坏时把 `done[]` 归零但 **保留 meta 文件** —— 因为删 meta 会让早退判定误判为"已完成"（这是一个已修复的 bug，注释中有标注）。

## 谁在用这些方法

| 调用方 | 用途 |
|---|---|
| `ResourceFlow.downloadAll` | 在线全量下载（单文件 `downloadResume` + 心跳换线） |
| `ResourceFlow.applyHotPatch` | 热更包下载（大包 `downloadChunked` 4 线程，小包 `downloadResume`） |
| `ResourceFlow.fetchManifestForGroup` | `getStringWithToken` 拉 S3 XML |
| `ClientInit.*` | `postJson` / `getString` 各云端接口 |
| `BootstrapActivity.downloadAndInstallClientUpdate` | 应用内更新 APK 下载 |
