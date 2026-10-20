// Concept-map viewer: one self-contained HTML page (canvas, no libraries, no network) for a map from
// lib/map.mjs. Same plate look as the playground. Listens for pp:param-hover {section} to highlight
// the chunks a playground control cites. The web app may swap this for r3f; the map JSON stays the same.

export function renderMapHtml(map) {
  const data = JSON.stringify(map).replace(/</g, '\\u003c');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Concept map</title>
<style>
:root{--page:#e9eaea;--panel:#f6f6f5;--line:#7d8083;--dim:#d6d8d9;--text:#5a5d60;--live:#111213;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color-scheme:light;
--c0:#2a78d6;--c1:#eb6834;--c2:#1baf7a;--c3:#eda100;--c4:#e87ba4;--c5:#008300;--c6:#6250d6;--c7:#e34948}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--page:#0c0d0e;--panel:#141516;--line:#6f7276;--dim:#2a2c2e;--text:#9b9ea2;--live:#f3f3f1;color-scheme:dark;
--c0:#3987e5;--c1:#d95926;--c2:#199e70;--c3:#c98500;--c4:#d55181;--c5:#008300;--c6:#9085e9;--c7:#e66767}}
:root[data-theme=dark]{--page:#0c0d0e;--panel:#141516;--line:#6f7276;--dim:#2a2c2e;--text:#9b9ea2;--live:#f3f3f1;color-scheme:dark;
--c0:#3987e5;--c1:#d95926;--c2:#199e70;--c3:#c98500;--c4:#d55181;--c5:#008300;--c6:#9085e9;--c7:#e66767}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--text);font:14px/1.45 system-ui,sans-serif;padding:24px 16px}
.plate{max-width:980px;margin:0 auto;background:var(--panel);border:1px solid var(--dim);padding:16px}
.top,.bottom{display:flex;gap:12px;align-items:baseline;justify-content:space-between;flex-wrap:wrap;font:12px var(--mono);text-transform:uppercase;letter-spacing:.08em}
.top b{color:var(--live);font-weight:500}
.toggle{display:inline-flex;border:1px solid var(--line)}
.toggle button{font:12px var(--mono);letter-spacing:.08em;background:none;border:0;color:var(--text);padding:4px 10px;cursor:pointer}
.toggle button[aria-pressed=true]{background:var(--live);color:var(--panel)}
.body{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:16px;margin:12px 0}
@media (max-width:720px){.body{grid-template-columns:1fr}}
.stage{position:relative;aspect-ratio:4/3;border:1px solid var(--dim);touch-action:none}
canvas{display:block;width:100%;height:100%;cursor:crosshair}
.legend{list-style:none;margin:0;padding:0;font-size:13px}
.legend li{display:flex;gap:8px;align-items:center;padding:4px 6px;cursor:default;border-radius:2px}
.legend li:hover,.legend li.on{background:var(--dim)}
.legend .n{margin-left:auto;font:12px var(--mono)}
.legend li span:first-of-type{color:var(--live)}
.tip{position:absolute;pointer-events:none;max-width:320px;background:var(--panel);border:1px solid var(--line);padding:8px 10px;font-size:12.5px;display:none;z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.tip .sec{font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.tip .txt{color:var(--live)}
.note{font-size:12.5px;margin:0}
.warn{color:var(--live)}
details{margin-top:12px;font-size:13px}summary{cursor:pointer;font:12px var(--mono);text-transform:uppercase;letter-spacing:.08em}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{text-align:left;vertical-align:top;padding:4px 8px;border-top:1px solid var(--dim)}th{font-weight:500;color:var(--live)}
td:first-child{white-space:nowrap;font:12px var(--mono)}
</style></head><body>
<div class="plate">
  <div class="top"><span>Map · <b>${esc(map.title)}</b></span>
    <span class="toggle" role="group" aria-label="layout"><button data-mode="2d" aria-pressed="true">2D</button><button data-mode="3d" aria-pressed="false">3D</button></span></div>
  <div class="body">
    <div class="stage"><canvas aria-label="concept map: ${map.n} passages in ${map.k} clusters"></canvas><div class="tip" role="status"></div></div>
    <ul class="legend"></ul>
  </div>
  <div class="bottom"><span class="cap">hover a point to read it · drag to rotate in 3d</span><span class="stat"></span></div>
  <p class="note">${map.warning ? `<span class="warn">${esc(map.warning)}</span> ` : ''}Each point is a passage of about 200 tokens, placed by ${map.method === 'tsne' ? 't-SNE' : 'PCA'} on its embedding. Nearby points say similar things; distances between clusters aren't meaningful.</p>
  <details><summary>Table</summary><table><thead><tr><th>section</th><th>passage</th></tr></thead><tbody class="rows"></tbody></table></details>
</div>
<script>
const MAP = ${data};
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'tridown', 'hex', 'plus', 'pent'];
const $ = s => document.querySelector(s), cv = $('canvas'), ctx = cv.getContext('2d'), tip = $('.tip');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const BOX = [0, 1].flatMap(d => [Math.min(...MAP.chunks.map(c => c.xy[d])), Math.max(...MAP.chunks.map(c => c.xy[d]))]);
const st = { mode: '2d', yaw: 0.6, pitch: 0.35, hover: -1, pin: -1, focus: -1, sections: null, spin: !reduced, drag: null };
let W = 0, H = 0, screen = [];
const text = c => c.text ?? c.snippet ?? '';
const secLabel = c => (/^(abstract|intro|front|s\\d+|p\\. \\d+)$/.test(c.section) ? '' : '§' + c.section + ' ') + (c.title || '');

function shape(g, kind, x, y, r) {
  g.beginPath();
  const poly = (n, rot, rr = r) => { for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; g[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); };
  if (kind === 'circle') g.arc(x, y, r, 0, 2 * Math.PI);
  else if (kind === 'square') g.rect(x - r * .85, y - r * .85, r * 1.7, r * 1.7);
  else if (kind === 'triangle') poly(3, -Math.PI / 2, r * 1.2);
  else if (kind === 'tridown') poly(3, Math.PI / 2, r * 1.2);
  else if (kind === 'diamond') poly(4, 0, r * 1.15);
  else if (kind === 'hex') poly(6, 0, r * 1.05);
  else if (kind === 'pent') poly(5, -Math.PI / 2, r * 1.1);
  else { const a = r * .38; g.rect(x - r, y - a, 2 * r, 2 * a); g.rect(x - a, y - r, 2 * a, 2 * r); }
}

function project(c) {
  const pad = 36, s = Math.min(W, H) / 2 - pad;
  if (st.mode === '2d') {                                      // fit the bounding box, same scale on both axes
    const [x0, x1, y0, y1] = BOX, f = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
    return { x: W / 2 + (c.xy[0] - (x0 + x1) / 2) * f, y: H / 2 - (c.xy[1] - (y0 + y1) / 2) * f, z: 0, k: 1 };
  }
  const [x, y, z] = c.xyz, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const k = 3 / (3 + z2) * 0.88;
  return { x: W / 2 + x1 * s * k, y: H / 2 - y1 * s * k, z: z2, k };
}

const lit = (c, i) => (st.focus < 0 || c.cluster === st.focus) && (!st.sections || st.sections(c.section)) || i === st.hover || i === st.pin;

function draw() {
  const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  W = r.width; H = r.height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const panel = css('--panel'), live = css('--live'), txt = css('--text');
  screen = MAP.chunks.map((c, i) => ({ i, c, ...project(c) }));
  ctx.font = '500 12px ' + css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const placed = [];
  MAP.clusters.forEach(cl => {                                  // direct label (under the markers, so no passage is hidden) just above the cluster's most central point
    const ps = screen.filter(p => p.c.cluster === cl.id); if (!ps.length) return;
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const at = ps.reduce((b, p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 < (b.x - cx) ** 2 + (b.y - cy) ** 2 ? p : b);
    const label = cl.label.toUpperCase(), w = ctx.measureText(label).width;
    const x = Math.min(Math.max(at.x, w / 2 + 4), W - w / 2 - 4);
    let y = Math.max(10, at.y - 16);
    while (placed.some(b => Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - y) < 16)) y -= 16;
    placed.push({ x, y, w });
    ctx.globalAlpha = st.focus < 0 || st.focus === cl.id ? 1 : 0.3;
    ctx.lineWidth = 4; ctx.strokeStyle = panel; ctx.lineJoin = 'round'; ctx.strokeText(label, x, y);
    ctx.fillStyle = st.focus === cl.id ? live : txt; ctx.fillText(label, x, y);
  });
  ctx.globalAlpha = 1;
  const order = [...screen].sort((a, b) => b.z - a.z);
  for (const p of order) {
    const on = lit(p.c, p.i), rr = (p.i === st.hover || p.i === st.pin ? 8 : 5.5) * (st.mode === '3d' ? p.k * 1.15 : 1);
    ctx.globalAlpha = on ? (st.mode === '3d' ? 0.55 + 0.45 * p.k : 1) : 0.18;
    shape(ctx, SHAPES[p.c.cluster % 8], p.x, p.y, rr);
    ctx.fillStyle = css('--c' + (p.c.cluster % 8)); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = p.i === st.pin ? live : panel; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const at = st.pin >= 0 ? st.pin : st.hover;
  if (at >= 0) {
    const p = screen[at], c = p.c, t = text(c);
    tip.innerHTML = '<div class="sec"></div><div class="txt"></div>';
    tip.firstChild.textContent = (secLabel(c) || 'passage ' + (c.id + 1)) + ' · ' + MAP.clusters[c.cluster].label;
    tip.lastChild.textContent = t.length > 320 ? t.slice(0, 320) + '…' : t;
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(4, p.x + 12), W - tw - 4) + 'px';
    tip.style.top = (p.y + 12 + th > H ? Math.max(4, p.y - th - 12) : p.y + 12) + 'px';
  } else tip.style.display = 'none';
}

function nearest(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = 14 * 14;
  for (const p of screen) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd || (d === bd && best >= 0 && p.z < screen[best].z)) { bd = d; best = p.i; } }
  return best;
}
cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, y: e.clientY, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (st.drag && st.mode === '3d') {
    const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) { st.drag.moved = true; st.spin = false; }
    st.yaw += dx * 0.01; st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch + dy * 0.01)); st.drag.x = e.clientX; st.drag.y = e.clientY;
  } else st.hover = nearest(e);
  draw();
});
cv.addEventListener('pointerup', e => { if (st.drag && !st.drag.moved) { const i = nearest(e); st.pin = i === st.pin ? -1 : i; } st.drag = null; draw(); });
cv.addEventListener('pointerleave', () => { st.hover = -1; draw(); });

