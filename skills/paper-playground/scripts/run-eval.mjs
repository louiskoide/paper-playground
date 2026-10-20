#!/usr/bin/env node
// Run eval cases through the web app's path: ingest → extract (separate call) → generate → build →
// self-test → one repair → fallback diagram. Writes each case's artifacts and evals/RESULTS.md.
// usage: node run-eval.mjs [case...] [--reuse-extraction] [--concurrency N]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ingest, htmlToText, docText } from '../../../lib/ingest.mjs';
import { extractionPrompt, extractionRetry, generationPrompt, repairPrompt, parseReply, skillHash } from '../../../lib/prompts.mjs';
import { complete, MODELS } from '../../../lib/llm.mjs';
import { checkQuotes } from '../../../lib/quotes.mjs';
import { build, validateExtraction } from './build.mjs';
import { verify } from './selftest.mjs';

export const EVALS = join(dirname(fileURLToPath(import.meta.url)), '..', 'evals');
const args = process.argv.slice(2), flag = f => args.includes(f);
const ci = args.indexOf('--concurrency'), concurrency = ci >= 0 ? +args[ci + 1] : 2;
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--concurrency');
const cases = readdirSync(EVALS).filter(d => existsSync(join(EVALS, d, 'case.json')) && (!only.length || only.includes(d)));
export const log = (c, m) => console.log(`[${c}] ${m}`);

export async function loadDoc(dir, spec) {
  const cache = join(dir, '.cache', 'doc.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const { input } = spec;
  let doc;
  if (input.paste_file) doc = await ingest({ text: readFileSync(join(dir, input.paste_file), 'utf8') });
  else if (input.paste_url) doc = await ingest({ text: htmlToText(await (await fetch(input.paste_url)).text()) });
  else doc = await ingest({ url: input.url });
  mkdirSync(dirname(cache), { recursive: true }); writeFileSync(cache, JSON.stringify(doc, null, 2));
  return doc;
}

function extractionProblems(x, doc) {
  const problems = validateExtraction(x);
  if (x.fallback) problems.push(...validateExtraction(x.fallback).map(p => `fallback: ${p}`));
  for (const q of checkQuotes(x, docText(doc))) if (!q.ok) problems.push(`${q.where}: quote not found in the document (match ${q.score}): "${q.quote}"`);
  return problems;
}

async function extract(name, dir, doc, calls) {
  const path = join(dir, 'extraction.json');
  if (flag('--reuse-extraction') && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  let prompt = extractionPrompt(doc), x = null, problems = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await complete({ ...prompt, model: MODELS.extract }); calls.push({ step: `extract-${attempt}`, cost: r.cost, ms: r.ms });
    writeFileSync(join(dir, '.cache', `extract-${attempt}.md`), r.text);
    const parsed = parseReply(r.text);
    problems = parsed.kind === 'json' ? extractionProblems(parsed.value, doc) : [`reply had no parseable JSON block (${parsed.kind}${parsed.error ? `: ${parsed.error}` : ''})`];
    if (parsed.kind === 'json') x = parsed.value;
    log(name, `extraction ${attempt}: ${problems.length ? `${problems.length} problem(s)` : 'ok'}`);
    if (!problems.length) break;
    prompt = extractionRetry(doc, r.text, problems);
  }
  if (x) writeFileSync(path, JSON.stringify(x, null, 2) + '\n');
  if (problems.length) throw Object.assign(new Error('extraction failed'), { problems, x });
  return x;
}

/** Build and verify one playground into `out`; `failures` are what a repair prompt gets. */
export async function check(code, x, out, browser) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'playground.js'), code + '\n');
  writeFileSync(join(out, 'playground.html'), build({ spec: x, code }));
  const v = await verify(join(out, 'playground.html'), { browser, outDir: out });
  writeFileSync(join(out, 'selftest.json'), JSON.stringify(v, null, 2));
  const failures = [...(v.selftest.failures || []), ...v.drive.controls.filter(c => !c.ok).map(c => `drive: control "${c.name}" changed neither the canvas nor the readout`),
    ...(v.drive.transport && !v.drive.transport.ok ? ['drive: play/step did not advance the readout'] : []), ...(v.drive.msg ? [`drive: ${v.drive.msg}`] : []),
    ...v.consoleErrors.map(e => `console error: ${e}`), ...(v.shots.phoneOverflow ? ['layout: horizontal overflow at 390px width'] : [])];
  return { ok: v.ok, failures, code, out, observed: Object.fromEntries((v.selftest.checks || []).filter(c => c.observed).map(c => [c.id, c.observed])) };
}

