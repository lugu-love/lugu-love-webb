# Frontstage + Realtime V1 续接点（2026-10-05 夜）

## 一句话状态

**正式站已上线并全绿，工作树干净，无未完成动作。明天从"运维加固"继续。**

## 发布事实

| 项目 | 值 |
| --- | --- |
| Release | `release-20261005-frontstage-realtime-v1` |
| 正式 commit | `aefdbf0`（= `origin/main` HEAD） |
| rollback commit | `5f901d5` |
| rollback tag | `production-rollback-before-frontstage-realtime-v1`（已推远端） |
| 正式 URL | https://lugu-love.github.io/lugu-love-webb/ |
| 入口指向 | `index.html` → `release-20261005-frontstage-realtime-v1` |
| 工作分支 | `codex/hotfix-ac-20261004`（与 main 同步，0 未推送） |
| 工作树 | **干净** |

## 架构现状（重要，别再踩）

```
正式站（静态）   GitHub Pages        https://lugu-love.github.io/lugu-love-webb/
      ↓ 绝对地址 + CORS:*
后端（动态）     阿里云香港 47.238.108.33
                 /lugu-send/  → 127.0.0.1:8791  (lugu-send.service)
                 /b74/        → 127.0.0.1:8790  (lugu-b74-doubao.service)
                 视频持久目录  /var/lib/lugu-send/app-video/
```

- 正式站与后端**跨域**，靠 `runtime-config.js` 里的 `LUGU_API_BASE="https://suomalianjia.cn/lugu-send"` + 后端 `CORS:*` 打通。
- **硬耦合点**：后端域名或 CORS 一变，正式站 C 链路立刻失效。
- 阿里云**大陆**机器（47.109.185.222）已被弃用于对外入口：`suomaanjia.cn` 无 ICP 备案，阿里云按 SNI 拦截（HTTP 返回 Beaver 备案页，HTTPS 直接 RST）。仅在服务器间反代时走 IP。
- 旧后端 `api.lugu.love` 指向**已删除的 Railway 应用**，任何页面都不应再引用它。

## 今日已完成（全部真机验证）

- Hotfix A：`disableFrontStagePerformance=false` → 漂流瓶放大 / 使者出瓶恢复
- Hotfix C：情绪表达同源化 + 三级分享降级 + 视频持久化（跨重启 URL 有效）
- B74 面对面实时对话：**幂等独立模块**接入，出瓶后显示「面对面聊聊」，对话期间挂住回瓶，结束后回瓶
- 小修：回瓶后复位 `star.clicked`，支持连续再次启动
- 香港本地化：`lugu-send` 与静态站均迁至香港，**0 处大陆引用**，大陆侧 0 次调用
- 正式发布 + 入口切换 + 公网 smoke 全项

**关键踩坑记录**（都写进 `docs/domain-icp-inventory-and-hk-migration.md`）：

1. `<base href>` 指向旧 release 目录 → `runtime-config.js` 从旧目录加载 → API base 缺失 → C 生成失败。**发布新 release 时必须把 base href 改成自引用。**
2. B74 模块若重复 `Object.defineProperty` 会抛 TypeError 并中断整段开瓶初始化 → 必须幂等（现状已是幂等版）。
3. GitHub Pages 构建约需 **5–10 分钟**，且可能先更新入口后更新子目录；切换后要轮询 `pages/builds/latest` 的 `status==built` 再验收。
4. 浏览器会缓存 HTML，验收前必须 `Network.clearBrowserCache` + 带 `?v=` 硬刷新。

## 真机验收结论（HONOR LGE-AN00 / 无线 ADB `192.168.1.8:40835`）

- 首页连续 **3/3** 全绿（文案非空 → zoomLevel=2 → 出瓶 → 入口 → 对话 → 回瓶，轮次间无需刷新）
- 情绪表达：契约无错 → 生成 202→done → 预览 → 分享降级给出可复制链接
- QQ 浏览器：正式站渲染正常、无 JS/网络错误
- 微信内置浏览器：已由你人工验证通过

## 明天第一件事（建议，按优先级）

