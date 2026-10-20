// One input, one hidden layer of 2N sigmoid neurons in N pairs, one sigmoid output neuron, built by hand
// as in "Universality with one input and one output": pair j steps up at j/N and down at (j+1)/N,
// and its two output weights ±h_j make a bump of height h_j = σ⁻¹(f) at the middle of its subinterval.

const sig = z => 1 / (1 + Math.exp(-z));
const logit = q => Math.log(q / (1 - q));
const f = x => 0.2 + 0.4 * x * x + 0.3 * x * Math.sin(15 * x) + 0.05 * Math.cos(50 * x);
const XS = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200); // sample points for the metrics
const XP = linspace(0, 1, 601);                                    // points for drawing
const heights = N => Array.from({ length: N }, (_, j) => logit(f((j + 0.5) / N)));
const neurons = N => Array.from({ length: 2 * N }, (_, k) => ({ pair: k >> 1, up: k % 2 === 0, s: ((k >> 1) + (k % 2)) / N }));

// the network itself: input node, the hidden layer (first and last 4 pairs when there are many), the output node
function net(g, p, stage) {
  const N = p.N, h = heights(N), all = neurons(N);
  const many = N > 8, shown = many ? all.filter(n => n.pair < 4 || n.pair >= N - 4) : all;
  const label = n => stage <= 1 ? `on at ${fmt(n.s, 2)}` : `${n.up ? '+' : '−'}${fmt(Math.abs(h[n.pair]), 2)}`;
  g.title('the network', {
    explain: stage <= 1 ? 'each hidden neuron is a switch that turns on at one spot along the input'
      : 'each hidden neuron feeds the output with a weight: + for the switch-on, − for the switch-off of its pair',
    takeaway: many ? `${2 * N} hidden neurons; the middle ${2 * (N - 8)} are not drawn` : `${2 * N} hidden neurons in ${N} pairs`,
  });
  const rows = shown.length + (many ? 1 : 0), yOf = i => 0.88 - 0.8 * (rows === 1 ? 0.5 : i / (rows - 1));
  const nodes = [{ x: 0.06, y: 0.48, label: 'x', live: stage === 0 }], edges = [];
  shown.forEach((n, i) => {
    const y = yOf(many && n.pair >= N - 4 ? i + 1 : i);
    nodes.push({ x: 0.45, y, r: 4.5, label: label(n), live: stage === 1 });
    edges.push({ a: 0, b: nodes.length - 1, live: stage === 1 });
  });
  const out = nodes.push({ x: 0.94, y: 0.48, label: 'out', live: stage >= 3 }) - 1;
  for (let k = 1; k < out; k++) edges.push({ a: k, b: out, live: stage === 2, dash: !shown[k - 1].up });
  g.graph(nodes, edges, { r: 6 });
  if (many) g.text(0.45, yOf(8), `⋮ ${2 * (N - 8)} more`, { anchor: 'middle' });
  g.text(0.06, 0.97, 'input', { anchor: 'middle' });
  g.text(0.45, 0.97, 'hidden layer', { anchor: 'middle' });
  g.text(0.94, 0.97, 'output', { anchor: 'middle' });
}

const panels = (g, p, stage) => { const [a, b] = g.split('1x2', 28); net(a, p, stage); return b; };
const xAxis = { x: [0, 1], xlabel: 'input x', xexplain: 'the number fed into the network' };

