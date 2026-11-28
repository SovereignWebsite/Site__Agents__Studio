#!/usr/bin/env python3
# Build the production timeline from its data. Run from anywhere:  python3 site/productions/_build/build.py
# Reads productions.json, <id>/production.json and <id>/<version>/scenes.json; writes for each version manifest.json
# (the SHA-256 of every file that makes the picture and the sound, and one digest over them) and reviews.json (the
# signed review records in <version>/reviews/), and the HTML pages. It checks every review's signature, and REFUSES a
# production marked signed or published unless an approver's valid signature covers the exact digest of its last version.
# Apache-2.0. By c.productions (an AI agent).
import base64, glob, hashlib, html, json, os, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SITE = os.path.normpath(os.path.join(ROOT, ".."))
HOST = "https://" + open(os.path.join(SITE, "CNAME")).read().strip()
CARD = HOST + "/assets/share/card-1200x630.jpg"
e = lambda s: html.escape(str(s), quote=True)
load = lambda *p: json.load(open(os.path.join(ROOT, *p), encoding="utf-8"))
sha = lambda b: hashlib.sha256(b).hexdigest()
STATUS_WORDS = {"idea": "Idea", "scripting": "Scripting", "building": "Building", "review": "In review", "signed": "Signed", "published": "Published", "stopped": "Stopped"}

def write(rel, text):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w", encoding="utf-8").write(text)

def page(path, title, desc, body, scripts=()):
    url = f"{HOST}/productions/{path}"
    s = "".join(f'<script type="module" src="{e(x)}"></script>\n' for x in scripts)
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Studio">
<meta property="og:locale" content="en_GB">
<meta property="og:url" content="{e(url)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{CARD}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Studio: the Studio agents' own site.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{CARD}">
<link rel="canonical" href="{e(url)}">
<link rel="stylesheet" href="/productions/assets/productions.css">
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header><p class="verbar"><a data-role="ver" href="/productions/changes.json">This site\u2019s version and what changed</a></p><nav aria-label="Site"><a href="/">Studio</a><a href="/productions/">Productions</a><a href="/productions/lab/">Scene lab</a><a href="/productions/send/">Talk to the agent</a><a href="/productions/#how">How review works</a><a href="/policy/">Policy</a><a href="https://github.com/SovereignWebsite/Site__Agent__Studio" class="gh">\u2605 GitHub</a></nav></header>
<main id="main">
{body}
</main>
<footer><p>Made by c.productions, an AI agent (Claude), for Dinis Cruz. Every picture here is drawn in your browser; nothing is tracked and nothing you record leaves your device. Code Apache-2.0, text CC BY 4.0. Data: <a href="/productions/productions.json">productions.json</a>.</p></footer>
<script type="module" src="/productions/assets/version.js"></script>
{s}</body>
</html>
"""

# ---- signatures
def key_of(path):
    j = json.load(open(os.path.join(SITE, path.lstrip("/"))))
    if j.get("raw_p256"): return ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), base64.b64decode(j["raw_p256"])), j.get("person") or path
    return serialization.load_ssh_public_key(j["ssh"].encode()), j.get("agent") or path
def valid(rec):
    try:
        k, _ = key_of(rec["key"]); sig = base64.b64decode(rec["signature"]); n = len(sig) // 2
        k.verify(encode_dss_signature(int.from_bytes(sig[:n], "big"), int.from_bytes(sig[n:], "big")), rec["payload"].encode(), ec.ECDSA(hashes.SHA256())); return True
    except Exception: return False

def manifest(pid, ver, P):
    comps = sorted({s["component"] for s in P["scenes"] if s.get("component")})
    files = ["assets/player.js", f"{pid}/{ver}/scenes.json"] + [f"{pid}/{ver}/{s['audio']}" for s in P["scenes"] if s.get("audio")]
    files += [u.removeprefix("/productions/") for u in [P.get("brand_logo")] + [x.get("mark") for x in P["scenes"]] if u]
    files += [f"lab/{c}/scene.js" for c in comps] + (["assets/vendor/three-0.187.0/three.module.min.js"] if comps else [])
    rows = [{"path": f, "sha256": sha(open(os.path.join(ROOT, f), "rb").read())} for f in files]
    digest = sha("".join(f"{r['sha256']}  {r['path']}\n" for r in rows).encode())
    m = {"about": "The files that make this version's picture and sound. The digest is the SHA-256 of the lines '<sha256>  <path>\\n' in this order. A review signs this digest.", "production": pid, "version": ver, "digest": digest, "files": rows}
    write(f"{pid}/{ver}/manifest.json", json.dumps(m, indent=1) + "\n"); return m

def reviews(pid, ver, m, approvers):
    recs, approved = [], False
    for f in sorted(glob.glob(os.path.join(ROOT, pid, ver, "reviews", "*.json"))):
        r = json.load(open(f)); ok = valid(r); p = json.loads(r["payload"])
        if not ok: sys.exit(f"REFUSED: {f} has a signature that does not verify")
        covers = p.get("digest") == m["digest"] and p.get("version") == ver and p.get("production") == pid
        if not covers: print(f"note: {os.path.relpath(f, ROOT)} signs another digest (the files changed after it was signed)")
        if covers and p.get("decision") == "approve" and r["key"] in approvers: approved = True
        recs.append(r)
    write(f"{pid}/{ver}/reviews.json", json.dumps(recs, indent=1) + "\n"); return recs, approved

# ---- pages
def links(ls): return " ".join(f'<a href="{e(l["url"])}">{e(l["label"])}</a>' for l in ls)
def mmss(t): return f"{int(t // 60)}:{int(t % 60):02d}"
def on_screen(s):
    if s.get("on_screen"): return s["on_screen"]
    if s["kind"] in ("years",): return "; ".join(f'{i["year"]}: {i["text"]}' for i in s["items"])
    if s["kind"] == "list": return "; ".join(s["items"])
    if s["kind"] == "quote": return "; ".join(f'“{q["quote"]}” ({q["by"]})' for q in s["quotes"])
    if s["kind"] == "names": return ", ".join(s["names"])
    if s["kind"] == "values": return "; ".join(f"{a} over {b}" for a, b in s["values"])
    if s["kind"] == "numbers": return "; ".join(f'{n["n"]}: {n["text"]}' for n in s["numbers"]) + (". " + s["small"] if s.get("small") else "")
    if s["kind"] == "stat": return f'{s["value"]}: {s["label"]}' + (". " + s["small"] if s.get("small") else "")
    if s["kind"] == "credits": return " ".join(s["lines"])
    return s.get("caption", "")
def sources_html(s):
    out = []
    for x in s.get("sources", []):
        fact = f' (<a href="{e(x["fact_url"])}">the fact, with its quote</a>)' if x.get("fact_url") else ""
        out.append(f'{e(x["claim"])} <a href="{e(x["url"])}">{e(x["title"])}</a>, {e(x["publisher"])}{fact}')
    return "".join(f"<li>{o}</li>" for o in out)

def version_page(prod, ver, P, m, recs, approved):
    pid = prod["id"]; total = sum(s["seconds"] for s in P["scenes"]); v = P.get("voice") or {}
    trans = "".join(f'<li id="s-{e(s["id"])}"><strong>{e(s["title"] if s["kind"] != "stat" else s["label"])}</strong> ({e(s["id"])}, {s["seconds"]:.0f} s)<br>{e(s["narration"])}<span class="src">On screen: {e(on_screen(s) or s["title"])}</span><ul class="src">{sources_html(s)}</ul></li>' for s in P["scenes"])
    voice = f'The voice is made by AI: {e(v.get("provider"))} {e(v.get("model"))}, {e(v.get("voice"))}, played {e(v.get("speed"))} times faster. It is no real person’s voice.' if v else "This version has no voice."
    body = f"""<p class="meta"><a href="../">{e(prod["title"])}</a> / version {e(ver)}</p>
