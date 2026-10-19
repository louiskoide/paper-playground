// Adam on the deterministic quadratic f(θ) = ½θ², g_t = θ_{t-1} (fixed.objective).
// The live run uses the reader's bias_correction setting; a second run with the opposite
// setting is shown in grey for comparison. Metrics come only from the live run.

const EPS = fixed.epsilon;

function newRun() {
  return { theta: fixed.theta0, m: fixed.m0, v: fixed.v0, ratios: [], thetas: [fixed.theta0] };
}

// One iteration of Algorithm 1. Without correction, m̂ = m_t and v̂ = v_t (§5, §6.4).
function adamStep(o, t, p, correct) {
  const g = o.theta;                                     // g_t = ∇f(θ_{t-1}) = θ_{t-1}
  o.m = p.beta1 * o.m + (1 - p.beta1) * g;               // biased first moment
  o.v = p.beta2 * o.v + (1 - p.beta2) * g * g;           // biased second raw moment
  const mh = correct ? o.m / (1 - Math.pow(p.beta1, t)) : o.m;
  const vh = correct ? o.v / (1 - Math.pow(p.beta2, t)) : o.v;
  const delta = p.alpha * mh / (Math.sqrt(vh) + EPS);    // Δ_t
  o.theta = o.theta - delta;
  o.ratios.push(Math.abs(delta) / p.alpha);
  o.thetas.push(o.theta);
}

playground({
  caption: 'turn off bias correction and watch steps exceed α',

  init() {
    return { t: 0, live: newRun(), other: newRun() };
  },

  step(s, p) {
    s.t += 1;
    adamStep(s.live, s.t, p, !!p.bias_correction);
    adamStep(s.other, s.t, p, !p.bias_correction);
  },

  metrics(s) {
    const r = s.live.ratios;
    return {
      max_step_ratio: r.length ? Math.max(...r) : null,
      distance_moved: Math.abs(s.live.theta - fixed.theta0),
    };
  },

  draw(g, s, p, m) {
    const [left, right] = g.split('1x2');
    const liveLbl = p.bias_correction ? 'corrected' : 'uncorrected';
    const otherLbl = p.bias_correction ? 'uncorrected' : 'corrected';
    const T = Math.max(50, s.t);

    left.title('step size |Δt| / α');
    const allR = s.live.ratios.concat(s.other.ratios);
    const yMax = Math.max(1.5, (allR.length ? Math.max(...allR) : 1) * 1.1);
    left.axes({ x: [0, T], y: [0, yMax], xlabel: 'iteration t' });
    left.hline(1, { series: 3, label: 'α' });
    const xs = s.live.ratios.map((_, i) => i + 1);
    left.line(xs, s.other.ratios, { series: 1, label: otherLbl });
    left.line(xs, s.live.ratios, { series: 0, label: liveLbl });
    if (m.max_step_ratio != null) {
      const k = argmax(s.live.ratios);
      left.marker(k + 1, s.live.ratios[k], { label: `max ${fmt(m.max_step_ratio)}` });
    }

    right.title('parameter θ');
    const ext = extent(s.live.thetas, s.other.thetas, [fixed.theta0, fixed.theta0 - 50 * p.alpha]);
    right.axes({ x: [0, T], y: ext, xlabel: 'iteration t' });
    const ts = s.live.thetas.map((_, i) => i);
    right.line(ts, s.other.thetas, { series: 1, label: otherLbl });
    right.line(ts, s.live.thetas, { series: 0, label: liveLbl });
    right.marker(s.t, s.live.theta);
  },
});
