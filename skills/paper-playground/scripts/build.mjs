#!/usr/bin/env node
// extraction.json + generated playground code → one self-contained HTML file.
// The same build() runs in Claude Code (CLI below) and in the web app, so the kernel is never model-written.
// usage: node build.mjs <extraction.json> <playground.js | model-output.md> [out.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

export const ARCHETYPES = ['dynamical', 'iterative', 'sweep', 'stochastic', 'pipeline', 'grid', 'diagram'];
const OPS = ['<', '<=', '>', '>=', 'between', 'diverges', 'finite'];

/** Pull the code out of a model reply: the last ```js fence, or the whole text if there is none. */
export function extractCode(text) {
  const fences = [...text.matchAll(/```(?:js|javascript)?[ \t]*\n([\s\S]*?)```/g)];
  return (fences.length ? fences[fences.length - 1][1] : text).trim();
}

/** Structural checks on an extraction. Returns a list of problems; empty means usable. */
export function validateExtraction(x) {
  const errs = [], err = m => errs.push(m);
  if (!x || typeof x !== 'object') return ['extraction is not an object'];
  if (x.playable === false) { if (!x.unplayable_reason) err('playable:false needs unplayable_reason'); return errs; }
  if (!ARCHETYPES.includes(x.archetype)) err(`archetype must be one of ${ARCHETYPES.join(', ')}`);
  if (!x.experiment) err('experiment sentence missing');
  const params = x.params || [], names = new Set();
  if (params.length < 1 || params.length > 6) err(`expected 1–6 params, got ${params.length}`);
  for (const q of params) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(q.name || '')) err(`param name ${JSON.stringify(q.name)} is not an identifier`);
    if (names.has(q.name)) err(`duplicate param ${q.name}`); names.add(q.name);
    if (!q.source?.section || !q.source?.quote) err(`param ${q.name} needs source.section and source.quote`);
    const kind = q.kind || 'range';
    if (kind === 'range') {
      if (!(q.min < q.max)) err(`param ${q.name}: min must be < max`);
      else if (!(q.default >= q.min && q.default <= q.max)) err(`param ${q.name}: default outside [min, max]`);
      if (q.scale === 'log' && !(q.min > 0)) err(`param ${q.name}: log scale needs min > 0`);
    } else if (kind === 'toggle') { if (typeof q.default !== 'boolean') err(`param ${q.name}: toggle default must be boolean`); }
    else if (kind === 'select') {
      const vals = (q.options || []).map(o => o && typeof o === 'object' ? o.value : o);
      if (vals.length < 2) err(`param ${q.name}: select needs ≥ 2 options`);
      if (!vals.includes(q.default)) err(`param ${q.name}: default not among options`);
    } else err(`param ${q.name}: unknown kind ${kind}`);
  }
  const metrics = new Set((x.metrics || []).map(m => m.name));
  if (!metrics.size) err('at least one metric is required');
  for (const key of ['reproduce', 'contrast']) {
    const c = x[key];
    if (!c) { err(`${key} missing`); continue; }
    if (!c.source?.section || !c.source?.quote) err(`${key} needs source.section and source.quote`);
    for (const [k, v] of Object.entries(c.params || {})) {
      const q = params.find(q => q.name === k);
      if (!q) err(`${key}.params.${k} is not a declared param`);
      else if ((q.kind || 'range') === 'range' && !(v >= q.min && v <= q.max)) err(`${key}.params.${k}=${v} outside [${q.min}, ${q.max}]`);
    }
    if (!c.expect?.length) err(`${key}.expect is empty`);
    for (const e of c.expect || []) {
      if (!OPS.includes(e.op)) err(`${key}: unknown op ${e.op}`);
      if (e.op !== 'diverges' && e.op !== 'finite' && !metrics.has(e.metric)) err(`${key}: metric ${e.metric} is not declared`);
      if (e.ref && key === 'reproduce') err('reproduce cannot reference itself');
      if (e.ref && e.ref !== 'reproduce') err(`${key}: ref must be "reproduce"`);
      if (['<', '<=', '>', '>='].includes(e.op) && !e.ref && typeof e.value !== 'number') err(`${key}: ${e.metric} ${e.op} needs a numeric value or ref`);
      if (e.op === 'between' && !(Array.isArray(e.value) && e.value.length === 2)) err(`${key}: between needs value [lo, hi]`);
    }
  }
  return errs;
}

const scriptSafe = s => s.replace(/<\/(script)/gi, '<\\/$1');
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function build({ spec, code, kernel = read('kernel.js'), template = read('template.html') }) {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const parts = { TITLE: escHtml(spec.title || 'playground'), SPEC: json, KERNEL: scriptSafe(kernel), PLAYGROUND: scriptSafe(extractCode(code)) };
  return template.replace(/%%(TITLE|SPEC|KERNEL|PLAYGROUND)%%/g, (_, k) => parts[k]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [specPath, codePath, out] = process.argv.slice(2);
  if (!specPath || !codePath) { console.error('usage: node build.mjs <extraction.json> <playground.js> [out.html]'); process.exit(2); }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const problems = validateExtraction(spec);
  if (problems.length) { console.error(`extraction problems:\n- ${problems.join('\n- ')}`); process.exit(1); }
  const html = build({ spec, code: readFileSync(codePath, 'utf8') });
  if (out) writeFileSync(out, html); else process.stdout.write(html);
}
