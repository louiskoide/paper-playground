/* ARCHETYPE · iterative algorithm
 *
 * Use when the document's idea is a procedure that repeats one update until it settles:
 * gradient descent, k-means, EM, value iteration, power iteration, message passing.
 * One press of "step" is one iteration. Play runs to the horizon (the largest `steps` in the extraction).
 *
 * Fill in:
 *   init(p, rand) → state              plain data only: numbers, arrays, typed arrays, plain objects
 *   step(s, p, rand) → state | void    one iteration; mutate s or return a new state
 *   metrics(s, p, trace) → {...}       exactly the declared metric names; null means "not defined yet"
 *   draw(g, s, p, m, trace)            trace = { t: [...], <metric>: [...] } for every step so far
 *   caption                            the bottom-left instruction
 *   readout(s, p, m) → string          optional; the kernel prefixes "step N"
 *
 * SOURCE (example passage written for this file, after Brin & Page 1998 and Haveliwala & Kamvar 2003)
 *   §2 "PageRank of a page is the probability that a random surfer lands on it. At each click the surfer
 *   follows a random out-link with probability d, the damping factor, and jumps to a random page
 *   otherwise. We usually set d to 0.85." "Pages with no out-links are dangling: unless their rank is
 *   spread over all pages, rank leaks out of the web at every step." "The ranks are the fixed point of
 *   this update and do not depend on the starting vector."
 *   §3 "Power iteration converges geometrically: the error shrinks by about a factor of d per
 *   iteration, so with d = 0.85 about fifty iterations reach three decimal places. As d approaches 1
 *   convergence slows sharply."
 */

// Two link cycles joined by one link (3 → 4); page 7 is dangling. Cycles mix slowly, so d sets the pace.
const LINKS = [[1], [2], [3], [0, 4], [5], [6], [4, 7], []];
const POS = [[0.06, 0.5], [0.24, 0.9], [0.42, 0.5], [0.24, 0.1], [0.62, 0.3], [0.86, 0.45], [0.66, 0.78], [0.92, 0.92]];
const N = LINKS.length;

playground({
  caption: 'raise d toward 0.99 and watch convergence slow',

  init(p) {
    return { r: p.start === 'uniform' ? new Array(N).fill(1 / N) : LINKS.map((_, i) => (i === 0 ? 1 : 0)), residual: null };
  },

  step(s, p) {
    const next = new Array(N).fill((1 - p.d) / N);
    let dangling = 0;
    LINKS.forEach((out, i) => {
      if (!out.length) { dangling += s.r[i]; return; }
      for (const j of out) next[j] += (p.d * s.r[i]) / out.length;
    });
    if (p.fix_dangling) for (let j = 0; j < N; j++) next[j] += (p.d * dangling) / N;
    s.residual = sum(next.map((v, i) => Math.abs(v - s.r[i])));
    s.r = next;
  },

  metrics: s => ({ residual: s.residual, mass: sum(s.r), top: Math.max(...s.r) }),

  draw(g, s, p, m, trace) {
    const [left, right] = g.split('1x2');
    left.title('link graph · area ∝ rank');
    const best = argmax(s.r);
    left.graph(
      POS.map(([x, y], i) => ({ x, y, r: 3 + 26 * Math.sqrt(s.r[i]), label: `${i} · ${fmt(s.r[i], 2)}`, live: i === best })),
      LINKS.flatMap((out, i) => out.map(j => [i, j])),
      { arrows: true },
    );
    right.title('residual per iteration');
    right.axes({ x: [0, Math.max(50, trace.t.at(-1))], y: [1e-9, 2], ylog: true, xlabel: 'iteration' });
    const xs = trace.t.slice(1);
    right.line(xs, xs.map(t => p.d ** t), { series: 2, label: 'dᵗ' });
    right.line(xs, trace.residual.slice(1), { label: `d = ${p.d}` });
    if (m.residual != null) right.marker(xs.at(-1), m.residual);
  },
});