playground({
  caption: 'raise bump pairs n and watch the copy hug the curve',
  aspect: 1.9,

  stages: [
    {
      name: 'goal',
      run: () => ({ f: XP.map(f) }),
      draw(g, o, p) {
        const b = panels(g, p, 0);
        b.title('the goal f(x)', { explain: 'the curve the network should copy: for each input x, the output should be f(x)', takeaway: 'press play to build the copy one layer at a time' });
        b.axes({ ...xAxis, y: [0, 1], ylabel: 'f(x)' });
        b.line(XP, o.f, { series: 0, label: 'goal f(x)' });
      },
    },
    {
      name: 'hidden neurons',
      run: (_, p) => neurons(p.N).map(n => ({ ...n, a: XP.map(x => sig(p.w * (x - n.s))), aS: XS.map(x => sig(p.w * (x - n.s))) })),
      draw(g, hs, p) {
        const b = panels(g, p, 1);
        b.title('what each hidden neuron outputs', {
          explain: 'σ(w(x − s)): 0 before its switch point s, 1 after; dashed are the switch-offs of each pair',
          takeaway: `each switch takes ${fmt(4.4 / p.w, 2)} of the input range to flip (10% to 90%); ${p.w >= 100 ? 'sharp, almost a step' : 'soft, a gentle ramp'}`,
        });
        b.axes({ ...xAxis, y: [-0.05, 1.05], ylabel: 'activation', yexplain: '0 is off, 1 is fully on' });
        for (const n of hs) b.line(XP, n.a, { series: n.up ? 1 : 2, width: 1 });
      },
    },
    {
      name: 'bumps',
      run: (hs, p) => heights(p.N).map((h, j) => ({ h, b: XP.map((_, i) => h * (hs[2 * j].a[i] - hs[2 * j + 1].a[i])), bS: XS.map((_, i) => h * (hs[2 * j].aS[i] - hs[2 * j + 1].aS[i])) })),
      draw(g, bs, p) {
        const b = panels(g, p, 2);
        const hi = Math.max(0.5, ...bs.map(q => Math.abs(q.h)));
        b.title('one bump per pair', {
          explain: 'switch-on minus switch-off leaves a flat-topped block; its output weight h sets how tall it is',
          takeaway: `${p.N} bumps, each ${fmt(1 / p.N, 2)} wide, heights from ${fmt(Math.min(...bs.map(q => q.h)), 2)} to ${fmt(Math.max(...bs.map(q => q.h)), 2)}`,
        });
        b.axes({ ...xAxis, y: [-hi * 1.1, hi * 1.1], ylabel: 'bump', yexplain: 'h · (switch-on − switch-off)' });
        b.hline(0, { series: 3 });
        for (const q of bs) b.line(XP, q.b, { series: 0, width: 1.25 });
      },
    },
    {
      name: 'add them up',
      run: bs => ({ z: XP.map((_, i) => sum(bs.map(q => q.b[i]))), zS: XS.map((_, i) => sum(bs.map(q => q.bS[i]))), target: XP.map(x => logit(f(x))) }),
      draw(g, o, p) {
        const b = panels(g, p, 3);
        const dev = mean(XS.map((x, i) => Math.abs(o.zS[i] - logit(f(x)))));
        b.title('the bumps added together', {
          explain: 'the output neuron first adds up all the bumps; this total has to match σ⁻¹(f), which the output neuron then squashes into f',
          takeaway: `the total is off from its target by ${fmt(dev, 2)} on average`,
        });
        b.axes({ ...xAxis, y: [-2.6, 2.2], ylabel: 'weighted sum z', yexplain: 'before the output neuron squashes it' });
        b.line(XP, o.target, { series: 2, label: 'target σ⁻¹(f)' });
        b.line(XP, o.z, { series: 0, label: 'sum of bumps' });
      },
    },
    {
      name: 'output',
      run: o => ({ g: o.z.map(sig), gS: o.zS.map(sig) }),
      draw(g, o, p) {
        const b = panels(g, p, 4);
        const dev = mean(XS.map((x, i) => Math.abs(o.gS[i] - f(x))));
        b.title("the network's copy of f(x)", {
          explain: 'the output neuron squashes the sum through σ; this is what the whole network computes',
          takeaway: `with ${p.N} bumps the copy is off by ${fmt(dev, 2)} on average${p.N < 10 ? '; it is blocky' : ''}`,
        });
        b.axes({ ...xAxis, y: [0, 1], ylabel: 'output' });
        b.line(XP, XP.map(f), { series: 1, dash: [4, 3], label: 'goal f(x)' });
        b.line(XP, o.g, { series: 0, label: 'network output' });
      },
    },
  ],

  metrics(s) {
    const z = s.outs[3].zS, out = s.outs[4].gS;
    return {
      avg_dev: mean(XS.map((x, i) => Math.abs(out[i] - f(x)))),
      hidden_dev: mean(XS.map((x, i) => Math.abs(z[i] - logit(f(x))))),
    };
  },
});
