# 域名 / 备案盘点 + 香港节点迁移（2026-10-04）

## 一、域名盘点

| 域名 | 当前 DNS | 当前服务器 | 备案证据 | 能否合法指向 47.109.185.222 | 可否立即作 HTTPS 入口 |
| --- | --- | --- | --- | --- | --- |
| `lugu.love` | CNAME → `lugu-love.cn-chengdu.taihangzt.cn`（该 CNAME 无 A 记录，解析失败） | 无（指向已失效的阿里云 CDN） | 无 | 否（DNS 本身就是坏的） | ❌ |
| `www.lugu.love` | CNAME → `www.lugu.love.w.kunlunle.com`（同样无 A 记录） | 无 | 无 | 否 | ❌ |
| `api.lugu.love` | A → `69.46.46.61` | 已删除的 Railway 应用（`Application not found`） | 无 | 否（可改，但域名未备案） | ❌ |
| `suomaanjia.cn` | 无解析 | — | **未备案**（阿里云拦证据见下） | 否 | ❌ |
| `www.suomaanjia.cn` | 无解析 | — | 未备案 | 否 | ❌ |
| `candidate.suomaanjia.cn` | A → `47.109.185.222` | 阿里云大陆（AS37963，成都） | **未备案** | 否 —— 已被阿里云合规拦截 | ❌ |
| `suomalianjia.cn` | A → `47.238.108.33` | **阿里云香港（AS45102）** | 走香港，无需大陆备案 | 是（备案不适用香港） | ✅ **可用** |
| `www.suomalianjia.cn` | A → `47.238.108.33` | 阿里云香港 | 同上 | 是 | ✅ |
| `suomalianjia.com` | A → `47.238.108.33` | 阿里云香港 | 同上 | 是 | ⚠️ 证书不匹配（设备 verify=1） |

### 备案证据（不是靠查询接口，是可复现的现实证据）

`candidate.suomaanjia.cn` HTTP 响应头：

```
HTTP/1.1 403 Forbidden
Server: Beaver
<title>Non-compliance ICP Filing</title>
iframe src="http://www.aliyun.com/beian/beian-block?id=00000000005874048179"
```

HTTPS 同域名：ClientHello 后立即 `Connection reset by peer`（按 SNI 重置）。
同一 IP 换任意其它 SNI（含 `www.baidu.com`）全部正常 → **是域名级备案拦截，不是 TLS 问题**。

`suomalianjia.cn` 在**阿里云香港**，不受大陆备案管辖，真机 `verify=0` 正常。

**结论：不存在可合法指向 47.109.185.222 的已备案域名 → 执行香港节点方案。**

## 二、香港节点迁移

香港机 `47.238.108.33`（Ubuntu 24.04，2C/3.5G/37G 空闲，nginx + node + python3.12）。
凭据：`admin@47.238.108.33`（公钥已可用）。

### 盘点：B 类服务早已在香港

| 服务 | 位置 | 状态 |
| --- | --- | --- |
| `lugu-b74-doubao.service` | 香港 `/opt/lugu-b74/releases/1516d28`（127.0.0.1:8790） | **已在香港运行** |
| `suomalianjia-voice(-v2)` | 香港 3001 / 3101 | 已在香港 |
| `suomalianjia-web`（Next.js） | 香港 3000 / 3100 | 已在香港 |
| `lugu-send` | 大陆 127.0.0.1:8785 | ← 需要迁 |
| `lugu-web`（静态） | 大陆 `/var/www/lugu-web` | ← 需要迁 |

### 已完成的落地（不改业务逻辑）

1. 香港机安装 `ffmpeg` + `fonts-noto-cjk`。
2. 写入 `/etc/nginx/snippets/lugu-web-send.conf`：
   - `^~ /lugu-web/` → 静态
   - `^~ /lugu-send/` → 后端
   并 `include` 进 `suomalianjia.cn` 的 443 server（与既有 `/lugu-b74/` 并列）。
3. 写入 `/etc/systemd/system/lugu-send.service`（端口 8791，`EnvironmentFile=-/etc/lugu-send/dashscope.env`，`GENERATION_MASTERS_DIR`、`TTS_PROVIDER=edge-tts`）。
4. 大陆机把 `lugu-send/app` 与静态站打包，香港机后台拉取（跨境带宽 ~175KB/s，约 365MB，进行中）。

### 上线入口（真机已验证）

