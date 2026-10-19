// Check that the extraction's quotes appear in the document. Exact match after normalisation, or
// ≥ 70% of the quote's word bigrams present (math renders differently in quote and source:
// "1/√d_k" vs "$\frac{1}{\sqrt{d_{k}}}$"). A paraphrase or an invented quote scores far lower.
const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const bigrams = toks => toks.slice(1).map((t, i) => `${toks[i]} ${t}`);

export function quoteChecker(docText) {
  const text = norm(docText), have = new Set(bigrams(text.split(' ')));
  return quote => {
    const q = norm(quote);
    if (!q) return { ok: false, score: 0 };
    if (text.includes(q)) return { ok: true, score: 1 };
    const bg = bigrams(q.split(' '));
    if (!bg.length) return { ok: false, score: 0 };
    const score = bg.filter(b => have.has(b)).length / bg.length;
    return { ok: score >= 0.7, score: +score.toFixed(2) };
  };
}

/** Every quote in an extraction (params, claims, and the fallback's), with its check. */
export function checkQuotes(x, docText) {
  const check = quoteChecker(docText), out = [];
  const visit = (x, where) => {
    if (!x || x.playable === false) return;
    for (const q of x.params || []) if (q.source?.quote) out.push({ where: `${where}params.${q.name}`, quote: q.source.quote, ...check(q.source.quote) });
    for (const k of ['reproduce', 'contrast']) if (x[k]?.source?.quote) out.push({ where: `${where}${k}`, quote: x[k].source.quote, ...check(x[k].source.quote) });
    if (x.fallback) visit(x.fallback, 'fallback.');
  };
  visit(x, '');
  return out;
}
