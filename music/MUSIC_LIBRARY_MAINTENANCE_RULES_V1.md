# 音乐库维护规则 V1

- 文档版本：`V1.0`
- 生效状态：已生效
- 适用范围：七星使者 / 心域平台公共音乐库
- 首个正式基线：`manifest catalogVersion = 20260914-01`
- 正式站接入提交：`9ecef6d05b53f07b9089bcd974a350ff3823d694`

本规范是音乐库长期维护的默认规则。后续新增、替换、下架、版权审核、manifest
更新、R2 发布和播放接入均以本规范为准，不再临时改变规则。若确需修改本规范，
必须形成新文档版本并经过明确审核，不得在单次操作中静默绕过。

## 1. 核心不变量

以下规则不得因排序、改名、换文件、紧急上线或方便操作而改变：

1. `music.core.xxx` 表示一首音乐作品的身份，不是播放槽位。
2. 一个作品 ID 一旦分配，永久对应同一首作品，禁止复用。
3. 不同作品必须分配新的 `music.core.xxx`。
4. 同一作品更换音频文件时：ID 不变，SHA-256 改变，`version + 1`。
5. 同一作品仅修改标题、情绪、排序或其他说明字段时：ID 不变，音频 SHA-256
   不变，音频 `version` 不变。
6. 正式播放必须同时满足：
   - `status === "active"`
   - `license.status === "verified"`
   - 请求的 `contexts[context] === true`
7. `contexts` 只表示允许或计划使用的场景，不单独授予播放资格。
8. `status=active` 不得覆盖、替代或绕过版权检查。
9. 版权无法确认的曲目只能保持 `draft` 或 `blocked`，不得进入正式随机池。
10. 下架优先修改状态和 contexts，不物理删除 R2 文件。
11. 正式 manifest 是公共音乐目录的唯一事实入口。
12. R2 音乐操作只允许写入 `music/` 前缀，不得修改兔/狐视频、七星使者视频、
    `site-assets`、`site-candidates` 或其他既有对象。

## 2. 标准文件与目标位置

仓库内维护文件：

```text
music/catalog/v1/manifest.json
music/catalog/v1/schema.json
music/catalog/v1/sources.local.json
music/audio/v1/<track-id>/<sha256>.<ext>
music/artwork/v1/<track-id>/<sha256>.<ext>
music/previews/v1/<track-id>/<sha256>.<ext>
music/license-evidence/v1/<provider>/
scripts/music/validate_manifest.py
scripts/music/upload_music.py
tests/music/test_manifest_gate.py
```

R2 公共结构：

```text
music/
  catalog/v1/manifest.json
  audio/v1/<track-id>/<sha256>.<ext>
  artwork/v1/<track-id>/<sha256>.<ext>
  previews/v1/<track-id>/<sha256>.<ext>
```

`license-evidence/` 是仓库内的审计材料，不上传到公共 R2 音乐前缀。

## 3. 稳定 ID 规则

### 3.1 分配

- 新作品按顺序分配下一个永久 ID，例如 `music.core.020`。
- 已跳过的编号不得因为“看起来空着”而重新使用。
- ID 不得包含标题、艺术家、情绪、日期或上传批次信息。
- ID 一经发布，不得修改。

### 3.2 同一作品

以下情况仍属于同一作品，必须保留原 ID：

- 重新编码同一音乐作品。
- 替换为更高码率、更高音质或修复后的同一作品文件。
- 替换为同一作品的另一份合法来源版本。
- 更换封面、预听片段、标题、情绪标签或展示顺序。

### 3.3 不同作品

以下情况必须分配新 ID：

- 换成另一首乐曲、另一段编曲或另一个独立作品。
- 对原作品进行重新创作、混音或衍生后，不再被授权或业务认定为同一作品。
- 旧 ID 已归档，但新素材实际是另一首作品。

不能仅凭“文件相似”或“标题相同”判断身份。作品身份决定必须由维护者明确记录；
无法判断时不得复用旧 ID，应暂停并先完成人工确认。

## 4. 新增音乐流程

新增音乐必须完成以下步骤：

1. 从有明确授权页面的正规来源寻找候选，不批量抓取。
2. 为每首候选建立独立来源记录，不得用平台首页或通用许可页代替逐曲证据。
3. 分配新的永久 `music.core.xxx`。
4. 保留合格网页音频，不做无必要转码。
5. 计算实际 `duration`、`bytes` 和 SHA-256。
6. 将音频放入 `music/audio/v1/<id>/<sha256>.<ext>`。
7. 在 `sources.local.json` 增加仓库相对来源映射。
8. 在 manifest 中以 `classification=candidate`、`status=draft` 登记。
9. 补齐来源与版权字段。
10. 运行校验器，确认无错误。
11. 版权核验通过后，将 `license.status` 改为 `verified`。
12. 仅在审核通过后设置 `status=active`，并明确目标 contexts。
13. 上传音频对象并逐项回读校验，最后上传 manifest。
14. 从公网重新读取 manifest、bytes 和 SHA-256，并完成播放验收。

