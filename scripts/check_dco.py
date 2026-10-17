"""Fail when a commit in a range has no Developer Certificate of Origin sign-off.
Run from the repository root: python scripts/check_dco.py <base> <head>"""
import re
import subprocess
import sys

SIGNOFF = re.compile(r"^Signed-off-by: .+ <.+>$", re.MULTILINE)


def missing_signoff(commits: list[tuple[str, str, int]]) -> list[str]:
    """Shas of (sha, message, parent count) commits that need a sign-off. Merge commits are exempt."""
    return [sha for sha, body, parents in commits if parents < 2 and not SIGNOFF.search(body)]


def commits_between(base: str, head: str) -> list[tuple[str, str, int]]:
    log = subprocess.run(
        ["git", "log", "--format=%H%x00%P%x00%B%x1e", f"{base}..{head}"],
        capture_output=True, text=True, encoding="utf-8", check=True,
    ).stdout
    out = []
    for entry in log.split("\x1e"):
        if not entry.strip():
            continue
        sha, parents, body = entry.lstrip("\n").split("\x00", 2)
        out.append((sha, body, len(parents.split())))
    return out


def main(base: str, head: str) -> int:
    missing = missing_signoff(commits_between(base, head))
    if not missing:
        return 0
    for sha in missing:
        print(f"{sha[:12]}: no 'Signed-off-by:' line (Developer Certificate of Origin)")
    fix = "git commit --amend -s --no-edit" if len(missing) == 1 else f"git rebase --signoff {base}"
    print(f"\nSign off to certify you may contribute this code (see CONTRIBUTING.md), then force-push:\n  {fix}")
    return 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python scripts/check_dco.py <base> <head>")
    sys.exit(main(sys.argv[1], sys.argv[2]))
