# Music Library Tools

These tools are independent from the rabbit/fox delivery uploader and the
current frontend playback code.

## Read-only validation

```bash
/usr/bin/python3 scripts/music/validate_manifest.py --check-local
```

The validator checks the catalog schema contract, stable IDs, immutable
hash-based object names, local bytes/SHA-256, duration, and the license gate.
`status=active` is rejected unless `license.status=verified` and
`license.licenseProof` are present.

When `--previous-manifest` is supplied, a changed SHA-256 for the same work ID
must increment `version`. A different work must use a new ID; this identity
decision remains an editorial responsibility because two files cannot prove
whether they contain the same composition.

The shared selection helper requires all three conditions before returning a
track for playback: `status=active`, `license.status=verified`, and the
requested context set to `true`. Context flags alone never authorize playback.

## Publish preview

```bash
/usr/bin/python3 scripts/music/upload_music.py
```

Without `--publish`, this only validates the manifest and local files. It does
not read credentials and does not make network requests.

## Publish

```bash
/usr/bin/python3 scripts/music/upload_music.py --publish
```

The publisher:

- reads credentials indirectly from `~/.config/lugu-love/r2.env`;
- passes credentials to curl through stdin rather than process arguments;
- uploads only tracks with `status=active` and a verified license;
- writes only under the `music/` R2 prefix;
- performs authenticated readback and SHA-256 verification;
- uploads the rendered manifest last;
- never deletes objects;
- never touches the rabbit/fox delivery workflow.

The current catalog intentionally has no active tracks, so a publish attempt is
a safe no-op until a candidate has verified rights and is explicitly promoted.
