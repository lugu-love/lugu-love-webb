# Android/Honor 透明图集 fallback —— 小样门禁（第一阶段）

## 结论确认（已定，不再调查）

同一台 HONOR、同一个 URL、同一发布版本，分别用 Honor 系统浏览器与 Chrome 实测：

| 项目 | Honor 系统浏览器 | Chrome |
| --- | --- | --- |
| URL | `release-20261005-frontstage-realtime-v1/` | **完全相同** |
| 引擎 | Chrome/**116** + HonorBrowser/3.8.1.306 | Chrome/**138** |
| 渲染路径 | `<video>`，无 canvas/sprite 回退 | `<video>`，无回退 |
| 素材 | `*_alpha_vp9.webm` | `*_alpha_vp9.webm` |
| `canPlayType('vp9')` | `"probably"` | `"probably"` |
| 首帧四角 RGBA | `[0,144,11,255]` … **alpha=255，greenish 229/256** | 采样被拒（视频未设 crossorigin，画布污染） |

**分流完全相同 → 差异在解码器。** Honor 的 Chromium 116 丢掉 VP9 的 alpha 平面。

## 关键验证：原文件到底有没有 alpha

用桌面 ffmpeg 对同一条素材（sha256 与 manifest 一致）分别用两种解码器抽第 13 帧：

| 解码器 | 四角 RGBA | alpha min/max | 零 alpha 占比 |
| --- | --- | --- | --- |
| **`-c:v libvpx-vp9`** | `(17,143,30,**0**)` | **0 / 255** | **79.8%** |
| 原生 `vp9` | `(17,143,30,**255**)` | 255 / 255 | 0% |

RGB 两路完全一致（绿 = RGB 平面里的遮罩色），**差别只在 alpha 平面**。

> **结论：素材本身带 alpha；原生 `vp9` 解码器不暴露它。Honor 116 的行为等同原生 vp9 解码器。**
>
> ⚠️ 因此离线转换**必须强制 `-c:v libvpx-vp9`**，用默认解码器会导出"看起来正常、其实 alpha 全 255"的假结果。

## 小样门禁结果（光尾狐 1 条 + 凌遥猴 1 条）

样本：
- 光尾狐 `fox_white_hurt_sad_alpha_vp9.webm`（834×1112，24fps，121 帧）
- 凌遥猴 `monkey_01_happy_alpha_vp9.webm`（720×960，24fps，289 帧）

| 门禁项 | 结果 |
| --- | --- |
| ① 导出确实为 RGBA | ✅ |
| ② 背景 alpha=0（非原样导出绿色像素） | ✅ 全透明 80.0% / 全不透明 17.7% |
| ③ 角色边缘无绿边 | ✅ 加 despill 后：偏绿半透明像素 **249 → 0（0.0%）** |
| ④ 帧数 / fps / 时长一致 | ✅ fox 121 帧、monkey 289 帧、均 24fps，与 manifest 完全一致；抽帧耗时 **0.9s/条** |
| ⑤ 打包为现有播放器支持的图集 | ⏳ 待做 |
| ⑥ HONOR 116 真机播放（瓶内/出瓶/情绪表达） | ⏳ 待做 |

转换链：
```
ffmpeg -c:v libvpx-vp9 -i <src>.webm -pix_fmt rgba frames/f_%04d.png
→ Python PIL despill（G 压到 max(R,B)）
→ 打包 atlas（待定格式）
```

## 待办

1. 完成图集打包（需与现有播放器支持的格式对齐；风信兔现行格式为 `mobile/N/sheet-XX.webp`，12 帧/图、4 列×3 行、270px/帧）
2. HONOR 116 真机验收：首页瓶内 / 前场出瓶 / 情绪表达预览
3. 第二阶段（门禁通过后）：扫描 registry 统计全部需要在 Android 播放的 `*_alpha_vp9.webm`，给出总视频数 / 已有图集数 / 缺失数 / 每条大小 / 总新增容量 / 首屏新增下载量 / 预计批处理时间，并按需加载
