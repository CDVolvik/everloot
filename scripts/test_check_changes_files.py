"""Run: python scripts/test_check_changes_files.py"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from check_changes_files import unexpected  # noqa: E402

POSTS = "kb/changes/blue-posts.json"
BUILDS = "kb/changes/builds.json"

# The two data files, alone or together, are fine.
assert unexpected([POSTS]) == []
assert unexpected([BUILDS]) == []
assert unexpected([POSTS, BUILDS]) == []
assert unexpected([POSTS + "\n", " " + BUILDS]) == []
# Anything else, even next to the data files, blocks the merge.
assert unexpected([POSTS, ".github/workflows/changes.yml"]) == [".github/workflows/changes.yml"]
assert unexpected([POSTS, "web/src/app/page.tsx"]) == ["web/src/app/page.tsx"]
assert unexpected(["kb/changes/other.json"]) == ["kb/changes/other.json"]
assert unexpected(["kb/changes/blue-posts.json.tmp"]) == ["kb/changes/blue-posts.json.tmp"]
assert unexpected(["kb/changes/../../.github/x.yml"]) == ["kb/changes/../../.github/x.yml"]
assert unexpected(["KB/changes/blue-posts.json"]) == ["KB/changes/blue-posts.json"]
assert unexpected(["kb/changes/"]) == ["kb/changes/"]
# No files at all is not "all allowed".
assert unexpected([]) == ["(no files)"]
assert unexpected(["", "  "]) == ["(no files)"]

# The command line: exit code and message.
script = os.path.join(os.path.dirname(__file__), "check_changes_files.py")


def run(text: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, script], input=text, capture_output=True, text=True)


ok = run(f"{POSTS}\n{BUILDS}\n")
assert ok.returncode == 0, ok.stderr
bad = run(f"{POSTS}\n.github/workflows/checks.yml\n")
assert bad.returncode == 1 and ".github/workflows/checks.yml" in bad.stderr
assert run("").returncode == 1
print("ok")
