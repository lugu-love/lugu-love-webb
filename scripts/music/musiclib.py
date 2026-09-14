#!/usr/bin/env python3
"""Music catalog validation helpers for the Lugu Love music library."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = REPO_ROOT / "music" / "catalog" / "v1" / "manifest.json"
DEFAULT_SOURCES = REPO_ROOT / "music" / "catalog" / "v1" / "sources.local.json"

TOP_LEVEL_REQUIRED = {
    "schemaVersion",
    "catalogVersion",
    "updatedAt",
    "assetBaseUrl",
    "tracks",
}

TRACK_REQUIRED = {
    "id",
    "title",
    "file",
    "url",
    "duration",
    "mood",
    "source",
    "license",
    "status",
    "classification",
    "statusReason",
    "contexts",
    "provider",
    "visibility",
    "mimeType",
    "bytes",
    "sha256",
    "version",
    "artwork",
    "preview",
}

SOURCE_REQUIRED = {
    "type",
    "provider",
    "providerTrackId",
    "sourceUrl",
    "acquiredAt",
    "notes",
}

LICENSE_REQUIRED = {
    "status",
    "type",
    "licenseProof",
    "commercialUse",
    "attributionRequired",
    "attributionText",
    "expiresAt",
    "territory",
}

CONTEXT_REQUIRED = {"earthRandom", "bottleRandom", "activeSend", "opening"}
PROVIDER_REQUIRED = {"type", "id"}

TRACK_STATUSES = {"draft", "active", "archived", "blocked"}
CLASSIFICATIONS = {"legacy", "candidate", "commissioned", "partner", "user"}
LICENSE_STATUSES = {"verified", "unverified", "restricted", "unknown"}
VISIBILITIES = {"public", "unlisted", "private"}
PROVIDER_TYPES = {"internal", "partner", "user", "external"}
MIME_TYPES = {"audio/mp4", "audio/mpeg", "audio/wav"}

ID_PATTERN = re.compile(r"^music\.[a-z0-9.-]+\.[0-9]{3}$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


@dataclass
class ValidationResult:
    errors: list[str]
    warnings: list[str]
    summary: dict[str, int]

    @property
    def ok(self) -> bool:
        return not self.errors


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def playback_eligible(track: Any, context: str) -> bool:
    """Return true only when status, license, and the exact context all allow playback."""
    if not isinstance(track, dict):
        return False
    if track.get("status") != "active":
        return False
    license_data = track.get("license")
    if not isinstance(license_data, dict) or license_data.get("status") != "verified":
        return False
    contexts = track.get("contexts")
    return isinstance(contexts, dict) and contexts.get(context) is True


def select_for_playback(tracks: Any, context: str) -> list[dict[str, Any]]:
    if not isinstance(tracks, list):
        return []
    return [track for track in tracks if playback_eligible(track, context)]


def validate_revision_transition(previous: Any, current: Any) -> list[str]:
    """Check version/SHA rules when a previous catalog revision is available."""
    errors: list[str] = []
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return ["revision: previous and current manifests must be objects"]
    old_tracks = previous.get("tracks")
    new_tracks = current.get("tracks")
    if not isinstance(old_tracks, list) or not isinstance(new_tracks, list):
        return ["revision: previous and current tracks must be arrays"]

    old_by_id = {
        track.get("id"): track
        for track in old_tracks
        if isinstance(track, dict) and isinstance(track.get("id"), str)
    }
    for index, track in enumerate(new_tracks):
        if not isinstance(track, dict) or not isinstance(track.get("id"), str):
            continue
        track_id = track["id"]
        old = old_by_id.get(track_id)
        if not isinstance(old, dict):
            continue
        old_sha = old.get("sha256")
        new_sha = track.get("sha256")
        old_version = old.get("version")
        new_version = track.get("version")
        if old_sha != new_sha:
            if not isinstance(new_version, int) or not isinstance(old_version, int):
                errors.append(f"revision.tracks[{index}]: {track_id} version must be an integer")
            elif new_version <= old_version:
                errors.append(
                    f"revision.tracks[{index}]: {track_id} changed SHA-256 requires version > {old_version}"
                )
        elif old_version != new_version:
            errors.append(
                f"revision.tracks[{index}]: {track_id} unchanged SHA-256 must keep version {old_version}"
            )
    return errors


def probe_duration(path: Path) -> float | None:
    ffprobe = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
    if not Path(ffprobe).is_file():
        return None

    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return None
    try:
        return float(completed.stdout.strip())
    except ValueError:
        return None


def _missing_keys(value: Any, required: set[str]) -> set[str]:
    if not isinstance(value, dict):
        return required
    return required - value.keys()


def _expect_mapping(value: Any, path: str, required: set[str], errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{path}: expected object")
        return False
    missing = sorted(_missing_keys(value, required))
    if missing:
        errors.append(f"{path}: missing fields: {', '.join(missing)}")
        return False
    unknown = sorted(value.keys() - required)
    if unknown:
        errors.append(f"{path}: unknown fields: {', '.join(unknown)}")
        return False
    return True


def _load_sources(sources: Any, errors: list[str]) -> dict[str, str]:
    if sources is None:
        return {}
    if not isinstance(sources, dict):
        errors.append("sources: expected object")
        return {}
    if sources.get("schemaVersion") != 1:
        errors.append("sources.schemaVersion: expected 1")
    values = sources.get("sources")
    if not isinstance(values, dict):
        errors.append("sources.sources: expected object")
        return {}
    result: dict[str, str] = {}
    for track_id, local_file in values.items():
        if not isinstance(track_id, str) or not isinstance(local_file, str):
            errors.append(f"sources.sources[{track_id!r}]: expected string values")
            continue
        result[track_id] = local_file
    return result


def _validate_source(source: Any, path: str, errors: list[str]) -> None:
    if not _expect_mapping(source, path, SOURCE_REQUIRED, errors):
        return


def _validate_license(license_data: Any, path: str, errors: list[str]) -> None:
    if not _expect_mapping(license_data, path, LICENSE_REQUIRED, errors):
        return
    if license_data["status"] not in LICENSE_STATUSES:
        errors.append(f"{path}.status: invalid value {license_data['status']!r}")
    if not isinstance(license_data["type"], str) or not license_data["type"]:
        errors.append(f"{path}.type: expected non-empty string")
    proof = license_data.get("licenseProof")
    if proof is not None and (not isinstance(proof, str) or not proof.strip()):
        errors.append(f"{path}.licenseProof: expected non-empty string or null")
    if license_data["status"] == "verified" and not proof:
        errors.append(f"{path}: verified license requires licenseProof")


def _validate_contexts(contexts: Any, path: str, errors: list[str]) -> None:
    if not _expect_mapping(contexts, path, CONTEXT_REQUIRED, errors):
        return
    for key in CONTEXT_REQUIRED:
        if not isinstance(contexts[key], bool):
            errors.append(f"{path}.{key}: expected boolean")


def _validate_provider(provider: Any, path: str, errors: list[str]) -> None:
    if not _expect_mapping(provider, path, PROVIDER_REQUIRED, errors):
        return
    if provider["type"] not in PROVIDER_TYPES:
        errors.append(f"{path}.type: invalid value {provider['type']!r}")
    if not isinstance(provider["id"], str) or not provider["id"]:
        errors.append(f"{path}.id: expected non-empty string")


def _validate_mime_and_file(track: dict[str, Any], path: str, errors: list[str]) -> None:
    object_key = track.get("file")
    mime_type = track.get("mimeType")
    sha256 = track.get("sha256")
    if not isinstance(object_key, str) or not object_key.startswith("audio/v1/"):
        errors.append(f"{path}.file: expected audio/v1/... object key")
        return
    if mime_type not in MIME_TYPES:
        errors.append(f"{path}.mimeType: invalid value {mime_type!r}")
        return
    expected_suffix = {
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
    }[mime_type]
    if not object_key.endswith(expected_suffix):
        errors.append(f"{path}.file: suffix does not match {mime_type}")
    if isinstance(sha256, str) and sha256 not in Path(object_key).name:
        errors.append(f"{path}.file: immutable filename must contain sha256")


def _validate_active_policy(track: dict[str, Any], path: str, errors: list[str]) -> None:
    status = track.get("status")
    license_data = track.get("license")
    contexts = track.get("contexts")
    if status not in TRACK_STATUSES:
        errors.append(f"{path}.status: invalid value {status!r}")
        return
    if status == "blocked" and not track.get("statusReason"):
        errors.append(f"{path}.statusReason: blocked tracks require a reason")
    if status != "active":
        return

    if not isinstance(license_data, dict):
        return
    if license_data.get("status") != "verified":
        errors.append(f"{path}: active status requires license.status=verified")
    if not license_data.get("licenseProof"):
        errors.append(f"{path}: active status requires license.licenseProof")
    if not track.get("url"):
        errors.append(f"{path}.url: active tracks require a URL")
    if isinstance(contexts, dict) and not any(contexts.values()):
        errors.append(f"{path}.contexts: active track must enable at least one context")
    if track.get("visibility") != "public":
        errors.append(f"{path}.visibility: public catalog active tracks must be public")


def _resolve_local_source(repo_root: Path, relative: str, path: str, errors: list[str]) -> Path | None:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        errors.append(f"{path}: local source must be a repo-relative path without '..'")
        return None
    return repo_root / candidate


def validate_manifest(
    manifest: Any,
    repo_root: Path = REPO_ROOT,
    sources: Any = None,
    check_local: bool = True,
) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    if not _expect_mapping(manifest, "manifest", TOP_LEVEL_REQUIRED, errors):
        return ValidationResult(errors, warnings, {})

    if manifest.get("schemaVersion") != 1:
        errors.append("manifest.schemaVersion: expected 1")
    catalog_version = manifest.get("catalogVersion")
    if not isinstance(catalog_version, str) or not re.fullmatch(r"[0-9]{8}-[0-9]{2}", catalog_version):
        errors.append("manifest.catalogVersion: expected YYYYMMDD-NN")
    asset_base_url = manifest.get("assetBaseUrl")
    if asset_base_url is not None and not isinstance(asset_base_url, str):
        errors.append("manifest.assetBaseUrl: expected string or null")
    tracks = manifest.get("tracks")
    if not isinstance(tracks, list):
        errors.append("manifest.tracks: expected array")
        return ValidationResult(errors, warnings, {})

    source_map = _load_sources(sources, errors) if check_local else {}
    seen_ids: set[str] = set()
    seen_files: set[str] = set()

    for index, track in enumerate(tracks):
        path = f"manifest.tracks[{index}]"
        if not _expect_mapping(track, path, TRACK_REQUIRED, errors):
            continue

        track_id = track["id"]
        if not isinstance(track_id, str) or not ID_PATTERN.fullmatch(track_id):
            errors.append(f"{path}.id: invalid stable id {track_id!r}")
        elif track_id in seen_ids:
            errors.append(f"{path}.id: duplicate id {track_id!r}")
        else:
            seen_ids.add(track_id)

        title = track["title"]
        if not isinstance(title, str) or not title.strip():
            errors.append(f"{path}.title: expected non-empty string")

        duration = track["duration"]
        if not isinstance(duration, (int, float)) or isinstance(duration, bool) or duration <= 0:
            errors.append(f"{path}.duration: expected positive number")
        mood = track["mood"]
        if not isinstance(mood, list) or not mood or not all(isinstance(item, str) and item for item in mood):
            errors.append(f"{path}.mood: expected non-empty string array")

        classification = track["classification"]
        if classification not in CLASSIFICATIONS:
            errors.append(f"{path}.classification: invalid value {classification!r}")
        if track["visibility"] not in VISIBILITIES:
            errors.append(f"{path}.visibility: invalid value {track['visibility']!r}")
        if not isinstance(track["version"], int) or isinstance(track["version"], bool) or track["version"] < 1:
            errors.append(f"{path}.version: expected positive integer")
        if not isinstance(track["bytes"], int) or isinstance(track["bytes"], bool) or track["bytes"] < 1:
            errors.append(f"{path}.bytes: expected positive integer")
        sha256 = track["sha256"]
        if not isinstance(sha256, str) or not SHA256_PATTERN.fullmatch(sha256):
            errors.append(f"{path}.sha256: expected lowercase 64-character digest")

        _validate_source(track["source"], f"{path}.source", errors)
        _validate_license(track["license"], f"{path}.license", errors)
        _validate_contexts(track["contexts"], f"{path}.contexts", errors)
        _validate_provider(track["provider"], f"{path}.provider", errors)
        _validate_mime_and_file(track, path, errors)
        _validate_active_policy(track, path, errors)

        if track["provider"].get("type") == "user" and track["visibility"] == "public":
            errors.append(f"{path}: user-owned tracks must not use the public catalog")

        object_key = track.get("file")
        if isinstance(object_key, str):
            if object_key in seen_files:
                errors.append(f"{path}.file: duplicate object key {object_key!r}")
            seen_files.add(object_key)

        if not check_local or not isinstance(track_id, str):
            continue

        relative = source_map.get(track_id)
        if not relative:
            message = f"{path}: no local source mapping for {track_id}"
            if track["status"] == "active":
                errors.append(message)
            else:
                warnings.append(message)
            continue

        local_path = _resolve_local_source(repo_root, relative, f"sources.{track_id}", errors)
        if local_path is None:
            continue
        if not local_path.is_file():
            message = f"{path}: local source does not exist: {relative}"
            if track["status"] == "active":
                errors.append(message)
            else:
                warnings.append(message)
            continue

        actual_size = local_path.stat().st_size
        if actual_size != track["bytes"]:
            errors.append(
                f"{path}.bytes: manifest={track['bytes']} local={actual_size} for {relative}"
            )

        actual_sha = sha256_file(local_path)
        if actual_sha != track["sha256"]:
            errors.append(f"{path}.sha256: local digest mismatch for {relative}")

        actual_duration = probe_duration(local_path)
        if actual_duration is None:
            warnings.append(f"{path}.duration: ffprobe unavailable for {relative}")
        else:
            tolerance = max(1.5, float(track["duration"]) * 0.01)
            if abs(actual_duration - float(track["duration"])) > tolerance:
                errors.append(
                    f"{path}.duration: manifest={track['duration']} local={actual_duration:.6f} for {relative}"
                )

        source_data = track.get("source", {})
        if track["status"] == "active" and not source_data.get("sourceUrl"):
            warnings.append(f"{path}.source.sourceUrl: active track has no source URL")
        if track["status"] == "active" and not source_data.get("providerTrackId"):
            warnings.append(f"{path}.source.providerTrackId: active track has no provider track ID")

    active_tracks = [track for track in tracks if isinstance(track, dict) and track.get("status") == "active"]
    if active_tracks and not asset_base_url:
        errors.append("manifest.assetBaseUrl: required when active tracks exist")

    summary = {
        "tracks": len(tracks),
        "active": sum(1 for track in tracks if isinstance(track, dict) and track.get("status") == "active"),
        "draft": sum(1 for track in tracks if isinstance(track, dict) and track.get("status") == "draft"),
        "blocked": sum(1 for track in tracks if isinstance(track, dict) and track.get("status") == "blocked"),
        "archived": sum(1 for track in tracks if isinstance(track, dict) and track.get("status") == "archived"),
        "verified": sum(
            1
            for track in tracks
            if isinstance(track, dict)
            and isinstance(track.get("license"), dict)
            and track["license"].get("status") == "verified"
        ),
    }
    summary["publishable"] = summary["active"]
    return ValidationResult(errors, warnings, summary)
