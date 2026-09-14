# Music Candidate Onboarding

Candidates from Pixabay, Mixkit, commissioned musicians, or future partners
enter the catalog through the same gate as legacy tracks.

## Required evidence

For each candidate, retain all of the following when available:

- `source.provider`: for example `pixabay` or `mixkit`
- `source.providerTrackId`: the provider's stable track identifier
- `source.sourceUrl`: the exact track page, not only the provider home page
- `source.acquiredAt`: ISO-8601 acquisition timestamp
- `license.status`: `verified` only after the exact track terms are checked
- `license.type`: the named provider license or signed agreement
- `license.licenseProof`: a stable license URL, receipt reference, or retained
  auditable document
- `license.commercialUse`: `true` only when the evidence allows it
- `license.attributionRequired` and `license.attributionText`
- `license.territory` and `license.expiresAt` when the provider specifies them

A provider-level license page alone may not identify the downloaded track. Keep
the exact track page and asset identifier as well.

## Intake flow

1. Create the next permanent `music.core.NNN` ID.
2. Preserve the qualified web asset without unnecessary transcoding.
3. Compute byte count and SHA-256; include the SHA-256 in the object filename.
4. Add a local source mapping in `catalog/v1/sources.local.json`.
5. Register the track as `classification=candidate` and `status=draft`.
6. Run `scripts/music/validate_manifest.py --check-local`.
7. Promote to `status=active` only after `license.status=verified` and a
   non-empty `license.licenseProof` are present.
8. Publish only through `scripts/music/upload_music.py --publish`.

`music.core.xxx` identifies one musical work, not a playback slot.

- Re-encoding the same work, replacing it with a higher-quality file, or
  replacing it with another lawfully sourced rendition of the same work keeps
  the ID, changes the SHA-256, and increments `version`.
- A different musical work must receive a new ID. An old ID is never reused.
- Changing a title, sort position, cover, or file location does not change the
  ID of the same work.

`contexts` only records intended or permitted use. It is not a publication or
playback grant. A formal selection must satisfy all three conditions: the track
is `active`, its license is `verified`, and the requested context is exactly
`true`.

Private user music is outside this workflow and must not be stored under the
public `music/` prefix.
