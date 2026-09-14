# Lugu Love Music Library V1

This directory is the source-of-truth workspace for the public music catalog.
It is intentionally separate from the rabbit/fox delivery uploader and from the
current production playback code.

## R2 layout

```text
music/
  catalog/v1/
    manifest.json
    releases/<catalog-version>.json
  audio/v1/<track-id>/<sha256>.m4a
  artwork/v1/<track-id>/<sha256>.webp
  previews/v1/<track-id>/<sha256>.m4a
  license-evidence/v1/<provider>/
  candidate/v1/index.html
```

Object keys in the catalog manifest are relative to `music/`. For example,
`audio/v1/music.core.001/<hash>.m4a` becomes:

```text
<R2_PUBLIC_BASE_URL>/music/audio/v1/music.core.001/<hash>.m4a
```

`license-evidence/` is repository-local audit material. It is not uploaded to
the public R2 music prefix.

`candidate/v1/index.html` is an isolated acceptance page. It does not modify
the production site and only selects `active`, `verified` tracks whose requested
context is explicitly enabled.

## Publication gate

- `status=active` is allowed only when `license.status=verified`.
- A verified track must include a non-empty `license.licenseProof`.
- `status=active` never overrides an unverified or restricted license.
- Legacy tracks with unclear rights remain `legacy`, `blocked`, and
  `license.unverified` until evidence is supplied.
- Draft and blocked tracks must not be selected by a production random pool.
- A track ID represents the identity of one musical work, not a slot in a
  playlist. Re-encoding, replacing a file with a higher-quality rendition, or
  replacing it with another lawfully sourced version of the same work keeps the
  ID, changes the SHA-256, and increments `version`.
- A different musical work must receive a new `music.core.xxx` ID. IDs are
  never reused.
- Changing a title, order, file, artwork, or encoding must not change the ID of
  the same work.
- A formal selection is eligible only when `status=active`,
  `license.status=verified`, and the requested context is explicitly `true`.
  Context flags alone never grant playback eligibility.
- Private user music must not be written under this public `music/` prefix.
  It belongs in a separate private bucket or authenticated service.

## Source evidence fields

Prefer recording all of the following for every track:

- `source.sourceUrl`
- `source.providerTrackId`
- `source.acquiredAt`
- `license.licenseProof`

`licenseProof` may be a stable provider license URL, a locally retained receipt
path, or another auditable evidence reference. A downloaded filename alone is
not proof of a license.

## Validation

```bash
/usr/bin/python3 scripts/music/validate_manifest.py --check-local
```

The validator is read-only and never uploads an object.