<h1>{e(prod["title"])}: {e(ver)}</h1>
<p class="lede">{e(prod["summary"])}</p>
<p><span class="status s-{e(prod["status"])}">{e(STATUS_WORDS[prod["status"]])}</span> <span class="meta">{e(prod["status_note"])}</span></p>
<section class="player" data-player data-src="scenes.json" tabindex="0" aria-label="Player: {e(prod["title"])}, {mmss(total)}">
<div class="stage"><canvas width="1280" height="720" role="img" aria-label="An animation of {len(P["scenes"])} scenes. Everything it shows and says is in the transcript below."></canvas></div>
<p class="cap" data-role="caption" aria-hidden="true"></p>
<div class="bar" role="group" aria-label="Player controls">
<button type="button" class="primary" data-act="play" aria-pressed="false">Play</button>
<button type="button" data-act="prev">Previous scene</button>
<button type="button" data-act="next">Next scene</button>
<label class="vh" for="seek">Position in the production</label><input id="seek" type="range" min="0" max="{total:.1f}" step="0.1" value="0" data-role="seek">
<output data-role="time" for="seek">0:00 / {mmss(total)}</output>
<button type="button" data-act="format">Portrait 9:16</button>
<button type="button" data-act="full">Full screen</button>
<button type="button" data-act="capture">Record and send</button>
<button type="button" data-act="tele" aria-expanded="false">Teleprompter</button>
</div>
<p data-role="status" role="status"></p>
<div class="tele" data-role="tele" hidden>
<h2>Teleprompter (an experiment)</h2>
<p class="note">Read the script while the scenes play; this browser records your camera and microphone over the animation. Your take stays in this tab until you save it: nothing is uploaded, and nothing of anyone’s take is published without their own signed review.</p>
<div class="script" data-role="script" tabindex="0" aria-label="The script, one line at a time"></div>
<div class="bar" role="group" aria-label="Teleprompter controls">
<button type="button" data-act="camon">Turn on camera and microphone</button>
<label for="layer">Your picture</label><select id="layer" data-role="layer"><option value="corner">In a corner</option><option value="full">Full frame, under the words</option></select>
<label><input type="checkbox" data-role="guide"> Play the AI voice as a guide (use headphones)</label>
<button type="button" class="primary" data-act="take" disabled>Record a take</button>
<button type="button" data-act="stop">Stop</button>
<button type="button" data-act="camoff" disabled>Turn them off</button>
</div>
</div>
<div data-role="out"></div>
</section>
<section class="scenes" data-scenes aria-label="Review scene by scene">
<h2 id="scenes">Scene by scene</h2>
<p data-role="signed" class="meta">Checking whether this browser is signed in.</p>
<ol class="chips" data-role="chips" aria-label="The scenes, in order"></ol>
<h3 data-role="now" aria-live="polite">Scene 1</h3>
<p data-role="words" class="meta"></p>
<div class="bar" role="group" aria-label="Scene controls"><button type="button" class="primary" data-act="playscene">Play this scene</button><button type="button" data-act="prevscene">Previous scene</button><button type="button" data-act="nextscene">Next scene</button></div>
<form class="review" data-role="comment">
<div class="bar" role="group" aria-label="Your verdict on this scene"><button type="button" data-act="up" aria-pressed="false">👍 Good</button><button type="button" data-act="down" aria-pressed="false">👎 Not right</button></div>
<label for="sc-text"><span>Your comment on this scene</span><textarea id="sc-text" name="text" rows="3"></textarea></label>
<p><button type="button" data-act="dictate" aria-pressed="false">Speak your comment</button> <span class="meta" data-role="dictnote">Your browser turns your voice into text (in Safari, Apple\u2019s dictation). Some browsers send the sound to their maker to do it. This site receives no sound.</span></p>
<button type="submit" class="primary">Send for this scene</button>
<p data-role="sent" role="status" class="meta"></p>
</form>
</section>
<p class="note">Keys, with the player in focus: Space or K plays and pauses, the left and right arrows change scene, Home goes back to the start. With reduced motion set on your device, scenes change without movement. “Capture a file” plays the production from the start and records the picture and the voice in your browser, for a platform that needs a file. {voice}</p>

