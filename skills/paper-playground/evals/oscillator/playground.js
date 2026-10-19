// Eq. 15.29: steady-state amplitude of the driven, damped oscillator.
// The fixed ω grid is [0.001, 3] rad/s with 3000 points (extraction.fixed.omega_grid).
const W_LO = 0.001, W_HI = 3, W_N = 3000;

const omega0 = (p) => Math.sqrt(p.k / p.m);

const amp = (w, p) => {
  const w0sq = p.k / p.m;
  const d = w * w - w0sq;
  return p.F0 / Math.sqrt(p.m * p.m * d * d + p.b * p.b * w * w);
};

// Half-maximum crossings on the grid. If a crossing lies outside the grid, it is
// clipped to the grid end (extraction.fixed.width_definition).
function halfMax(xs, ys) {
  const peak = Math.max(...ys);
  const half = peak / 2;
  let lo = null, hi = null;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] >= half) {
      if (lo === null) lo = xs[i];
      hi = xs[i];
    }
  }
  return { peak, half, lo, hi };
}

playground({
  caption: 'raise damping b and watch the peak drop and widen',
  aspect: 1.7,

  domain: () => [W_LO, W_HI, W_N],
  f: (w, p) => amp(w, p),

  metrics(s, p) {
    const h = halfMax(s.x, s.y[0]);
    return {
      amplitude: amp(p.omega, p),
      peak_amplitude: h.peak,
      width: h.lo === null ? null : h.hi - h.lo,
    };
  },

  draw(g, s, p, m) {
    const ys = s.y[0];
    const h = halfMax(s.x, ys);
    const top = Math.max(h.peak, m.amplitude) * 1.15;
    const w0 = omega0(p);

    g.title('steady-state amplitude a(ω)');
    g.axes({ x: [0, W_HI], y: [0, top], xlabel: 'driving frequency ω (rad/s)', ylabel: 'amplitude A (m)' });

    if (w0 <= W_HI) g.vline(w0, { series: 3, label: `ω₀ ${fmt(w0)}` });
    g.hline(h.half, { series: 2, label: 'half max' });
    if (h.lo !== null) {
      g.line([h.lo, h.hi], [h.half, h.half], { series: 1, width: 2, label: `Δω ${fmt(h.hi - h.lo)}` });
    }

    g.line(s.x, ys, { label: `b = ${fmt(p.b)} kg/s` });
    g.marker(p.omega, m.amplitude, { label: `ω ${fmt(p.omega)} · A ${fmt(m.amplitude)}` });
  },

  readout(s, p, m) {
    const w0 = omega0(p);
    const q = m.width ? w0 / m.width : null;
    return `A(ω) ${fmt(m.amplitude)} m · peak ${fmt(m.peak_amplitude)} m · F₀/(bω₀) ${fmt(p.F0 / (p.b * w0))} m · Δω ${fmt(m.width)} rad/s · Q ${fmt(q)} · mω₀/b ${fmt(p.m * w0 / p.b)}`;
  },
});