## 5. 版权门禁

### 5.1 最低来源字段

每首音乐至少保存：

- `source.provider`
- `source.providerTrackId`，如果来源平台提供
- `source.sourceUrl`，必须是精确作品页或精确下载页
- `source.acquiredAt`
- `title`
- `creator / artist`，如果来源提供
- `license.type`
- `license.commercialUse`
- `license.attributionRequired`
- `license.licenseProof`

### 5.2 verified 条件

`license.status=verified` 只有在以下条件同时成立时才能使用：

- 许可条件能对应到具体作品。
- 许可证明反映下载当时适用的条款。
- 商业使用、署名、地域、有效期等限制已核对。
- 许可证明或其不可变本地快照已保存。
- 必要时保存精确 provider 记录和版权声明快照。

来自 Pixabay、Mixkit 或其他平台本身不等于 verified。平台品牌、文件名、下载目录名、
艺术家 ID3 标签或网络搜索摘要都不足以单独证明许可。

### 5.3 不满足门禁时

任何来源或许可无法确认的曲目必须：

- `license.status=unverified` 或 `unknown`
- `status=draft` 或 `blocked`
- 不得设置 `status=active`
- 不得进入任何正式随机池或主动选择池

### 5.4 版权状态变化

若授权到期、被撤回、出现权利争议或收到平台声明：

1. 立即将曲目设为 `blocked`。
2. 将相关 contexts 设为 `false`。
3. 更新 manifest 并最后上传。
4. 保留音频和证据用于审计，不因下架而物理删除。

## 6. 替换音乐文件

替换前必须先确认新文件仍属于同一作品。

同一作品替换流程：

1. 保持 `music.core.xxx` 不变。
2. 计算新文件 SHA-256、bytes 和 duration。
3. 使用新的 `<sha256>` 文件名，禁止覆盖旧对象。
4. 将原 `version` 加 1。
5. 更新 manifest 中的 `file`、`url`、`sha256`、`bytes` 和 `duration`。
6. 先上传并回读验证新对象。
7. 最后上传更新后的 manifest。
8. 保留旧对象至少到新版本验收完成，便于回滚。

如果新文件是不同作品，必须停止替换流程并分配新 ID。

相同 SHA-256 重复上传不增加 version。仅修改标题、mood 或排序时也不增加音频
version，但必须重新校验 manifest。

## 7. SHA-256 与 version

- `sha256` 必须是小写 64 位十六进制字符串。
- 音频文件名必须包含内容 SHA-256。
- `bytes` 必须等于实际文件大小。
- `duration` 必须来自实际音频探测，允许校验器定义的小范围误差。
- version 从 1 开始。
- 主音频内容变化时 version 必须增加。
- 未变化的 SHA-256 必须保持原 version。
- 发布前必须运行本地 SHA-256、bytes 和 duration 校验。

## 8. Manifest 规则

`music/catalog/v1/manifest.json` 是正式公共目录。

每个条目至少维护：

```text
id
title
file
url
duration
mood
source
license
status
classification
statusReason
contexts
provider
visibility
mimeType
bytes
sha256
version
artwork
preview
```

约束：

- `schemaVersion` 当前为 `1`。
- 不得擅自改变 v1 字段语义。
- 破坏性结构变化必须建立新的 schema 版本和路径，不得原地修改 v1 含义。
- manifest 不得包含 Secret、Access Key、用户隐私或私有上传信息。
- `file` 是相对 `music/` 的对象键。
- `url` 必须与公开基地址和 `file` 一致。
- `mood` 用于后续筛选，不得删除或改变为不兼容结构。
- `contexts` 当前包含 `earthRandom`、`bottleRandom`、`activeSend`、`opening`。
- 新增、替换、下架时不得删除其他条目来“刷新”文件。

状态定义：

- `draft`：准备或审核中，不可正式播放。
- `active`：版权和内容已通过门禁，可按 contexts 使用。
- `archived`：保留但不再主动使用。
- `blocked`：明确禁止播放，必须排除出正式池。

许可证状态：

- `verified`：证据完整，可按许可使用。
- `unverified`：尚未核验。
- `restricted`：存在明确限制，不能按常规使用。
- `unknown`：来源或许可状态未知。

