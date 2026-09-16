# 七星 IP 素材库

每个角色使用独立目录，透明 PNG 主素材统一命名为 `main.png`。

## 目录与文件名

- `xingyu-deer/main.png`：星语鹿
- `xinguang-fox/main.png`：心光狐
- `menghu-whale/main.png`：梦湖鲸
- `guangwei-cat/main.png`：光尾猫
- `shouye-bear/main.png`：守夜熊
- `fengxin-rabbit/main.png`：风信兔
- `gongming-gull/main.png`：共鸣鸥

后续如需增加不同用途，可在对应角色目录继续添加：

- `portrait.png`：头像或角色卡片
- `full.png`：全身展示
- `thumbnail.png`：小尺寸列表图
- `bottle.png`：漂流瓶互动专用
- `heart-star.png`：心星互动专用

页面应优先通过同级 `manifest.json` 读取角色名称和素材路径，避免在多个页面重复写死路径。
