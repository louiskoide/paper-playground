// Forced, damped oscillator: steady-state amplitude A(ω) from Eq. 15.29, with F_0 from `fixed`.
// Width follows the fixed rule: linear-interpolated half-maximum crossings on the 3000-point grid
// from 0 to 3·ω_0. When the curve already starts above A_max/2 at ω = 0 (heavy damping, no lower
// rise), the width and the quality are undefined and reported as null.

const F0 = fixed.F_0;
const omega0 = (p) => Math.sqrt(p.k / p.m);
const amp = (w, p) => {
  const w0sq = p.k / p.m;
  const d = w * w - w0sq;
  return F0 / Math.sqrt(p.m * p.m * d * d + p.b * p.b * w * w);
};

function halfCrossings(x, y) {
  const i0 = argmax(y);
  const Amax = y[i0];
  const half = Amax / 2;
  let lo = null, hi = null;
  for (let i = 1; i <= i0; i++) {
    if (y[i - 1] <= half && y[i] > half) {
      lo = x[i - 1] + (half - y[i - 1]) / (y[i] - y[i - 1]) * (x[i] - x[i - 1]);
      break;
    }
  }
  for (let i = y.length - 2; i >= i0; i--) {
    if (y[i] > half && y[i + 1] <= half) {
      hi = x[i] + (y[i] - half) / (y[i] - y[i + 1]) * (x[i + 1] - x[i]);
      break;
    }
  }
  return { Amax, half, lo, hi, wpeak: x[i0] };
}

playground({
  caption: 'raise damping b and watch the peak drop and widen',
  aspect: 1.8,

  domain: (p) => [0, 3 * omega0(p), 3000],
  f: (w, p) => amp(w, p),

  metrics(s, p) {
    const c = halfCrossings(s.x, s.y[0]);
    const width = (c.lo !== null && c.hi !== null) ? c.hi - c.lo : null;
    return {
      amplitude: amp(p.omega, p),
      width,
      quality: width ? omega0(p) / width : null,
    };
  },

  draw(g, s, p, m) {
    const w0 = omega0(p);
    const c = halfCrossings(s.x, s.y[0]);
    const A = m.amplitude;
    const xmax = Math.max(3 * w0, p.omega * 1.05);
    const top = Math.max(c.Amax, A) * 1.15;
    g.title('steady-state amplitude vs driving frequency');
    g.axes({ x: [0, xmax], y: [0, top], xlabel: 'driving frequency ω (rad/s)', ylabel: 'amplitude A (m)' });
    g.vline(w0, { series: 3, label: 'ω₀' });
    g.hline(c.half, { series: 2, label: 'A_max / 2' });
    if (c.lo !== null) g.vline(c.lo, { series: 1 });
    if (c.hi !== null) g.vline(c.hi, { series: 1 });
    g.line(s.x, s.y[0], { label: `b = ${fmt(p.b)} kg/s` });
    g.marker(p.omega, A, { label: `A ${fmt(A)} m` });
  },

  readout: (s, p, m) =>
    `ω ${fmt(p.omega)} rad/s · ω₀ ${fmt(omega0(p))} rad/s · amplitude ${fmt(m.amplitude)} m · ` +
    `F₀/(bω₀) ${fmt(F0 / (p.b * omega0(p)))} m · Δω ${fmt(m.width)} rad/s · q ${fmt(m.quality)} · mω₀/b ${fmt(p.m * omega0(p) / p.b)}`,
});