## 9. R2 发布规则

目标 Bucket：

```text
lugu-love-media-apac
```

发布顺序必须为：

1. 上传新增或替换的音频、封面、预听对象。
2. 逐项进行 HTTP 可访问检查。
3. 回读 bytes 和 SHA-256。
4. 全部通过后，最后上传 manifest。

禁止：

- 先上传 manifest，再补齐音频对象。
- 覆盖不同内容的相同对象键。
- 删除或改写 `music/` 之外的对象。
- 在未授权时执行批量删除。
- 把 Secret 写入脚本、日志、Git 或聊天。

缓存建议：

- 内容 SHA 命名的音频对象使用长期 immutable 缓存。
- manifest 使用短缓存并允许快速失效。
- Candidate 验收页面使用 `no-store`。

R2 凭据继续通过本机 `~/.config/lugu-love/r2.env` 和 macOS Keychain 读取。
Secret 不得进入仓库。公开 CORS 至少允许正式站 Origin：

```text
https://lugu-love.github.io
```

## 10. 播放资格与前端规则

正式选择逻辑必须同时满足：

```text
status == "active"
AND license.status == "verified"
AND contexts[requestedContext] == true
```

具体含义：

- `earthRandom=true` 只说明允许进入地球随机池。
- `bottleRandom=true` 只说明允许进入漂流瓶随机池。
- `activeSend=true` 只说明允许进入未来主动选音乐场景。
- `opening=true` 只说明允许作为开场用途。
- 任何 blocked、archived、draft 或 unverified 曲目不得进入正式随机池。

前端必须继续使用现有播放协调机制，禁止重叠播放。

当前 V1 接入点：

- `lugu-music-library.js`：读取、校验条件筛选和随机选择。
- `lugu-music-coordinator.js`：负责播放所有权与互斥。
- `startVoiceMusic`：沿用正式页现有淡入、停止和播放流程。

不得为了换几首音乐而重写播放器、漂流瓶业务或其他视频逻辑。

## 11. 下架规则

常规下架优先使用状态，不删除文件：

1. 将 `status` 改为 `archived` 或 `blocked`。
2. 将所有不应再使用的 contexts 改为 `false`。
3. 保留原 ID、SHA-256、version、来源和许可证据。
4. 更新 manifest 并最后上传。
5. 验证正式站不再选中该作品。

使用 `archived` 表示正常停止使用；使用 `blocked` 表示版权、合规或安全问题。
物理删除 R2 对象属于独立的数据保留操作，必须单独审批，不能作为日常下架步骤。

## 12. 用户和合作方音乐

V1 公共 `music/` 前缀只放平台审核通过的公共音乐。

未来用户私人音乐必须进入独立私有 Bucket 或鉴权服务，不得写入公共音乐前缀，也不得
写入公开 manifest。合作方或用户来源只有在明确授权、隐私边界和数据清理规则通过后，
才能通过独立 provider adapter 进入系统。

## 13. 发布前校验

所有 manifest 变更至少执行：

```bash
/usr/bin/python3 scripts/music/validate_manifest.py --check-local
/usr/bin/python3 scripts/music/upload_music.py
```

只在确认无误后执行：

```bash
/usr/bin/python3 scripts/music/upload_music.py --publish
```

发布后必须检查：

- manifest HTTP 状态和 CORS
- 每首新对象的 HTTP 状态
- Content-Type
- bytes
- SHA-256 回读
- 实际随机池数量
- blocked 曲目未进入
- 电脑端和移动视口播放
- 无重叠播放
- 无控制台错误、加载错误和跨域错误

## 14. 当前 V1 基线

首个正式 V1 基线：

- manifest catalog version：`20260914-01`
- 正式随机池：15 首
- ID：`music.core.005` 至 `music.core.019`
- 许可证：Mixkit Stock Music Free License
- `license.status=verified`
- `status=active`
- 原历史音乐：`music.core.001` 至 `music.core.004`
- 原历史音乐状态：`legacy + blocked + license.unverified`
- 原历史音乐不得进入新随机池

V1 基线已经验收。未来操作只能在此规范下增量更新，不重写已有作品 ID，不改变播放资格
公式，不修改其他系统的 R2 对象和播放链路。

## 15. 规范修订

本规范变更必须满足：

1. 明确列出变更原因和影响范围。
2. 更新文档版本号。
3. 经过维护负责人审核。
4. 不得通过一次临时脚本或口头规则绕过。

紧急版权或安全事件可先立即将曲目设为 `blocked` 并关闭 contexts；事件受控后必须补齐
manifest、证据和操作记录，使其重新符合本规范。
