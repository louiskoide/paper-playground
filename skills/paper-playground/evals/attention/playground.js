/* Scaled dot-product attention, §3.2.1 of "Attention Is All You Need".
 *   Attention(Q, K, V) = softmax(QKᵀ / √d_k) V                                   (eq. 1)
 *   footnote: q, k with i.i.d. components of mean 0 and variance 1 give q·k with variance d_k.
 * The toy input is fixed.num_draws independent draws of Q, K (seq_len × d_k, N(0,1)) and V (seq_len × 4).
 * The ÷√d_k toggle switches between scaled and plain dot-product attention.
 */

const N = fixed.seq_len;      // 8 queries, 8 keys
const DRAWS = fixed.num_draws; // 16 independent draws
const DV = 4;                 // value dimension (shown only)
const SHOW_DIMS = 32;         // columns of Q, K drawn

const QL = Array.from({ length: N }, (_, i) => `q${i + 1}`);
const KL = Array.from({ length: N }, (_, i) => `k${i + 1}`);

const gauss = (r, c) => Array.from({ length: r }, () => Array.from({ length: c }, () => randn()));

// numerically stable softmax over one row of logits
function softmaxRow(row) {
  let mx = -Infinity;
  for (const v of row) if (v > mx) mx = v;
  const e = row.map(v => Math.exp(v - mx));
  const z = sum(e);
  return e.map(v => v / z);
}

const absMax = M => {
  let a = 0;
  for (const r of M) for (const v of r) a = Math.max(a, Math.abs(v));
  return a || 1;
};
const pooled = Ms => {
  const out = [];
  for (const M of Ms) for (const r of M) for (const v of r) out.push(v);
  return out;
};
const rowMaxes = Ws => {
  const out = [];
  for (const W of Ws) for (const r of W) out.push(Math.max(...r));
  return out;
};

playground({
  caption: 'untick ÷ √d_k, raise d_k and watch weights go one-hot',
  aspect: 1.4,

  stages: [
    {
      name: 'q, k',
      run(_, p) {
        const dk = Math.max(1, Math.round(p.d_k));
        const draws = [];
        for (let d = 0; d < DRAWS; d++) draws.push({ Q: gauss(N, dk), K: gauss(N, dk), V: gauss(N, DV) });
        return { dk, draws };
      },
      draw(g, out) {
        const [a, b] = g.split('2x1');
        const c = Math.min(out.dk, SHOW_DIMS);
        const lim = absMax(out.draws[0].Q.map(r => r.slice(0, c)).concat(out.draws[0].K.map(r => r.slice(0, c))));
        const more = out.dk > c ? ` · first ${c} of ${out.dk} dims` : ` · ${out.dk} dims`;
        a.title(`q · draw 1${more}`);
        a.heatmap(out.draws[0].Q.map(r => r.slice(0, c)), { diverging: true, range: [-lim, lim], rowLabels: QL });
        b.title(`k · draw 1${more}`);
        b.heatmap(out.draws[0].K.map(r => r.slice(0, c)), { diverging: true, range: [-lim, lim], rowLabels: KL });
      },
    },
    {
      name: 'qkᵀ',
      run: prev => prev.draws.map(d => matmul(d.Q, transpose(d.K))),
      draw(g, L, p, s) {
        const lim = absMax(L[0]);
        g.title(`dot products qkᵀ · draw 1 · d_k ${s.outs[0].dk}`);
        g.heatmap(L[0], { diverging: true, range: [-lim, lim], rowLabels: QL, colLabels: KL, values: true });
      },
    },
    {
      name: p => (p.scaled ? '÷ √d_k' : 'scale'),
      run(L, p, _r, s) {
        const c = p.scaled ? 1 / Math.sqrt(s.outs[0].dk) : 1;
        return L.map(M => M.map(r => r.map(v => v * c)));
      },
      draw(g, L, p, s) {
        const [a, b] = g.split('1x2');
        const lim = absMax(L[0]);
        a.title(p.scaled ? 'softmax input · ÷ √d_k' : 'softmax input · unscaled');
        a.heatmap(L[0], { diverging: true, range: [-lim, lim], rowLabels: QL, colLabels: KL, values: true });
        const all = pooled(L), sd = std(all), r = Math.max(4, 4 * sd);
        b.title('all softmax inputs, pooled');
        b.hist(all, { bins: 30, range: [-r, r], density: true, series: 0 });
      },
    },
    {
      name: 'softmax',
      run: L => L.map(M => M.map(softmaxRow)),
      draw(g, W) {
        g.title('attention weights · draw 1');
        g.heatmap(W[0], { range: [0, 1], rowLabels: QL, colLabels: KL, values: true });
      },
    },
    {
      name: 'weights · v',
      run(W, _p, _r, s) {
        return W.map((M, d) => matmul(M, s.outs[0].draws[d].V));
      },
      draw(g, O, p, s) {
        const [a, b, c, e] = g.split('2x2');
        const W = s.outs[3], L = s.outs[2];
        a.title('attention weights · draw 1');
        a.heatmap(W[0], { range: [0, 1], rowLabels: QL, colLabels: KL });
        b.title('largest weight per query, all draws');
        b.hist(rowMaxes(W), { bins: 20, range: [0, 1], series: 0 });
        b.vline(1 / N, { label: 'uniform', series: 2 });
        const all = pooled(L), sd = std(all), r = Math.max(4, 4 * sd);
        c.title(p.scaled ? 'softmax inputs · ÷ √d_k' : 'softmax inputs · unscaled');
        c.hist(all, { bins: 30, range: [-r, r], density: true, series: 1 });
        const lim = absMax(O[0]);
        e.title('output = weights · v · draw 1');
        e.heatmap(O[0], { diverging: true, range: [-lim, lim], rowLabels: QL });
      },
    },
  ],

  metrics(s) {
    const L = s.outs[2], W = s.outs[3];
    if (!L || !W) return { max_weight: null, logit_std: null };
    return { max_weight: mean(rowMaxes(W)), logit_std: std(pooled(L)) };
  },

  readout(s, p, m) {
    const dk = s.outs[0] ? s.outs[0].dk : Math.round(p.d_k);
    return `softmax input std ${fmt(m.logit_std)} · √d_k ${fmt(Math.sqrt(dk))} · max weight ${fmt(m.max_weight)} (uniform ${fmt(1 / N)})`;
  },
});