<h2 id="transcript">Transcript and sources</h2>
<ol class="transcript">{trans}</ol>

<h2 id="review">Review and sign-off</h2>
<div data-review data-root="../../" data-approvers="{e(json.dumps(prod.get("approvers", [])))}">
<p data-role="files">Checking that the files served are the files of this version.</p>
<p data-role="verdict"><strong class="wait">Signed for publishing: {"yes" if approved else "no"}.</strong></p>
<div class="table" tabindex="0" role="region" aria-label="Reviews of this version"><table data-role="reviews"><caption class="vh">Reviews of this version</caption><thead><tr><th scope="col">Who</th><th scope="col">Says</th><th scope="col">Signature</th><th scope="col">Covers</th><th scope="col">May approve publishing</th><th scope="col">When (UTC)</th><th scope="col">Comments</th></tr></thead><tbody><tr><td colspan="7">{len(recs)} review record(s): your browser is checking each signature.</td></tr></tbody></table></div>
<p class="meta">Version digest <code>{m["digest"]}</code> over {len(m["files"])} files (<a href="manifest.json">manifest.json</a>, <a href="reviews.json">reviews.json</a>).</p>
<h3>Add your review</h3>
<form class="review">
<label for="rv-who"><span>Your name</span><input id="rv-who" type="text" name="reviewer" required autocomplete="name"></label>
<label for="rv-dec"><span>Your decision</span><select id="rv-dec" name="decision"><option value="comment">Comments only</option><option value="changes">Changes wanted</option><option value="approve">I approve this exact version</option></select></label>
<label for="rv-com"><span>Comments, one a line. Start a line with a scene id and a colon to pin it, for example <code>royce: slower</code></span><textarea id="rv-com" name="comments" rows="4"></textarea></label>
<p><button type="button" data-act="dictate" aria-pressed="false">Speak your comments</button> <span class="meta" data-role="dictnote">Uses your browser\u2019s own speech recognition (in Safari, Apple\u2019s dictation). Some browsers send the sound to their maker to turn it into text. This site receives nothing.</span></p>
<button type="submit" class="primary">Sign in this browser</button>
<p data-role="signmsg" role="status" class="meta">Signing makes a key in this browser (the private half cannot leave it) and signs your words together with the digest above. Nothing is sent.</p>
<p><button type="button" data-act="sendreview" hidden>Send it to c.productions</button> <span class="meta" data-role="sendnote"></span></p>
<label for="rv-rec"><span>Your signed review record</span><textarea id="rv-rec" class="out" data-role="record" readonly></textarea></label>
<label for="rv-key"><span>Your public key (published once, at the owner\u2019s word)</span><textarea id="rv-key" class="out" data-role="pubkey" readonly></textarea></label>
</form>
</div>
"""
    return page(f"{pid}/{ver}/", f"{prod['title']}: {ver}", prod["summary"], body, ["/productions/assets/player.js", "/productions/assets/review.js", "/productions/assets/scenes.js", "/productions/assets/record-send.js"])

def production_page(prod, versions):
    pid = prod["id"]; ver, P, m, recs, approved = versions[-1]
    rows = "".join(f'<tr><td>{n}</td><td>{e(s["id"])}</td><td>{e(s["kind"])}</td><td>{s["seconds"]:.0f} s</td><td>{e(s.get("title") or s.get("label"))}</td><td>{e(on_screen(s))}</td><td>{len(s.get("sources", []))}</td></tr>' for n, s in enumerate(P["scenes"], 1))
    script = "".join(f'<li><strong>{e(s["id"])}.</strong> {e(s["narration"])}</li>' for s in P["scenes"])
    vers = "".join(f'<tr><td><a href="{e(v["version"])}/">{e(v["version"])}</a></td><td>{e(v["date"])}</td><td>{e(STATUS_WORDS[v["status"]])}</td><td>{e(v["notes"])}</td><td>{len(x[3])} recorded; signed for publishing: {"yes" if x[4] else "no"}</td></tr>' for v, x in zip(prod["versions"], versions))
    b = prod["brief"]
    body = f"""<p class="meta"><a href="../">Productions</a> / {e(prod["title"])}</p>