1. **加监控**：对 `https://suomalianjia.cn/lugu-send/status` 与 `https://suomalianjia.cn/b74/api/health` 各挂定时探测，异常即告警（我可以直接建）。
2. **记录运维手册**：把上面的架构图、跨域硬耦合、发布 checklist（base href 自引用 / Pages 构建轮询 / 硬刷新验收）落成 `docs/OPS-RUNBOOK.md`。
3. **可选加固**：
   - 香港视频目录接对象存储或加备份（现为单机 `/var/lib`，机器挂掉历史视频链接全失效）；
   - `api.lugu.love` 若要用回，需在阿里云把 DNS 指到 47.238.108.33 并签证书（涉你的账号）；
   - `lugu.love` / `www.lugu.love` 的 CNAME 仍指向已失效的阿里云 CDN，品牌入口要恢复同样需你的 DNS 账号。

## 续接第一条命令

```bash
cd /private/tmp/lugu-frontstage-v2 && git fetch origin -q && \
  git log --oneline -1 origin/main && \
  curl -sS -o /dev/null -w "smoke index %{http_code}\n" -L https://lugu-love.github.io/lugu-love-webb/ && \
  curl -sS -o /dev/null -w "lugu-send %{http_code}\n" https://suomalianjia.cn/lugu-send/status && \
  curl -sS -o /dev/null -w "b74 %{http_code}\n" https://suomalianjia.cn/b74/api/health && \
  ssh admin@47.238.108.33 'systemctl is-active lugu-send lugu-b74-doubao nginx'
```

**回滚**（若需）：

```bash
cd /private/tmp/lugu-frontstage-v2
git revert --no-edit 0108b04 aefdbf0   # 或
git push origin 5f901d5:main           # 直接回到 rollback commit
```

---

# 2026-10-05 追补：两处"不是最新版本"的修复

用户反馈：① 入口文案应为「聊一聊呗」；② 瓶内使者与对话内角色不一致（瓶里是狐狸、对话是考拉）。

## 修复 1：入口文案

`面对面聊聊` → `聊一聊呗`（保留旁边圆形 `×` 先回瓶）。已上线验证。

## 修复 2：对话角色与瓶内使者错位

**真机实测到的错位（差一瓶）：**

| 瓶 | 瓶内素材（真实使者） | iframe 角色 |
| --- | --- | --- |
| 1 | `monkey_06_stubborn_...`（凌遥猴） | `xinguang-fox`（光尾狐） |
| 2 | `yunqi-koala-09-...`（云栖考拉） | `lingyao-monkey`（凌遥猴）= 上一瓶 |

**两层根因：**

1. `b74-candidate.js` 的 `__b74SelectCharacter` 在角色表未加载完时 **静默返回 false**
   （`state.characters.find` 为空），而此时 embed 用的仍是创建时的 `requestedCharacter`。
2. **主因**：`ensureFrame` 重建时只 `C.frame.remove()`，**没删旧 overlay**。
   每次开瓶都会多留一个空的 `#frontstageRealtimeOverlay`（实测累积到 **4 个**），
   `document.querySelector('#frontstageRealtimeOverlay')` 命中旧节点，
   于是对话里显示的是上一个使者的角色与情绪。

**修复：**

- `ensureFrame` 以 `character|emotion` 为复用 key，变化时重建；
- 重建前清掉**所有**历史 `#frontstageRealtimeOverlay`（连同其 iframe），并校验 `isConnected`；
- `open()` 里选角色改为等 `__b74Ready` 就绪后再调 `__b74SelectCharacter`。

**真机复验（HONOR，连续 3 瓶）：**

| 瓶 | 瓶内使者 | iframe 角色 | 结果 |
| --- | --- | --- | --- |
| 1 | 暖山熊 `nuanshan-bear-08-...` | 暖山熊 `nuanshan-bear` | ✅ |
| 2 | 风信兔 `rabbit_09_confused_...` | 风信兔 `fengxin-rabbit` | ✅ |
| 3 | 光尾狐 `fox_pink_coquettish_...` | 光尾狐 `xinguang-fox` | ✅ |

overlay 数始终 **1**；按钮文案 **聊一聊呗**；`character_id` 与前场 `characterId` 一一对应
（B74 注册表：fengxin-rabbit / xinguang-fox / xingyu-deer / nuanshan-bear / yunqi-koala / lingyao-monkey / xuanxing-cat）。

commit：`672970c`（文案 + 按角色重建）、`8ea91f4`（清理历史 overlay）。香港副本同步。
