/* ARCHETYPE · stochastic / Monte Carlo
 *
 * Use when the document's idea is about what random draws do in aggregate: estimators, sampling
 * distributions, bootstrap, random walks, Monte Carlo integration.
 *
 * Fill in:
 *   sample(p, rand) → number | { value, ...extra }   one draw; use rand()/randn() only, never Math.random
 *   batch                              draws per step (default 50)
 *   The kernel keeps s.samples (all values) and s.draws (the last 4000 object draws, if you return objects).
 *   init(p, rand) → {...}              optional extra fields merged into s
 *   metrics(s, p, trace), draw(g, s, p, m, trace), caption, readout?(s, p, m)
 *
 * This example has two params because the passage has two real knobs. Don't pad the table.
 *
 * SOURCE (example passage written for this file, textbook treatment of the central limit theorem)
 *   §5.2 "Let X̄ₙ be the mean of n independent draws from a distribution with finite variance σ². As n
 *   grows, X̄ₙ is approximately normal with standard deviation σ/√n. For uniform draws on [0, 1],
 *   σ = 1/√12 ≈ 0.289, so means of n = 30 draws have standard deviation close to 0.053."
 *   §5.3 "The theorem needs finite variance. The mean of n Cauchy draws is itself Cauchy, exactly as
 *   spread out as a single draw, however large n is."
 */

const DRAW = { uniform: r => r(), exponential: r => -Math.log(1 - r()), cauchy: r => Math.tan(Math.PI * (r() - 0.5)) };
const MOMENTS = { uniform: [0.5, Math.sqrt(1 / 12)], exponential: [1, 1], cauchy: null };

playground({
  caption: 'switch to cauchy draws and watch the means refuse to settle',
  batch: 50,

  sample(p, rand) {
    let total = 0;
    for (let i = 0; i < p.n; i++) total += DRAW[p.dist](rand);
    return total / p.n;
  },

  metrics(s) {
    if (s.samples.length < 20) return { sd: null, iqr: null };
    const xs = [...s.samples].sort((a, b) => a - b), q = f => xs[Math.floor(f * (xs.length - 1))];
    return { sd: std(s.samples), iqr: q(0.75) - q(0.25) };
  },

  draw(g, s, p) {
    const mom = MOMENTS[p.dist], mu = mom ? mom[0] : 0, sig = mom ? mom[1] / Math.sqrt(p.n) : null;
    const range = sig ? [mu - 4.5 * sig, mu + 4.5 * sig] : [-8, 8], peak = sig ? 1 / (sig * Math.sqrt(2 * Math.PI)) : 1 / Math.PI;
    const xs = linspace(range[0], range[1], 240);
    g.axes({ x: range, y: [0, peak * 1.4], xlabel: 'sample mean', ylabel: 'density' });
    g.hist(s.samples, { bins: 40, range, density: true, series: 1, label: `${s.samples.length} means of n = ${p.n}` });
    if (sig) g.line(xs, xs.map(x => peak * Math.exp(-(((x - mu) / sig) ** 2) / 2)), { label: `normal, sd σ/√n = ${fmt(sig)}` });
    else g.line(xs, xs.map(x => 1 / (Math.PI * (1 + x * x))), { label: 'cauchy, for any n' });
  },
});