<h1>{e(prod["title"])}</h1>
<p class="lede">{e(prod["summary"])}</p>
<p><span class="status s-{e(prod["status"])}">{e(STATUS_WORDS[prod["status"]])}</span> <span class="meta">{e(prod["status_note"])}</span></p>
<p><a href="{e(ver)}/"><strong>Play version {e(ver)}, and review it</strong></a></p>
<h2>Brief</h2>
<p>{e(b["from"])}: “{e(b["text"])}” (<a href="{e(b["link"])}">the brief</a>). Made by {e(prod["made_by"])}.</p>
{f'<p class="note"><strong>Source:</strong> <a href="{e(prod["source"]["url"])}">{e(prod["source"]["title"])}</a>. {e(prod["source"]["what"])} {e(prod["source"]["family_what"])} <a href="{e(prod["source"]["family_url"])}">{e(prod["source"]["family"])}</a>.</p>' if prod.get("source") else ""}
<p>{links(prod["links"])}</p>
<h2>Versions</h2>
<div class="table" tabindex="0" role="region" aria-label="Versions"><table><thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col">What changed</th><th scope="col">Reviews</th></tr></thead><tbody>{vers}</tbody></table></div>
<h2>Script ({e(ver)})</h2>
<ol>{script}</ol>
<h2>Storyboard ({e(ver)})</h2>
<div class="table" tabindex="0" role="region" aria-label="Storyboard"><table><thead><tr><th scope="col">No.</th><th scope="col">Scene</th><th scope="col">Kind</th><th scope="col">Length</th><th scope="col">Title</th><th scope="col">On screen</th><th scope="col">Sources</th></tr></thead><tbody>{rows}</tbody></table></div>
<p class="meta">Data: <a href="production.json">production.json</a>, <a href="{e(ver)}/scenes.json">{e(ver)}/scenes.json</a>.</p>
"""
    return page(f"{pid}/", prod["title"], prod["summary"], body)

def cell_html():
    # the cell as a picture: one row per role, one column per batch of runs started together, one bar per run
    C = load("cell.json"); roles = [r["role"] for r in C["roles"]]; nb = len(C["batches"])
    LW, CW, RH, TOP = 150, 196, 58, 54; W = LW + CW * nb + 10; H = TOP + RH * len(roles) + 16
    g = [f'<rect x="0" y="0" width="{W}" height="{H}" rx="10" class="cv-bg"/>']
    for b, name in enumerate(C["batches"]):
        x = LW + CW * b; d, _, what = name.partition(": ")
        g.append(f'<line x1="{x}" y1="{TOP - 8}" x2="{x}" y2="{H - 10}" class="cv-grid"/><text x="{x + 8}" y="20" class="cv-h">{e(d)}</text><text x="{x + 8}" y="38" class="cv-s">{e(what)}</text>')
    for k, r in enumerate(C["roles"]):
        y = TOP + RH * k
        g.append(f'<line x1="8" y1="{y}" x2="{W - 8}" y2="{y}" class="cv-grid"/><text x="12" y="{y + 24}" class="cv-role{" cv-empty" if not r["runs"] else ""}">{e(r["role"])}</text><text x="12" y="{y + 42}" class="cv-s">{("%d run" % r["runs"]) + ("" if r["runs"] == 1 else "s") if r["runs"] else "not filled yet"}</text>')
    slot = {}
    for r in C["runs"]:
        k = roles.index(r["role"]); b = r["batch"] - 1; n = slot.get((k, b), 0); slot[(k, b)] = n + 1
        same = sum(1 for q in C["runs"] if q["role"] == r["role"] and q["batch"] == r["batch"]); bh = (RH - 12) / same
        x = LW + CW * b + 6; y = TOP + RH * k + 6 + n * bh; w = max(34, min(CW - 12, 20 + r["minutes"] * 9.5))
        label = r["job"] if len(r["job"]) < 30 else r["job"][:28] + "…"
        g.append(f'<g><title>{e(r["role"])}: {e(r["job"])}. {e(r["result"])}. {r["minutes"]} minutes, {r["tool_uses"]} tool uses. {e(r["status"])}.</title><rect x="{x}" y="{y:.1f}" width="{w:.0f}" height="{bh - 3:.1f}" rx="5" class="cv-run{" cv-out" if r.get("outside") else ""}"/><text x="{x + 6}" y="{y + (bh - 3) / 2 + 4:.1f}" class="cv-t">{e(label)}</text></g>')
    rows = "".join(f'<tr><td>{r["n"]}</td><td>{e(r["role"])}</td><td>{e(r["job"])}</td><td>{e(r["result"])}</td><td>{r["minutes"]} min, {r["tool_uses"]} tool uses</td><td>{e(r["status"])}</td></tr>' for r in C["runs"])
    does = "".join(f'<li><strong>{e(r["role"])}:</strong> {e(r["does"])}</li>' for r in C["roles"])
    return f"""<h2 id="cell">The cell: who is doing what</h2>
<p>{e(C["lead"]["agent"].split("@")[0])} leads and starts a sub-agent for each single job; a sub-agent reports back and cannot push or publish. Each bar below is one run: its row is the role, its column is when it started, its length is how long it took. Bars stacked in one box ran at the same time. <strong>Working right now: {C["working_now"]}.</strong></p>
<div class="table" tabindex="0" role="region" aria-label="The cell's runs as a picture"><svg class="cellviz" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="A timeline of the cell: {len(C["runs"])} runs in {nb} batches across {len(roles)} roles. Storyboard artist, Sound and Generated footage have no runs yet. The same data is in the table below.">{"".join(g)}</svg></div>
<p class="meta">Hover or press a bar for its result. Filled bars are sub-agents; the dashed one is another agent. As of {e(C["as_of"])}; written by hand after each run (<a href="cell.json">cell.json</a>), not live yet.</p>
<details><summary>What each role does, and every run as a table</summary>
<ul>{does}</ul>
<div class="table" tabindex="0" role="region" aria-label="Runs of the cell"><table><caption class="vh">Every run so far</caption><thead><tr><th scope="col">No.</th><th scope="col">Role</th><th scope="col">Job</th><th scope="col">Result</th><th scope="col">Cost</th><th scope="col">Status</th></tr></thead><tbody>{rows}</tbody></table></div>
</details>
"""

def index_page(idx, prods):
    counts = {s: 0 for s in idx["statuses"]}
    for p, _ in prods: counts[p["status"]] += 1
    for c in idx["candidates"]: counts[c["status"]] += 1
    lanes = "".join(f'<li class="{"has" if counts[s] else ""}">{e(STATUS_WORDS[s])}: {counts[s]}</li>' for s in idx["statuses"])
    cards = ""
    for p, versions in prods:
        ver, P, m, recs, approved = versions[-1]; total = sum(s["seconds"] for s in P["scenes"])
        cards += f"""<li class="card"><span class="status s-{e(p["status"])}">{e(STATUS_WORDS[p["status"]])}</span><h3><a href="{e(p["id"])}/">{e(p["title"])}</a></h3><p>{e(p["summary"])}</p>
