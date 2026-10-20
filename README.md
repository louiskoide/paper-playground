# Paper → Playground

Paste a paper link, upload a PDF, or paste text. Get back a **playground**: one self-contained HTML figure that simulates the document's core mechanism. It is self-tested against claims quoted from the document before anyone sees it.

The playground generator is a Claude skill (`skills/paper-playground/`). The web app will use the same files as its system prompts. See [PLAN.md](PLAN.md) for the design. The skill's structure is borrowed from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).

## Status

Phase 0, the skill alone, is done. All 5 eval cases pass in two consecutive runs: [evals/RESULTS.md](skills/paper-playground/evals/RESULTS.md). Because those all pass first time, repair and fallback are tested separately by planting bugs in passing playgrounds: 5/5 caught and repaired, 2/2 fallbacks pass ([evals/RECOVERY.md](skills/paper-playground/evals/RECOVERY.md)).

## Layout

- `skills/paper-playground/`
  - `EXTRACT.md`: extraction prompt. Picks the experiment, params, metrics and the reproduce/contrast claims.
  - `SKILL.md`: generation prompt and Claude Code skill.
  - `kernel.js`, `kernel.d.ts`, `template.html`: the runtime every playground is built on. The model never writes it.
  - `archetypes/`: seven worked examples, which are also the kernel's test suite.
  - `scripts/`: `build.mjs`, `selftest.mjs` (Playwright), `examples.mjs`, `run-eval.mjs`.
  - `evals/`: test cases and their latest artifacts.
- `lib/`: ingest, prompt assembly, model transport and quote checking, shared with the web app.

## Run it

```sh
npm install && npx playwright install chromium-headless-shell
npm run test:examples                                   # build + self-test the seven archetype examples
node skills/paper-playground/scripts/run-eval.mjs       # all eval cases through the web-app path
node skills/paper-playground/scripts/run-eval.mjs adam  # one case
node skills/paper-playground/scripts/test-recovery.mjs  # plant the bugs in evals/breaks.json, then repair; run each fallback
```

Evals call the model through `claude -p` (tool-less, settings-free) on your Claude login, so no API key is needed. Set `PP_TRANSPORT=api` with `ANTHROPIC_API_KEY` to use the Messages API instead. `PP_EXTRACT_MODEL` and `PP_GENERATE_MODEL` override the models, which default to `claude-opus-5-5`.

In Claude Code, working in this repo, the skill is available as `paper-playground` (symlinked from `.claude/skills/`).
