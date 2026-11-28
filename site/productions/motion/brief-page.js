// The brief page: builds the film from the feed snapshot with brief.js and shows the rules that chose it.
// Apache-2.0. By c.motion (an AI agent).
import { play } from './motion.js';
import { brief } from './brief.js';
import { RULES, rank, hoursOf } from './priority.js';
const $ = (id) => document.getElementById(id);
let dec, ide, film;
const cell = (tr, txt, tag = 'td') => { const c = document.createElement(tag); c.textContent = txt; tr.append(c); return c; };
const pad = (n) => String(n).padStart(2, '0');
const toLocal = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const nowMs = () => Date.parse($('now').value + ':00Z');

function rules() {
  const w = RULES.weights, s = RULES.seconds;
  const rows = [
    ['What waits on Dinis leads', 'status weight: ' + Object.entries(w).map(([k, n]) => `${k} ${n}`).join(', ')],
    ['Newer first within a weight', `plus up to ${RULES.recencyMax} for recency inside the window (0 at its edge)`],
    ['The window', `daily: the last ${hoursOf('daily')} hours; hourly: the last ${hoursOf('hourly')} hour, and an hourly brief with nothing new is not made. A daily brief also keeps anything still waiting (${RULES.stillWaiting.join(', ')})`],
    ['Lead', `at most ${RULES.maxLead} items get a hand-off scene of their own`],
    ['Cut', `the rest are counted, not shown; ${RULES.countOnly.join(', ')} items only appear as a count`],
    ['Length', `title ${s.title} s, hand-offs ${s.handoff} s each, counts ${s.count} s, close ${s.close} s: never over ${s.cap} s`],
    ['Words', `the decision's own words, shortened at a word boundary to ${RULES.shortenTo} characters`],
  ];
  $('rules').replaceChildren(...rows.map((r) => { const tr = document.createElement('tr'); cell(tr, r[0]); cell(tr, r[1]); return tr; }));
}
function build() {
  const window = $('win').value, now = nowMs();
  if (film) { film.destroy(); film = null; }
  const f = brief(dec, ide, { now, window }), r = rank(dec.decisions, { now, window }), ledIds = new Set(f ? f.brief.led : []);
  $('ranked').replaceChildren(...r.ranked.map(({ item, score }) => {
    const tr = document.createElement('tr'); cell(tr, ledIds.has(item.id) ? 'Led' : RULES.countOnly.includes(item.status) ? 'Counted (done)' : 'Cut');
    cell(tr, score.toFixed(1)); cell(tr, item.status); cell(tr, item.decision); return tr;
  }));
  if (!r.ranked.length) { const tr = document.createElement('tr'), c = cell(tr, 'Nothing in the window.'); c.colSpan = 4; $('ranked').append(tr); }
  $('empty').textContent = f ? '' : `No ${window} brief is made: nothing new in the last ${hoursOf(window)} hour${hoursOf(window) > 1 ? 's' : ''} before this time.`;
  $('film').hidden = !f; $('sources').replaceChildren();
  if (!f) return;
  film = play($('film'), f, { orientation: $('shape').value });
  $('notes').textContent = film.notes.length ? 'Held back by the policy: ' + film.notes.join('; ') : '';
  $('sources').replaceChildren(...f.sources.map((s) => { const li = document.createElement('li'), a = document.createElement('a'); a.href = s.url; a.textContent = s.title; li.append(a); return li; }));
}
Promise.all(['data/decisions.json', 'data/ideas.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' (' + r.status + ')'); return r.json(); }))).then(([d, i]) => {
  dec = d; ide = i; $('now').value = toLocal(Date.parse(d.updated)); rules(); build();
  ['win', 'now', 'shape'].forEach((id) => { $(id).onchange = build; });
}).catch((e) => { $('empty').textContent = 'The feed could not be loaded: ' + e.message; });
