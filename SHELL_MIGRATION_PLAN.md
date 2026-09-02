# 统一壳层迁移方案（第一阶段：首页 + 情绪表达）

> **状态：已暂缓 / 非当前优先级（2026-09-02 收口）。**
> 本方案与相关实验保留作参考，**不再继续开发**；除非未来出现明确更低风险、更高收益的方案，否则不重新开启。

---

## 性能专项最终结论（2026-09-02，真机实测后收口）

1. 华为系统浏览器 / 桌面 App（Chrome）**前向完整 document navigation 每次约 3～4 秒**（设备级，example.com 亦同；与缓存/SW/解析/解码无关）。
2. **纯同文档壳层实验**（navigation-shell-test.html）可达到**毫秒级切换**（真机 3.5~10ms）。
3. **正式业务迁移试验**（shell-home-emotion.html：真实 index/send-test 放入 iframe 壳层，DOM 显隐 + pushState 切换）经真机多轮测试，**未获得明显实际收益**（正式切换仍约 3.7s 量级），投入产出比不合理。
4. **当前阶段停止继续优化此 3～4 秒导航问题**；降级为“后续优化项”。
5. 后续仅在**明确存在更低风险、更高收益方案**时才重新评估，避免重复同一轮实验。

### 保留为“暂缓参考”的成果（不删除、不继续开发）
- `navigation-shell-test.html`（纯壳层实验）
- `shell-home-emotion.html`（正式业务壳层试验入口，未链接进正式首页）
- 分支 `codex/shell-home-emotion`（未合并 main）
- 真机 CDP 性能诊断结论（含 /tmp 脚本，随环境可重建）
- 本迁移方案文档

### 明确不再投入的方向
重构壳层 / SPA / pushState / Service Worker / 缓存 / WebP 压缩 / 导航性能实验——本轮性能专项全部收口。

---
# 统一壳层迁移方案（第一阶段：首页 + 情绪表达）

> 目标：让地球首页 ⇄ 情绪表达在真机达到同文档即时切换（已由 navigation-shell-test.html 验证 3.5~10ms）。
> 原则：只改变“页面之间怎么切换”，不重做业务；不引新框架；可一键回滚。
> 本文件为设计说明，未实施。

## 0. 当前系统盘点（2026-09-02）

