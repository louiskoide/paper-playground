/* Scaled dot-product attention (§3.2.1, eq. 1) with an optional causal mask (§3.2.3), on a toy input.
 * Q, K, V entries are i.i.d. N(0,1), as in the §3.2.1 footnote, so q·k has variance d_k. Dividing by
 * √d_k restores unit variance. Without it, the softmax rows saturate toward one-hot and p(1−p) → 0.
 */

const N = fixed.seq_len || 8;
const DV = fixed.d_v || 4;

const randMat = (r, c) => {
  const M = [];
  for (let i = 0; i < r; i++) {
    const row = [];
    for (let j = 0; j < c; j++) row.push(randn());
    M.push(row);
  }
  return M;
};

const maxAbs = M => {
  let m = 0;
  for (const row of M) for (const v of row) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  return m > 0 ? m : 1;
};

// Display copy: masked (-∞) entries are shown blank, as 0.
const forShow = M => M.map(row => row.map(v => (Number.isFinite(v) ? v : 0)));

// Row softmax that respects -∞ entries (they get weight exactly 0).
function rowSoftmax(row) {
  let mx = -Infinity;
  for (const v of row) if (v > mx) mx = v;
  const e = row.map(v => (Number.isFinite(v) ? Math.exp(v - mx) : 0));
  const z = sum(e);
  return e.map(v => v / z);
}

const idx = n => Array.from({ length: n }, (_, i) => String(i));

playground({
  caption: 'switch off ÷ √d_k at d_k 512 and watch rows go one-hot',
  aspect: 1.6,

  stages: [
    {
      name: 'q, k, v',
      run: (_, p) => {
        const dk = Math.round(p.d_k);
        return { dk, Q: randMat(N, dk), K: randMat(N, dk), V: randMat(N, DV) };
      },
      draw(g, o) {
        const [a, b] = g.split('1x2');
        const show = Math.min(o.dk, 16);
        a.title(`q · first ${show} of ${o.dk} dims`);
        a.heatmap(o.Q.map(r => r.slice(0, show)), { diverging: true, range: [-3, 3], rowLabels: idx(N) });
        b.title(`k · first ${show} of ${o.dk} dims`);
        b.heatmap(o.K.map(r => r.slice(0, show)), { diverging: true, range: [-3, 3], rowLabels: idx(N) });
      },
    },
    {
      name: 'qkᵀ',
      run: o => {
        const S = matmul(o.Q, transpose(o.K));
        return { dk: o.dk, V: o.V, S };
      },
      draw(g, o) {
        const r = maxAbs(o.S);
        g.title(`dot products qkᵀ · |max| ${fmt(r)}`);
        g.heatmap(o.S, { diverging: true, range: [-r, r], rowLabels: idx(N), colLabels: idx(N) });
      },
    },
    {
      name: 'scale',
      run: (o, p) => {
        const c = p.scaled ? 1 / Math.sqrt(o.dk) : 1;
        return { dk: o.dk, V: o.V, L: o.S.map(row => row.map(v => v * c)) };
      },
      draw(g, o, p) {
        const r = maxAbs(o.L);
        g.title(p.scaled ? `÷ √${o.dk} · |max| ${fmt(r)}` : `unscaled · |max| ${fmt(r)}`);
        g.heatmap(o.L, { diverging: true, range: [-r, r], rowLabels: idx(N), colLabels: idx(N) });
      },
    },
    {
      name: 'mask',
      run: (o, p) => {
        const L = o.L.map((row, i) => row.map((v, j) => (p.mask === 'causal' && j > i ? -Infinity : v)));
        return { dk: o.dk, V: o.V, L };
      },
      draw(g, o, p) {
        const r = maxAbs(o.L);
        g.title(p.mask === 'causal' ? 'causal mask · future keys → −∞ (blank)' : 'no mask · softmax input');
        g.heatmap(forShow(o.L), { diverging: true, range: [-r, r], rowLabels: idx(N), colLabels: idx(N) });
      },
    },
    {
      name: 'softmax',
      run: o => ({ V: o.V, L: o.L, P: o.L.map(rowSoftmax) }),
      draw(g, o) {
        const [a, b] = g.split('1x2');
        a.title('attention weights (rows = queries)');
        a.heatmap(o.P, { range: [0, 1], rowLabels: idx(N), colLabels: idx(N) });
        b.title('largest weight per row');
        const mx = o.P.map(row => Math.max(...row));
        b.bars(idx(N), mx, { series: 0, y: [0, 1] });
        b.hline(1 / N, { label: 'uniform 1/n', series: 2 });
      },
    },
    {
      name: '× v',
      run: o => ({ P: o.P, out: matmul(o.P, o.V) }),
      draw(g, o) {
        g.title(`output softmax(·) v · ${N}×${DV}`);
        g.heatmap(o.out, { diverging: true, range: [-2.5, 2.5], rowLabels: idx(N), colLabels: idx(DV) });
      },
    },
  ],

  metrics(s) {
    const L = s.outs[3].L, P = s.outs[4].P;
    const live = [];
    let grad = 0, cnt = 0, mxSum = 0;
    for (let i = 0; i < N; i++) {
      mxSum += Math.max(...P[i]);
      for (let j = 0; j < N; j++) {
        if (!Number.isFinite(L[i][j])) continue;
        live.push(L[i][j]);
        grad += P[i][j] * (1 - P[i][j]);
        cnt++;
      }
    }
    return {
      max_weight: mxSum / N,
      logit_std: live.length ? std(live) : null,
      softmax_grad: cnt ? grad / cnt : null,
    };
  },
});
