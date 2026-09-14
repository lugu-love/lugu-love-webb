from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "music"))

from musiclib import (  # noqa: E402
    DEFAULT_MANIFEST,
    DEFAULT_SOURCES,
    load_json,
    playback_eligible,
    select_for_playback,
    validate_manifest,
    validate_revision_transition,
)


class ManifestGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = load_json(DEFAULT_MANIFEST)
        self.sources = load_json(DEFAULT_SOURCES)

    def test_current_legacy_catalog_is_readable_but_not_publishable(self) -> None:
        result = validate_manifest(self.manifest, sources=self.sources, check_local=True)
        self.assertTrue(result.ok, result.errors)
        legacy_tracks = [
            track
            for track in self.manifest["tracks"]
            if track.get("classification") == "legacy"
        ]
        self.assertEqual(len(legacy_tracks), 4)
        self.assertTrue(all(track["status"] == "blocked" for track in legacy_tracks))
        self.assertTrue(all(track["license"]["status"] == "unverified" for track in legacy_tracks))

    def test_active_without_verified_license_is_rejected(self) -> None:
        manifest = copy.deepcopy(self.manifest)
        track = manifest["tracks"][0]
        manifest["assetBaseUrl"] = "https://media.example/music/"
        track["status"] = "active"
        track["statusReason"] = None
        track["url"] = f"https://media.example/music/{track['file']}"

        result = validate_manifest(manifest, sources=self.sources, check_local=True)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("active status requires license.status=verified" in error for error in result.errors),
            result.errors,
        )

    def test_playback_requires_active_verified_and_requested_context(self) -> None:
        track = copy.deepcopy(self.manifest["tracks"][0])
        track["status"] = "active"
        track["license"]["status"] = "verified"
        track["license"]["licenseProof"] = "https://example.test/license/proof"
        track["contexts"]["earthRandom"] = True
        track["contexts"]["opening"] = False

        self.assertTrue(playback_eligible(track, "earthRandom"))
        self.assertFalse(playback_eligible(track, "opening"))

        track["license"]["status"] = "unverified"
        self.assertFalse(playback_eligible(track, "earthRandom"))

        track["license"]["status"] = "verified"
        track["status"] = "draft"
        self.assertFalse(playback_eligible(track, "earthRandom"))

        tracks = [track, copy.deepcopy(self.manifest["tracks"][1])]
        self.assertEqual(select_for_playback(tracks, "earthRandom"), [])

    def test_same_work_revision_requires_new_version_when_sha_changes(self) -> None:
        previous = copy.deepcopy(self.manifest)
        current = copy.deepcopy(self.manifest)
        current["tracks"][0]["sha256"] = "1" * 64
        current["tracks"][0]["version"] = 1
        errors = validate_revision_transition(previous, current)
        self.assertTrue(any("changed SHA-256 requires version" in error for error in errors), errors)

        current["tracks"][0]["version"] = 2
        self.assertEqual(validate_revision_transition(previous, current), [])


if __name__ == "__main__":
    unittest.main()
