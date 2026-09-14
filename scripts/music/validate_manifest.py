#!/usr/bin/env python3
"""Validate the public music manifest and its local source assets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from musiclib import (
    DEFAULT_MANIFEST,
    DEFAULT_SOURCES,
    REPO_ROOT,
    load_json,
    validate_manifest,
    validate_revision_transition,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    parser.add_argument(
        "--previous-manifest",
        type=Path,
        help="compare stable work IDs and require version increments when SHA-256 changes",
    )
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument(
        "--check-local",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="verify local bytes, SHA-256, duration, and source mapping",
    )
    parser.add_argument("--json", action="store_true", help="emit machine-readable summary")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = load_json(args.manifest)
    sources = load_json(args.sources) if args.check_local and args.sources.is_file() else None
    result = validate_manifest(
        manifest,
        repo_root=args.repo_root,
        sources=sources,
        check_local=args.check_local,
    )
    if args.previous_manifest:
        result.errors.extend(validate_revision_transition(load_json(args.previous_manifest), manifest))

    if args.json:
        print(
            json.dumps(
                {
                    "ok": result.ok,
                    "summary": result.summary,
                    "errors": result.errors,
                    "warnings": result.warnings,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"manifest={args.manifest}")
        for key in ("tracks", "active", "draft", "blocked", "archived", "verified", "publishable"):
            print(f"{key}={result.summary.get(key, 0)}")
        print(f"errors={len(result.errors)}")
        print(f"warnings={len(result.warnings)}")
        for error in result.errors:
            print(f"ERROR: {error}")
        for warning in result.warnings:
            print(f"WARNING: {warning}")

    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