/** One model call (generate, repair when `prev` is given, or fallback) plus its check; files go under `work`. */
export async function attempt(name, work, kind, x, doc, browser, calls, prev) {
  const prompt = prev ? repairPrompt(x, doc, prev.code, prev.failures) : generationPrompt(x, doc);
  const r = await complete({ ...prompt, model: MODELS.generate }); calls.push({ step: kind, cost: r.cost, ms: r.ms });
  writeFileSync(join(work, `${kind}.md`), r.text);
  const reply = parseReply(r.text);
  if (reply.kind === 'refuse') { log(name, `${kind}: refused: ${reply.reason}`); return { kind, ok: false, refused: reply.reason, failures: [`refused: ${reply.reason}`] }; }
  if (reply.kind !== 'code') return { kind, ok: false, failures: [`reply had no code block (${reply.kind})`] };
  const c = await check(reply.code, x, join(work, kind), browser);
  log(name, `${kind}: ${c.ok ? 'pass' : `${c.failures.length} failure(s)`}`);
  return { kind, ...c };
}

async function runCase(name, browser) {
  const dir = join(EVALS, name), spec = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')), t0 = Date.now(), calls = [];
  mkdirSync(join(dir, '.cache'), { recursive: true });
  const result = { case: name, expect: spec.expect, skill: skillHash(), models: MODELS, date: new Date().toISOString() };
  try {
    const doc = await loadDoc(dir, spec);
    const text = docText(doc);
    writeFileSync(join(dir, 'source.json'), JSON.stringify({ title: doc.title, source: doc.source, via: doc.via, chars: text.length,
      sha256: createHash('sha256').update(text).digest('hex').slice(0, 16), sections: doc.sections.map(s => s.id) }, null, 2) + '\n');
    log(name, `ingested via ${doc.via}: ${doc.sections.length} sections, ${text.length} chars`);
    const x = await extract(name, dir, doc, calls);
    result.extraction = x.playable === false ? { playable: false, reason: x.unplayable_reason }
      : { archetype: x.archetype, experiment: x.experiment, reproduce: x.reproduce.claim, contrast: x.contrast.claim, fallback: !!x.fallback };
    const attempts = [];
    if (x.playable !== false) {
      let a = await attempt(name, join(dir, '.cache'), 'generate', x, doc, browser, calls); attempts.push(a);
      if (!a.ok && a.code) { a = await attempt(name, join(dir, '.cache'), 'repair', x, doc, browser, calls, a); attempts.push(a); }
      if (!a.ok && x.fallback) { a = await attempt(name, join(dir, '.cache'), 'fallback', x.fallback, doc, browser, calls); attempts.push(a); }
    }
    const final = attempts.find(a => a.ok) || attempts.at(-1);
    result.outcome = x.playable === false ? 'unplayable' : final?.ok ? (final.kind === 'fallback' ? 'fallback-pass' : 'pass') : final?.refused ? 'refused' : 'fail';
    result.attempts = attempts.map(({ kind, ok, failures, refused, observed }) => ({ kind, ok, failures, refused, observed }));
    for (const f of ['playground.js', 'playground.html', 'selftest.json', 'dark.png', 'light.png']) rmSync(join(dir, f), { force: true });
    if (final?.out) for (const f of ['playground.js', 'playground.html', 'selftest.json', 'dark.png', 'light.png']) if (existsSync(join(final.out, f))) writeFileSync(join(dir, f), readFileSync(join(final.out, f)));
  } catch (e) {
    result.outcome = 'error'; result.error = e.message; if (e.problems) result.problems = e.problems;
    log(name, `error: ${e.message}${e.problems ? `\n  - ${e.problems.join('\n  - ')}` : ''}`);
  }
  result.calls = calls; result.cost_usd = +calls.reduce((s, c) => s + (c.cost || 0), 0).toFixed(3); result.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  log(name, `→ ${result.outcome} ($${result.cost_usd}, ${result.seconds}s)`);
  return result;
}

function writeResults() {
  const rows = readdirSync(EVALS).filter(d => existsSync(join(EVALS, d, 'result.json'))).map(d => JSON.parse(readFileSync(join(EVALS, d, 'result.json'), 'utf8')));
  const archetypeOk = r => r.extraction?.playable === false ? /unplayable/.test(r.expect?.archetype || '') : new RegExp(`^(${r.expect?.archetype})$`).test(r.extraction?.archetype || '');
  const lines = ['# Eval results', '', 'Generated by `scripts/run-eval.mjs`. One row per case, latest run.', '',
    '| case | expected | got | outcome | attempts | reproduces | cost | time | skill |', '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.case} | ${r.expect?.archetype} | ${r.extraction?.playable === false ? 'unplayable' : r.extraction?.archetype ?? '–'} ${archetypeOk(r) ? '✓' : '✗'} | ${r.outcome} | ${(r.attempts || []).map(a => `${a.kind} ${a.ok ? '✓' : '✗'}`).join(', ') || '–'} | ${(r.extraction?.reproduce || r.extraction?.reason || r.error || '').replace(/\|/g, '/')} | $${r.cost_usd} | ${r.seconds}s | ${r.skill} |`)];
  writeFileSync(join(EVALS, 'RESULTS.md'), lines.join('\n') + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const browser = await chromium.launch();
  const queue = [...cases];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => { while (queue.length) await runCase(queue.shift(), browser); }));
  await browser.close();
  writeResults();
}
