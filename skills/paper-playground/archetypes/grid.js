/* ARCHETYPE · agent / grid world
 *
 * Use when the document's idea emerges from many local interactions on a lattice: cellular automata,
 * agent-based models, RL gridworlds, lattice diffusion, percolation.
 *
 * Fill in:
 *   init(p, rand) → state              keep the lattice in a makeGrid(w, h) = { w, h, data: Float32Array }
 *   update(s, p, rand) → state | void  one round; use rand() for every random choice
 *   metrics(s, p, trace), draw(g, s, p, m, trace), caption, readout?(s, p, m)
 *   g.cells(grid, { range, diverging }) draws a lattice with square cells.
 *
 * SOURCE (example passage written for this file, after Schelling 1971)
 *   §1 "Two groups of households live on a grid with some empty cells. A household is content if at
 *   least a fraction τ of its occupied neighbouring cells hold its own group; otherwise it moves to a
 *   random empty cell."
 *   §2 "Even mild preferences produce strong segregation: with τ = 0.3, households end up with well over
 *   70% like neighbours, far more than any of them demands."
 *   §3 "With τ = 0 nobody moves and the mix stays at its random level, about half like neighbours."
 */

const W = 40, H = 40;
const NB = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function likeShare(d, k) {
  const i = Math.floor(k / W), j = k % W;
  let same = 0, occupied = 0;
  for (const [a, b] of NB) {
    const v = d[((i + a + H) % H) * W + ((j + b + W) % W)];
    if (v) { occupied++; if (v === d[k]) same++; }
  }
  return occupied ? same / occupied : null;
}

playground({
  caption: 'drop τ to zero and the city stays mixed; even 0.3 sorts it',
  aspect: 1.9,

  init(p, rand) {
    const g = makeGrid(W, H);
    for (let k = 0; k < W * H; k++) { const u = rand(); g.data[k] = u < p.vacancy ? 0 : u < p.vacancy + (1 - p.vacancy) / 2 ? 1 : 2; }
    return { g, moved: 0 };
  },

  update(s, p, rand) {
    const d = s.g.data, unhappy = [], empty = [];
    for (let k = 0; k < d.length; k++) {
      if (!d[k]) empty.push(k);
      else { const share = likeShare(d, k); if (share !== null && share < p.tau) unhappy.push(k); }
    }
    for (let i = unhappy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [unhappy[i], unhappy[j]] = [unhappy[j], unhappy[i]]; }
    for (const k of unhappy) { const e = Math.floor(rand() * empty.length), dest = empty[e]; d[dest] = d[k]; d[k] = 0; empty[e] = k; }
    s.moved = unhappy.length;
  },

  metrics(s) {
    const d = s.g.data, shares = [];
    for (let k = 0; k < d.length; k++) if (d[k]) { const v = likeShare(d, k); if (v !== null) shares.push(v); }
    return { similarity: mean(shares), moved: s.moved / shares.length };
  },

  draw(g, s, p, m, trace) {
    const [left, right] = g.split('1x2');
    left.title('households · light A, grey B');
    left.cells({ w: W, h: H, data: s.g.data.map(v => (v === 1 ? 1 : v === 2 ? 0.35 : 0)) }, { range: [0, 1] });
    right.title('share of like neighbours');
    right.axes({ x: [0, 60], y: [0, 1], xlabel: 'round' });
    right.hline(p.tau, { label: `τ ${p.tau}` });
    right.line(trace.t, trace.moved, { series: 2, label: 'moved this round' });
    right.line(trace.t, trace.similarity, { label: 'like neighbours' });
  },
});
