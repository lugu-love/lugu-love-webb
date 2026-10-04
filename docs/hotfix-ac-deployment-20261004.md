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
