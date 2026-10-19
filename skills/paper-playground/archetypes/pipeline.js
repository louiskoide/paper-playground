/* ARCHETYPE · pipeline walkthrough
 *
 * Use when the document's idea is a fixed sequence of transformations whose intermediates are the
 * point: attention, convolution, tokenization, a compiler pass, a signal chain. Use a toy input
 * small enough to show every intermediate.
 *
 * Fill in:
 *   stages: [{ name, run(prev, p, rand, s) → out, draw(g, out, p, s) }, ...]   at least 2
 *     stage 0 receives prev = null and builds the input; play advances one stage at a time;
 *     the chips above the figure let the reader revisit any computed stage
 *   init(p, rand) → {...}              optional extra fields on s, available to every stage
 *   metrics(s, p) → {...}              called once all stages have run; s.outs[k] is stage k's output
 *   caption, readout?(s, p, m)
 *   The self-test always runs the whole pipeline; `steps` in the extraction is ignored.
 *
 * SOURCE (example passage written for this file, after Marr & Hildreth 1980 and Canny 1986)
 *   §2 "Differentiation amplifies noise: a derivative filter applied to a noisy image responds to every
 *   pixel-level fluctuation, and thresholding its output marks edges all over flat regions."
 *   §3 "Smoothing with a Gaussian of width σ before differentiating suppresses those responses, while
 *   true edges, which extend over many pixels, survive."
 *   §4 "An edge is declared wherever the gradient magnitude exceeds a threshold. Too much smoothing
 *   lowers the response at true edges until they, too, fall below it."
 */

const W = 48;
const at = (img, i, j) => img[clamp(i, 0, W - 1) * W + clamp(j, 0, W - 1)];
const CLEAN = new Float32Array(W * W).map((_, k) => {
  const i = Math.floor(k / W), j = k % W;
  return (i >= 8 && i < 22 && j >= 7 && j < 23) || Math.hypot(i - 31, j - 31) < 10 ? 1 : 0;
});
function sobel(img) {
  const out = new Float32Array(W * W);
  for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
    const gx = at(img, i - 1, j + 1) + 2 * at(img, i, j + 1) + at(img, i + 1, j + 1) - at(img, i - 1, j - 1) - 2 * at(img, i, j - 1) - at(img, i + 1, j - 1);
    const gy = at(img, i + 1, j - 1) + 2 * at(img, i + 1, j) + at(img, i + 1, j + 1) - at(img, i - 1, j - 1) - 2 * at(img, i - 1, j) - at(img, i - 1, j + 1);
    out[i * W + j] = Math.hypot(gx, gy);
  }
  return out;
}
function blur(img, sigma) {
  if (sigma < 0.05) return img.slice();
  const r = Math.ceil(3 * sigma), k = linspace(-r, r, 2 * r + 1).map(d => Math.exp(-(d * d) / (2 * sigma * sigma))), z = sum(k);
  const pass = (src, horizontal) => new Float32Array(W * W).map((_, idx) => {
    const i = Math.floor(idx / W), j = idx % W;
    let acc = 0;
    for (let d = -r; d <= r; d++) acc += k[d + r] * (horizontal ? at(src, i, j + d) : at(src, i + d, j));
    return acc / z;
  });
  return pass(pass(img, true), false);
}
const dilate = (mask, r) => mask.map((_, k) => {
  const i = Math.floor(k / W), j = k % W;
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (at(mask, i + a, j + b)) return 1;
  return 0;
});
const TRUE_EDGE = sobel(CLEAN).map(v => (v > 0 ? 1 : 0));
const NEAR_EDGE = dilate(TRUE_EDGE, 1);
const FAR = dilate(TRUE_EDGE, 2).map(v => 1 - v);

const show = (g, img, title, range) => { g.title(title); g.cells({ w: W, h: W, data: img }, { range }); };

playground({
  caption: 'set σ to 0 and watch noise turn into edges',
  aspect: 1.25,

  stages: [
    { name: 'image', run: (_, p) => CLEAN.map(v => v + p.noise * randn()), draw: (g, img, p) => show(g, img, `input · noise ${p.noise}`, [-0.5, 1.5]) },
    { name: 'smooth', run: (img, p) => blur(img, p.sigma), draw: (g, img, p) => show(g, img, `gaussian · σ ${p.sigma}`, [-0.5, 1.5]) },
    { name: 'gradient', run: img => sobel(img), draw: (g, mag) => show(g, mag, 'sobel gradient magnitude', [0, 4]) },
    {
      name: 'edges',
      run: (mag, p) => mag.map(v => (v > p.threshold ? 1 : 0)),
      draw(g, e) {
        g.title('edges · false ones in red');
        g.cells({ w: W, h: W, data: e.map((v, k) => (v ? (FAR[k] ? -1 : 1) : 0)) }, { diverging: true, range: [-1, 1] });
      },
    },
  ],

  metrics(s) {
    const e = s.outs[3], hit = dilate(e, 1);
    let falses = 0, far = 0, found = 0, edges = 0;
    for (let k = 0; k < e.length; k++) {
      if (FAR[k]) { far++; falses += e[k]; }
      if (TRUE_EDGE[k]) { edges++; found += hit[k]; }
    }
    return { false_rate: falses / far, recall: found / edges };
  },
});