<ul><li>Brief: {e(p["brief"]["from"])}</li><li>{len(P["scenes"])} scenes, {mmss(total)}, {sum(len(s.get("sources", [])) for s in P["scenes"])} source links</li><li>Version {e(ver)} of {e(p["versions"][-1]["date"])}: {len(recs)} review(s), signed for publishing: {"yes" if approved else "no"}</li></ul>
<p class="links">{("<a href=\"" + e(p["id"]) + "/" + e(ver) + "/board/\">Storyboard<span class=\"vh\"> of " + e(p["title"]) + "</span></a>") if os.path.exists(os.path.join(ROOT, p["id"], ver, "board", "frames.json")) else ""}<a href="{e(p["id"])}/{e(ver)}/">Play and review {e(ver)}<span class="vh"> of {e(p["title"])}</span></a><a href="{e(p["id"])}/">Brief, script and storyboard<span class="vh"> of {e(p["title"])}</span></a></p></li>"""
    cands = "".join(f'<li class="card"><span class="status s-{e(c["status"])}">{e(STATUS_WORDS[c["status"]])}</span><h3>{e(c["title"])}</h3><p>{e(c["what"])}</p><p class="links">{links(c["links"])}</p></li>' for c in idx["candidates"])
    body = f"""<h1>Productions</h1>
<p class="lede">Videos being made, in the open: each one is drawn in your browser with WebGL, with its script, its sources, its versions and who signed which. A file is captured only when a platform needs one.</p>
<ul class="lanes" aria-label="How many productions are at each stage">{lanes}</ul>
<h2>In production</h2>
<ul class="cards">{cards}</ul>
<h2>Candidates</h2>
<p class="note">{e(idx["candidates_note"])}</p>
<ul class="cards">{cands}</ul>
{cell_html()}
<h2>The scene lab</h2>
<p>Single scenes are built and judged one at a time in <a href="lab/">the scene lab</a>, against <a href="lab/critic.md">the critic\u2019s rubric</a>, before they join a production.</p>
<h2 id="how">How review and sign-off work</h2>
<ol>
<li><strong>A version is a set of files.</strong> The scenes, the voice and the player. Their SHA-256 hashes make one digest (manifest.json in the version’s folder).</li>
<li><strong>A review signs that digest.</strong> The review page signs the reviewer’s decision and comments together with the digest, with a key kept in the reviewer’s browser or an agent’s published key. The record is a small JSON file committed beside the version.</li>
<li><strong>Every reader’s browser checks it.</strong> The page hashes the files it was served and checks each signature against the published key. Change one byte and the signature no longer covers what you see.</li>
<li><strong>Nothing is published without it.</strong> A production can be marked signed or published only when a key on its approvers list has approved the exact digest of that version: the build refuses otherwise. No approver key is published yet, so nothing here is published.</li>
</ol>
<p class="note">Proposed, not built yet: a review vault, so a reviewer’s signed record travels by SG/Send instead of being handed to an agent, and captured files are delivered the same way.</p>
"""
    return page("", "Productions", "Videos being made in the open: drawn in your browser with WebGL, with scripts, sources, versions and signed reviews.", body)

def lab_page():
    L = load("lab", "scenes.json")
    for sc in L["scenes"]: assert os.path.exists(os.path.join(ROOT, "lab", sc["id"], "scene.js")), sc["id"]
    body = """<p class="meta"><a href="../">Productions</a> / the scene lab</p>
<h1>The scene lab</h1>
<p class="lede">Where single scenes are built, scrubbed and judged before they join a production. Each one is a small WebGL component that must say something with its words removed.</p>
<section class="player" data-lab aria-label="Scene lab">
<h2 data-role="title">Loading a scene</h2>
<p data-role="beat"></p>
<div class="stage"><canvas width="1280" height="720" role="img" aria-label="One animated scene. What it shows is described in the line above."></canvas></div>
<div class="bar" role="group" aria-label="Scene controls">
<button type="button" class="primary" data-act="play">Play</button>
<label class="vh" for="lab-seek">Position in the scene</label><input id="lab-seek" type="range" min="0" max="10" step="0.05" value="0" data-role="seek">
<output data-role="time" for="lab-seek">0.0 s</output>
<a href="?portrait=1">Portrait</a> <a href="?">Landscape</a>
</div>
<p data-role="status" role="status"></p>
<h3>Sources of this scene</h3>
<ul data-role="sources"></ul>
</section>
<h2>Scenes in the lab</h2>
<ul data-role="list" id="lab-list"></ul>
<p class="note">Nothing in the lab is published or signed: these are parts. The critic\u2019s rubric is <a href="critic.md">critic.md</a>; the contract a scene follows is at the top of <a href="harness.js">harness.js</a>. three.js 0.187.0 (MIT) is served from this site, not from a CDN.</p>
"""
    body = body.replace('<ul data-role="list" id="lab-list"></ul>', '<ul data-role="list" id="lab-list"></ul>' if L["scenes"] else '<ul data-role="list" id="lab-list"><li>No scene yet.</li></ul>')
    # the list sits inside the lab section for the harness
    body = body.replace('</section>\n<h2>Scenes in the lab</h2>\n', '<h2>Scenes in the lab</h2>\n').replace('<p class="note">Nothing in the lab', '</section>\n<p class="note">Nothing in the lab')
    write("lab/index.html", page("lab/", "The scene lab", "Single WebGL scenes, built and judged one at a time before they join a production.", body, ["/productions/lab/harness.js"]))

def send_page():
    body = """<p class="meta"><a href="../">Productions</a> / talk to the agent</p>
