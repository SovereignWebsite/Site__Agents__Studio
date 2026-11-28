#!/usr/bin/env python3
# Fetch a recording someone sent with Record and send (assets/record-send.js) from SG/Send, decrypt it and check it:
#   python3 fetch_transfer.py <code word-word-NNNN> [service] [out folder]
# The code is the only key: transfer id = first 12 hex of SHA-256(code); key = PBKDF2-SHA256(code, "sgraph-send-v1",
# 600,000 rounds); the file is AES-256-GCM with its 12-byte IV first, inside an SGMETA envelope with the file name
# (after account F's notes, webgl/LEARNINGS.md section 11). The file goes to a folder outside the repository
# (default ~/.sg-send/received/); only its name, size, length and SHA-256 are printed. Apache-2.0. By c.productions.
import hashlib, json, os, subprocess, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

code = sys.argv[1].strip()
service = sys.argv[2] if len(sys.argv) > 2 else "dev.send.sgraph.ai"
out = os.path.expanduser(sys.argv[3] if len(sys.argv) > 3 else "~/.sg-send/received")
tid = hashlib.sha256(code.encode()).hexdigest()[:12]
key = hashlib.pbkdf2_hmac("sha256", code.encode(), b"sgraph-send-v1", 600000, 32)
api = f"https://{service}"

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "productions-fetch"}), timeout=300) as r:
        return r.read(), r.headers.get("Content-Type", "")

body = None
try:  # large files: a presigned address
    raw, ctype = get(f"{api}/api/presigned/download-url/{tid}")
    j = json.loads(raw)
    url = j.get("download_url") or j.get("url")
    if url: body, _ = get(url)
except Exception:
    pass
if body is None:  # small files: straight from the API
    body, _ = get(f"{api}/api/transfers/download/{tid}")
plain = AESGCM(key).decrypt(body[:12], body[12:], None)
name = f"transfer-{tid}.bin"
if plain[:6] == b"SGMETA":
    n = int.from_bytes(plain[6:10], "big"); meta = json.loads(plain[10:10 + n]); plain = plain[10 + n:]
    name = os.path.basename(meta.get("filename") or name)
os.makedirs(out, mode=0o700, exist_ok=True)
path = os.path.join(out, name)
open(path, "wb").write(plain)
length = ""
try:
    length = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
except Exception:
    pass
print(json.dumps({"file": path, "bytes": len(plain), "seconds": length, "sha256": hashlib.sha256(plain).hexdigest()}))
