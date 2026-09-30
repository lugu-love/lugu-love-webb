# Huawei Download Hotfix V1

## 根因

- 生成结果只保留 Blob URL，保存依赖 `<a download>` + `blob:`。
- 华为浏览器和微信内置浏览器可能忽略 Blob download，或拿到无效文件。
- 后端实际视频地址是公开 HTTPS URL，位于 `/lugu-send/app-video/*.mp4`，但旧页面没有保留它作为保存兜底。
- 后端当前响应为 `Content-Type: video/mp4`、`Access-Control-Allow-Origin: *`，但旧逻辑没有利用这个 URL。

## 修复

- 生成完成后保留后端 `videoPath` 对应的 HTTPS URL。
- Android/Huawei 保存优先打开该 HTTPS 视频链接，交给系统下载/播放器/DownloadManager 处理。
- 原生 AndroidShare bridge 存在时优先调用系统分享。
- 微信内置浏览器提供“浏览器打开”兜底和明确提示。
- 保留 Blob 下载作为桌面和辅助兜底。
- 不修改视频生成请求、TTS、方言、角色和 A/B 链路。
