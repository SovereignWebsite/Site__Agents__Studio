// Record and send: after the player has recorded a film in this browser (the Record and send button), send the file
// to c.productions with SG/Send, encrypted here before it leaves (sgsend.js). The person sending types their own SG/Send
// access token: it stays in this tab's memory, goes only to SG/Send with the upload, and is never saved or sent to this
// site. They get a short code to give to c.productions, who fetches the file (_build/fetch_transfer.py), checks it and
// passes it on for publishing. Recording here is the hand-over: the owner chooses the exact version. By c.productions.
import { sendFile, SERVICES } from './sgsend.js';
const host = document.querySelector('[data-player]');
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
function panel(blob, filename) { document.querySelector('.sendbox')?.remove();
  const service = el('select', { id: 'rs-service' }, ...SERVICES.map((s) => el('option', { value: s, textContent: s })));
  const access = el('input', { id: 'rs-access', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: 'your SG/Send access token' });
  const send = el('button', { type: 'button', className: 'primary', textContent: 'Send it to c.productions' }), stage = el('p', { className: 'meta' }); stage.setAttribute('role', 'status');
  const result = el('div');
  send.addEventListener('click', async () => {
    send.disabled = true; stage.textContent = '';
    try {
      const r = await sendFile({ blob, filename, service: service.value, access: access.value.trim(), onStage: (t, f) => { stage.textContent = `${t} (${Math.round(f * 100)}%)`; } });
      access.value = '';
      const code = el('code', { textContent: r.token, className: 'big' }), copy = el('button', { type: 'button', textContent: 'Copy the code' });
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${r.token} (${service.value})`); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select and copy it'; } });
      result.replaceChildren(el('p', {}, el('strong', { textContent: 'Sent. ' }), 'Give c.productions this code in the chat (and say it is on ', el('code', { textContent: service.value }), '). Anyone with it can open the file, so share it only there.'), el('p', {}, code, ' ', copy));
    } catch (x) { stage.textContent = `Not sent: ${x.message}`; send.disabled = false; }
  });
  (document.querySelector('.rs-pick') || host).after(el('section', { className: 'sendbox' },
    el('h3', { textContent: 'Send this recording' }),
    el('p', {}, `${filename}, ${(blob.size / 1048576).toFixed(1)} MB. Watch it above first: this exact recording is what will be published once you sign the drafts.`),
    el('label', { htmlFor: 'rs-service', textContent: 'SG/Send service ' }), service,
    el('p', {}, el('label', { htmlFor: 'rs-access', textContent: 'Your SG/Send access token ' }), access),
    el('details', {}, el('summary', { textContent: 'What happens to the access token?' }), el('p', { textContent: 'It stays in this tab’s memory, goes only to the SG/Send service you chose, with this upload, and is cleared when the upload ends. It is never saved and never sent to this site. The file is encrypted in this browser before it leaves.' })),
    send, stage, result));
}
host?.addEventListener('recorded', (ev) => panel(ev.detail.blob, ev.detail.filename));
// a recording saved earlier (or made in another tab) can be sent too: pick the file
if (host) {
  const pick = el('input', { type: 'file', id: 'rs-file', accept: 'video/*' });
  pick.addEventListener('change', () => { const f = pick.files[0]; if (f) panel(f, f.name); });
  host.after(el('p', { className: 'meta rs-pick' }, el('label', { htmlFor: 'rs-file', textContent: 'Or send a recording you saved: ' }), pick));
}
