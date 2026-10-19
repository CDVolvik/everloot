"""Run: python scripts/test_check_dco.py"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from check_dco import commits_between, fix_advice, missing_signoff  # noqa: E402

ANA = "ana@example.com"
signed = "Fix a thing\n\nSigned-off-by: Ana Player <ana@example.com>\n"
assert missing_signoff([("a1", signed, 1, ANA)]) == []
# The sign-off must name the commit's author (matched by email, any case).
assert missing_signoff([("a2", signed, 1, "ANA@Example.com")]) == []
assert missing_signoff([("a3", signed, 1, "someone@example.com")]) == ["a3"]
# Merge commits (two parents) need no sign-off of their own.
assert missing_signoff([("m1", "Merge branch 'main'\n", 2, ANA)]) == []
# GitHub's bots cannot sign off, so their commits are exempt; a lookalike human address is not.
assert missing_signoff([("g1", "Bump x\n", 1, "49699333+dependabot[bot]@users.noreply.github.com")]) == []
assert missing_signoff([("g2", "Bump x\n", 1, "dependabot@example.com")]) == ["g2"]
# A co-author line is not a sign-off.
assert missing_signoff([("b2", "Fix\n\nCo-Authored-By: Bot <bot@example.com>\n", 1, ANA)]) == ["b2"]
# The trailer must start its own line, and carry a real name and email.
assert missing_signoff([("c3", "Fix: we Signed-off-by: Ana <ana@example.com> in text\n", 1, ANA)]) == ["c3"]
assert missing_signoff([("c4", "Fix\n\nSigned-off-by:   < >\n", 1, ANA)]) == ["c4"]
assert missing_signoff([("c5", "Fix\n\nSigned-off-by: Nobody <not-an-email>\n", 1, ANA)]) == ["c5"]
assert missing_signoff([("a1", signed, 1, ANA), ("d4", "No trailer\n", 1, ANA)]) == ["d4"]

# Amend only fixes the newest commit; anything older needs a rebase. Newest first, like git log.
assert fix_advice(["t1"], ["t1", "o1"], "origin/main") == "git commit --amend -s --no-edit"
assert fix_advice(["o1"], ["t1", "o1"], "origin/main") == "git rebase --signoff origin/main"

# A commit message may contain any byte; the parser must not split on one.
with tempfile.TemporaryDirectory() as repo:
    def git(*args: str) -> str:
        return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout.strip()
    git("init", "-q")
    git("-c", "user.name=Ana Player", "-c", f"user.email={ANA}", "commit", "-q", "--allow-empty", "-m", "base")
    base = git("rev-parse", "HEAD")
    git("-c", "user.name=Ana Player", "-c", f"user.email={ANA}", "commit", "-q", "--allow-empty",
        "-m", "odd \x1e message", "-m", f"Signed-off-by: Ana Player <{ANA}>")
    found = commits_between(base, "HEAD", cwd=repo)
    assert len(found) == 1 and found[0][2] == 1 and found[0][3] == ANA, found
    assert missing_signoff(found) == []

print("check_dco: 16 cases pass")
