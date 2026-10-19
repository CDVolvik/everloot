"""Fail when a commit in a range has no Developer Certificate of Origin sign-off by its author.
Run from the repository root: python scripts/check_dco.py <base> <head>"""
import re
import subprocess
import sys

# A trailer on its own line, with a non-empty name and an email address.
SIGNOFF = re.compile(r"^Signed-off-by: *([^<>\s][^<>]*?) *<([^<>\s@]+@[^<>\s@]+)>\s*$", re.MULTILINE)
# GitHub's own bots (Dependabot and the like) commit as <id>+<name>[bot]@users.noreply.github.com and
# cannot sign off; nobody certifies a bot's commit, so they are exempt like the title check exempts them.
GITHUB_BOT = re.compile(r"\[bot\]@users\.noreply\.github\.com$", re.IGNORECASE)


def missing_signoff(commits: list[tuple[str, str, int, str]]) -> list[str]:
    """Shas of (sha, message, parent count, author email) commits that lack a sign-off by their
    author. Merge commits and commits authored by a GitHub bot are exempt."""
    missing = []
    for sha, body, parents, author_email in commits:
        if parents >= 2 or GITHUB_BOT.search(author_email):
            continue
        emails = {m.group(2).lower() for m in SIGNOFF.finditer(body)}
        if author_email.lower() not in emails:
            missing.append(sha)
    return missing


def fix_advice(missing: list[str], newest_first: list[str], base: str) -> str:
    """Amend fixes only the newest commit; anything older needs a rebase."""
    if missing == newest_first[:1]:
        return "git commit --amend -s --no-edit"
    return f"git rebase --signoff {base}"


def _git(cwd: str | None, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def commits_between(base: str, head: str, cwd: str | None = None) -> list[tuple[str, str, int, str]]:
    """Newest first. Each message is read on its own, so no byte in it can split the list."""
    out = []
    for line in _git(cwd, "rev-list", "--parents", f"{base}..{head}").splitlines():
        sha, *parents = line.split()
        out.append((sha, _git(cwd, "log", "-1", "--format=%B", sha), len(parents), _git(cwd, "log", "-1", "--format=%ae", sha).strip()))
    return out


def main(base: str, head: str) -> int:
    commits = commits_between(base, head)
    missing = missing_signoff(commits)
    if not missing:
        return 0
    for sha in missing:
        print(f"{sha[:12]}: no 'Signed-off-by:' line from the commit's author (Developer Certificate of Origin)")
    print("\nSign off to certify you may contribute this code (see CONTRIBUTING.md), then force-push:")
    print(f"  {fix_advice(missing, [c[0] for c in commits], base)}")
    return 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python scripts/check_dco.py <base> <head>")
    sys.exit(main(sys.argv[1], sys.argv[2]))
