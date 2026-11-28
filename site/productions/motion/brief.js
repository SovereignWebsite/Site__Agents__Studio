// Makes a motion.scene/v1 film (about 30 seconds at most) from c.maestro's decisions and ideas feeds.
// Only words from the feed are used; the rules are in priority.js. No DOM and no network here, so it runs in Node too:
//   node --input-type=module -e "import('./brief.js').then(async m=>{...})"
// Apache-2.0. By c.motion (an AI agent).
import { RULES, rank, shorten, timing, time } from './priority.js';

const STATUS_WORDS = { waiting_on_dinis: 'waiting on Dinis', asked: 'asked', in_progress: 'in progress', decided: 'decided', done: 'done' };
const statusWord = (s) => STATUS_WORDS[s] || String(s).replace(/_/g, ' ');
const agentsOf = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// Returns null for an hourly brief with nothing new (it is not made). The result carries `brief` (the ranking) for pages.
export function brief(decisions, ideas, { now, window = 'daily' } = {}) {
  const list = Array.isArray(decisions) ? decisions : (decisions && decisions.decisions) || [];
  const ideaList = Array.isArray(ideas) ? ideas : (ideas && ideas.ideas) || [];
  const r = rank(list, { now: now ?? (decisions && decisions.updated), window });
  if (window === 'hourly' && r.inPlay === 0) return null;
  const T = RULES.seconds, plan = timing(r.led.length), led = r.led.slice(0, plan.lead);
  const waiting = r.counts.waiting_on_dinis || 0, sources = [], scenes = [];
  const src = (d) => { const id = 's' + (sources.length + 1); sources.push({ id, title: shorten(d.decision, 60), url: d.link }); return id; };
  const when = window === 'hourly' ? 'This hour' : 'Today';
  scenes.push({
    id: 'title', type: 'title', seconds: T.title, title: 'The brief',
    narration: `${when}: ${waiting} wait on you.`,
    vars: { text: `${when}: ${waiting} wait on you`, sub: `${r.inPlay} decisions in the feed, ${led.length} shown` },
  });
  led.forEach(({ item: d }, i) => {
    const agents = agentsOf(d.carried_by), what = shorten(d.decision), waits = d.waits_on ? shorten(d.waits_on) : '';
    const actors = [{ id: 'd', label: 'Dinis Cruz', role: 'person', note: statusWord(d.status) }];
    agents.forEach((a, k) => actors.push({ id: 'a' + k, label: a, role: 'agent' }));
    if (waits) actors.push({ id: 'w', label: 'Waits on: ' + waits, role: 'file' });
    scenes.push({
      id: 'lead-' + (i + 1), type: 'handoff', seconds: T.handoff, title: `${i + 1} of ${led.length}: ${statusWord(d.status)}`,
      narration: `${what}. Carried by ${d.carried_by}.${waits ? ' Waits on: ' + waits + '.' : ''}`,
      sources: [src(d)], vars: { actors, carry: what, direction: 'down' },
    });
  });
  const others = Object.entries(r.counts).filter(([k]) => k !== 'waiting_on_dinis').map(([k, n]) => `${n} ${statusWord(k)}`);
  const ideaLine = ideaList.length ? `${ideaList.length} ideas on file` : '';
  scenes.push({
    id: 'count', type: 'count', seconds: T.count, title: 'Counted',
    narration: `${waiting} waiting on Dinis. ${others.join(', ')}.`,
    vars: { from: 0, to: waiting, unit: '', label: 'waiting on Dinis', lines: [...others, ideaLine].filter(Boolean) },
  });
  scenes.push({
    id: 'close', type: 'title', seconds: T.close, title: 'Close',
    narration: `${r.cut.length} more are counted, not shown.`,
    vars: { text: `${r.cut.length} more are counted, not shown`, sub: 'c.maestro' },
  });
  return {
    schema: 'motion.scene/v1', id: `brief-${window}`, title: `${when}: ${waiting} wait on you`, format: { w: 720, h: 1280 }, theme: 'auto',
    sources, scenes, brief: { window, now: r.now, led: led.map((x) => x.item.id), cut: r.cut.map((x) => x.item.id), seconds: scenes.reduce((a, s) => a + s.seconds, 0), updated: decisions && decisions.updated },
  };
}
export { time };
