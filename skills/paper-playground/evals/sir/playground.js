// SIR model (Eq. 1), integrated in absolute counts with the paper's α, β and N.
// The epidemic peak occurs where S = γ = β/α (dI/dt = 0), so the right panel marks that line.

const A = p => p.alpha_factor * fixed.alpha_0;
const B = p => p.beta_factor * fixed.beta_0_per_day;

function deriv([S, I, R], p) {
  const a = A(p), b = B(p);
  return [-a * S * I, a * S * I - b * I, b * I];
}

function peakIndex(I) {
  let k = 0;
  for (let i = 1; i < I.length; i++) if (I[i] > I[k]) k = i;
  return k;
}

playground({
  caption: 'halve α or double β and compare when the peak arrives',
  dt: 1,
  substeps: 10,

  init: () => ({ y: [fixed.N - fixed.I0, fixed.I0, fixed.R0] }),
  deriv,

  metrics(s) {
    const I = s.path.y[1], R = s.path.y[2];
    if (!I || I.length === 0) return { peak_frac: null, t_peak: null, final_frac: null };
    const k = peakIndex(I);
    return {
      peak_frac: I[k] / fixed.N,
      t_peak: k,
      final_frac: R[R.length - 1] / fixed.N,
    };
  },

  readout(s, p, m) {
    const ratio = fixed.N / (B(p) / A(p));
    return `S₀/γ ${fmt(ratio)} · peak I*/N ${fmt(m.peak_frac)} · peak day ${fmt(m.t_peak)} · ever infected ${fmt(m.final_frac)}`;
  },

  draw(g, s, p, m) {
    const [left, right] = g.split('1x2');
    const N = fixed.N;
    const t = s.path.t;
    const S = s.path.y[0].map(v => v / N);
    const I = s.path.y[1].map(v => v / N);
    const R = s.path.y[2].map(v => v / N);
    const gN = (B(p) / A(p)) / N;

    left.title('fractions over time');
    left.axes({ x: [0, 300], y: [0, 1], xlabel: 'day' });
    left.line(t, S, { series: 1, label: 'S/N' });
    left.line(t, R, { series: 2, label: 'R/N' });
    left.line(t, I, { label: 'I/N' });
    if (m.t_peak != null) {
      left.vline(m.t_peak, { series: 3, label: `t* ${fmt(m.t_peak)}` });
      left.marker(m.t_peak, m.peak_frac, { label: `I*/N ${fmt(m.peak_frac)}` });
    }

    right.title('infected vs susceptible');
    right.axes({ x: [0, 1], y: [0, 0.6], xlabel: 'S/N', ylabel: 'I/N' });
    if (gN <= 1) right.vline(gN, { series: 2, label: 'S = γ' });
    right.line(S, I);
    right.marker(S[S.length - 1], I[I.length - 1], { label: `day ${fmt(s.t)}` });
  },
});
