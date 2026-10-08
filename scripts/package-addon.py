"""Build the beta zip from the TOC allowlist: python scripts/package-addon.py"""
from pathlib import Path
from hashlib import sha256
import re
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
addon = root / "addon"
toc = (addon / "Everloot.toc").read_text(encoding="utf-8")
version = re.search(r"^## Version: ([0-9.]+)$", toc, re.M).group(1)
assert f'E.VERSION = "{version}"' in (addon / "core.lua").read_text(encoding="utf-8")
paths = ["Everloot.toc"] + [line.strip().replace("\\", "/") for line in toc.splitlines() if line.strip() and not line.startswith("#")]
output = root / "web" / "public" / "downloads" / f"Everloot-{version}.zip"
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for relative in paths:
        source = (addon / relative).resolve()
        assert source.is_relative_to(addon.resolve()) and source.suffix in [".toc", ".lua"]
        entry = ZipInfo(f"Everloot/{relative}", date_time=(2000, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, source.read_text(encoding="utf-8").encode("utf-8"))
print(f"{output.name}: {len(paths)} source files, sha256 {sha256(output.read_bytes()).hexdigest()}")
