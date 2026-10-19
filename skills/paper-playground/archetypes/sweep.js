/* ARCHETYPE · parameter sweep
 *
 * Use when the document's idea is a closed-form relationship: a law, a scaling curve, a formula whose
 * shape changes with its parameters. There is no time; every control redraws the curve at once.
 *
 * Fill in:
 *   domain(p) → [x0, x1, n] or [x0, x1, n, 'log']   where to evaluate (default [0, 1, 200])
 *   f(x, p) → number | [numbers]       the formula; return an array to get several series
 *   The kernel builds s = { x: [...], y: [[series 0], [series 1], ...] }.
 *   init(p, rand, { x, y }) → {...}    optional extra fields merged into s
 *   metrics(s, p), draw(g, s, p, m), caption, readout?(s, p, m)
 *
 * SOURCE (example passage written for this file, after Planck 1901 and Wien 1893)
 *   §1 "A black body at temperature T has spectral radiance B(λ, T) = (2hc²/λ⁵) / (e^{hc/λkT} − 1)."
 *   §2 "The peak moves to shorter wavelengths as the body heats up, following Wien's displacement law
 *   λmax = b/T with b ≈ 2.898 × 10⁻³ m·K. The Sun's surface, near 5800 K, peaks around 500 nm, while a
 *   3000 K lamp filament peaks in the infrared near 970 nm."
 *   §3 "The classical Rayleigh–Jeans law B = 2ckT/λ⁴ agrees at long wavelengths but grows without bound
 *   at short ones: the ultraviolet catastrophe that Planck's formula removes."
 */

const H = 6.62607015e-34, C = 2.99792458e8, KB = 1.380649e-23, WIEN_NM = 2.897771955e6;
// spectral radiance in kW · sr⁻¹ · m⁻² · nm⁻¹
const planck = (nm, T) => { const l = nm * 1e-9; return (2 * H * C * C) / l ** 5 / Math.expm1((H * C) / (l * KB * T)) * 1e-12; };
const rayleighJeans = (nm, T) => { const l = nm * 1e-9; return (2 * C * KB * T) / l ** 4 * 1e-12; };

playground({
  caption: 'slide the temperature and follow the peak',
  aspect: 1.8,

  domain: () => [100, 3000, 600],
  f: (nm, p) => [planck(nm, p.T), planck(nm, p.T_ref), rayleighJeans(nm, p.T)],

  metrics: (s, p) => ({ peak_nm: s.x[argmax(s.y[0])], uv_ratio: rayleighJeans(200, p.T) / planck(200, p.T) }),

  draw(g, s, p, m) {
    const top = Math.max(...s.y[0], ...s.y[1]) * 1.15;
    g.axes({ x: [100, 3000], y: [0, top], xlabel: 'wavelength (nm)', ylabel: 'radiance (kW·sr⁻¹·m⁻²·nm⁻¹)' });
    g.vline(380, { series: 3, label: 'visible' });
    g.vline(750, { series: 3 });
    if (p.show_rj) g.line(s.x, s.y[2], { series: 2, label: 'Rayleigh–Jeans' });
    g.line(s.x, s.y[1], { series: 1, label: `${p.T_ref} K` });
    g.line(s.x, s.y[0], { label: `${p.T} K` });
    g.marker(m.peak_nm, Math.max(...s.y[0]), { label: `peak ${fmt(m.peak_nm)} nm` });
  },

  readout: (s, p, m) => `peak ${fmt(m.peak_nm)} nm · wien b/T ${fmt(WIEN_NM / p.T)} nm · rayleigh–jeans ÷ planck at 200 nm ${fmt(m.uv_ratio)}`,
});
