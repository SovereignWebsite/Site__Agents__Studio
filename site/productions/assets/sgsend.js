// Copied unchanged in its working parts from account F's deck player (site/factory/dinis-cruz/account-f/decks/signed/source/src/sgsend.js), Apache-2.0, for the productions' Record and send (28 Nov 2026).
// Send a recording with SG/Send (send.sgraph.ai), encrypted in this browser before it leaves it.
// The same protocol as SG/Send's own upload page, "simple token" mode:
//   token  = word-word-NNNN, made here at random
//   id     = the first 12 hex characters of SHA-256(token)
//   key    = PBKDF2-SHA256(token, salt "sgraph-send-v1", 600,000 rounds) -> AES-256-GCM
//   body   = SGMETA envelope { filename } + the file, encrypted; the 12-byte IV goes first
// The token is all the receiver needs: they open https://<service>/en-gb/download/#<token>.
// Uploading needs the sender's own SG/Send access token. It is typed by the person sending, kept only in this tab's
// memory, sent only to the SG/Send service in the x-sgraph-access-token header, and never stored or sent anywhere else.

const WORDS = ["amber", "anchor", "arrow", "aspen", "birch", "bloom", "brook", "cedar", "chalk", "cliff", "cloud", "clover",
  "coast", "coral", "crane", "creek", "crest", "delta", "drift", "dune", "ember", "fern", "field", "flint", "frost", "glade",
  "grove", "harbor", "hazel", "heron", "ivory", "jasper", "lake", "linen", "lotus", "maple", "marsh", "meadow", "moss",
  "north", "oak", "ocean", "olive", "onyx", "opal", "orbit", "pearl", "pine", "plume", "prism", "quail", "raven", "reef",
  "ridge", "river", "robin", "sage", "slate", "spruce", "stone", "tide", "trail", "willow", "wren"];
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
export const makeToken = () => `${WORDS[rand(WORDS.length)]}-${WORDS[rand(WORDS.length)]}-${String(rand(10000)).padStart(4, "0")}`;
export const SERVICES = ["dev.send.sgraph.ai", "send.sgraph.ai"];

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function derive(token) {
  const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).slice(0, 12);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("sgraph-send-v1"), iterations: 600000 },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  return { id, key };
}
function sgmeta(bytes, meta) {
  const m = new TextEncoder().encode(JSON.stringify(meta)), out = new Uint8Array(6 + 4 + m.length + bytes.byteLength);
  out.set([0x53, 0x47, 0x4d, 0x45, 0x54, 0x41], 0); new DataView(out.buffer).setUint32(6, m.length);
  out.set(m, 10); out.set(new Uint8Array(bytes), 10 + m.length); return out;
}

// sendFile({ blob, filename, service, access, onStage(text, fraction) }) -> { token, id, url }
export async function sendFile({ blob, filename, service = SERVICES[0], access, onStage = () => {} }) {
  if (!/^[a-z0-9_-]+$/i.test(access || "")) throw new Error("That access token does not look right: letters, digits, - and _ only.");
  const api = `https://${service}`, H = { "x-sgraph-access-token": access };
  const call = async (path, opts = {}) => {
    const r = await fetch(api + path, { mode: "cors", ...opts, headers: { ...H, ...(opts.headers || {}) } });
    if (r.status === 401) throw new Error("SG/Send did not accept that access token.");
    if (!r.ok) throw new Error(`SG/Send said ${r.status} at ${path.split("/").slice(0, 4).join("/")}.`);
    return r.json();
  };
  onStage("Making the key (a few seconds)", 0.02);
  const token = makeToken(), { id, key } = await derive(token);
  onStage("Encrypting in this browser", 0.08);
  const plain = sgmeta(await blob.arrayBuffer(), { filename }), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)), body = new Uint8Array(12 + ct.length);
  body.set(iv, 0); body.set(ct, 12);
  onStage("Creating the transfer", 0.12);
  await call("/api/transfers/create", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_size_bytes: plain.byteLength, content_type_hint: blob.type || "application/octet-stream", transfer_id: id }) });
  const DIRECT = 5 * 1024 * 1024;
  if (body.byteLength <= DIRECT) {
    onStage("Uploading", 0.3);
    await call(`/api/transfers/upload/${id}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
  } else {
    const cap = await call("/api/presigned/capabilities");
    if (!cap.multipart_upload) throw new Error("This SG/Send service does not take files this large from a browser.");
    const part = cap.max_part_size || 10 * 1024 * 1024, n = Math.ceil(body.byteLength / part);
    const init = await call("/api/presigned/initiate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_id: id, file_size_bytes: body.byteLength, num_parts: n }) });
    const parts = new Array(n); let done = 0, next = 0;
    const worker = async () => {
      while (next < n) {
        const i = next++, slice = body.subarray(i * part, Math.min((i + 1) * part, body.byteLength));
        const r = await fetch(init.part_urls[i].upload_url, { method: "PUT", body: slice });
        if (!r.ok) throw new Error(`A part of the upload failed (${r.status}).`);
        parts[i] = { part_number: init.part_urls[i].part_number, etag: r.headers.get("ETag") };
        onStage(`Uploading, part ${++done} of ${n}`, 0.15 + 0.8 * (done / n));
      }
    };
    try { await Promise.all([worker(), worker(), worker(), worker()]); await call("/api/presigned/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transfer_id: id, upload_id: init.upload_id, parts }) }); }
    catch (e) { fetch(`${api}/api/presigned/cancel/${id}/${init.upload_id}`, { method: "POST", headers: H }).catch(() => {}); throw e; }
  }
  onStage("Finishing", 0.97);
  await call(`/api/transfers/complete/${id}`, { method: "POST" });
  onStage("Sent", 1);
  return { token, id, url: `${api}/en-gb/download/#${token}` };
}