function setMode(m) {
  st.mode = m; document.querySelectorAll('.toggle button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  draw();
}
document.querySelectorAll('.toggle button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

const legend = $('.legend');
MAP.clusters.forEach(cl => {
  const li = document.createElement('li');
  const c = document.createElement('canvas'); c.width = c.height = 28; const g = c.getContext('2d');
  li.innerHTML = '<span></span><span class="n"></span>';
  li.firstChild.textContent = cl.label; li.lastChild.textContent = cl.size;
  li.prepend(c); c.style.width = c.style.height = '14px'; c.style.flex = 'none';
  li._paint = () => { g.clearRect(0, 0, 28, 28); shape(g, SHAPES[cl.id % 8], 14, 14, 9); g.fillStyle = css('--c' + (cl.id % 8)); g.fill(); };
  li.onmouseenter = () => { st.focus = cl.id; li.classList.add('on'); draw(); };
  li.onmouseleave = () => { st.focus = -1; li.classList.remove('on'); draw(); };
  legend.append(li);
});
const paintLegend = () => legend.querySelectorAll('li').forEach(li => li._paint());

const rows = $('.rows');
for (const cl of MAP.clusters) for (const c of MAP.chunks.filter(c => c.cluster === cl.id)) {
  const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>';
  tr.firstChild.textContent = secLabel(c).split(' ')[0] || '—';
  tr.lastChild.textContent = cl.label + ': ' + (text(c).length > 200 ? text(c).slice(0, 200) + '…' : text(c));
  rows.append(tr);
}
$('.stat').textContent = MAP.n + ' passages · ' + MAP.k + ' clusters' + (MAP.silhouette != null ? ' · silhouette ' + MAP.silhouette.toFixed(2) : '');

// A playground control hovered in the parent page highlights the passages its section covers.
addEventListener('message', e => {
  if (e.data?.type !== 'pp:param-hover') return;
  const s = e.data.section ? String(e.data.section) : null;
  st.sections = s ? sec => sec === s || sec.startsWith(s + '.') : null; draw();
});

let last = 0;
function tick(t) {
  if (st.mode === '3d' && st.spin && !st.drag && st.hover < 0 && st.pin < 0) { st.yaw += Math.min(50, t - last) * 0.00025; draw(); }
  last = t; requestAnimationFrame(tick);
}
new ResizeObserver(draw).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { paintLegend(); draw(); });
paintLegend(); draw(); requestAnimationFrame(tick);
window.__map = { st, setMode, draw, paintLegend, screen: () => screen };
</script></body></html>`;
}
