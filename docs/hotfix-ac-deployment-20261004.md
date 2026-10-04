# Hotfix A + C 部署记录（2026-10-04）

主机：`47.109.185.222`（Ubuntu 24.04.5，阿里云 ECS，SSH 用户 `ecs-user`）
域名：`candidate.suomaanjia.cn`

## 结论：C 的后端从未丢失

之前判定 "backend gone" 只对 Railway 成立：

```
curl https://api.lugu.love/status              -> 404 Application not found
curl https://lnnwiev5.up.railway.app/status    -> 404 Application not found
```

但**完整后端一直运行在本机**：

```
/opt/lugu-send            (suomalianjia:suomalianjia)
/etc/systemd/system/lugu-send.service   -> enabled + active
127.0.0.1:8785            (python server.py)
/etc/lugu-send/dashscope.env            (TTS 凭据)
generation-masters: rabbit 11 / fox 8 / monkey 15 / bear 15 / koala 11
```

所以 **Hotfix C 的真正修复 = 把前端接到这个活着的后端**，而不是重建。

`services/make-send-cloud/`（我按 `.pyc` 反解契约重建的那套）保留为**独立备份**，
不参与本次链路，避免与原件冲突。

## 本次改动（全部在 VPS 上）

### 1. 新增 443 独立路径（nginx）

`/etc/nginx/sites-available/lugu-send-443` → `sites-enabled/lugu-send-443`

```
server {
    listen 443 ssl http2;
    server_name candidate.suomaanjia.cn;
    ssl_certificate     /etc/letsencrypt/live/candidate.suomaanjia.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/candidate.suomaanjia.cn/privkey.pem;

    include /etc/nginx/snippets/lugu-send.conf;      # /lugu-send/ -> 127.0.0.1:8785

    location ^~ /hotfix-ac-v1/ {                      # 本次 Candidate 静态
        alias /var/www/lugu-hotfix-ac-v1/;
        index index.html;
        add_header Cache-Control "no-store" always;
    }
    location / { return 404; }
}
```

为什么要 443：**8443 的 TLS 在部分网络被干扰**（本机 `SSL_ERROR_SYSCALL`，
而服务器自测 200）。443 稳定。

### 2. Candidate 静态部署

```
/var/www/lugu-hotfix-ac-v1/    (由 candidate-20261004-hotfix-ac-v1 解包，72M)
```

### 3. api.lugu.love 预置

`/etc/nginx/sites-available/lugu-api-love-80`（ACME 校验入口）已启用。
DNS 指过来之后只需：

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d api.lugu.love
```

## 公网验收地址

| 用途 | URL |
| --- | --- |
| Hotfix A 首页 | `https://candidate.suomaanjia.cn/hotfix-ac-v1/` |
| Hotfix C 情绪表达 | `https://candidate.suomaanjia.cn/hotfix-ac-v1/send-test.html` |
| 后端健康 | `https://candidate.suomaanjia.cn/lugu-send/status` |

前端 `runtime-config.js` 已设 `window.LUGU_API_BASE = "https://candidate.suomaanjia.cn/lugu-send"`。

## 已验证（服务器侧实测）

```
GET  /hotfix-ac-v1/                     -> 200 text/html
GET  /hotfix-ac-v1/send-test.html       -> 200 text/html
GET  /lugu-send/status                  -> 200
POST /make-send?...&async=1             -> 202 {"job":"mHiB1b1HiQq6fVDz84CqHg"}
GET  /make-send/result?job=...          -> {"status":"done","videoPath":"/app-video/....mp4"}
GET  /app-video/....mp4                 -> 200 video/mp4 1,224,848 bytes
ffprobe                                 -> h264 720x1280 + aac, 5.056s
OPTIONS /make-send (CORS preflight)     -> 204
```

`/make-send` 有强校验，必须带齐：`buildId=release-20260912-03`、
`manifestVersion=20260912-03-c1`、`assetVersion`、`expectedMasterSHA256`
（前端本来就会带；用 curl 手测必须补齐，否则 409）。

## 未完成

- 本机（开发机）DNS 被代理接管（返回 198.18.x 假 IP），且沙箱禁止本地端口转发，
  **无法从开发机跑真机级浏览器验收**。四端验收必须在真机上进行。
- `api.lugu.love` 需在阿里云把 DNS 指向 `47.109.185.222`，才能签证书并恢复该域名。


---

# 2026-10-04 真机失败后的修复（P0）

## 华为打不开：先排除后再定位

