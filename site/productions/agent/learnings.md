# c.productions: what the first session learnt the hard way

Written at the hand-over of 28 Nov 2026, for the successor. These are the things restart.md leaves out.

## Before every push
- `python3 site/productions/_build/build.py`, then `bash tools/check.sh` (all four checks; `--fast` skips accessibility, use it only for text or data changes). A page that fails fails the whole site's deploy.
- If the push is refused, another agent pushed first: `git fetch origin dev`, `git rebase origin/dev`, push again. Never force.
- Commit as `c.productions@SovereignWebsite.dinis`, signed, with `Agent:` and `Claude-Session:` trailers. No model name in a commit.
- Changing `assets/player.js`, a lab scene or three.js changes every version's digest, so the self-check reviews stop covering it: re-sign with `_build/sign_review.py` and rebuild.
- In `build.py`, write emoji as real characters. A `\ud83d` escape breaks the file write.
- Headings must not skip a level, and every page goes through `page()` for its link-preview tags.

## Testing
- Local servers die when the worker restarts. Built site: `python3 -m http.server 8765 -d _site` (after `node .github/ci/build.mjs`). Lab scenes: port 8770 on `site/`.
- `_build/shoot.js` shoots a lab scene; `_build/frames.js` shoots three frames of every scene of a version.
- Headless Chromium here is software GL and has no microphone or camera: say so when reporting.

## This environment
- Attaching another repository is refused. Read public files with curl from raw.githubusercontent.com or the live sites; api.github.com is blocked. Do not try to get round it.
- Showing a token or key in chat is refused, rightly. Hand a secret over only sealed to the reader's key.
- `sgit create` prints a web address that contains the vault key. Always send its output to a private file.
- Do not start sessions yourself, even where the tools allow it. Dinis, 28 Nov 2026: "you need to ask your conductor to start it, because you should not be able to." Write a start prompt and ask conductor.c.

## The append lane on SG/Send (not documented anywhere else)
- The vault must exist with one pushed commit first.
- Configure: POST `/api/vault/append/configure/<vault_id>` with headers `x-sgraph-access-token` and `x-sgraph-vault-write-key`, body `{"append_anchors": [sha256hex(token)], "enum_key_hash": sha256hex(enum_key)}`. The token and enum key are 64-hex strings you make; hash the string, not the bytes. The `lanes` field is accepted but does not open the lane.
- Write (no auth): POST `/api/vault/append/write/<vault_id>` `{"append_token", "payload"}`; payload is base64 of base64 of the JSON envelope `{v:2,w,i,c}`. An unknown token answers a 404 page.
- Read: POST `list` `{"include_content": false}`, `fetch` `{"inbox": token, "file_ids": [...]}`, `mark-processed` the same, all with header `x-sgraph-vault-enum-key`.
- Settings are cached for 30 seconds.
- The browser side is `assets/lane.js`; grants and replies are sealed with ECDH P-256, HKDF info `ws-ecies-1`, AES-GCM; a grant is signed with the agent's ECDSA key over `epk.iv.ct`.

## What Dinis has asked for, more than once
- A picture, not a list: do the data analysis first, then draw it.
- Storyboard before scenes. Each scene must say something with its words removed.
- QR codes, not text to copy. Voice input. One page where he can see everything and comment per scene.
- The version at the top of every page with what changed, and a GitHub link.
- Big files in a vault with a published read key. Vault keys go to the maestro, sealed.
- Keep it lean. Hand over early.

## Who is where (28 Nov 2026)
c.conductor starts sessions and holds claims. c.maestro was handed over on 28 Nov; ask c.conductor for its current session. accountant.c measures cost. higgsfield.c reviews and runs the Higgsfield trial with account B. feedback.c waits for Dinis's word to make its key. Ask c.conductor for any session id; do not rely on an old one.

## For the session-refresh film
- The brief each scene-smith gets, and how the loop is run step by step: `_build/scene-smith-brief.md`.
- The lane's agent side (drain, reply, grant): `_build/lane_agent.py`. It holds no secret, only paths.
- A chart can be drawn straight from data in `build.py` (see `refresh_chart` and `cell_html`): cheaper than a scene, and Dinis asked for the analysis first.
- A key file can only be published in a commit that adds `site/keys/<name>.json` and nothing else, and a name already taken blocks its successor: the old session must retire its own key file first (done on 28 Nov, to `site/keys/retired/`).

## Posting vertical films (learnt 28 Nov 2026, the first refresh film on Instagram and LinkedIn)
- The platforms draw their own buttons, name and caption over the bottom fifth of the frame, and LinkedIn trims the sides. Words near the bottom get cut.
- For any film going to social media, set "safe_area": {"scale": 0.82, "top": 0.04, "captions": 0.76} in scenes.json: the picture is drawn a little smaller from the top, the words on screen sit at 76% of the height, the source line leaves the frame (the sources are on the page) and the label sits above the words. Pair it with captions_in_frame and brand_corner.
- Dinis records the film himself on his iPad with Record and send: that is the hand-over and his choice of the exact version. Do not render here unless he asks.
