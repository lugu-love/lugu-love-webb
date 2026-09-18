# Apple HEVC Alpha 正式生产模板

## 真机验收结论

- 失败链路：`ffmpeg hevc_videotoolbox -alpha_quality 0.8 -pix_fmt yuva420p -tag:v hvc1`
- 真实 iPhone Safari：绿底，不可作为正式 iPhone 交付。
- 成功链路：Apple 原生 `avconvert` + `PresetHEVCHighestQualityWithAlpha`
- 成功验证项：`rabbit-playful`
- 真机结果：透明通过。

## 固定命令

```zsh
/usr/bin/avconvert \
  --source "<带 alpha 的 ProRes 4444 母版.mov>" \
  --preset PresetHEVCHighestQualityWithAlpha \
  --output "<新版本 HEVC Alpha 输出.mov>" \
  --replace \
  --progress
```

## rabbit-playful 成功使用的完整输入源路径

```text
/Users/liangminghua/Desktop/rabbit_15_firstframes_v1/rabbit_05_playful_birefnet_alpha_v1.mov
```

## 使用脚本

```zsh
zsh tools/video-matting/iphone-hevc-alpha/avconvert_with_alpha.sh \
  "/绝对路径/输入-alpha-master.mov" \
  "/绝对路径/输出-hevc-alpha.mov"
```

后续所有 iPhone HEVC Alpha 都复用此模板；旧 ffmpeg HEVC 文件保留，不覆盖。
