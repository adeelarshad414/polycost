#!/usr/bin/env python3
"""Pin the released image digests into the Helm chart's values.yaml (audit H-13).

Usage: pin-chart-digests.py <values.yaml> <api-digest> <migrations-digest>

Edits the `digest: ''` lines under `image:` and `migrations.image:` in place,
keeping comments and layout intact (no YAML round-trip). Fails if either key is
not found exactly once, so a values.yaml refactor cannot silently ship an
unpinned chart.
"""
import re
import sys

DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")


def pin(text: str, block: str, indent: str, digest: str) -> str:
    # `block` is the YAML path's last key line, e.g. "image:" at a given indent.
    pattern = re.compile(
        rf"(^{re.escape(indent)}{re.escape(block)}\n(?:{re.escape(indent)}  .*\n)*?"
        rf"{re.escape(indent)}  digest: )''",
        re.MULTILINE,
    )
    result, count = pattern.subn(rf"\g<1>'{digest}'", text)
    if count != 1:
        sys.exit(f"pin-chart-digests: expected one digest under {block!r} (indent {len(indent)}), found {count}")
    return result


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    path, api_digest, migrations_digest = sys.argv[1:]
    for digest in (api_digest, migrations_digest):
        if not DIGEST.match(digest):
            sys.exit(f"pin-chart-digests: not a sha256 digest: {digest!r}")

    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    text = pin(text, "image:", "", api_digest)
    text = pin(text, "image:", "  ", migrations_digest)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(f"Pinned api={api_digest} migrations={migrations_digest} in {path}")


if __name__ == "__main__":
    main()