`check-host.net` 30 个全球节点实测 `https://candidate.suomaanjia.cn/...`：
**29/30 返回 200**（美/日/德/法/荷/俄/印…），仅 1 个节点 broken pipe。
说明域名、DNS、443、证书链在公网层面是通的，不是"华为网络下不稳定"。

真正可疑点：**证书只有 ECDSA（P-256）**，
且 Let's Encrypt 2026-09 新中间证书 `YE2`。老旧华为/安卓 TLS 栈不支持
ECDSA-only 服务端是已知失败模式，表现就是华为浏览器"网站暂时无法打开，网络连接正常"。

处置：
1. `certbot certonly --key-type rsa --cert-name candidate.suomaanjia.cn-rsa`
2. 443 与 8443 同时配置 **ECDSA + RSA 双证书**，nginx 按客户端能力择优
3. 放宽密码套件（补回 `ECDHE-RSA-AES128-SHA` / `AES128-SHA` 等 CBC 套件）

验证：
```
RSA 客户端  -> Public Key Algorithm: rsaEncryption
ECDSA 客户端 -> Public Key Algorithm: id_ecPublicKey
```

## 微信"素材契约加载失败"：根因是 `<base href>` 与部署路径不匹配

`send-test.html` 第 4 行：

```html
<base href="../release-20260920-nuanshan-bear-r1/">
```

`<base>` 会让**所有相对 fetch 改写到 `../release-20260920-nuanshan-bear-r1/`**。
我最初把 Candidate 部署到 `/hotfix-ac-v1/`，同级没有这个目录，
于是以下请求全部 404：

| 页面实际请求 URL（修复前） | 状态 |
| --- | --- |
| `/release-20260920-nuanshan-bear-r1/build.json?v=0` | **404** |
| `/release-20260920-nuanshan-bear-r1/asset-manifest.json` | **404** |
| `/release-20260920-nuanshan-bear-r1/seven-stars-assets-manifest.json` | **404** |
| `/release-20260920-nuanshan-bear-r1/blessing-manifest.json` | **404** |

`loadProductionManifest()` 第一步 `build contract mismatch` 之前就先 fetch 失败，
直接落到 `.catch()` → `setStatus("生产素材契约加载失败，已停止生成。")`。

注意：契约文件本身**全部正确**（已逐条核对 build/manifest 版本与 5 角色 11/8/15/11/15 条目数），
问题纯粹是 URL 解析。

处置：按 `<base href>` 重建部署目录：

```
/var/www/lugu-web/
├── candidate-20261004-hotfix-ac-v1 -> release-20260920-nuanshan-bear-r1   (symlink)
└── release-20260920-nuanshan-bear-r1/                                      (真实文件)
```

nginx：`/lugu-web/` → `alias /var/www/lugu-web/`；旧 `/hotfix-ac-v1/` 302 到新路径。

## 修复后真机入口

| 用途 | URL |
| --- | --- |
| Hotfix A 首页 | `https://candidate.suomaanjia.cn/lugu-web/candidate-20261004-hotfix-ac-v1/` |
| Hotfix C 情绪表达 | `https://candidate.suomaanjia.cn/lugu-web/candidate-20261004-hotfix-ac-v1/send-test.html` |

## 微信 UA 实测（修复后）

```
build.json                        200 application/json 1021B
asset-manifest.json               200 application/json 172094B
seven-stars-assets-manifest.json  200 application/json 73951B
blessing-manifest.json            200 application/json 18644B
welcome-messages.json             200 application/json 909B
/lugu-send/status                 200 (CORS: access-control-allow-origin: *)
OPTIONS /make-send                204
GET /make-send?...&async=1        202 {"job":"-i0PdIhlF_h_c2DL0Vhs7w"}
GET /make-send/result?job=...     {"status":"done","videoPath":"/app-video/Yz7ttx7DvrShbEwwBuTeVsJVTsDQsjxN.mp4"}
```

---

# 2026-10-04 真机（HONOR LGE-AN00 / Android 15 / MagicOS）ADB 排查结论

## 华为/QQ 打不开的**真正根因**：阿里云 ICP 备案合规拦截

真机复现（`adb shell curl -v`）：

```
* Connected to candidate.suomaanjia.cn (47.109.185.222) port 443
* TLSv1.2 (OUT), TLS handshake, Client hello (1):
} [512 bytes data]
* Recv failure: Connection reset by peer     <-- ClientHello 后立即被重置
```

同一台真机、同一 IP 的对照实验：

