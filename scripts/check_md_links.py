"""Fail when a relative link or image in a tracked Markdown file points at a file that does not exist.
Anchors and web links are not followed. Run from the repository root: python scripts/check_md_links.py"""
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

LINK = re.compile(r"!?\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\)")
FENCE = re.compile(r"^\s*(```|~~~)")


def broken_links(path: Path, root: Path) -> list[tuple[int, str]]:
    found = []
    in_fence = False
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if FENCE.match(line):
            in_fence = not in_fence
        if in_fence:
            continue
        for target in LINK.findall(re.sub(r"`[^`]*`", "", line)):
            if re.match(r"^([a-z][a-z0-9+.-]*:|#|//)", target, re.I):
                continue
            rel = unquote(target.split("#", 1)[0].split("?", 1)[0])
            if not rel:
                continue
            base = root if rel.startswith("/") else path.parent
            if not (base / rel.lstrip("/")).resolve().exists():
                found.append((n, target))
    return found


def main() -> int:
    root = Path.cwd()
    files = subprocess.run(["git", "ls-files", "-z", "*.md"], capture_output=True, text=True, check=True).stdout.split("\0")
    bad = 0
    for name in filter(None, files):
        path = root / name
        if not path.is_file():
            continue
        for n, target in broken_links(path, root):
            print(f"{name}:{n}: broken link {target}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