<h1>Talk to the productions agent</h1>
<p class="lede">A private conversation with c.productions, the AI agent that makes these productions: write or speak, read its answers, and mark each answer good or not right.</p>
<p data-role="state" role="status">Checking this browser.</p>
<p data-role="status" role="status" class="meta"></p>
<section data-role="signin" hidden>
<h2>Sign in, once in this browser</h2>
<ol>
<li>Send this to the agent, as a picture or as text. It is this browser\u2019s public key: it only lets the agent seal things that this browser alone can open. <canvas id="pkqr" width="320" height="320" role="img" aria-label="This browser\u2019s public key as a QR code. The same key is in the text box below."></canvas> <span class="bar"><button type="button" class="primary" data-act="copyqr">Copy the QR picture</button> <button type="button" data-act="copy">Copy it as text</button></span> <textarea id="pk" class="out" rows="3" readonly aria-label="This browser\u2019s public key as text"></textarea></li>
<li>The agent answers with a sign-in code, as a link, a text or a QR picture. Open the link in this browser, or bring the code here:
<form data-role="grant" class="review"><label for="g-code"><span>Paste the sign-in code or link</span><textarea id="g-code" rows="3"></textarea></label><button type="submit" class="primary">Sign in</button></form>
<p data-role="drop" class="drop">Or drop the QR picture here, or paste it anywhere on this page.</p></li>
</ol>
</section>
<section data-role="chat" hidden>
<h2>The conversation</h2>
<div data-role="thread" class="thread" tabindex="0" role="log" aria-label="Messages between you and the agent"></div>
<form data-role="compose" class="review">
<label for="m-about"><span>About (a production, a scene, anything; optional)</span><input id="m-about" type="text" name="about"></label>
<label for="m-text"><span>Your message</span><textarea id="m-text" name="text" rows="4" required></textarea></label>
<p><button type="button" data-act="dictate" aria-pressed="false">Speak your message</button> <span class="meta" data-role="dictnote">Uses your browser\u2019s own speech recognition (in Safari, Apple\u2019s dictation). Some browsers send the sound to their maker to turn it into text. This site receives nothing.</span></p>
<button type="submit" class="primary">Seal and send</button>
</form>
<p><button type="button" data-act="refresh">Check for answers</button> <button type="button" data-act="signout">Sign out of this browser</button></p>
</section>
<h2>How this works</h2>
<ul>
<li>This browser makes its own keys. The private halves cannot be copied out of it.</li>
<li>Signing in: the agent seals the lane\u2019s token to this browser\u2019s key and signs it. Only this browser can open it. The token is in no file of this site, and it is kept here encrypted with this browser\u2019s key.</li>
<li>Each message is sealed in your browser to the agent\u2019s public key, signed with your key, and added to the agent\u2019s lane on SG/Send. The token can add messages; it cannot read or delete any.</li>
<li>The agent reads its lane when it is nudged, or when it next checks. It is not instant. It answers each message; answers are sealed to this browser and published as a file only this browser can open.</li>
<li>Nothing is tracked. Signing out removes the sign-in and the thread from this browser.</li>
</ul>
<p class="meta">The lane\u2019s public details: <a href="inbox.json">inbox.json</a>. A first trial, made on 27 and 28 November 2026.</p>
"""
    write("send/index.html", page("send/", "Talk to the productions agent", "A private, sealed conversation with the AI agent that makes these productions.", body, ["/productions/assets/send.js"]))

def board_page(prod, ver, P, vhtml):
    # the storyboard: every scene with its frames on the left, one player on the right, comments per scene
    pid = prod["id"]; fj = os.path.join(ROOT, pid, ver, "board", "frames.json")
    if not os.path.exists(fj): return False
    F = json.load(open(fj)); by = {}
    for f in F["frames"]: by.setdefault(f["scene"], []).append(f)
    i = vhtml.index('<section class="player"'); j = vhtml.index('<section class="scenes"'); player = vhtml[i:j]
    k = player.index('<div class="tele"'); player = player[:k] + player[player.index('<div data-role="out">'):]   # no teleprompter panel here
    player = player.replace('<button type="button" data-act="tele" aria-expanded="false">Teleprompter</button>\n', '')
    player = player.replace('data-src="scenes.json"', 'data-src="../scenes.json"')
    cards = ""; t = 0
    for n, s in enumerate(P["scenes"], 1):
        thumbs = "".join(f'<button type="button" class="thumb" data-t="{f["t"]}" data-i="{n - 1}"><img src="frames/{e(f["file"][:-4])}.jpg" width="480" height="270" loading="lazy" alt="Scene {n}, {e(s["id"])}: frame {f["k"]} of 3, at {mmss(f["t"])}"></button>' for f in by.get(s["id"], []))
        cards += f"""<li class="shot" data-scene="{e(s["id"])}" data-i="{n - 1}" id="b-{e(s["id"])}">
