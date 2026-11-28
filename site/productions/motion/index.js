// The player page: one scene file drawn in two shapes, and an editor whose fields come from the policy
// (policy.json mirrors what motion.js enforces). Only open variables can change. Apache-2.0. By c.motion (an AI agent).
import { play, enforce, policy, PALETTE } from './motion.js';
const $ = (id) => document.getElementById(id);
const POL = policy();
let data, cur = 0, work = {}, players = [];
const el = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); kids.forEach((k) => e.append(k)); return e; };
const type = () => data.scenes[cur].type, open = () => POL.types[type()].open;
const single = () => ({ ...data, scenes: [{ ...data.scenes[cur], vars: work }] });
const get = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);

function defaultFor(rule) {
  if (rule.kind === 'text') return 'New';
  if (rule.kind === 'number') return Math.max(rule.min, Math.min(rule.max, 10));
  if (rule.kind === 'enum') return rule.values === 'actors' ? ((work.actors || [])[0] || {}).id : rule.values[0];
  if (rule.kind === 'object') { const o = {}; Object.entries(rule.fields).forEach(([k, r]) => { if (['label', 'role', 'from', 'to'].includes(k)) o[k] = k === 'role' ? 'agent' : defaultFor(r); }); return o; }
  return undefined;
}
// Builds one field, or a group of them, for a rule. path locates the value inside `work`.
function field(name, rule, path, rebuild) {
  const parent = path.length > 1 ? get(work, path.slice(0, -1)) : work, key = path[path.length - 1], val = parent[key];
  const set = (v) => { parent[key] = v; apply(); };
  const id = 'f-' + path.join('-');
  if (rule.kind === 'text' || rule.kind === 'id') {
    const i = el('input', { id, type: 'text', value: val ?? '', maxLength: rule.max || 12, size: Math.min(40, (rule.max || 12) + 2) });
    i.oninput = () => set(i.value); i.onchange = () => { commit(); if (rule.kind === 'id') rebuild(); };
    return el('label', {}, [name + (rule.max ? ` (up to ${rule.max} characters)` : ''), i]);
  }
  if (rule.kind === 'number') {
    const i = el('input', { id, type: 'number', min: rule.min, max: rule.max, step: rule.int ? 1 : 0.1, value: val ?? '' });
    i.oninput = () => set(i.value === '' ? undefined : Number(i.value)); i.onchange = commit;
    return el('label', {}, [`${name} (${rule.min} to ${rule.max})`, i]);
  }
  if (rule.kind === 'enum' || rule.kind === 'colour') {
    const vals = rule.kind === 'colour' ? Object.keys(PALETTE) : rule.values === 'actors' ? (work.actors || []).map((a) => a.id) : rule.values;
    const s = el('select', { id }, [el('option', { value: '', textContent: rule.kind === 'colour' ? 'by role' : 'default' }), ...vals.map((v) => el('option', { value: v, textContent: v }))]);
    s.value = val ?? ''; s.onchange = () => { parent[key] = s.value === '' ? undefined : s.value; apply(); commit(); };
    return el('label', {}, [name, s]);
  }
  if (rule.kind === 'object') {
    const fs = el('fieldset', {}, [el('legend', { textContent: name })]); parent[key] = val || {};
    Object.entries(rule.fields).forEach(([k, r]) => fs.append(field(k, r, [...path, k], rebuild))); return fs;
  }
  if (rule.kind === 'list') {
    const arr = (parent[key] = Array.isArray(val) ? val : []), fs = el('fieldset', {}, [el('legend', { textContent: `${name} (${rule.min} to ${rule.max})` })]);
    arr.forEach((_, i) => {
      const row = el('div', {}, [field(`${name} ${i + 1}`, rule.item, [...path, i], rebuild)]);
      const rm = el('button', { type: 'button', textContent: `Remove ${name} ${i + 1}`, disabled: arr.length <= rule.min, onclick: () => { arr.splice(i, 1); apply(); commit(); rebuild(); } });
      row.append(rm); fs.append(row);
    });
    fs.append(el('button', { type: 'button', textContent: `Add to ${name}`, disabled: arr.length >= rule.max, onclick: () => { const d = defaultFor(rule.item); if (rule.item.kind === 'object' && rule.item.autoId) d.id = rule.item.autoId + (Date.now() % 1000); arr.push(d); apply(); commit(); rebuild(); } }));
    return fs;
  }
  return el('span');
}
function form() {
  const f = $('fields'); f.replaceChildren();
  Object.entries(open()).forEach(([k, r]) => f.append(field(k, r, [k], form)));
}
function show(res) {
  $('json').textContent = JSON.stringify(res.vars, null, 2);
  const n = $('notes'); n.replaceChildren(...(res.notes.length ? [el('p', { textContent: 'Moved back inside the policy:' }), el('ul', {}, res.notes.map((t) => el('li', { textContent: t })))] : []));
}
let timer = 0;
function apply() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const res = enforce(type(), work); show(res); $('err').textContent = '';
    try { players.forEach((p) => p.replay(single())); } catch (e) { $('err').textContent = e.message; }
  }, 250);
}
// On a finished edit, take the clamped values back into the form so it shows what the film uses.
function commit() { const res = enforce(type(), work); work = res.vars; show({ vars: work, notes: res.notes }); form(); }
function choose(i) {
  cur = i; const res = enforce(type(), data.scenes[i].vars || {}); work = JSON.parse(JSON.stringify(res.vars)); form(); show(res);
  try { players.forEach((p) => p.replay(single())); $('err').textContent = ''; } catch (e) { $('err').textContent = e.message; }
}

fetch('examples/agile-cells-chain.json').then((r) => r.json()).then((d) => {
  data = d;
  $('pick').replaceChildren(...data.scenes.map((s, i) => new Option(`${i + 1}. ${s.title || s.type} (${s.type})`, i)));
  $('sources').replaceChildren(...data.sources.map((s) => el('li', {}, [el('a', { href: s.url, textContent: s.title })])));
  work = JSON.parse(JSON.stringify(enforce(type(), data.scenes[0].vars).vars));
  players = [play($('film-p'), single(), { orientation: 'portrait' }), play($('film-l'), single(), { orientation: 'landscape' })];
  form(); show(enforce(type(), work));
  $('pick').onchange = () => choose(+$('pick').value);
}).catch((e) => { $('err').textContent = 'The example could not be loaded: ' + e.message; });
