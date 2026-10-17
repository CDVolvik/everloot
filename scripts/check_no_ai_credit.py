"""Fail when a commit message, commit author or PR description credits an AI tool.
Everloot's history and pull requests name people only.
Run from the repository root: python scripts/check_no_ai_credit.py <base> <head>
The PR description, when given, is read from the PR_BODY environment variable."""
import os
import re
import subprocess
import sys

TOOLS = r"(claude|anthropic|codex|chatgpt|openai|copilot|gemini|grok|cursor|devin)"
# Co-author trailers naming a tool, any address at an AI vendor, and "Generated with ..." footers.
CREDIT = re.compile(
    rf"^\s*co-authored-by:[^\n]*\b{TOOLS}\b"
    r"|noreply@anthropic\.com|@openai\.com|copilot@github\.com"
    rf"|generated (with|by) \[?{TOOLS}"
    r"|\U0001F916 generated",
    re.IGNORECASE | re.MULTILINE,
)


def credits(text: str) -> list[str]:
    """The offending lines in a message, empty when it is clean."""
    return [line.strip() for line in text.splitlines() if CREDIT.search(line)]


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8", check=True).stdout


def main(base: str, head: str) -> int:
    found = []
    for sha in _git("rev-list", f"{base}..{head}").split():
        text = _git("log", "-1", "--format=%an <%ae>%n%cn <%ce>%n%B", sha)
        found += [f"{sha[:12]}: {line}" for line in credits(text)]
    found += [f"PR description: {line}" for line in credits(os.environ.get("PR_BODY", ""))]
    if not found:
        return 0
    print("Remove AI tool credits; Everloot's history and PRs name people only:")
    print("\n".join(found))
    print("\nFor commits: git rebase -i and reword them, then force-push.")
    return 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python scripts/check_no_ai_credit.py <base> <head>")
    sys.exit(main(sys.argv[1], sys.argv[2]))
