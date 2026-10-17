"""Exit 0 only when every changed file named on stdin (one path per line) is on the allowlist for the
automatic /changes data pull request, and there is at least one. Used by .github/workflows/changes.yml
before it merges that pull request: nothing else is ever merged without Carlos.
Run: gh pr diff <number> --name-only | python scripts/check_changes_files.py"""
import sys

ALLOWED = frozenset({"kb/changes/blue-posts.json", "kb/changes/builds.json"})


def unexpected(names: list[str]) -> list[str]:
    """Paths that are not allowed. An empty change counts as a problem too, reported as '(no files)'."""
    cleaned = [n.strip() for n in names if n.strip()]
    if not cleaned:
        return ["(no files)"]
    # Exact matches only: no globs, no prefixes, no path tricks such as "kb/changes/../.github/x".
    return [n for n in cleaned if n not in ALLOWED]


if __name__ == "__main__":
    bad = unexpected(sys.stdin.read().splitlines())
    if bad:
        print("Not merging automatically. Files outside the allowlist: " + ", ".join(bad), file=sys.stderr)
        sys.exit(1)
    print("Only the allowed data files changed.")
