// SIR model of §II, Eq. (1), integrated with the kernel's RK4 at the paper's scale (N = 6e7, I0 = 10).
// The analytic peak of Eq. (8) is drawn only as a reference line; all metrics come from the simulated I(t).

const N = fixed.N, I0 = fixed.I0, R00 = fixed.R0, S0 = N - I0;   // fixed.S0 = "N - I0"
const SAFE = 1e-4;                                                 // fixed.safety_level: I/N = 1e-4
const T_END = 300;                                                 // run length in days (1500 steps × 0.2 d)

const rates = p => ({ alpha: p.alpha_factor * fixed.alpha0, beta: p.beta_factor * fixed.beta0 });

function deriv([S, I, R], p) {
  const { alpha, beta } = rates(p);
  return [-alpha * S * I, alpha * S * I - beta * I, beta * I];
}

// Eq. (8): I*/N = 1 - g - g ln(1/g), g = γ/N, valid only above threshold
function peakEq8(p) {
  const { alpha, beta } = rates(p), g = beta / alpha / N;
  return g < 1 ? 1 - g - g * Math.log(1 / g) : 0;
}

function analyse(s) {
  const I = s.path.y[1], t = s.path.t, n = I.length;
  if (n < 1) return null;
  const k = argmax(I);
  let ts = null;
  for (let j = k + 1; j < n; j++) if (I[j] / N < SAFE) { ts = t[j]; break; }
  if (ts === null && s.t >= T_END - 1e-9) ts = T_END;
  return { k, peak_frac: I[k] / N, peak_day: t[k], t_safe: ts };
}

playground({
  caption: 'double β instead of halving α: same peak, half the time',
  dt: fixed.dt_days,
  substeps: 2,

  init: () => ({ y: [S0, I0, R00] }),
  deriv,

  metrics(s) {
    const a = analyse(s);
    if (!a) return { peak_frac: null, peak_day: null, t_safe: null };
    return { peak_frac: a.peak_frac, peak_day: a.peak_day, t_safe: a.t_safe };
  },

  readout(s, p, m) {
    const { alpha, beta } = rates(p);
    return `peak ${fmt(m.peak_frac)} N · day ${fmt(m.peak_day)} · safe day ${fmt(m.t_safe)} · N/γ ${fmt(N * alpha / beta)}`;
  },

  draw(g, s, p, m) {
    const [left, right] = g.split('1x2');
    const t = s.path.t, I = s.path.y[1];
    const frac = Array.from(I, v => v / N);
    const a = analyse(s);
    const top = Math.max(0.6, (a ? a.peak_frac : 0) * 1.1, peakEq8(p) * 1.1);

    left.title('infectives I(t)/N');
    left.axes({ x: [0, T_END], y: [0, top], xlabel: 'days', ylabel: 'I/N' });
    left.hline(peakEq8(p), { series: 2, label: 'Eq. 8 peak' });
    left.line(t, frac, { label: 'I/N' });
    if (a && a.k > 0) left.marker(a.peak_day, a.peak_frac, { label: `t* ${fmt(a.peak_day)}` });

    right.title('log scale, safety level');
    right.axes({ x: [0, T_END], y: [1e-7, 1], xlabel: 'days', ylog: true });
    right.hline(SAFE, { series: 2, label: 'I/N = 1e-4' });
    right.line(t, frac);
    if (a && a.t_safe !== null && a.t_safe < T_END) {
      right.vline(a.t_safe, { series: 3, label: `t_s ${fmt(a.t_safe)}` });
    }
  },
});
