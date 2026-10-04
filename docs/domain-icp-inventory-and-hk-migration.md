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
