---
name: paper-playground
description: Turn a paper, PDF or textbook passage into one self-contained interactive HTML figure that simulates the document's core mechanism and is self-tested against claims quoted from it. Use when asked for a playground, simulation, interactive figure or explorable explanation of a paper or document.
---

# Paper playground

You produce one figure: a numbered plate holding a small simulation of the document's core mechanism. The reader changes parameters the document defines and gets real output: a curve moves, a number in the readout changes, a run converges or blows up. The figure carries its own test. It must reproduce a claim quoted from the document and behave differently under a contrasting setting, and a self-test checks both before anyone sees it.

A figure that only animates is decoration. A figure whose controls produce the document's result is the point.

## How the work is split

1. **Extraction** ([EXTRACT.md](EXTRACT.md)) reads the document and writes `extraction.json`: the experiment, the params, the metrics, the reproduce and contrast claims with quotes, and the archetype. It's frozen before you start. It's your contract and you can't change it.
2. **Generation** (this file) implements the contract as one call to `playground({...})`, using one archetype's signatures.
3. **Build** (`scripts/build.mjs`) wraps your code with `kernel.js`, the extraction and a no-network policy into one HTML file. You never write the kernel, controls, loop, RNG, axes, frame or self-test. They exist already and are described in `kernel.d.ts`.
4. **Self-test** (`window.__selftest()`) sweeps every param to its min, default and max, checks for crashes, decorative params, non-determinism and hard-coded metrics, then runs reproduce and contrast and evaluates their predicates.

## The four rules

1. **Implement the mechanism, not the result.** Write the document's equations or procedure, run them, and measure. Metrics are computed from the simulated state. Never steer them toward the predicate's numbers, and never special-case the reproduce or contrast settings.
2. **The extraction is the contract.** Use its param names exactly (`p.d_k`), its metric names exactly, and its `fixed` constants via the `fixed` global. Don't add params, rename them or reinterpret their units.
3. **The kernel does the scaffolding.** You write the archetype functions, `metrics`, `draw`, `caption`, and sometimes `readout`. Everything else already exists. One state object and pure functions of `(state, params)`, with no DOM, timers or event listeners.
4. **Never fake.** If the mechanism can't be implemented honestly from what the document states, don't write a figure. Refuse (see Output), and the caller falls back to the extraction's diagram or to no figure.

## Procedure

1. **Read the contract.** Read the experiment sentence and both claims. Decide what the reader sees change between the reproduce and contrast settings (which curve moves, which number in the readout), and make that the figure's focus.
2. **Choose the state.** Pick the plain data that holds the system at one moment: numbers, arrays, typed arrays, plain objects. Keep it small: a toy at the `fixed` scale.
3. **Write the mechanism** from the cited sections, using the archetype's signatures. Translate the document's equations directly. Name variables after its symbols. Keep its update order.
4. **Write `metrics`.** Return exactly the declared names, each computed as the metric's `meaning` says. Return `null` while a metric isn't defined yet (too early in the run, empty sample). NaN or Infinity means the run diverged, which halts it and shows "diverged". Use that only when the system really diverges.
5. **Write `draw`.** Use one panel, or two with `g.split('1x2')`. Typically the mechanism goes on the left and the metric over time or the parameter on the right. Draw the claim's subject in series 0 (the live colour) and references or comparisons in series 1–3. Panel titles are short and lowercase.
6. **Write the caption.** It's a lowercase imperative of at most 60 characters that names a control and what to watch: "raise d toward 0.99 and watch convergence slow".
7. **Check against the claims before you output.** Trace the reproduce params through your code: will the predicate hold? Do the same for the contrast. Then check the param extremes: does anything divide by zero, take the log of 0, allocate something huge or loop forever? If the honest implementation won't meet a predicate, **don't tune constants to pass**. Keep the honest code and explain in a `// NOTE:` comment at the top. A failing test is information, and a gamed one is a lie.

## What the self-test checks

Knowing this will save you a repair round.

- **default**: the default params run cleanly (no divergence, no exception) for `steps` steps.
- **metrics**: every declared metric is a number at the end of the default run.
- **determinism**: the same params twice give identical output. Use only `rand()` and `randn()`, which are seeded. No `Math.random`, `Date` or `performance.now`, and no module-level mutable state that persists between runs. Top-level constants and lookup tables are fine.
- **sweep**: each param at min, default and max (toggles both ways, selects every option) runs without exceptions in under 1.5 s. Divergence is allowed there if the physics says so.
- **decorative**: changing each param changes the drawing or a metric. A param your code ignores fails.
- **varies**: each metric used in a predicate takes more than one value across the runs.
- **reproduce / contrast**: the claims' predicates, evaluated on your metrics.

## Output

Exactly one fenced block. Either the playground:

```js
// any top-level helpers and constants
playground({
  caption: '...',
  // archetype functions, metrics, draw, optional readout / aspect
});
```

or, if rule 4 applies, a refusal:

```json
{ "refuse": "one or two sentences: what the document lacks that an honest simulation would need" }
```

No prose outside the block. The block is plain JavaScript (no imports, no TypeScript, no HTML) and runs after the kernel as a classic script.

## Look

The kernel owns the look: a plate with `Fig 1` and the document title on top, your caption and a live readout at the bottom, hairline monochrome drawing, one live colour, and light and dark themes. You choose only what to draw and which series carries the live colour. Don't add custom colours, fonts, DOM elements or CSS, because there's no API for them, deliberately.

Readout: the default tail lists every metric as `label value unit`, and the kernel prefixes `step N`. Override `readout` only when a derived number explains more than the raw metrics (e.g. `peak 502 nm · wien b/T 500 nm`). Keep it lowercase, terse and dot-separated.

## Don'ts

- Don't rename, add or drop params or metrics. Don't edit or second-guess the extraction.
- Don't hard-code metric values, or branch on whether params equal the reproduce or contrast settings.
- No network, libraries, `fetch`, `import`, `eval`, DOM access, timers or `localStorage`.
- Don't invent a new archetype or mix two. Use the shape `kernel.d.ts` gives for the extraction's archetype.
- No decorative motion or drawing that isn't in the mechanism.
- Don't use your own ODE stepper for continuous dynamics. Give `deriv`, and the kernel runs RK4.

<!-- claude-code -->
## Running it in Claude Code

From the repository root:

1. If you were given a document but no `extraction.json`, run the extraction first in a **subagent** (Agent tool), so the test isn't written by the same context that will try to pass it. Prompt: the contents of `EXTRACT.md` plus the document text. Save its JSON block as `extraction.json`, and check it with `node skills/paper-playground/scripts/build.mjs --check extraction.json`. Show the user the experiment sentence and both claims.
2. Read `kernel.d.ts` and the archetype file for the extraction's archetype (`archetypes/<archetype>.js` and its `.json`, a complete worked example).
3. Write `playground.js` following the procedure above.
4. Build and test:
   ```
   node skills/paper-playground/scripts/build.mjs extraction.json playground.js playground.html
   node skills/paper-playground/scripts/selftest.mjs playground.html
   ```
   This writes `selftest.json`, `dark.png` and `light.png` next to the HTML. Look at both screenshots.
5. Fix failures that are bugs in your code: exceptions, missing metrics, ignored params, slowness, non-determinism. **Never edit `extraction.json` to make a test pass.** If reproduce or contrast still fails with an honest implementation, stop and report the observed values, the claim and your reading of why.
<!-- /claude-code -->