| 用途 | URL | 真机结果 |
| --- | --- | --- |
| 首页 | `https://suomalianjia.cn/lugu-web/candidate-20261004-hotfix-ac-v1/` | **200 verify=0** |
| 情绪表达 | `https://suomalianjia.cn/lugu-web/candidate-20261004-hotfix-ac-v1/send-test.html` | **200 verify=0** |
| 契约 `build.json` | `https://suomalianjia.cn/lugu-web/release-20260920-nuanshan-bear-r1/build.json` | **200 verify=0** |
| 契约 `asset-manifest.json` | 同上 | **200 verify=0** |
| 契约 `seven-stars-assets-manifest.json` | 同上 | **200 verify=0** |
| 后端健康 | `https://suomalianjia.cn/lugu-send/status` | **200 verify=0** |
| 后端生成 | `…/make-send?...&async=1` | **202 → done → MP4 1,207,374 B** |

真机浏览器：HONOR 系统浏览器 ✅ 渲染（43.7 万浅色像素 / 6.9 万匹配正文色 `#eef0ff`，无 JS 报错）；
QQ 浏览器 ✅ 渲染（51.9 万浅色像素，无 JS 报错）；均无 `net::ERR` / `Uncaught` / `production-contract`。

当前 `/lugu-send/` 与 `/lugu-web/` 由香港 nginx **反代到大陆**（服务器间走 IP，无 SNI，不触发备案拦截）。
当北京香港机本地的 `lugu-send`（8791）与静态站就绪后，只需把 snippet 的 `proxy_pass` 改为 `http://127.0.0.1:8791/` 与 `root`，即完成真正的本地化迁移。

## 三、Rollback

- 大陆机：`/etc/nginx/sites-enabled/suomalianjia-staging`、`candidate-suomaanjia` 的改动均已加注释块，删除块并 `nginx -s reload` 即回退；服务 `lugu-send.service` 未被改动。
- 香港机：`suomalianjia-http` 只新增一行 `include`，注释掉即回退；`lugu-send.service` 为新增，`systemctl disable` 即移除。
- 正式站入口 `index.html` **未做任何改动**，仍指向 `release-20260920-nuanshan-bear-r1`。

---

# 2026-10-04 香港本地化完成

## 传输与校验

```
大陆 → 香港（经 /lugu-web/_migrate/ 走 IP 直传，无 SNI）
lugu-send-app.tgz  294,454,596 B  md5 94ec07b483894245175446a959b0def5  ✅ 两侧一致
lugu-web.tgz        70,178,101 B  md5 b80f4250c2c57ee2bf4f6e67f8975e7f  ✅ 两侧一致
dashscope.env             134 B
```

## 香港本地部署

| 项目 | 位置 |
| --- | --- |
| 后端代码 | `/opt/lugu-send/app`（108 文件，含 67 个 generation-masters） |
| 虚拟环境 | `/opt/lugu-send/venv`（edge-tts / Pillow / dashscope / psycopg） |
| 凭据 | `/etc/lugu-send/dashscope.env`（600） |
| 静态站 | `/var/www/lugu-web`（899 文件） |
| 服务 | `lugu-send.service` → **active + enabled**，`127.0.0.1:8791` |
| 依赖 | `ffmpeg` 7:6.1.1 + `fonts-noto-cjk` 已装 |

### 两处必要的基础设施调整（非业务逻辑）

1. `server.py` 原硬编码 `ThreadingHTTPServer(("0.0.0.0", port))`，
   初次启动后 **8791 对公网可达**（安全组放行）。改为读 `HOST` 环境变量，unit 内设 `HOST=127.0.0.1`，
   现已只监听 `127.0.0.1:8791`。备份：`server.py.bak-migrate`。
2. `Environment=FONT_FC=Noto Sans CJK SC` 含空格被 systemd 解析成多条无效变量，已加引号。
3. `PrivateTmp=true` → `false`：视频落盘从 `/tmp/systemd-private-*/app-video-cache/`
   改为持久 `/tmp/app-video-cache/`，服务重启后 `/app-video/*.mp4` 链接不再失效。

## nginx 切换

`/etc/nginx/snippets/lugu-web-send.conf`：

```diff
- proxy_pass http://47.109.185.222:80/lugu-send/;     # 大陆反代
+ proxy_pass http://127.0.0.1:8791/;                  # 香港本地
- proxy_pass http://47.109.185.222:80/lugu-web/;      # 大陆反代
+ alias /var/www/lugu-web/;                            # 香港本地静态
```

备份：`lugu-web-send.conf.bak-mainland-proxy`。
`grep -rn "47.109.185.222" /etc/nginx/{sites-enabled,snippets}` → **无任何引用**。
`/lugu-b74/` 的 `include /etc/nginx/snippets/lugu-b74.conf;` **未改动**，`lugu-b74-doubao.service` 仍 active。

## 脱离大陆依赖的证明

