"""Run: python scripts/test_check_dco.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from check_dco import missing_signoff  # noqa: E402

signed = "Fix a thing\n\nSigned-off-by: Ana Player <ana@example.com>\n"
assert missing_signoff([("a1", signed, 1)]) == []
# Merge commits (two parents) need no sign-off of their own.
assert missing_signoff([("m1", "Merge branch 'main'\n", 2)]) == []
# A co-author line is not a sign-off.
assert missing_signoff([("b2", "Fix\n\nCo-Authored-By: Bot <bot@example.com>\n", 1)]) == ["b2"]
# The trailer must start its own line.
assert missing_signoff([("c3", "Fix: we Signed-off-by: Ana <ana@example.com> in text\n", 1)]) == ["c3"]
assert missing_signoff([("a1", signed, 1), ("d4", "No trailer\n", 1)]) == ["d4"]
print("check_dco: 5 cases pass")
