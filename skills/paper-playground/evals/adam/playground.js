// Adam (Algorithm 1) on the deterministic toy objective f(θ) = θ²/2, so g_t = θ_{t-1}.
// The figure tracks each step |θ_t − θ_{t-1}| in units of α. With bias correction (m̂, v̂) the step
// stays near α. Without it, the raw m_t / √v_t is inflated by up to (1−β1)/√(1−β2) at t = 1, and the
// inflation keeps growing for a while, because v_t is still far below g² when β2 is near 1.

const EPS = Number(fixed.epsilon);
const THETA0 = Number(fixed.theta0);

playground({
  caption: 'turn off bias correction and watch steps leap past α',

  init() {
    return { theta: THETA0, m: 0, v: 0, t: 0, thetas: [THETA0], ratios: [], first: null, maxr: null };
  },

  step(s, p) {
    const b1 = Number(p.beta1), b2 = Number(p.beta2), a = Number(p.alpha);
    s.t += 1;
    const g = s.theta;                                // ∇θ (θ²/2) at θ_{t-1}
    s.m = b1 * s.m + (1 - b1) * g;                    // biased first moment
    s.v = b2 * s.v + (1 - b2) * g * g;                // biased second raw moment
    let delta;
    if (p.bias_correction) {
      const mhat = s.m / (1 - Math.pow(b1, s.t));
      const vhat = s.v / (1 - Math.pow(b2, s.t));
      delta = a * mhat / (Math.sqrt(vhat) + EPS);
    } else {
      delta = a * s.m / (Math.sqrt(s.v) + EPS);
    }
    const prev = s.theta;
    s.theta = prev - delta;
    const r = Math.abs(s.theta - prev) / a;
    s.ratios.push(r);
    s.thetas.push(s.theta);
    if (s.first == null) s.first = r;
    s.maxr = s.maxr == null ? r : Math.max(s.maxr, r);
  },

  metrics: s => ({ first_step_ratio: s.first, max_step_ratio: s.maxr }),

  draw(g, s, p) {
    const [left, right] = g.split('1x2');
    const b1 = Number(p.beta1), b2 = Number(p.beta2);
    const bound = (1 - b1) / Math.sqrt(1 - b2);
    const T = Math.max(100, s.t);
    const LO = 0.01;
    const ratios = s.ratios.map(r => Math.max(LO, r));
    const top = Math.max(2, bound, ...ratios) * 2;

    left.title('step size / α per iteration');
    left.axes({ x: [0, T], y: [LO, top], ylog: true, xlabel: 'iteration t', ylabel: '|Δθ| / α' });
    left.hline(1, { series: 1, label: 'α' });
    left.hline(bound, { series: 2, label: '(1−β1)/√(1−β2)' });
    const ts = ratios.map((_, i) => i + 1);
    left.line(ts, ratios, { series: 0, label: p.bias_correction ? 'corrected' : 'uncorrected' });
    if (ratios.length) left.marker(ts.at(-1), ratios.at(-1));

    right.title('θ on f = θ²/2');
    const [ylo, yhi] = extent(s.thetas, [0, THETA0]);
    right.axes({ x: [0, T], y: [ylo, yhi], xlabel: 'iteration t', ylabel: 'θ' });
    right.hline(0, { series: 3 });
    right.line(s.thetas.map((_, i) => i), s.thetas, { series: 0 });
  },
});
