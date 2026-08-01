# 日常运维

把服务托管成长期运行的进程,配好日志、备份与监控。

## 用 systemd 托管

### 推荐:在线一键(root)

仿 MCSManager 风格的远程拉脚本 + `bash` 执行,**不需要 clone 仓库**:

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/MagirecoCN-Revival-Project/magirecocn-resource-server/main/deploy/install.sh | bash"
# 或用 curl
sudo su -c "curl -fsSL https://raw.githubusercontent.com/MagirecoCN-Revival-Project/magirecocn-resource-server/main/deploy/install.sh | bash"
```

弹出交互菜单,选 `1) panel` / `2) node-business` / `3) node-edge`(管道里的 `stdin` 被脚本读 `/dev/tty` 拿到)。
也能跳过菜单直接指定角色:

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/MagirecoCN-Revival-Project/magirecocn-resource-server/main/deploy/install.sh | bash -s -- panel"
sudo su -c "wget -qO- https://raw.githubusercontent.com/MagirecoCN-Revival-Project/magirecocn-resource-server/main/deploy/install.sh | bash -s -- node-business"
sudo su -c "wget -qO- https://raw.githubusercontent.com/MagirecoCN-Revival-Project/magirecocn-resource-server/main/deploy/install.sh | bash -s -- node-edge"
```

