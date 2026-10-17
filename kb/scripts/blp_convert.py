"""Convert Blizzard BLP textures to WebP with Pillow (which reads BLP). Used by `client-assets`.

Usage: python -E blp_convert.py <jobs.json>
jobs.json: [{"src": "in.blp", "dst": "out.webp", "crop": [l, t, r, b] | null, "max": 128 | null}]
Prints one JSON object per job on stdout: {"dst", "ok", "width", "height", "error"}.
Reads only the files it is given. Pillow decodes palette and DXT BLPs; the newer interface atlases are
BLP2 "encoding 3", plain 32-bit BGRA pixels that Pillow does not read, so those are unpacked here
(no compression, no encryption involved: the file is a header and raw pixels).
"""
import json
import struct
import sys

from PIL import Image


def read_raw_bgra(path):
    """BLP2 encoding 3: header, then the first mip level as raw BGRA. Anything else is refused."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"BLP2":
        raise ValueError("not a BLP2 file")
    kind, encoding, alpha_depth, _alpha_encoding, _has_mips = struct.unpack("<IBBBB", data[4:12])
    width, height = struct.unpack("<II", data[12:20])
    if kind != 1 or encoding != 3 or alpha_depth not in (0, 8):
        raise ValueError(f"unsupported BLP2 (type {kind}, encoding {encoding}, alpha {alpha_depth})")
    offset = struct.unpack("<I", data[20:24])[0]  # mip 0 offset (offsets: 16 x u32 from byte 20)
    size = struct.unpack("<I", data[84:88])[0]  # mip 0 size (sizes: 16 x u32 from byte 84)
    if size != width * height * 4 or offset + size > len(data):
        raise ValueError("BLP2 pixel data does not match its header")
    return Image.frombuffer("RGBA", (width, height), data[offset:offset + size], "raw", "BGRA", 0, 1)


def open_blp(path):
    try:
        im = Image.open(path)
        im.load()
        return im
    except Exception as first:
        if "Unknown BLP encoding 3" not in str(first):
            raise
        return read_raw_bgra(path)


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as f:
        jobs = json.load(f)
    for job in jobs:
        result = {"dst": job["dst"], "ok": False, "width": 0, "height": 0, "error": None}
        try:
            im = open_blp(job["src"]).convert("RGBA")
            if job.get("crop"):
                im = im.crop(tuple(job["crop"]))
            cap = job.get("max")
            if cap and max(im.size) > cap:
                im.thumbnail((cap, cap), Image.LANCZOS)
            im.save(job["dst"], "WEBP", lossless=True, quality=100, method=6)
            result.update(ok=True, width=im.width, height=im.height)
        except Exception as e:  # one bad file must not stop the rest
            result["error"] = f"{type(e).__name__}: {e}"
        print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
