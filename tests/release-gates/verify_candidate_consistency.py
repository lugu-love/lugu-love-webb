#!/usr/bin/env python3
"""Candidate Preview -> Generation consistency gate.

This gate fails closed. A Candidate URL must not be handed to a human tester
until this command exits 0.
"""
import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROD_MANIFEST = "https://lugu-love.github.io/lugu-love-webb/release-20260912-03/asset-manifest.json"
DEFAULT_PROD_ASSET_BASE = "https://lugu-love.github.io/lugu-love-webb/release-20260912-03/"
DEFAULT_CAND_MANIFEST = "https://lugu-dialect-lab-20260912-production.up.railway.app/candidate/asset-manifest.json"
DEFAULT_CAND_BUILD = "https://lugu-dialect-lab-20260912-production.up.railway.app/candidate/build.json"
DEFAULT_CAND_ASSET_BASE = "https://lugu-dialect-lab-20260912-production.up.railway.app/candidate/"
DEFAULT_CAND_BACKEND = "https://lugu-candidate-20260912-01-production.up.railway.app"

ITEM_FIELDS = ("itemId", "characterId", "emotionId", "assetVersion")
DELIVERIES = ("generationMaster", "webVp9", "webHevc", "mobileFallback")


def fetch(url, timeout=30):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def fetch_with_status(url, timeout=30):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.status, response.read()


def fetch_json(url, timeout=30):
    return json.loads(fetch(url, timeout).decode("utf-8"))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def post_json(url, payload, timeout=30):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.read()


