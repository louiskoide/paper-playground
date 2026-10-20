# Paper → Playground: plan

Status: **approved 2026-10-19.** Phase 0 done; Phase 1 (web app) not started. The concept map was dropped (see 10).

## Changes from the brief, and why

1. **The kernel is inlined by a build script, not by the model.** iso-figure's kernel is 15 lines, so "copy verbatim" is cheap there. Ours will be ~400 lines (8 chart types, controls, loop, guards, self-test). Having Opus re-emit it on every run costs output tokens and minutes, and any drift breaks the self-test. The model writes one `playground({...})` call. `build.mjs` wraps it with the kernel, the frozen extraction JSON and the CSP. Claude Code and the web app run the same `build`, so behavior stays identical and the kernel can't drift. The prompt carries `kernel.d.ts` (~80 lines), not the kernel source.
2. **Predicates are data over declared metrics, not code over state.** Extraction runs before the generator has named anything, so "loss after 200 steps < 0.05" can't refer to `state.loss`. Extraction declares named metrics (`loss`, `peak_day`). The generator must implement `metrics(state, params)` and return exactly those names. Predicates are a small JSON DSL that the kernel evaluates, so no test code is ever written by the model.
3. **Prefer relative predicates.** If the extractor guesses "entropy > 1.5" for a toy it hasn't built, that will be the main source of false failures. Contrast predicates compare against the reproduce run, e.g. "max weight ≥ 0.3 higher than reproduce" or "diverges where reproduce converges". Absolute thresholds are only for numbers that don't depend on the implementation (the R0 = 1 threshold, Adam's |Δθ| ≲ α). Extraction can also pin toy constants (`fixed`: sequence length, init scale) so the thresholds mean something.
4. **"Reproduce" means the mechanism on a toy, never a headline number.** No iframe will reproduce BLEU 28.4. The reproducible claim in *Attention* is §3.2.1: without scaling, large d_k saturates the softmax. The result badge should say "reproduces the mechanism in §3.2.1 on a toy model", not "reproduces §4.2", because the second wording overclaims.
5. **Archetype choice moves into extraction.** The generator gets only the chosen archetype file, which shortens the prompt and avoids blended archetypes. It also gets only the cited sections plus the extraction JSON, not the whole paper.
6. **Archetype 1 takes `deriv(y, p, t)` and the kernel integrates with RK4.** With model-written Euler, Lotka–Volterra spirals outward and large-dt SIR goes negative. The "divergence is a real result" readout would then present an integrator artifact as the paper's finding. `step(s, p, dt, rand)` stays available for discrete maps and stochastic models.
7. **"No playground" is a legitimate outcome.** If the main mechanism, a sub-mechanism and a diagram with a real derived quantity all fail, extraction returns `playable: false` with a reason. The result page then shows that reason. An archetype-7 diagram that computes nothing is still a fake figure.
8. **The fallback spec comes from the first extraction.** Falling back to archetype 7 needs different reproduce/contrast claims. Asking for them up front (the `fallback` field) saves an extraction round trip right when things are already failing.
9. **Evals run the web-app path, not just Claude Code.** (Transport: `claude -p --tools "" --system-prompt-file …`, so a tool-less one-shot call on your Claude login, no API key; swappable for the SDK.) In Claude Code the generator is agentic: it runs the self-test and fixes its own mistakes. The web app gets one shot plus one repair, so pass rates measured only in Claude Code would overstate the product. `scripts/run-eval.mjs` calls the API with the exact prompts the app will use (extract → generate → self-test → repair). Claude Code stays the development loop.
10. **No concept map.** A t-SNE map of the document's chunks was built (Phase 2) and dropped on 2026-10-19: it showed which topics a paper covers but explained none of them, and at ~40 chunks it mostly rediscovered the section headings.
11. **Models.** Extraction picks the claim, thresholds and params, which decides most of the quality. I'd start with Opus for both calls and let the evals show whether Sonnet is good enough for extraction. Both stay configurable.

## File tree

```
paper-playground/
  PLAN.md  README.md
  .claude/skills/paper-playground -> ../../skills/paper-playground   # Claude Code picks it up in-repo
  skills/paper-playground/
    SKILL.md                 # generation procedure + rules + look (system prompt for /api/generate)
    EXTRACT.md               # extraction procedure + schema (system prompt for /api/extract)
    kernel.js                # inlined by build.mjs; the model never sees or emits it
    kernel.d.ts              # the API the model reads
    template.html            # plate shell, CSP meta, slots
    archetypes/              # each: header comment with signatures + one complete, runnable example
      dynamical.js    dynamical.json      # .json = the example's extraction spec
      iterative.js    iterative.json
      sweep.js        sweep.json
      stochastic.js   stochastic.json
      pipeline.js     pipeline.json
      grid.js         grid.json
      diagram.js      diagram.json
    scripts/
      build.mjs              # extraction.json + playground.js → playground.html; validateExtraction(); --check
      selftest.mjs           # Playwright: load, __selftest(), drive controls, screenshot light+dark, phone width
      examples.mjs           # build + self-test the seven archetype examples (kernel test suite)
      run-eval.mjs           # web-app path per case: ingest → extract → generate → build → selftest → repair → fallback
    evals/
      RESULTS.md             # one row per case, regenerated each run
      attention/  { case.json, source.json, extraction.json, playground.js, playground.html, selftest.json, result.json, light.png, dark.png }
      adam/ sir/ oscillator/ bitter-lesson/
  lib/                       # shared by the eval runner and (Phase 1) the Next.js routes
    ingest.mjs               # arXiv HTML → ar5iv → PDF (unpdf); generic pages; MathML → text; pasted text
    prompts.mjs              # extraction / generation / repair prompt assembly, reply parsing, skill hash
    llm.mjs                  # transport: `claude -p` (keyless) or the Messages API
    quotes.mjs               # verbatim-quote check against the ingested text
  app/ ...                   # Phase 1+
```

Each archetype example has to pass its own self-test, so those seven examples also serve as the kernel's test suite.

## Kernel API (`kernel.d.ts`, abridged)

```ts
playground(def: Def): void   // mounts plate, controls, loop; params/metrics/selftest/title are injected from extraction.json

type Def = {
  caption: string                                   // bottom-left instruction, lowercase imperative
  init(p, rand): State
  metrics(s, p): Record<string, number>             // must return every declared metric, nothing hard-coded
  draw(g: G, s, p, m): void                         // only via g.* (see display list below)
  readout?(s, p, m): string                         // default: "step 120 · loss 0.031 · lr 0.01"
} & Archetype

// helpers in scope: rand() randn() fmt(x,d) clamp lerp linspace mean std softmax argmax

G:  g.split('2x1'|'1x2'|'2x2') → G[]
    g.axes({ x:[a,b], y:[a,b], xlabel, ylabel, xlog, ylog })
    g.line(xs, ys, { series, label, dash })   g.scatter(xs, ys, { series, r })
    g.bars(labels, values)                    g.hist(values, { bins, range })
    g.heatmap(M, { range, rowLabels, colLabels, diverging })
    g.field((x,y) => [u,v], { n })            g.cells(grid, { range })
    g.graph(nodes, edges, { draggable })      g.text / g.marker / g.vline / g.hline
```

Every `g.*` call is recorded into a display list, and a painter draws that list to a DPR-aware canvas. The self-test hashes the list, which gives a cheap, deterministic check for "the render changed". It also keeps the simulation core DOM-free, so the core can run in a Worker or in Node. Theme colors are read from CSS custom properties at paint time, so light and dark mode work on canvas too.

The kernel also provides:

- A fixed-timestep loop with play/pause/step/reset.
- A seeded RNG that is reseeded on reset and on every self-test run.
- `prefers-reduced-motion`, which starts the playground paused and skips easing.
- Native inputs for params, each with a `§3.2` chip that shows the quote on hover.
- A plate frame: `Fig 1` and the title on top, the caption and the readout (`aria-live`, throttled) at the bottom.
- A NaN/Infinity guard that halts the run and shows `diverged at step 143 · reset`.

**The look** follows the reference's restraint without its isometric drawing. Linework uses two greys, and one `--live` color marks whatever is live. Series 1 is drawn in the live color and series 2–4 in grey solid, dashed and dotted. Heatmaps use a single ramp from grey to live. Captions are 13px monospace, uppercase and letter-spaced. The figure is a single column at phone width.

## Archetype signatures

| # | archetype | functions | one "step" means |
|---|---|---|---|
| 1 | dynamical | `deriv(y,p,t)→dy` + `dt` (kernel RK4), or `step(s,p,dt,rand)` | one fixed dt |
| 2 | iterative | `step(s,p,rand)` | one iteration (step button) |
| 3 | sweep | `f(x,p)→y \| y[]`, `domain(p)→[x0,x1,n]` | n/a: pure function of params, play hidden |
| 4 | stochastic | `sample(p,rand)→number`, `batch` | one batch of samples into the live histogram |
| 5 | pipeline | `input(p,rand)`, `stages:[{name, run(x,p,rand), draw(g,out,p)}]` | advance one stage; all intermediates kept and clickable |
| 6 | grid | `update(grid,p,rand)→grid` (`grid = {w,h,data: Float32Array}`) | one update |
| 7 | diagram | `model(p)`, `constrain(model,p)` after drag, `derive(model,p)→metrics` | one drag/settle |

All seven also take `init`, `metrics`, `draw`, `readout` and `caption`.

## SKILL.md outline (generation)

1. What it produces: one figure whose controls produce a real output that traces back to the document.
2. Inputs: `extraction.json` is fixed and the generator never edits it. If it's missing in Claude Code, run EXTRACT.md in a subagent first and freeze its output. The cited sections are the other input.
3. The four rules: decide the output first; one state and one `render`; the kernel does the scaffolding; the self-test is the contract.
4. Procedure:
   - Confirm the mechanism can be built honestly. If not, output `{"refuse": "<reason>"}`, which triggers the fallback.
   - Write the archetype functions.
   - Write `metrics` with exactly the declared names.
   - Write `draw`, `readout` and `caption`.
   - Build, then (in Claude Code only) run the self-test.
5. Output format: exactly one ```js block calling `playground({...})`.
6. Look: the tokens, caption and readout style, and motion.
7. Don'ts:
   - Never rename params or metrics, and never hard-code a metric.
   - Use `rand()`, never `Math.random`.
   - No network and no libraries.
   - No new archetypes and no decorative params.
   - No simulation the document doesn't support.

## EXTRACT.md outline

The steps, in order:

1. Name the experiment.
2. Find a claim that can be reproduced on a toy: a mechanism that runs in under ~2s, not a benchmark number.
3. Write the param table: 3–6 params, each with a section and a verbatim quote.
4. Pick the archetype and give the reason.
5. Fall back if needed: try a sub-mechanism, then a diagram with a real derived quantity, then `playable:false`.
6. Declare the metrics and the `fixed` constants.
7. Write reproduce and contrast, using relative predicates where possible.
8. Write the fallback spec.

## Extraction JSON

```jsonc
{
  "schema": 1,
  "title": "Attention Is All You Need",
  "playable": true, "unplayable_reason": null,
  "experiment": "Raising d_k with scaling off pushes softmax toward one-hot, which is why §3.2.1 divides by √d_k.",
  "archetype": "pipeline",
  "archetype_reason": "attention is a fixed sequence of matrix stages on a toy input",
  "fixed": { "seq_len": 6, "qk_init": "N(0,1) per component" },
  "params": [
    { "name": "d_k", "label": "key dim", "kind": "range", "min": 4, "max": 512, "step": 4, "default": 64, "scale": "log", "unit": "",
      "source": { "section": "3.2.1", "quote": "We suspect that for large values of d_k, the dot products grow large in magnitude" } },
    { "name": "scaled", "label": "÷ √d_k", "kind": "toggle", "default": true, "source": { "section": "3.2.1", "quote": "..." } }
  ],                                         // kind: range | toggle | select(options)
  "metrics": [ { "name": "max_weight", "label": "max attn weight", "unit": "", "meaning": "mean over queries of the largest softmax weight" } ],
  "steps": 1,                                // N for the sweep
  "reproduce": {
    "claim": "With scaling, attention stays spread out even at d_k = 512.",
    "source": { "section": "3.2.1", "quote": "..." },
    "params": { "d_k": 512, "scaled": true }, "steps": 1,
    "expect": [ { "metric": "max_weight", "op": "<", "value": 0.8 } ]
  },
  "contrast": {
    "claim": "Without scaling the same d_k saturates the softmax.",
    "source": { "section": "3.2.1", "quote": "pushing the softmax function into regions where it has extremely small gradients" },
    "params": { "d_k": 512, "scaled": false }, "steps": 1,
    "expect": [ { "metric": "max_weight", "op": ">", "ref": "reproduce", "by": 0.3 } ]
  },
  "fallback": null                           // same shape with archetype "diagram", or null
}
```

Predicate ops:

- Absolute comparisons: `< <= > >=` and `between` against a `value`.
- Relative comparisons: the same ops with `ref:"reproduce"` plus `by` (additive) or `factor` (multiplicative).
- State checks: `diverges` (non-finite within N steps, or a metric past `bound`) and `finite`.

The server checks every `quote` against the ingested text with a fuzzy match. Any miss triggers one extraction retry, which is a cheap guard against invented citations.

## Self-test

`window.__selftest()` returns a Promise and also posts the result to the parent.

1. **Sweep.** For each param, the test tries min, default and max (both states for a toggle, every option for a select) and holds the other params at their defaults. It runs `steps` steps for each setting and checks four things:
   - nothing throws;
   - every metric is finite, or the run is flagged as diverged (allowed);
   - each run finishes in under 1.5s;
   - the display-list hash is recorded for the decorative check.
2. **Decorative check.** A param fails if neither the metrics nor the data marks (lines, points, bars, heatmaps, markers) change across its values. Titles, axes, text and hline/vline guides don't count, so a param that only moves a reference line drawn from itself fails. (Requiring a metric change instead would be wrong: Adam's corrected step is ≈ α whatever α, β1 and β2 are, and that invariance is the claim.)
3. **Constant-metric check.** A metric fails if it is identical across the whole sweep, which catches hard-coded values.
4. **Reproduce and contrast.** The test runs both settings and evaluates their predicates.
5. **Budget.** The whole self-test must finish in under 8s.

```jsonc
// iframe → parent
{ "type": "pp:selftest", "ok": false, "kernel": "0.1.0",
  "checks": [ { "id": "sweep:d_k:max", "ok": true, "ms": 4 },
              { "id": "decorative:scaled", "ok": true },
              { "id": "reproduce", "ok": true, "observed": { "max_weight": 0.41 }, "section": "3.2.1" },
              { "id": "contrast",  "ok": false, "observed": { "max_weight": 0.52 }, "expect": "max_weight > reproduce + 0.3" } ],
  "failures": [ "contrast: max_weight 0.52, expected > 0.71 (§3.2.1)" ] }
// parent → iframe: { "type": "pp:run-selftest" }   other messages: pp:ready, pp:param-hover {name, section}
```

`pp:param-hover` lets the host page highlight the source passage when someone hovers a control.

`selftest.mjs` (Playwright) runs the same self-test. It also sets real input values, presses play, step and reset, checks that the readout text changes, fails on any console error, and takes light and dark screenshots.

## Web app (Phase 1–3 summary)

- **Client-orchestrated stages.** Verification runs in the browser, so the client drives the pipeline: `/api/ingest` → `/api/extract` (stream) → `/api/generate` (stream) → verify in the iframe → `/api/repair` → fallback. Each route is its own function invocation, so each gets its own `maxDuration`. That keeps any single call well under Vercel's limits even when Opus generation takes 1–3 minutes.
- **Ingest.** For arXiv IDs, try `arxiv.org/html/<id>` first, then `ar5iv.labs.arxiv.org/html/<id>`, which covers both pre-2023 test papers. If neither exists, use the PDF via unpdf. From HTML, keep the section numbers and take the LaTeX from MathML `alttext` so equations survive. On the PDF path, sections come from a heading regex and equations will be degraded.
- **Sandbox.** The playground loads as `<iframe sandbox="allow-scripts" srcdoc>`. `build` injects a CSP meta tag as the first child of `<head>`: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:`. The parent checks `event.source === iframe.contentWindow`, because the iframe's origin is `"null"`.
- **Hang protection.** The kernel enforces a time budget between steps, and the parent runs a watchdog. A single `step()` that never returns can still freeze the tab if the browser keeps the sandboxed frame in-process. A Phase 1 spike will test running the self-test in a Worker spawned inside the iframe (the core is DOM-free) and calling `terminate()` on timeout.
- **Cache.** The key is sha256(normalized text) + a hash of the skill files, so editing SKILL.md invalidates old results.

## Keys

- **Phase 0:** none. Evals call the model through `claude -p`, which uses your Claude login.
- **Deployed app:** `ANTHROPIC_API_KEY` in Vercel env. A web server can't use a personal Claude login, so this one is unavoidable once strangers use the site.

## Test set

| case | source | expected | likely reproduce / contrast |
|---|---|---|---|
| attention | arXiv 1706.03762 (ar5iv) | 5 pipeline | §3.2.1: scaling keeps softmax spread / unscaled d_k=512 saturates |
| adam | arXiv 1412.6980 (both HTML conversions are empty, so this exercises the PDF fallback) | 2 iterative | §2.1: effective step ≲ α / §6.4: no bias correction with β2→1 is unstable early |
| sir | Cadoni & Gaeta, *Size and timescale of epidemics in the SIR framework* (arXiv 2004.13024, given as a PDF link) | 1 dynamical | how β, γ and containment change epidemic size and timescale. (Kermack & McKendrick 1927 was the first choice; its publisher returns 403 to scripts.) |
| oscillator | OpenStax *University Physics Vol. 1* §15.6 Forced Oscillations (CC BY), pasted | 1 or 3 | resonance peak near ω0 at low damping / heavy damping flattens it |
| bitter-lesson | Sutton, *The Bitter Lesson*, pasted | `playable:false` or honest 7 | **pass** = declines, or a diagram whose output is a real derived quantity. **fail** = any invented curve |

Document text isn't committed for copyrighted sources, because the repo is public. `case.json` records the source, and the ingested text is cached in a gitignored `.cache/`. `source.json` records the title, section ids and a hash of the text, so a change in ingest shows up in diffs. The OpenStax section is CC BY 4.0 and is committed with attribution.

## Main risks

1. **Extraction picks a claim that can't be reproduced or sets the wrong thresholds.** Mitigations are relative predicates, the `fixed` constants, the quote check, and reading every eval's extraction JSON by hand.
2. **The generator passes the test without the mechanism.** The decorative-param and constant-metric checks catch lazy cases, but a determined cheat would still pass. The self-test proves "consistent with the claim on this toy". The UI should say exactly that and nothing stronger.
3. **Tab freeze** from a `step()` that never returns. Covered by the Worker spike above.
4. **Phase 0 looks better than the product will be.** Covered by `run-eval.mjs` using the web-app path.
5. **PDF-only documents** have weaker section structure and garbled equations.
6. **Prompt injection from paper text.** The model calls have no tools, and the output runs in an opaque-origin sandbox with no network. The worst case is a misleading playground, and the quote check and self-test still apply to it.

## Phase 0 order

1. Write `kernel.js`, `kernel.d.ts`, `template.html`, `build.mjs` and `selftest.mjs`.
2. Write the seven archetype examples and their extraction JSONs. All of them pass the self-test, which shows the kernel works.
3. Write `EXTRACT.md` and `SKILL.md`.
4. Write `run-eval.mjs` and run it over the five cases. `RESULTS.md` records, per case: claim, archetype, self-test result, whether repair was needed, tokens and seconds.
5. Iterate on SKILL.md and EXTRACT.md until all five cases pass. Commit the results with each change so regressions show up in diffs.
