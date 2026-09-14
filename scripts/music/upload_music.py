#!/usr/bin/env python3
"""Publish active music objects and the manifest without touching other R2 paths."""

from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from musiclib import DEFAULT_MANIFEST, DEFAULT_SOURCES, REPO_ROOT, load_json, validate_manifest


DEFAULT_ENV_FILE = Path.home() / ".config" / "lugu-love" / "r2.env"
EXPECTED_BUCKET = "lugu-love-media-apac"
MUSIC_PREFIX = "music"

SHELL_R2_OPERATION = r'''
set -u
set -o pipefail
env_file="$1"
local_file="$2"
object_key="$3"
content_type="$4"
cache_control="$5"
mode="$6"
output_file="${7:-}"

source "$env_file"
for key in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT; do
  if [[ -z "${(P)key:-}" ]]; then
    print -r -- '000'
    exit 2
  fi
done

url="${R2_ENDPOINT%/}/$R2_BUCKET/$object_key"
if [[ "$mode" == "put" ]]; then
  code=$(printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" |
    /usr/bin/curl --config - --aws-sigv4 'aws:amz:auto:s3' -sS -o /dev/null -w '%{http_code}' \
      -X PUT -T "$local_file" -H "Content-Type: $content_type" -H "Cache-Control: $cache_control" "$url" 2>/dev/null)
  rc=$?
else
  code=$(printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" |
    /usr/bin/curl --config - --aws-sigv4 'aws:amz:auto:s3' -sS -o "$output_file" -w '%{http_code}' "$url" 2>/dev/null)
  rc=$?
fi

print -r -- "${code:-000}"
exit "$rc"
'''


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument(
        "--publish",
        action="store_true",
        help="upload active assets and the manifest; without this flag the command is read-only",
    )
    return parser.parse_args()