二进制脚本会从 [GitHub Release latest](https://github.com/MagirecoCN-Revival-Project/magirecocn-resource-server/releases/latest) 按 `uname -m` 选 `amd64` / `arm64` 自动下载;systemd unit 与边缘 `.env` 模板**内嵌**在脚本里,
没有外部模板文件依赖。

### 从仓库 checkout(开发/离线包)

仓库 `deploy/` 下有同源的 unit 模板,本地执行时优先用本地文件,二进制也优先用 `./magireco-X`、`./bin/`、`/usr/local/bin/`:

```bash
sudo ./deploy/install.sh panel          # 面板
sudo ./deploy/install.sh node-business  # 业务节点
sudo ./deploy/install.sh node-edge      # 边缘节点
#   --bin PATH           指定二进制位置(默认本地查找,都没就下载 Release)
#   --non-interactive    node-edge 跳过交互式 prompt
```

脚本会:

- 建系统用户 `magireco:magireco`(`/usr/sbin/nologin`,无家目录);
- 把二进制装到 `/opt/magireco/<角色>/bin/`,状态目录 `/var/lib/magireco/<角色>/`,日志 `/var/log/magireco/<角色>.log`;
- 把 `deploy/systemd/magireco-<角色>.service` 复制到 `/etc/systemd/system/`,加固项(`NoNewPrivileges` / `ProtectSystem=strict` / `ReadWritePaths` …)已经填好;
- 写 `/etc/magireco/<panel|node-business|node-edge>.env`(权限 `0640 root:magireco`,**原子写**)。

**配置归属**:

| 角色 | 配置归谁管 | 脚本管什么 |
|---|---|---|
| `panel` | 面板自己的 `/install/*` 向导 | 只生成 `CNV_PANEL_KEY` 与 `CNV_ADDR`,其余由向导落地 |
| `node-business` | 面板向导(同凭证写入)或节点自己的 `/setup/*` 向导 | 生成 `CNV_ADMIN_JWT_SECRET`,`CNV_DB_URL` 留空待向导填,`enable` 但**不 start** |
| `node-edge` | `deploy/edge.env.example` 复制成 `/etc/magireco/node-edge.env` | 必填 `CNV_PUBLIC_URL` / `CNV_PRIMARY_RES_DIR` 在交互式提问 |

边缘节点 `.env` 在仓库 `.gitignore` 里以 `*.env` 模式忽略(`*.env.example` 是模板,显式保留),
防止把节点 secret 误提交。

跑完后:

```bash
sudo systemctl status magireco-panel
sudo systemctl status magireco-node-business
sudo systemctl status magireco-node-edge
```

业务节点 `enable` 但不 start —— 等面板向导或 `/setup/*` 填完 `CNV_DB_URL` 再 `systemctl start magireco-node-business`。

### 手工写 unit(理解部署细节用)

不用脚本时,基本结构(以业务节点为例):

```ini
# /etc/systemd/system/magireco-node-business.service
[Unit]
Description=MagiReco Revival Business Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=magireco
Group=magireco
WorkingDirectory=/var/lib/magireco/node-business
EnvironmentFile=/etc/magireco/node-business.env
ExecStart=/opt/magireco/node-business/bin/magireco-node
Restart=on-failure
RestartSec=5s

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/magireco/node-business /var/log/magireco
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`/etc/magireco/node-business.env`(权限 `0640 root:magireco`):

```bash
CNV_NODE_ROLE=business
CNV_ADDR=:8080
CNV_CONTROL_ADDR=127.0.0.1:9090
CNV_ADMIN_JWT_SECRET=...
CNV_DB_URL=postgres://user:pass@localhost:5432/magireco?sslmode=require
CNV_SIGNATURE_WHITELIST=...
CNV_REQUIRE_SIGNATURE=true
CNV_TRUST_PROXY=loopback
```

启用:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now magireco-node-business
sudo systemctl status magireco-node-business
```

面板与边缘节点同构,服务名分别为 `magireco-panel.service` 与 `magireco-node-edge.service`。

## 日志

进程用结构化 JSON 日志打到 stdout,systemd 会收进 journald:

```bash
journalctl -u magireco-node-business -f              # 实时跟踪
journalctl -u magireco-node-business --since "1h ago" # 最近一小时
journalctl -u magireco-node-business -p warning       # 只看 WARN 及以上
```

unit 也通过 `StandardOutput=append:/var/log/magireco/<角色>.log` 把日志旁路到文件,
方便 logrotate 处理(脚本会写 `/etc/logrotate.d/magireco`)。

每条 HTTP 请求一行 INFO(方法、路径、状态码、字节数、耗时、来源 IP)。`panic` 会被恢复中间件转成 500 并打 ERROR + 栈。

**值得留意的 WARN**:

| 日志 | 含义 | 处理 |
|---|---|---|
| `收到空 signature,但未配置白名单` | 签名闸门没开 | 生产应配 `CNV_SIGNATURE_WHITELIST` |
| `client integrity rejected` | 有改包/伪造渠道客户端被拒 | 正常风控,频繁则关注来源 IP |
| `接受任意 signature` | 白名单为空,放行所有 | 同上 |

## 后台定时任务

业务节点内置一组定时任务(无需 cron),周期可在管理后台「定时任务」页调整:

| 任务 | 默认周期 | 作用 |
|---|---|---|
| 封禁过期清理 | 60s | 把到期的封禁置为失效 |
| 会话 GC | 300s | 清理过期的玩家/管理员会话 |
| 心跳超时清理 | 30s | 从内存表移除超时(>120s)的在线设备 |
| 副节点失联清理 | 60s | 删除 >180s 没心跳的副节点 |
| 离线包自动打包 | 按配置 | 定期把资源目录打成离线整包 |

任务在进程内以独立 goroutine 运行,随进程优雅退出(收到 SIGINT/SIGTERM 时停止)。

## 备份

最重要的是数据库。按你选的库定期快照:

```bash
# PostgreSQL —— 每日 cron
pg_dump magireco | gzip > /backup/magireco-$(date +%F).sql.gz

# SQLite —— 热备(不停服)
sqlite3 /srv/magireco/magireco.db ".backup /backup/magireco-$(date +%F).db"
```

**核心三张表**:`config`(运行配置)、`accounts`(玩家身份)、`saves`(云存档)。整库备份自然都覆盖。

资源文件和离线整包通常可由源头重建,优先级低于数据库;但若来之不易也一并备份。

## 升级

1. 备份数据库。
2. 拉新代码 / 换新二进制。
3. 重启服务。迁移在启动时自动跑(幂等,只会新增表/索引,不动既有数据)。
4. 观察日志确认 `业务节点启动` 且无迁移报错。

```bash
sudo systemctl restart magireco-node-business
journalctl -u magireco-node-business --since "1 min ago"
```

> 用 `deploy/install.sh` 重跑同一角色就是升级二进制 —— 脚本幂等,只覆盖 `bin/`
> 与 unit,**不动** 现有 `.env` 与 `/var/lib/magireco/<角色>/`。跑完别忘 `systemctl restart`。

::: tip 灰度建议
重大升级先在一台预发环境用**生产数据库的副本**跑一遍,确认迁移与行为无误再上。
:::

## 平滑停机

进程监听 `SIGINT` / `SIGTERM`,收到后:

- 停止接收新连接,给在途请求最多 10 秒优雅收尾。
- 定时任务 goroutine 随 context 取消而退出。

`systemctl stop` / `Ctrl-C` 都会触发,不会粗暴 kill 掉在途请求。

## 监控指标(自建)

项目没有内置 Prometheus 端点。轻量做法:

- 用 journald 日志里的 `status` / `dur_ms` 字段聚合错误率与延迟(如 Loki + Grafana)。
- 边缘节点用 `/healthz` 给负载均衡探活。
- 数据库层面监控连接数(连接池上限 16)、慢查询。
- 管理后台「仪表盘」「心跳监控」可肉眼看在线规模与下载健康度。

## 常见运维场景

| 场景 | 怎么做 |
|---|---|
| 临时停服维护 | 后台「服务器控制」切 `维护中` + 维护文案;无需重启 |
| 紧急封禁某设备 | 后台「设备封禁」按 device_id 封;或「心跳监控」里直接封在线设备 |
| 强制所有人更新 | 「版本管理」把旧版本移出白名单,旧客户端握手即被 `force_update` |
| 换下载线路 | 「资源管理」改镜像组;或「心跳监控」给个别卡住的设备手动换线 |
| 重置玩家/管理员密码 | `admintool reset-account` / `reset-admin` |
| 轮换资源签名密钥 | 「资源管理」页操作 |

## 节点证书

节点身份走[证书链](/security/node-pki)。**根私钥只在离线机器上**，下面的命令区分在哪台机器执行。

### 首次建根（离线机器）

```bash
admintool ca init -subject=offline-root -out-dir=./ca
```

产出两个文件：

- `ca/root.key` —— 私钥（`0600`）。**留在这台离线机器上，绝不上线、绝不入库。**
- `ca/root.cert` —— 根证书，可公开。分发给所有节点作 `CNV_PKI_ANCHORS`。

::: danger 不要重复执行 ca init
覆盖已有的根会**作废该根签出的全部证书且不可逆**。命令默认拒绝覆盖，要重建须显式加 `-force`。轮换请另建目录并走[多锚重叠期](/security/node-pki#根轮换)，而不是原地覆盖。
:::

### 接入一台新节点

**① 在新节点上**生成密钥对并输出 CSR。私钥就地生成、就地留下，交出去的只有公钥：

```bash
node emit-csr -out=./rs1.csr
# 私钥落在 CNV_PKI_KEY（默认 ./data/pki.key）
```

**② 把 CSR 拷到离线机器**签发：

```bash
admintool ca sign \
  -ca-cert=./ca/root.cert -ca-key=./ca/root.key \
  -csr=./rs1.csr -role=resource -caps=init,resource -out=./rs1.cert
```

::: warning `-role` 与 `-caps` 必须显式指定，且**不从 CSR 采信**
CSR 里那两个字段是申请者自己写的。一台被攻陷的节点只要在 CSR 里写 `role=root` 就能申请到根权限——所以签发时由你决定，CSR 里的值只并排打出来供比对。

即便手滑真按 `-role=root` 签，签发侧仍会拒绝（能力超出签发者 / 角色不可签出），有两道独立防线。
:::

**③ 把签好的证书拷回节点**，配上路径后启动：

```bash
CNV_PKI_ANCHORS=/etc/cnv/root.cert
CNV_PKI_CERT=/etc/cnv/node.cert
CNV_PKI_KEY=/etc/cnv/pki.key
# 边缘节点还要带上上级那张：
CNV_PKI_CHAIN=/etc/cnv/rs1.cert
```

启动时会做三项自检，任何一项不过**拒绝启动**：

| 检查 | 典型报错 |
|---|---|
| 链能锚定到钉住的根 | `链未锚定到任何受信任的根`（多半是漏配 `CNV_PKI_CHAIN`） |
| 私钥与证书配对 | `私钥与证书里的公钥不匹配`（拿错文件） |
| 角色与 `CNV_NODE_ROLE` 一致 | `证书角色是 "edge"，但本节点按 "resource" 运行` |

::: tip 为什么角色那条必须硬拦
另外两项迟早会炸，而**角色配反可能长期无症状**——只是安静地让一台本该只发资源的机器收下了凭证类请求。这是那种上线三个月才被发现的问题。
:::

### 日常续期（自动）

面板每 10 分钟巡检一轮，给过了半个生命周期的**边缘节点**换证：

```
面板 ──cert_csr──►  边缘节点        节点生成 CSR，私钥不出本机
面板 ──cert_sign─►  resource 子CA   子 CA 用自己的在线私钥签
面板 ──cert_install► 边缘节点        节点校验后原子换证
```

面板**不持有任何签名私钥**，只做编排；离线根全程不参与。

**子 CA 不会被自动续期**，它是手工签的（90 天一次）——自动续等于让在线的东西去延长一个本该由人把关的身份。到期前请按「接入一台新节点」的 ②③ 步重签。

### 紧急踢出一台节点

机器被入侵、私钥疑似泄漏时用。**这是唯一能立刻生效的手段**，不用等证书自然过期。

**① 取出要吊销的证书序列号：**

```bash
admintool ca show -in=./edge1.cert | grep 序列号
```

也可以在面板对该节点执行 `cert_status`，返回里带 `serial` 与 `expires_at`。

**② 广播吊销：**

```bash
curl -X POST https://面板地址/api/panel/certs/revoke \
  -H 'Content-Type: application/json' \
  -H "Cookie: $PANEL_SESSION" \
  -d '{"serial":"<序列号>","subject":"edge-tokyo-1",
       "expires_at":<原过期时刻的 Unix 毫秒>,"reason":"机器疑似被入侵"}'
```

**③ 核对未送达列表 —— 这一步不能跳过：**

```json
{
  "delivered": 3,
  "undelivered": { "edge-osaka-2": "节点离线,吊销未送达" },
  "note": "未送达的节点在吊销送达前仍会接受该证书;它们上线后需重新广播"
}
```

::: danger 部分送达就是部分生效
接口**即便部分失败也返回 200**，因为返回 5xx 会让你以为整个操作没生效而重试，但实际上大部分节点已经生效了。

未送达的节点（含离线的）在吊销送达前**仍然会接受这张证书**。它们上线后必须重新广播一次。请把 `undelivered` 当成待办清单，而不是可以忽略的附注。
:::

吊销条目会在原过期时刻自动清理——那之后证书自己已经失效，留着没有意义。