### 正式页面（线上入口）
| 页面 | 角色 | 入口 |
|---|---|---|
| index.html | 地球首页（一级） | 平台根 |
| send-test.html | A｜情绪表达（一级） | index 的 情绪表达 |
| co-create.html | 事业共创（一级） | index 的 事业共创 |
| my-v13.html | 我的空间（一级，经弹窗 JS 进入） | index 我的空间 |
| lugu/*.html | 心域世界子站（10 页） | index 的心域世界 |
| share.html | 收到一份情绪表达（分享/转发落地） | 外部分享链接 |
| download/android/index.html | Android APK 下载页 | 固定 URL |

### 测试页面（保留作实验/回归，不并入壳层）
navigation-shell-test、railway-test、*comp/preview/recheck/intuition/live-test 等约 20 个顶层测试页 + life-space-v1-test、p0-3-compare、tests/。

### 历史/废弃页面
emotion-hub.html（旧 A/B 枢纽）、pure-emotion.html（旧 A 路，仅 emotion-hub 引用）、my.html 与 voice/collection/story/growth（旧我的空间多页版，my-v13 前的体系）、life-space-v1（旧版）、backups/、chutki-3emotions、wronged-3versions 等比较页。

### 临时代码（迁移时可清理/收敛，需逐一评估）
- send-test：`?perf=1` 诊断、debug 面板(renderDiag/preloadDiag 已按 debugMode 门控)、keyboard-open 键盘态、poster 首帧兜底、首屏空闲预载
- index：`?perf=1` 诊断、首页空闲预载 A 路、兔子瓶演示、i18n
- 共同注意：不要因壳层迁移顺手删掉仍在用的诊断/降级逻辑

### 素材重复/废弃（迁移期不动，但记录）
- assets/video 共 ~285MB：fengxin-rabbit-v2(77MB)、sequence 全分辨率(1/2/3/5/8 ≈ 22MB)、mobile 低清(5.4MB，A 路实际用)、video-compare(14MB)、test(9MB)
- assets/music 54MB（首页按需）
- 清理属后续“素材整理”专项，不在壳层迁移范围内

### A/B 路现状
- A 路 = send-test（纯情绪表达，生成+分享），独立于 B 路
- B 路 = share.html + 后端 journey/remix（漂流/转发共创），入口在分享链路，与 A 路编辑页互不干扰（共用后端 /make-send 与 manifest）

## 1. 哪些进入统一壳层（第一阶段最小范围）
- index.html 的“地球首页视图” + send-test.html 的“情绪表达视图”，合并进一个壳 document。
- 壳 document = 以现 index.html 为基础（它是平台根/start_url），把 A 路做成一个同文档内视图。

## 2. 哪些代码独立保留（不进壳层）
- lugu/ 心域世界、co-create.html、my-v13.html（第二阶段再议）
- share.html、download/android（分享/下载落地页，天然独立页面）
- B 路后端、MP4 生成、所有测试页
- A 路内部业务代码（情绪切换/键盘/生成/分享）原样搬入壳内对应 section，不重写

## 3. 资源共享
- 壳层内共享：页面底色/字体/CSS 变量、audio 协调器(LuguMusic)、sw.js、manifest、emotion-manifest.json、?perf=1 诊断框架
- 不共享/需隔离：A 路编辑页的 keyboard-open 与 state-done 规则须限定在 A 路 section 内（已有 html:not(.state-done) 隔离经验，改为按 section/scope 隔离）；首页兔子瓶演示与 A 路画布互不干扰

## 4. 页面状态保存
- 切换时 DOM 显隐即保留 JS 状态（A 路输入文字、已生成视频、语音、情绪选择等原生保留）
- 音乐播放：切走视图时保留音频（LuguMusic 已有 claim/release 协调器）
- 视需要：离开 A 路视图时暂停画布动画以省电；返回时恢复

## 5. URL 如何变化
- 壳层根 URL：`/lugu-love-webb/`（地球首页视图）
- A 路视图：`/lugu-love-webb/?view=emotion`（或 `/lugu-love-webb/emotion` 由 pushState 保持），同 document
- history.pushState 维护：popstate 时切回对应视图；入口按钮不再 href 到 send-test.html

## 6. 浏览器返回键
- popstate → 切回上一视图（同文档，秒级）
- 深链直接打开 ?view=emotion：初载即显示 A 路视图
- 注意：由于不再“前进导航”，系统返回在多视图历史里是视图级返回（接近 BFCache 体验）

## 7. 深链直接打开情绪表达
- 保留兼容：直接访问旧 `/lugu-love-webb/send-test.html` 仍可独立打开（迁移期双轨），或 301/JS 重定向到 `/?view=emotion`
- 从分享/微信进入 send-test.html 的旧链接不断链（建议双轨保留，后续再统一）

## 8. PWA 兼容
- start_url 保持 `/lugu-love-webb/`（壳层首页）
- scope 不变；sw.js 不变（assets Cache First 逻辑与壳层兼容）
- manifest 显示名/图标不变；PWA 安装体验不变

## 9. 分享链路是否受影响
- 不改为同文档前，A 路“生成→结果页→发给TA/保存”逻辑原样在壳内 section 运行，不受影响
- share.html / 后端 /make-send / app-video 不变
- 唯一变化：结果页“返回首页/重新编辑”改为壳内视图切换（不再 location.href）

## 10. 迁移失败一键回滚
- 正式基线：`emotion-system-baseline-2026-09-02`（b19737e）
- 壳层工作在独立分支（如 codex/shell-home-emotion）开发，main 不动
- 失败/异常 → 不合并 main 即线上无感；需要回滚线上 = 分支回退到基线 commit 即可
- 双轨期保留 send-test.html 独立可访问，最坏情况下壳层首页入口临时指回 send-test.html

## 实施顺序建议（确认后执行）
1. 建分支 codex/shell-home-emotion（自基线 b19737e）
2. 壳 document = 复制 index.html 结构 + 内嵌 A 路视图（从 send-test.html 移植渲染函数与 CSS 作用域化）
3. 最小两视图切换（home/emotion）+ pushState/popstate + 返回按钮
4. 真机验收：与实验页对比切换耗时；A 路全流程回归（输入/键盘/生成/预览/发送）
5. 稳定后再考虑 co-create / my-v13 / lugu 并入
