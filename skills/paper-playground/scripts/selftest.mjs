#!/usr/bin/env node
// Open a built playground in headless Chromium, run window.__selftest(), drive the real controls,
// check phone width, and screenshot the plate in dark and light.
// usage: node selftest.mjs <playground.html>... [--out <dir>]   (writes selftest.json, dark.png, light.png next to each file by default)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const settle = async page => {
  // wait until the readout stops changing (param changes re-simulate up to the playhead over a few frames)
  let prev = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(60);
    const cur = await page.evaluate(() => window.__pp?.readout());
    if (cur === prev) return cur;
    prev = cur;
  }
  return prev;
};
const canvasSig = page => page.evaluate(() => { const u = document.querySelector('canvas')?.toDataURL() || ''; let h = 0; for (let i = 0; i < u.length; i += 7) h = (h * 31 + u.charCodeAt(i)) | 0; return `${u.length}:${h}`; });

async function drive(page) {
  if (!(await page.evaluate(() => !!window.__pp))) return { ok: false, controls: [], transport: null, msg: 'playground did not mount' };
  await page.evaluate(() => { window.__pp.pause(); window.__pp.end(); });
  const controls = [];
  const rows = await page.$$('.param');
  for (const row of rows) {
    const name = (await row.$eval('.plabel', e => e.textContent)).trim();
    const input = await row.$('input, select');
    const kind = await input.evaluate(e => e.tagName === 'SELECT' ? 'select' : e.type);
    const before = { r: await settle(page), c: await canvasSig(page) };
    const tries = [];
    if (kind === 'range') { await input.focus(); await page.keyboard.press('End'); tries.push('max'); }
    else if (kind === 'checkbox') { await input.click(); tries.push('toggle'); }
    else { const n = await input.evaluate(e => e.options.length), cur = await input.evaluate(e => e.selectedIndex); await input.selectOption({ index: (cur + 1) % n }); tries.push('next option'); }
    let after = { r: await settle(page), c: await canvasSig(page) };
    let changed = after.r !== before.r || after.c !== before.c;
    if (!changed && kind === 'range') { await page.keyboard.press('Home'); tries.push('min'); after = { r: await settle(page), c: await canvasSig(page) }; changed = after.r !== before.r || after.c !== before.c; }
    controls.push({ name, kind, tried: tries, readoutChanged: after.r !== before.r, canvasChanged: after.c !== before.c, ok: changed });
    await page.evaluate(() => { document.activeElement?.blur(); });
  }
  // restore defaults
  await page.evaluate(() => { const spec = window.__PP_SPEC__; for (const q of spec.params || []) window.__pp.set(q.name, q.default); });
  let transport = null;
  if (await page.$eval('.transport', e => !e.hidden)) {
    await page.click('button[aria-label="reset"]'); const r0 = await settle(page);
    await page.click('button[aria-label="step"]'); const r1 = await settle(page);
    await page.click('button[aria-label="play"]'); await page.waitForTimeout(400); const r2 = await page.evaluate(() => window.__pp.readout());
    await page.evaluate(() => window.__pp.pause());
    transport = { reset: r0, step: r1, playing: r2, ok: r0 !== r1 && r1 !== r2 };
  }
  const ok = controls.every(c => c.ok) && (!transport || transport.ok);
  return { ok, controls, transport };
}

export async function verify(file, { outDir, browser } = {}) {
  const own = !browser; browser ||= await chromium.launch();
  outDir ||= dirname(resolve(file));
  mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage(), consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(() => typeof window.__selftest === 'function', null, { timeout: 5000 });
  const selftest = await Promise.race([
    page.evaluate(() => window.__selftest()),
    new Promise(r => setTimeout(() => r({ ok: false, failures: ['harness: __selftest() did not resolve in 20 s'], checks: [] }), 20000)),
  ]);
  const driven = await drive(page);
  let shots = {};
  if (await page.evaluate(() => !!window.__pp)) {
    await page.evaluate(() => { window.__pp.pause(); window.__pp.end(); }); await settle(page);
    const plate = await page.$('.plate');
    await plate.screenshot({ path: join(outDir, 'dark.png') });
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(150);
    await plate.screenshot({ path: join(outDir, 'light.png') });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
    shots = { dark: 'dark.png', light: 'light.png', phoneOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
  }
  await ctx.close(); if (own) await browser.close();
  const ok = !!selftest.ok && driven.ok && consoleErrors.length === 0 && !shots.phoneOverflow;
  return { file: basename(file), ok, selftest, drive: driven, consoleErrors, shots };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), oi = args.indexOf('--out'), out = oi >= 0 ? args.splice(oi, 2)[1] : null;
  if (!args.length) { console.error('usage: node selftest.mjs <playground.html>... [--out dir]'); process.exit(2); }
  const browser = await chromium.launch(); let allOk = true;
  for (const f of args) {
    const r = await verify(f, { outDir: out, browser }); allOk &&= r.ok;
    writeFileSync(join(out || dirname(resolve(f)), 'selftest.json'), JSON.stringify(r, null, 2));
    const bad = [...(r.selftest.failures || []), ...r.drive.controls.filter(c => !c.ok).map(c => `drive: ${c.name} changed nothing`),
      ...(r.drive.transport && !r.drive.transport.ok ? ['drive: transport did not advance'] : []), ...(r.drive.msg ? [`drive: ${r.drive.msg}`] : []),
      ...r.consoleErrors.map(e => `console: ${e}`), ...(r.shots.phoneOverflow ? ['layout: horizontal overflow at 390px'] : [])];
    console.log(`${r.ok ? '✓' : '✗'} ${f}  (${r.selftest.ms ?? '?'} ms)${bad.length ? '\n  - ' + bad.join('\n  - ') : ''}`);
  }
  await browser.close();
  process.exit(allOk ? 0 : 1);
}
