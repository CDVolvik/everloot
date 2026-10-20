"""Run with: python addon/tests/no_ads_contract.py

Blizzard's UI Add-On Development Policy allows no advertising in an addon and no requests for
donations in the game. Every string the addon could show (each quoted literal in its Lua files) and
the .toc's Title and Notes are checked against wording that asks players to pay, donate, follow,
join or support something. A plain pointer to everloot.app for more detail is allowed.
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]

BANNED = [
    "donate", "donation", "patreon", "ko-fi", "kofi", "paypal", "buymeacoffee", "buy me a coffee",
    "support us", "support everloot", "support the addon", "subscribe", "premium", "sponsor",
    "check out", "join our", "join us", "follow us", "discord.gg", "twitch.tv", "youtube.com",
]

# Lua string literals: double- or single-quoted, with escapes. Comments are stripped first.
STRING = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')
COMMENT = re.compile(r"--\[\[.*?\]\]|--[^\n]*", re.S)


def strings(text: str):
    for line_no, line in enumerate(COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text).split("\n"), 1):
        for match in STRING.finditer(line):
            yield line_no, match.group(0)[1:-1]


found = []
for path in sorted(root.glob("**/*.lua")):
    if "tests" in path.relative_to(root).parts:
        continue
    for line_no, text in strings(path.read_text(encoding="utf-8")):
        for word in BANNED:
            if word in text.lower():
                found.append(f"{path.relative_to(root)}:{line_no}: {word!r} in {text[:80]!r}")

toc = (root / "Everloot.toc").read_text(encoding="utf-8")
for line in toc.splitlines():
    if line.startswith(("## Title:", "## Notes:")):
        for word in BANNED:
            if word in line.lower():
                found.append(f"Everloot.toc: {word!r} in {line!r}")

assert not found, "In-game text that reads as advertising or a donation request:\n" + "\n".join(found)

# The check itself catches what it should and lets a plain link through.
sample = 'print("Everloot: support us on Patreon") print("Full history: everloot.app/tools/auctions")'
hits = [text for _, text in strings(sample) if any(word in text.lower() for word in BANNED)]
assert hits == ["Everloot: support us on Patreon"], hits

print("no_ads_contract: ok")