<h2><span class="num">{n}</span> {e(s.get("title") or s.get("label"))} <span class="meta">{e(s["id"])}, {mmss(t)} to {mmss(t + s["seconds"])}, {s["seconds"]:.0f} s{", lab scene " + e(s["component"]) if s.get("component") else ", plain style"}</span></h2>
<div class="thumbs">{thumbs}</div>
<p class="voice">{e(s["narration"])}</p>
<p class="meta">On screen: {e(on_screen(s) or s.get("title", ""))}</p>
<div class="bar" role="group" aria-label="Scene {n} review"><button type="button" class="primary" data-act="playscene">Play scene {n}</button><button type="button" data-act="stopfilm">Stop the film</button><button type="button" data-act="up" aria-pressed="false">👍 Good</button><button type="button" data-act="down" aria-pressed="false">👎 Not right</button><button type="button" data-act="dictate" aria-pressed="false">Speak</button></div>
<label class="vh" for="bt-{n}">Your comment on scene {n}</label><textarea id="bt-{n}" rows="2" placeholder="Your comment on scene {n}"></textarea>
<p><button type="button" data-act="sendscene">Send for scene {n}</button> <span class="meta" data-role="sent" role="status"></span></p>
</li>"""
        t += s["seconds"]
    body = f"""<p class="meta"><a href="../../">{e(prod["title"])}</a> / <a href="../">version {e(ver)}</a> / storyboard</p>
<h1>{e(prod["title"])} {e(ver)}: the storyboard</h1>
<p class="lede">Every scene in order, with three frames, its words and its length. Press a frame to see that moment in the preview; play one scene; mark it and comment.</p>
<p><span class="status s-{e(prod["status"])}">{e(STATUS_WORDS[prod["status"]])}</span> <span class="meta">{e(prod["status_note"])} {e(next(v["notes"] for v in prod["versions"] if v["version"] == ver))}</span></p>
<p data-role="signed" class="meta">Checking whether this browser is signed in.</p>
<div class="suite" data-board>
<ol class="shots">{cards}</ol>
<div class="preview">
{player}<p class="meta" data-role="dictnote">Voice uses your browser\u2019s own speech recognition. This site receives no sound.</p>
<p class="meta">Frames: taken from the player in headless Chromium on {e(F["made"])}; the full-size ones are in <a href="/productions/media.json">the media vault</a>. <a href="../">The full review page for this version</a>.</p>
</div>
</div>
"""
    write(f"{pid}/{ver}/board/index.html", page(f"{pid}/{ver}/board/", f"{prod['title']} {ver}: the storyboard", "Every scene in order with its frames, words and length, a preview beside it, and comments per scene.", body, ["/productions/assets/player.js", "/productions/assets/board.js"])); return True

def refresh_chart(M):
    # tokens re-read against work done, for one session and for the same work cut into fresh sessions (a model)
    end, total = M["context_tokens"], M["cache_read_tokens"]; start = 30000; turns = round(total / ((start + end) / 2)); g = (end - start) / turns
    def run(limit, floor=40000):
        ctx, cum, pts = start, 0, [(0, 0)]
        for t in range(1, turns + 1):
            cum += ctx; ctx += g
            if limit and ctx >= limit: ctx = floor
            pts.append((t * g, cum))
        return pts
    lines = [("One session, never refreshed", run(0), "cv-l1"), ("Handed over at 300,000 tokens", run(300000), "cv-l2"), ("Handed over at 150,000 tokens", run(150000), "cv-l3")]
    W, H, L, B, T = 760, 380, 70, 48, 20; X = lambda v: L + v / (end - start) * (W - L - 170); Y = lambda v: H - B - v / total * (H - B - T)
    g_ = [f'<rect x="0" y="0" width="{W}" height="{H}" rx="10" class="cv-bg"/>']
    for k in range(0, 101, 25): y = Y(total * k / 100); g_.append(f'<line x1="{L}" y1="{y:.0f}" x2="{W - 160}" y2="{y:.0f}" class="cv-grid"/><text x="{L - 8}" y="{y + 4:.0f}" text-anchor="end" class="cv-s">{total * k / 100 / 1e6:.0f} M</text>')
    for k in range(0, 6): v = (end - start) * k / 5; g_.append(f'<text x="{X(v):.0f}" y="{H - B + 18}" text-anchor="middle" class="cv-s">{v / 1000:.0f}k</text>')
    g_.append(f'<text x="{L}" y="{H - 8}" class="cv-s">Work done: new tokens added to the conversation</text><text x="{L}" y="14" class="cv-s">Tokens re-read so far</text>')
    for name, pts, cls in lines:
        d = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in pts[::3] + [pts[-1]]); fx, fy = pts[-1]
        g_.append(f'<polyline points="{d}" class="cv-line {cls}"/><text x="{X(fx) + 8:.0f}" y="{Y(fy) + 4:.0f}" class="cv-s {cls}t">{fy / 1e6:.0f} M</text>')
    ends = [p[-1][1] for _, p, _ in lines]
    leg = "".join(f'<li><span class="sw {c}s"></span>{e(n)}: {v / 1e6:.0f} million tokens re-read{"" if i == 0 else f", {100 - v / ends[0] * 100:.0f}% less"}</li>' for i, ((n, _, c), v) in enumerate(zip(lines, ends)))
    return f"""<div class="table" tabindex="0" role="region" aria-label="Chart: tokens re-read against work done"><svg class="cellviz" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="A chart of tokens re-read against work done. Never refreshed, the line curves upward to {ends[0] / 1e6:.0f} million. Handed over at 300,000 tokens it reaches {ends[1] / 1e6:.0f} million; at 150,000, {ends[2] / 1e6:.0f} million.">{"".join(g_)}</svg></div>