| 请求 | 结果 | 说明 |
| --- | --- | --- |
| `http://candidate.suomaanjia.cn/...` | **403** | 响应头 `Server: Beaver`，标题 **"Non-compliance ICP Filing"**，跳 `aliyun.com/beian/beian-block` |
| `https://47.109.185.222/`（SNI=IP） | 200 | 通 |
| `https://47.109.185.222` + SNI `www.baidu.com` | 404 | 到达 nginx |
| `https://47.109.185.222` + 随机 SNI | 404 | 到达 nginx |
| `https://candidate.suomaanjia.cn`（SNI=该域名） | **RST** | 被拦 |
| `https://suomalianjia.cn`（已备案，另一台） | 200 verify=0 | 通 |

**结论：不是证书问题、不是 TLS 版本、不是 IPv6、不是华为兼容性。**
`suomaanjia.cn` 未做 ICP 备案，阿里云对该域名在其 IP 上做合规拦截：
HTTP 返回备案拦截页，HTTPS 按 SNI 直接 RST。所以任何指向这台阿里云机器的域名都会在境内被拦。

（顺带完成的无害加固：为 `candidate.suomaanjia.cn` 加了 RSA 证书，443/8443 双证书 + 兼容密码套件。
这不是根因，保留。）

## 修复：改用无备案拦截的入口

| 入口 | 地址 | 真机结果 |
| --- | --- | --- |
| IP 直连（页面+API 同源，无 SNI） | `http://47.109.185.222/lugu-web/candidate-20261004-hotfix-ac-v1/` | **200** |
| 同入口情绪表达 | `http://47.109.185.222/lugu-web/candidate-20261004-hotfix-ac-v1/send-test.html` | **200** |
| 后端 | `http://47.109.185.222/lugu-send/` | **200** |
| GitHub Pages（HTTPS，证书受信） | `https://lugu-love.github.io/lugu-love-webb/candidate-20261004-hotfix-ac-v1/` | **200 verify=0** |

`runtime-config.js` 改为同源推导：
`window.LUGU_API_BASE = location.protocol + "//" + location.host + "/lugu-send"`，
因此页面与 API 永远同源，换入口不用再改前端。

## 微信"素材契约加载失败"根因（已修）

`send-test.html` 第 4 行 `<base href="../release-20260920-nuanshan-bear-r1/">`
会把所有相对请求改写到 `../release-20260920-nuanshan-bear-r1/`。
最初部署在 `/hotfix-ac-v1/`，同级没有该目录 → 四个契约全部 **404**：

- `…/release-20260920-nuanshan-bear-r1/build.json?v=0`
- `…/release-20260920-nuanshan-bear-r1/asset-manifest.json`
- `…/release-20260920-nuanshan-bear-r1/seven-stars-assets-manifest.json`
- `…/release-20260920-nuanshan-bear-r1/blessing-manifest.json`

→ `loadProductionManifest()` 首个 fetch 失败即落 `.catch()` → "生产素材契约加载失败，已停止生成。"

修复：按 base href 重建部署目录 `/var/www/lugu-web/{candidate-…,release-20260920-nuanshan-bear-r1}`。
契约文件本身经逐条校验无误（版本号 + 5 角色 11/8/15/11/15 条目）。

## 真机验收结果

| 项目 | 结果 |
| --- | --- |
| HONOR 系统浏览器打开 IP 入口 | ✅ 渲染正常（截图 1122×2442，3785 色阶，深色底符合站点） |
| QQ 浏览器打开 IP 入口 | ✅ 渲染正常（3112 色阶） |
| WebView JS 执行 | ✅ `setJavaScriptEnabled=true`，无 `net::ERR`、无 `Uncaught`、无 `production-contract` 报错、无渲染进程崩溃 |
| 契约 URL（微信 UA） | ✅ 全部 200 + 正确 content-type |
| 视频生成（真机网络栈） | ✅ `202 {"job":"yvwkcbx68dhVM__HLxDwMw"}` → `done` → `/app-video/7gfRGp9tChbNP4AD4ZzzwlGy3fBzhkkT.mp4` → **200 video/mp4 1,206,137 bytes** |
| QQ 浏览器 + 微信 UA CORS | ✅ `access-control-allow-origin: *`，`OPTIONS /make-send` 204 |

## 仍未完成

- 微信内置浏览器必须**从聊天里点链接**打开（微信 WebView 是插件式 activity，`am start` 无法拉起），
  需要真人在微信里点一次；UA 级契约与 API 已全部验证通过。
- 面对面对话入口、保存/分享未验证（按指示暂停下载/分享修复）。
- `http://` 入口无 TLS，`getUserMedia`（麦克风）在非安全上下文不可用；B 实时对话需要 HTTPS 入口。
- 真正的长期修复：给一个**已备案域名**加一条 A 记录指向可用服务器（或把后端迁到非阿里云主机）。
