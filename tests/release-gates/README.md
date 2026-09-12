# Candidate Release Gate

Candidate URL 只能在此门禁通过后提供给人工测试。

## Regular Candidate

```sh
export CANDIDATE_MANIFEST_URL='https://.../candidate/asset-manifest.json'
export CANDIDATE_BUILD_URL='https://.../candidate/build.json'
export CANDIDATE_ASSET_BASE='https://.../candidate/'
export CANDIDATE_BACKEND='https://candidate-backend...'
tests/release-gates/run_candidate_release_gate.sh
```

门禁检查：

1. Preview 与 generation 的 `itemId` / `characterId` / `assetVersion` 一致。
2. generationMaster、webVp9、webHevc、mobileFallback SHA256 与当前生产一致。
3. 兔子预览 poster/sheet 与当前生产同源。
4. Candidate backend status 与 Candidate build/manifest 一致。
5. 历史 item 必须返回 404。
6. 19 条正式 item 使用空文字完成实际生成，从而验证 requested/actual/item/asset/master 合同。

## Identity Rule

- 当前生产基线镜像 Candidate 可使用 `--identity-mode mirror`。
- 任何代码、UI、声音或资产修改后的 Candidate 必须使用 `--identity-mode candidate`。
- 修改后的 Candidate 必须提供新的 `releaseId`、`buildId` 和 `candidateId`。
- 若 asset manifest 发生变化，还必须提供新的 `manifestVersion`。
- `baseProductionRelease` 必须指向当前冻结生产版本。

未通过门禁时，不得发布人工测试 URL。