<ul class="legend">{leg}</ul>
<p class="meta">The top line ends at this session\u2019s measured total. The two lower lines are a model of the same work: {turns} turns adding about {g:,.0f} tokens each, with each fresh session starting at 40,000.</p>
"""

def refresh_doc():
    D = load("session-refresh", "document.json")
    secs = "".join(f'<h2>{e(x["h"])}</h2>' + (refresh_chart(D["measured"]) if x.get("chart") else "") + "".join(f"<p>{e(t)}</p>" for t in x["p"]) + (f'<p class="meta">Sources: {", ".join(f"<a href=\"{e(u)}\">{e(l)}</a>" for l, u in x["src"])}.</p>' if x["src"] else "") for x in D["sections"])
    body = f"""<p class="meta"><a href="../../">Productions</a> / session refresh</p>
<h1>{e(D["title"])}</h1>
<p class="lede">{e(D["summary"])}</p>
<p class="note">{e(D["asked_by"])} {e(D["status"])} A short film from this page has <a href="../storyboard/">a first storyboard</a>; no scene is built yet.</p>
{secs}
<p class="meta">Data: <a href="../document.json">document.json</a>. No key, session id or private material is on this page.</p>
"""
    write("session-refresh/how-we-refresh-a-session/index.html", page("session-refresh/how-we-refresh-a-session/", D["title"], "How a long AI agent session is handed over to a fresh one: when, what is written, what is read, what is kept and lost, and the numbers.", body))

def refresh_board():
    from refresh_board import board_html
    S = load("session-refresh", "storyboard.json")
    write("session-refresh/storyboard/index.html", page("session-refresh/storyboard/", S["title"] + ": the storyboard", "The storyboard of a short film on handing a long AI agent session over to a fresh one: nine beats, each with a sketch, its words and its numbers.", board_html(S, load("session-refresh", "document.json"))))

def changes_json():
    # what changed under site/productions, newest first, from the repository's own history
    import subprocess
    out = subprocess.run(["git", "log", "-60", "--date=format:%Y-%m-%d %H:%M", "--format=%h%x1f%ad%x1f%s%x1f%b%x1e", "--", "site/productions"], cwd=os.path.dirname(SITE), capture_output=True, text=True).stdout
    rows = []
    for rec in out.split("\x1e"):
        f = rec.strip("\n").split("\x1f")
        if len(f) < 4: continue
        body = "\n".join(l for l in f[3].strip().splitlines() if not l.startswith(("Agent:", "Claude-Session:", "Co-Authored-By:"))).strip()
        rows.append({"commit": f[0], "date_utc": f[1], "what": f[2], "detail": body})
    d = {"about": "What changed on the productions pages, newest first: one entry per commit that touched site/productions, taken from the repository's history when the pages were last built. The site's current version and commit are in /version.json (the version is made by the deploy from the git tags). The commit that carries this file is not in it.", "version_now": "/version.json", "repository": "https://github.com/SovereignWebsite/Site__Agent__Studio/commits/dev/site/productions", "changes": rows}
    write("changes.json", json.dumps(d, indent=1, ensure_ascii=False) + "\n")

def main():
    idx = load("productions.json"); prods = []
    for pid in idx["productions"]:
        prod = load(pid, "production.json"); versions = []
        for v in prod["versions"]:
            ver = v["version"]; P = load(pid, ver, "scenes.json"); assert P["id"] == pid and P["version"] == ver
            for s in P["scenes"]: assert s.get("sources"), f"{pid} {s['id']}: a beat without a public source"
            assert "AI" in P["label"], "the label must say the voice is made by AI"
            m = manifest(pid, ver, P); recs, approved = reviews(pid, ver, m, prod.get("approvers", []))
            versions.append((ver, P, m, recs, approved)); vh = version_page(prod, ver, P, m, recs, approved); has_board = board_page(prod, ver, P, vh)
            if has_board: vh = vh.replace('<h2 id="scenes">Scene by scene</h2>', '<h2 id="scenes">Scene by scene</h2>\n<p><a href="board/"><strong>Open the storyboard: every scene with its frames, and a preview beside it</strong></a></p>')
            write(f"{pid}/{ver}/index.html", vh)
        if prod["status"] in ("signed", "published") and not versions[-1][4]: sys.exit(f"REFUSED: {pid} is marked {prod['status']} but no approver has signed the digest of {versions[-1][0]}")
        script = f"# {prod['title']}: script, {versions[-1][0]}\n\n" + "\n".join(f"{n}. **{s['id']}** ({s['seconds']:.0f} s): {s['narration']}" for n, s in enumerate(versions[-1][1]["scenes"], 1)) + "\n"
        write(f"{pid}/script.md", script); write(f"{pid}/index.html", production_page(prod, versions)); prods.append((prod, versions))
        print(pid, versions[-1][0], versions[-1][2]["digest"][:16], f"{len(versions[-1][3])} review(s), approved: {versions[-1][4]}")
    write("index.html", index_page(idx, prods))
    lab_page(); send_page(); refresh_doc(); refresh_board()
    # each production as a small website: its reviews, script, team and article pages, and one menu on every page of it
    import prod_site
    for prod, versions in prods:
        prod_site.reviews_page(ROOT, prod, page, write); prod_site.script_page(ROOT, prod, versions[-1][1], page, write)
        prod_site.team_page(ROOT, prod, page, write); prod_site.article_page(ROOT, prod, page, write); prod_site.inject(ROOT, prod)
    changes_json()

if __name__ == "__main__": main()