def run_generation_gate(base, manifest, items, errors, delay_seconds):
    """Generate selected items with empty text.

    Empty text isolates the asset contract: the backend still validates
    item/character/assetVersion/master SHA before producing video.
    """
    failures = []
    for index, item_id in enumerate(items):
        item = manifest["items"][item_id]
        params = {
            "text": "",
            "item": item_id,
            "characterId": item["characterId"],
            "buildId": manifest["buildId"],
            "manifestVersion": manifest["manifestVersion"],
            "assetVersion": item["assetVersion"],
            "expectedMasterSHA256": item["generationMaster"]["sha256"],
            "voiceId": "female-bright",
            "async": "1",
        }
        url = base.rstrip("/") + "/make-send?" + urllib.parse.urlencode(params)
        if index:
            time.sleep(max(0.0, delay_seconds))
        try:
            status = None
            body = None
            for attempt in range(4):
                try:
                    status, body = fetch_with_status(url, timeout=30)
                    if status == 429:
                        raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code != 429 or attempt == 3:
                        raise
                    time.sleep(65)
            if status != 202:
                raise RuntimeError("start HTTP %s" % status)
            job = json.loads(body.decode("utf-8")).get("job")
            if not job:
                raise RuntimeError("missing job id")
            result = None
            for _ in range(60):
                result = fetch_json(base.rstrip("/") + "/make-send/result?job=" + urllib.parse.quote(job))
                if result.get("status") in ("done", "error"):
                    break
                time.sleep(1)
            if not result or result.get("status") != "done":
                raise RuntimeError("job failed: %s" % json.dumps(result or {}, ensure_ascii=False)[:200])
            video = fetch(base.rstrip("/") + result["videoPath"], timeout=60)
            if len(video) < 1000:
                raise RuntimeError("video too small: %d" % len(video))
            failures.append({"itemId": item_id, "status": "ok", "bytes": len(video)})
        except Exception as exc:  # noqa: BLE001
            errors.append("generation gate %s: %s" % (item_id, exc))
            failures.append({"itemId": item_id, "status": "error", "error": str(exc)})
    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod-manifest-url", default=DEFAULT_PROD_MANIFEST)
    parser.add_argument("--prod-asset-base", default=DEFAULT_PROD_ASSET_BASE)
    parser.add_argument("--candidate-manifest-url", default=DEFAULT_CAND_MANIFEST)
    parser.add_argument("--candidate-build-url", default=DEFAULT_CAND_BUILD)
    parser.add_argument("--candidate-asset-base", default=DEFAULT_CAND_ASSET_BASE)
    parser.add_argument("--candidate-backend", default=DEFAULT_CAND_BACKEND)
    parser.add_argument("--identity-mode", choices=("mirror", "candidate"), default="candidate")
    parser.add_argument("--generation-scope", choices=("none", "representative", "all"), default="all")
    parser.add_argument("--generation-delay", type=float, default=10.5)
    args = parser.parse_args()

    prod_raw = fetch(args.prod_manifest_url)
    cand_raw = fetch(args.candidate_manifest_url)
    prod = json.loads(prod_raw.decode("utf-8"))
    cand = json.loads(cand_raw.decode("utf-8"))
    prod_build = fetch_json(args.prod_manifest_url.rsplit("/", 1)[0] + "/build.json")
    cand_build = fetch_json(args.candidate_build_url)
    errors = []

    if set(cand.get("items", {})) != set(prod.get("items", {})):
        errors.append("candidate item set mismatch")

    if args.identity_mode == "mirror":
        for field in ("releaseId", "buildId", "manifestVersion"):
            if cand_build.get(field) != prod_build.get(field):
                errors.append("mirror identity %s mismatch" % field)
        if sha256(prod_raw) != sha256(cand_raw):
            errors.append("mirror manifest sha256 mismatch")
    else:
        if cand_build.get("releaseId") == prod_build.get("releaseId"):
            errors.append("candidate releaseId must differ from production")
        if cand_build.get("buildId") == prod_build.get("buildId"):
            errors.append("candidate buildId must differ from production")
        if not cand_build.get("candidateId"):
            errors.append("candidateId is required for a modified Candidate")
        if cand_build.get("baseProductionRelease") != prod_build.get("releaseId"):
            errors.append("baseProductionRelease must equal current production release")
        if sha256(prod_raw) != sha256(cand_raw) and cand_build.get("manifestVersion") == prod_build.get("manifestVersion"):
            errors.append("manifestVersion must change when candidate manifest changes")

    for item_id, item in prod["items"].items():
        candidate = cand["items"].get(item_id)
        if not candidate:
            continue
        for field in ITEM_FIELDS:
            if item.get(field) != candidate.get(field):
                errors.append("%s.%s mismatch" % (item_id, field))
        source_version = ((item.get("generationMaster") or {}).get("source") or {}).get("assetVersion")
        if source_version and source_version != item.get("assetVersion"):
            errors.append("%s generation source assetVersion mismatch" % item_id)
        for key in DELIVERIES:
            pa = item.get(key) or {}
            ca = candidate.get(key) or {}
            if pa.get("sha256") != ca.get("sha256"):
                errors.append("%s.%s sha256 mismatch" % (item_id, key))

    avatar_checks = 0
    for character_id in ("fengxin-rabbit", "xinguang-fox"):
        rel = "assets/characters/seven-stars/%s/main.png" % character_id
        try:
            a = fetch(args.prod_asset_base.rstrip("/") + "/" + rel)
            b = fetch(args.candidate_asset_base.rstrip("/") + "/" + rel)
        except Exception as exc:  # noqa: BLE001
            errors.append("%s avatar fetch failed: %s" % (character_id, exc))
            continue
        if sha256(a) != sha256(b):
            errors.append("%s avatar sha256 mismatch" % character_id)
        avatar_checks += 1

    try:
        candidate_html = fetch(args.candidate_asset_base.rstrip("/") + "/send-test.html").decode("utf-8", "replace")
        for character_id in ("fengxin-rabbit", "xinguang-fox"):
            marker = "assets/characters/seven-stars/%s/main.png" % character_id
            if marker not in candidate_html:
                errors.append("%s avatar marker missing from Candidate page" % character_id)
    except Exception as exc:  # noqa: BLE001
        errors.append("candidate page avatar check failed: %s" % exc)

    preview_checks = 0
    for item_id, item in prod["items"].items():
        if item.get("characterId") != "fengxin-rabbit":
            continue
        proxy = item.get("previewProxy")
        if not proxy:
            errors.append("%s missing previewProxy" % item_id)
            continue
        for name in ("poster.webp", "sheet-00.webp"):
            rel = "assets/video/fengxin-rabbit-sequence/%s/%s" % (proxy, name)
            try:
                a = fetch(args.prod_asset_base.rstrip("/") + "/" + rel)
                b = fetch(args.candidate_asset_base.rstrip("/") + "/" + rel)
            except Exception as exc:  # noqa: BLE001
                errors.append("%s preview fetch failed: %s" % (item_id, exc))
                continue
            if sha256(a) != sha256(b):
                errors.append("%s preview %s sha256 mismatch" % (item_id, name))
            preview_checks += 1

    try:
        candidate_status = fetch_json(args.candidate_backend.rstrip("/") + "/status")
        for field in ("releaseId", "buildId", "manifestVersion"):
            if candidate_status.get(field) != cand_build.get(field):
                errors.append("candidate backend status %s mismatch" % field)
    except Exception as exc:  # noqa: BLE001
        errors.append("candidate backend status failed: %s" % exc)

    old_item_status = None
    old_url = args.candidate_backend.rstrip("/") + "/make-send?" + urllib.parse.urlencode({
        "text": "test",
        "item": "rabbit-aggrieved",
        "characterId": "fengxin-rabbit",
        "buildId": cand.get("buildId", ""),
        "manifestVersion": cand.get("manifestVersion", ""),
        "assetVersion": "rabbit-aggrieved-v1",
        "expectedMasterSHA256": "deadbeef",
        "voiceId": "female-bright",
    })
    try:
        fetch(old_url)
        old_item_status = 200
    except urllib.error.HTTPError as exc:
        old_item_status = exc.code
    if old_item_status != 404:
        errors.append("retired item was not rejected: HTTP %s" % old_item_status)

    generation = []
    if args.generation_scope != "none" and not errors:
        ids = sorted(prod["items"])
        if args.generation_scope == "representative":
            ids = [x for x in ids if x in ("rabbit-happy", "fox-giveup")]
        generation = run_generation_gate(args.candidate_backend, cand, ids, errors, args.generation_delay)

    result = {
        "ok": not errors,
        "identity_mode": args.identity_mode,
        "production_release": prod_build.get("releaseId"),
        "candidate_release": cand_build.get("releaseId"),
        "candidate_build": cand_build.get("buildId"),
        "candidate_manifest_version": cand_build.get("manifestVersion"),
        "items_checked": len(prod.get("items", {})),
        "rabbit_preview_files_checked": preview_checks,
        "avatar_files_checked": avatar_checks,
        "retired_item_http": old_item_status,
        "generation_checked": len(generation),
        "errors": errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
