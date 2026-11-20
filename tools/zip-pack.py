"""Zips a resource pack folder with forward-slash entry names and prints its SHA-1.

usage: python zip-pack.py <pack-dir> <out.zip>

The pack.mcmeta and assets folder must sit at the top of the zip. Entries are sorted and carry a
fixed timestamp, so the same input always gives the same file and checksum.
"""
import hashlib
import os
import sys
import zipfile

pack_dir, out = sys.argv[1], sys.argv[2]
names = []
for root, dirs, files in os.walk(pack_dir):
    dirs[:] = [d for d in dirs if d != ".git"]
    for f in files:
        full = os.path.join(root, f)
        rel = os.path.relpath(full, pack_dir).replace(os.sep, "/")
        if rel.endswith("models.yml") or os.path.basename(rel).startswith("_") or rel == ".gitignore":
            continue  # plugin data, not pack content
        names.append((rel, full))
names.sort()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel, full in names:
        info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(full, "rb") as fh:
            z.writestr(info, fh.read())
with open(out, "rb") as fh:
    print(hashlib.sha1(fh.read()).hexdigest())
