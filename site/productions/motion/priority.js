// The Studio's brief rules, written once. Pure functions, no DOM, no network: the same input gives the same answer.
// The table is DESIGN.md section 7; the page shows RULES so the words and the code cannot drift apart.
// Apache-2.0. By c.motion (an AI agent).

export const RULES = {
  weights: { waiting_on_dinis: 100, asked: 80, in_progress: 50, decided: 40, done: 20 },
  recencyMax: 10,
  windowHours: { daily: 24, hourly: 1 },
  maxLead: 3,
  shortenTo: 70,
  seconds: { title: 3, handoff: 6, count: 5, close: 3, cap: 30 },
  // statuses that still wait on someone, so a daily brief keeps them whatever their age
  stillWaiting: ['waiting_on_dinis', 'asked'],
  // statuses that are only ever counted, never given a scene
  countOnly: ['done'],
};

const HOUR = 3600000;
export const hoursOf = (window) => RULES.windowHours[window] ?? RULES.windowHours.daily;
export const time = (s) => Date.parse(s);

// Shorten at a word boundary to at most n characters, with a single ellipsis character when something was cut.
export function shorten(str, n = RULES.shortenTo) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '') + '…';
}

// Age in hours of an item at `now` (never negative).
export const ageHours = (item, now) => Math.max(0, (now - time(item.decided_at)) / HOUR);

// Score = status weight + up to recencyMax for how recent it is inside the window (linear, 0 at the window's edge).
export function score(item, now, window = 'daily') {
  const w = RULES.weights[item.status] ?? 0, h = hoursOf(window), age = ageHours(item, now);
  const bonus = age <= h ? RULES.recencyMax * (1 - age / h) : 0;
  return w + bonus;
}

// An item is in play when it is inside the window, or (daily only) it still waits on someone.
export function inPlay(item, now, window = 'daily') {
  if (Number.isNaN(time(item.decided_at))) return false;
  if (ageHours(item, now) <= hoursOf(window)) return true;
  return window === 'daily' && RULES.stillWaiting.includes(item.status);
}

// Rank the decisions. Returns { led, cut, counts, inPlay, ranked }: led are the (at most three) items given a scene,
// cut are the rest, counts is the number of in-play items by status. Done items are never led, only counted.
export function rank(decisions, { now, window = 'daily' } = {}) {
  const t = typeof now === 'number' ? now : time(now);
  const play = (decisions || []).filter((d) => inPlay(d, t, window));
  const ranked = play.map((d) => ({ item: d, score: score(d, t, window) }))
    .sort((a, b) => b.score - a.score || time(b.item.decided_at) - time(a.item.decided_at) || String(a.item.id).localeCompare(String(b.item.id)));
  const eligible = ranked.filter((r) => !RULES.countOnly.includes(r.item.status));
  const led = eligible.slice(0, RULES.maxLead), ledIds = new Set(led.map((r) => r.item.id));
  const counts = {}; play.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
  return { now: t, window, led, cut: ranked.filter((r) => !ledIds.has(r.item.id)), counts, inPlay: play.length, ranked };
}

// Seconds for a film with this many lead scenes. Never over the cap: lead scenes are dropped if it would be.
export function timing(nLead) {
  const s = RULES.seconds, n = Math.max(0, Math.min(nLead, RULES.maxLead));
  const total = (k) => s.title + k * s.handoff + s.count + s.close;
  let k = n; while (total(k) > s.cap && k > 0) k--;
  return { lead: k, total: total(k) };
}
