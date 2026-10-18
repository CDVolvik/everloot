"""Run: python scripts/test_check_pr_title.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from check_pr_title import problem  # noqa: E402

for ok in [
    "feat(web): the raid builder shows which tree each buff needs",
    "fix(addon): auction rows keep the per-unit price",
    "data(kb): new blue posts and builds",
    "chore(infra): weekly dependency updates",
    "docs(docs): index the design specs",
    "feat(protocol): one package holds the upload record contract",
]:
    assert problem(ok) is None, ok
for bad, why in [
    ("Update README", "look like"),
    ("feat: no scope", "look like"),
    ("feature(web): wrong type", "look like"),
    ("fix(site): unknown scope", "look like"),
    ("fix(web):no space", "look like"),
    ("fix(web): ends with a stop.", "full stop"),
    ("fix(web): " + "x" * 100, "100"),
]:
    got = problem(bad)
    assert got and why in got, (bad, got)
print("ok")
