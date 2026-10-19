#!/usr/bin/env node
// Build every archetypes/<name>.js with its <name>.json into archetypes/.build/<name>/playground.html.
// With --test, also run selftest.mjs on each. The worked examples double as the kernel's test suite.
// usage: node examples.mjs [--test] [name...]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validateExtraction } from './build.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'archetypes');
const args = process.argv.slice(2), test = args.includes('--test'), only = args.filter(a => !a.startsWith('--'));
const names = readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).filter(n => !only.length || only.includes(n));
let ok = true;
const built = [];
for (const n of names) {
  const spec = JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')), problems = validateExtraction(spec);
  if (problems.length) { ok = false; console.log(`✗ ${n}.json\n  - ${problems.join('\n  - ')}`); continue; }
  const out = join(DIR, '.build', n); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'playground.html'), build({ spec, code: readFileSync(join(DIR, `${n}.js`), 'utf8') }));
  built.push(join(out, 'playground.html'));
}
if (test && built.length) {
  const { chromium } = await import('playwright'), { verify } = await import('./selftest.mjs');
  const browser = await chromium.launch();
  for (const f of built) {
    const r = await verify(f, { browser }); ok &&= r.ok;
    writeFileSync(join(dirname(f), 'selftest.json'), JSON.stringify(r, null, 2));
    const bad = [...(r.selftest.failures || []), ...r.drive.controls.filter(c => !c.ok).map(c => `drive: ${c.name} changed nothing`),
      ...(r.drive.transport && !r.drive.transport.ok ? [`drive: transport ${JSON.stringify(r.drive.transport)}`] : []), ...(r.drive.msg ? [`drive: ${r.drive.msg}`] : []),
      ...r.consoleErrors.map(e => `console: ${e}`), ...(r.shots.phoneOverflow ? ['layout: horizontal overflow at 390px'] : [])];
    console.log(`${r.ok ? '✓' : '✗'} ${f.split('/.build/')[1].split('/')[0]}  (${r.selftest.ms ?? '?'} ms)${bad.length ? '\n  - ' + bad.join('\n  - ') : ''}`);
  }
  await browser.close();
} else built.forEach(f => console.log(`built ${f}`));
process.exit(ok ? 0 : 1);