def read_public_config(env_file: Path) -> tuple[str, str]:
    script = r'''
set -u
source "$1"
print -r -- "$R2_BUCKET"
print -r -- "$R2_PUBLIC_BASE_URL"
'''
    completed = subprocess.run(
        ["/bin/zsh", "-c", script, "music-public-config", str(env_file)],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError("unable to read non-secret R2 public configuration")
    lines = completed.stdout.splitlines()
    if len(lines) != 2:
        raise RuntimeError("unexpected R2 public configuration format")
    return lines[0], lines[1]


def render_manifest_for_publish(manifest: dict[str, Any], public_base_url: str) -> dict[str, Any]:
    rendered = copy.deepcopy(manifest)
    base_url = f"{public_base_url.rstrip('/')}/{MUSIC_PREFIX}/"
    rendered["assetBaseUrl"] = base_url
    for track in rendered.get("tracks", []):
        if track.get("status") == "active":
            track["url"] = f"{base_url}{track['file']}"
    return rendered


def run_r2_operation(
    env_file: Path,
    local_file: Path,
    object_key: str,
    content_type: str,
    cache_control: str,
    mode: str,
    output_file: Path | None = None,
) -> tuple[int, str]:
    args = [
        "/bin/zsh",
        "-c",
        SHELL_R2_OPERATION,
        "music-r2-operation",
        str(env_file),
        str(local_file),
        object_key,
        content_type,
        cache_control,
        mode,
    ]
    if output_file is not None:
        args.append(str(output_file))

    completed = subprocess.run(args, check=False, capture_output=True, text=True)
    code = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else "000"
    return completed.returncode, code


def sha256_file(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def upload_and_verify(
    env_file: Path,
    local_file: Path,
    object_key: str,
    content_type: str,
    cache_control: str,
    expected_sha256: str,
) -> bool:
    rc, code = run_r2_operation(
        env_file,
        local_file,
        object_key,
        content_type,
        cache_control,
        "put",
    )
    if rc != 0 or not code.startswith("2"):
        return False

    with tempfile.NamedTemporaryFile(prefix="lugu-music-readback-", delete=False) as handle:
        readback_path = Path(handle.name)
    try:
        rc, code = run_r2_operation(
            env_file,
            local_file,
            object_key,
            content_type,
            cache_control,
            "get",
            readback_path,
        )
        if rc != 0 or not code.startswith("2"):
            return False
        return sha256_file(readback_path) == expected_sha256
    finally:
        readback_path.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    manifest = load_json(args.manifest)
    sources = load_json(args.sources) if args.sources.is_file() else None

    if not args.publish:
        result = validate_manifest(
            manifest,
            repo_root=args.repo_root,
            sources=sources,
            check_local=True,
        )
        print("mode=verify")
        print(f"active_tracks={result.summary.get('active', 0)}")
        print(f"publishable={result.summary.get('publishable', 0)}")
        print(f"errors={len(result.errors)}")
        print(f"warnings={len(result.warnings)}")
        for error in result.errors:
            print(f"ERROR: {error}")
        for warning in result.warnings:
            print(f"WARNING: {warning}")
        return 0 if result.ok else 1

    if not args.env_file.is_file():
        print("ERROR: R2 environment file is unavailable")
        return 2

    try:
        bucket, public_base_url = read_public_config(args.env_file)
    except RuntimeError as exc:
        print(f"ERROR: {exc}")
        return 2
    if bucket != EXPECTED_BUCKET:
        print("ERROR: target bucket does not match lugu-love-media-apac")
        return 2

    rendered_manifest = render_manifest_for_publish(manifest, public_base_url)
    result = validate_manifest(
        rendered_manifest,
        repo_root=args.repo_root,
        sources=sources,
        check_local=True,
    )
    if not result.ok:
        print("mode=publish")
        print("published=no")
        print(f"errors={len(result.errors)}")
        for error in result.errors:
            print(f"ERROR: {error}")
        return 1

    source_map = sources.get("sources", {}) if isinstance(sources, dict) else {}
    active_tracks = [
        track
        for track in rendered_manifest.get("tracks", [])
        if isinstance(track, dict) and track.get("status") == "active"
    ]
    if not active_tracks:
        print("mode=publish")
        print("active_tracks=0")
        print("r2_writes=0")
        print("published=no")
        print("blocking=no_active_tracks")
        return 0

    uploaded = 0
    for track in active_tracks:
        track_id = track["id"]
        relative_source = source_map.get(track_id)
        if not relative_source:
            print(f"ERROR: missing local source for {track_id}")
            return 1
        local_file = args.repo_root / relative_source
        object_key = f"{MUSIC_PREFIX}/{track['file']}"
        if not upload_and_verify(
            args.env_file,
            local_file,
            object_key,
            track["mimeType"],
            "public, max-age=31536000, immutable",
            track["sha256"],
        ):
            print(f"ERROR: upload/readback failed for {track_id}")
            return 1
        uploaded += 1

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix="lugu-music-manifest-",
        suffix=".json",
        delete=False,
    ) as handle:
        json.dump(rendered_manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        manifest_path = Path(handle.name)
    os.chmod(manifest_path, 0o600)

    try:
        manifest_bytes = manifest_path.read_bytes()
        manifest_sha = sha256_file(manifest_path)
        if not upload_and_verify(
            args.env_file,
            manifest_path,
            f"{MUSIC_PREFIX}/catalog/v1/manifest.json",
            "application/json; charset=utf-8",
            "public, max-age=300, must-revalidate",
            manifest_sha,
        ):
            print("ERROR: manifest upload/readback failed")
            return 1
        if not manifest_bytes:
            print("ERROR: rendered manifest is empty")
            return 1
    finally:
        manifest_path.unlink(missing_ok=True)

    print("mode=publish")
    print(f"active_tracks={len(active_tracks)}")
    print(f"r2_writes={uploaded + 1}")
    print("published=yes")
    print("blocking=none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
