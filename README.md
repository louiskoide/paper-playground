# Paper → Playground

Paste a paper link, upload a PDF, or paste text. Get back:

1. **Playground**: one self-contained HTML figure that simulates the document's core mechanism. It is self-tested against claims quoted from the document before anyone sees it.
2. **Concept map**: a t-SNE of the document's chunks, clustered and labeled, in 2D or 3D.

The playground generator is a Claude skill (`skills/paper-playground/`). The web app will use the same files as its system prompts. See [PLAN.md](PLAN.md) for the design. The skill's structure is borrowed from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).

## Status

Phase 0, the skill alone, is done. All 5 eval cases pass in two consecutive runs: [evals/RESULTS.md](skills/paper-playground/evals/RESULTS.md). Because those all pass first time, repair and fallback are tested separately by planting bugs in passing playgrounds: 5/5 caught and repaired, 2/2 fallbacks pass ([evals/RECOVERY.md](skills/paper-playground/evals/RECOVERY.md)).

Phase 2, the concept map, runs on all 5 cases and its viewer passes its Playwright checks: [evals/MAPS.md](skills/paper-playground/evals/MAPS.md). Embeddings are local, so the only model call is one Haiku request per document for the cluster labels. The Phase 1 web app is not built yet; the map code lives in `lib/` so the app's `/api/map` route can call `buildMap(doc)` directly.

## Layout

- `skills/paper-playground/`
  - `EXTRACT.md`: extraction prompt. Picks the experiment, params, metrics and the reproduce/contrast claims.
  - `SKILL.md`: generation prompt and Claude Code skill.
  - `kernel.js`, `kernel.d.ts`, `template.html`: the runtime every playground is built on. The model never writes it.
  - `archetypes/`: seven worked examples, which are also the kernel's test suite.
  - `scripts/`: `build.mjs`, `selftest.mjs` (Playwright), `examples.mjs`, `run-eval.mjs`.
  - `evals/`: test cases and their latest artifacts.
- `lib/`: ingest, prompt assembly, model transport and quote checking, shared with the web app.
  - `map.mjs`: concept map. Chunking (150–300 tokens), bge-small embeddings via transformers.js, cosine k-means with k by silhouette, seeded t-SNE (PCA below 30 chunks), Haiku cluster labels.
  - `map-view.mjs`: the map viewer, one self-contained canvas page with a 2D/3D toggle, hover text, legend and table. It highlights a section's passages on `pp:param-hover`.
- `scripts/map.mjs`: builds and checks the map for each eval case.

## Run it

```sh
npm install && npx playwright install chromium-headless-shell
npm run test:examples                                   # build + self-test the seven archetype examples
node skills/paper-playground/scripts/run-eval.mjs       # all eval cases through the web-app path
node skills/paper-playground/scripts/run-eval.mjs adam  # one case
node skills/paper-playground/scripts/test-recovery.mjs  # plant the bugs in evals/breaks.json, then repair; run each fallback
npm run map                                             # concept map for every case; writes evals/MAPS.md (add --no-label to skip Haiku)
```

Evals call the model through `claude -p` (tool-less, settings-free) on your Claude login, so no API key is needed. Set `PP_TRANSPORT=api` with `ANTHROPIC_API_KEY` to use the Messages API instead. `PP_EXTRACT_MODEL` and `PP_GENERATE_MODEL` override the models, which default to `claude-opus-5-5`; `PP_LABEL_MODEL` overrides the map's label model (`claude-haiku-5-5`). The embedding model (~35 MB) downloads from Hugging Face on first run; no key needed.

In Claude Code, working in this repo, the skill is available as `paper-playground` (symlinked from `.claude/skills/`).
