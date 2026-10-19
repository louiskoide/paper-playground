# Paper → Playground

Paste a paper link, upload a PDF, or paste text. Get back:

1. **Playground**: one self-contained HTML figure that simulates the document's core idea. It is self-tested against a claim quoted from the document.
2. **Concept map**: a 3D t-SNE of the document's chunks, clustered and labeled.

The playground generator is a Claude skill (`skills/paper-playground/`). The web app uses the same files as its system prompt.

See [PLAN.md](PLAN.md). Structure borrowed from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).