| 证据 | 结果 |
| --- | --- |
| 香港 nginx 配置中大陆 IP 引用 | **0 处** |
| 大陆 `lugu-send` 最后一次 `/make-send` 调用 | **10:09:32**（切换前） |
| 切换（约 10:22）之后大陆 `/make-send` 调用数 | **0 次** |
| 香港本地产出物 | `/tmp/app-video-cache/2WA924JE-…mp4`（真机下载的正是该文件） |

## 真机验收（HONOR LGE-AN00 / Android 15 / ADB）

| 项目 | 结果 |
| --- | --- |
| 首页 `/lugu-web/candidate-20261004-hotfix-ac-v1/` | 200 **verify=0** |
| 情绪表达 `send-test.html` | 200 **verify=0** |
| `build.json` / `asset-manifest.json` / `seven-stars-assets-manifest.json` | 200 **verify=0** |
| `/lugu-send/status` | 200 **verify=0** |
| 生成链路（切换后 ×3 次） | 202 → done → MP4 1,210,779 / 1,209,200 B |
| 服务重启后再生成 | 202 → done → MP4 1,209,200 B |
| HONOR 系统浏览器渲染 | ✅ 478,226 浅色像素 |
| QQ 浏览器渲染 | ✅ 553,721 浅色像素 |
| JS 报错 | 无 `net::ERR` / `Uncaught` / `production-contract` |

## Rollback

- 香港 nginx：`cp lugu-web-send.conf.bak-mainland-proxy lugu-web-send.conf && nginx -s reload`（退回大陆反代）
- 香港后端：`systemctl disable --now lugu-send`（不影响其它服务）
- 大陆侧：本次仅新增 `/var/www/lugu-web/_migrate/` 与 nginx 注释块，删除即回退；`lugu-send.service` 未改
- 正式站 `index.html`：**一行未动**

---

# 2026-10-04 视频持久化收口

## 关键发现：仅换目录不够

`/app-video/` 的 token 注册表 `_app_videos` 是**纯内存 dict**，`take_app_video(token)` 只查内存。
服务一重启注册表即空 → 旧链接必然 410，**与文件是否在磁盘无关**。
且 `APP_VIDEO_TTL=600`、`APP_VIDEO_MAX_READS=3`，10 分钟或读 3 次即被删除。

迁移前实测：`/tmp/app-video-cache` 已被 TTL 清空（0 文件），旧 token 返回 **410**。

## 改动

### 1. 配置（无代码）

`/etc/systemd/system/lugu-send.service` 新增：

```
Environment=APP_VIDEO_DIR=/var/lib/lugu-send/app-video
Environment=APP_VIDEO_PERSIST=1
Environment=APP_VIDEO_TTL=315360000        # 10 年
Environment=APP_VIDEO_MAX_READS=1000000
```

### 2. 后端（可选开关，默认关闭）

`server.py` 新增 `APP_VIDEO_PERSIST`，仅在开启时：
- 清理循环不再 `os.remove`
- `take_app_video()` 在内存未命中时按 token 从 `APP_VIDEO_DIR` **磁盘回落**

`_send_app_video` 原有 token 白名单 `[A-Za-z0-9_-]` 已阻止路径穿越。
**不设置该环境变量时行为与原来完全一致。** 备份：`server.py.bak-persist`。

### 3. nginx

`/app-video/` **不需要独立映射** —— 它是 `/lugu-send/` 反代下由后端自己提供的路由
（已确认 nginx 配置中无 `app-video` 条目）。故 nginx 侧本轮无改动，仅做 reload。

## 验证

| 项目 | 结果 |
| --- | --- |
| 旧链接（重启后） | **200**，1,209,609 B |
| 同一 URL 重启前后内容 | md5 **完全一致** `299a64b6a378d0e28f17a36a4422219c` |
| 新生成 | 202 → done → `/app-video/hlEH4uQ8TxkK6UVAd0qiN6rJ3aut9RUj.mp4` |
| 新视频 | 200 `video/mp4` 1,208,409 B；ffprobe `h264 720x1280 + aac, 5.056s` |
| 持久目录 | `/var/lib/lugu-send/app-video`，2 文件 / 2.4M |
| `lugu-send` | active + enabled |
| nginx | active |
| `/lugu-b74/` | **未改动**，`lugu-b74-doubao.service` active，308 |

## Rollback

- 关持久化：unit 中删除 `APP_VIDEO_DIR/APP_VIDEO_PERSIST/APP_VIDEO_TTL/APP_VIDEO_MAX_READS` 四行 → 回到 `/tmp` + 600s TTL 原行为
- 回滚代码：`cp server.py.bak-persist server.py`
