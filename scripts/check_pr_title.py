"""Fail when a pull request title is not `type(scope): plain sentence`.
Run: PR_TITLE='feat(web): ...' python scripts/check_pr_title.py   (or pass the title as an argument)"""
import os
import re
import sys

TYPES = ["feat", "fix", "perf", "refactor", "docs", "chore", "data"]
SCOPES = ["addon", "web", "kb", "companion", "protocol", "mcp", "game-data", "infra", "docs"]
TITLE = re.compile(rf"^({'|'.join(TYPES)})\(({'|'.join(SCOPES)})\): (\S.*)$")


def problem(title: str) -> str | None:
    """Why a title is rejected, or None when it is fine."""
    m = TITLE.match(title)
    if not m:
        return "does not look like `type(scope): plain sentence`"
    if len(title) > 100:
        return "is longer than 100 characters"
    if m.group(3).endswith("."):
        return "ends with a full stop"
    return None


def main(title: str) -> int:
    why = problem(title.strip())
    if why is None:
        return 0
    print(f'The pull request title "{title}" {why}.')
    print(f"Types: {', '.join(TYPES)}. Scopes: {', '.join(SCOPES)}.")
    print("Example: feat(web): the raid builder shows which tree each buff needs")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PR_TITLE", "")))
