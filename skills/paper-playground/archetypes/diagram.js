/* ARCHETYPE · manipulable diagram (fallback)
 *
 * Use only when the document's mechanism is qualitative or theoretical AND still yields a quantity you
 * can compute from the diagram's configuration: a vote share, an equilibrium, a payoff, a count.
 * If nothing is computed, there is no playground: say so instead of drawing one.
 * There is no time; the state is a pure function of the params.
 *
 * Fill in:
 *   init(p, rand) → state              compute everything the diagram shows from p
 *   drag(key, x, y, p) → { param: value }   called while a node with { drag: key } is dragged;
 *                                      x, y are data coordinates; the kernel clamps and snaps to the param's range
 *   metrics(s, p), draw(g, s, p, m), caption, readout?(s, p, m)
 *   In draw, give draggable nodes a drag key: g.graph([{ x, y, drag: 'a', label }], edges)
 *
 * SOURCE (example passage written for this file, after Hotelling 1929, Black 1948 and Downs 1957)
 *   §1 "Voters sit along a single left–right line and each votes for the nearer of two candidates."
 *   §2 "The candidate nearer the median voter wins: the median voter and everyone beyond them on that
 *   side vote for that candidate, which is a majority. Where the mean voter sits does not matter."
 *   §3 "Here the electorate is lopsided: a large bloc near 0.3 and a smaller one near 0.8, so the mean
 *   lies well to the right of the median."
 */

const XS = linspace(0, 1, 401), DX = XS[1] - XS[0];
const normal = (x, m, s) => Math.exp(-(((x - m) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI));

playground({
  caption: 'drag a or b; whoever is nearer the median wins',
  aspect: 2,

  init(p) {
    const dens = XS.map(x => (1 - p.right) * normal(x, 0.3, 0.08) + p.right * normal(x, 0.8, 0.05)), total = sum(dens) * DX;
    let c = 0;
    const cdf = dens.map(v => (c += (v * DX) / total));
    const median = XS[cdf.findIndex(v => v >= 0.5)], meanPos = (sum(XS.map((x, i) => x * dens[i])) * DX) / total;
    const cut = (p.a + p.b) / 2, votesA = x => (p.a === p.b ? false : (x < cut) === (p.a < p.b));
    const shareA = p.a === p.b ? 0.5 : sum(dens.map((v, i) => (votesA(XS[i]) ? v : 0))) * DX / total;
    return { dens, median, mean: meanPos, cut, shareA, votesA: XS.map(votesA) };
  },

  metrics: s => ({ share_a: s.shareA, median: s.median }),

  drag: (key, x) => ({ [key]: x }),

  draw(g, s, p) {
    const top = Math.max(...s.dens) * 1.3;
    g.axes({ x: [0, 1], y: [0, top], xlabel: 'left ← position → right', ylabel: 'voters' });
    g.line(XS, s.dens.map((v, i) => (s.votesA[i] ? NaN : v)), { series: 1, label: 'vote b' });
    g.line(XS, s.dens.map((v, i) => (s.votesA[i] ? v : NaN)), { label: 'vote a' });
    g.vline(s.median, { series: 0, dash: [], label: 'median' });
    g.vline(s.mean, { series: 2, label: 'mean' });
    g.graph([
      { x: p.a, y: top * 0.85, r: 8, drag: 'a', live: s.shareA > 0.5, label: `a ${fmt(100 * s.shareA, 3)}%` },
      { x: p.b, y: top * 0.85, r: 8, drag: 'b', live: s.shareA < 0.5, label: `b ${fmt(100 * (1 - s.shareA), 3)}%` },
    ]);
  },

  readout: (s, p, m) => `a ${fmt(100 * m.share_a, 3)}% · b ${fmt(100 * (1 - m.share_a), 3)}% · median ${fmt(m.median)} · mean ${fmt(s.mean)}`,
});
