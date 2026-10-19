/* ARCHETYPE · dynamical system
 *
 * Use when the document's idea is a quantity changing in time under rules it states:
 * ODEs, population models, epidemics, mechanics, kinetics, circuits.
 *
 * Fill in, continuous time (preferred):
 *   init(p, rand) → { y: [numbers], ...extra }   y is the ODE state vector
 *   deriv(y, p, t) → [dy/dt]           the right-hand side exactly as the document writes it
 *   dt                                  time per step (default 0.1); substeps = RK4 substeps per step (default 1)
 *   The kernel integrates with RK4 and maintains s.t and s.path = { t: [...], y: [[y0 over time], [y1 ...]] }.
 *   Never write your own Euler loop: integrator error would look like a result.
 * Or discrete time / stochastic:
 *   init(p, rand) → state;  step(s, p, rand) → state | void
 * Then:
 *   metrics(s, p, trace) → {...}   null for a metric not defined yet (too early in the run);
 *                                  NaN or Infinity halts the run as "diverged"
 *   draw(g, s, p, m, trace), caption, readout?(s, p, m)
 *
 * SOURCE (example passage written for this file, after Lotka 1925 and Volterra 1926)
 *   §1 "Prey x grow at rate α and are eaten at rate βxy; predators y gain δxy and die at rate γ:
 *   dx/dt = αx − βxy, dy/dt = δxy − γy."
 *   §2 "Without a limit on prey growth the populations cycle forever: every orbit is closed and the
 *   swings never shrink. Averaged over the cycles, prey sit at the equilibrium x* = γ/δ, whatever the
 *   starting point."
 *   §3 "Give prey a carrying capacity K, so they grow as αx(1 − x/K), and the cycles damp out: the
 *   populations spiral into the equilibrium."
 */

function deriv([x, y], p) {
  const growth = p.logistic ? p.alpha * x * (1 - x / fixed.K) : p.alpha * x;
  return [growth - fixed.beta * x * y, fixed.delta * x * y - p.gamma * y];
}
const span = a => Math.max(...a) - Math.min(...a);

playground({
  caption: 'switch on the carrying capacity and watch the cycles spiral in',
  dt: 0.1,
  substeps: 4,

  init: p => ({ y: [p.x0, fixed.y0] }),
  deriv,

  metrics(s) {
    const xs = s.path.y[0], n = xs.length, q = Math.floor(n / 4);
    if (n < 80 || span(xs.slice(0, q)) < 1e-9) return { amp_ratio: null, mean_prey: null };
    return { amp_ratio: span(xs.slice(n - q)) / span(xs.slice(0, q)), mean_prey: mean(xs) };
  },

  draw(g, s, p) {
    const [left, right] = g.split('1x2'), [X, Y] = s.path.y, top = Math.max(40, ...X, ...Y) * 1.05;
    left.title('populations over time');
    left.axes({ x: [0, 60], y: [0, top], xlabel: 'time' });
    left.hline(p.gamma / fixed.delta, { label: 'x* = γ/δ' });
    left.line(s.path.t, Y, { series: 1, label: 'predators y' });
    left.line(s.path.t, X, { label: 'prey x' });
    right.title('phase plane');
    right.axes({ x: [0, top], y: [0, top], xlabel: 'prey x', ylabel: 'predators y' });
    right.field((x, y) => deriv([x, y], p), { n: 13 });
    right.line(X, Y);
    right.marker(X.at(-1), Y.at(-1), { label: `t ${fmt(s.t)}` });
  },
});
