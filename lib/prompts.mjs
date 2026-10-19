// Prompt assembly for extraction, generation and repair. The web app and the eval runner both use
// these, so a change to SKILL.md or EXTRACT.md reaches both. System prompts depend only on the skill
// files and the archetype, so they cache across documents.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { docText } from './ingest.mjs';

const SKILL = new URL('../skills/paper-playground/', import.meta.url);
const read = f => readFileSync(new URL(f, SKILL), 'utf8');
const FULL_DOC_CHARS = 60000;

/** Hash of every file that shapes the output; part of the cache key, and recorded in eval results. */
export const skillHash = () => createHash('sha256')
  .update(['EXTRACT.md', 'SKILL.md', 'kernel.js', 'kernel.d.ts', 'template.html'].map(read).join('\0'))
  .update(['dynamical', 'iterative', 'sweep', 'stochastic', 'pipeline', 'grid', 'diagram'].map(a => read(`archetypes/${a}.js`) + read(`archetypes/${a}.json`)).join('\0'))
  .digest('hex').slice(0, 12);

const attr = s => String(s).replace(/"/g, '&quot;');
const docBlock = (doc, text, tag = 'document') => `<${tag} title="${attr(doc.title)}" source="${attr(doc.source || '')}">\n${text}\n</${tag}>`;

export function extractionPrompt(doc) {
  return {
    system: read('EXTRACT.md'),
    user: `${docBlock(doc, docText(doc))}\n\nWrite the extraction for this document.`,
  };
}

export function extractionRetry(doc, reply, problems) {
  const p = extractionPrompt(doc);
  return { system: p.system, user: `${p.user}\n\n<previous_attempt>\n${reply}\n</previous_attempt>\n\nThat extraction has these problems:\n${problems.map(x => `- ${x}`).join('\n')}\n\nWrite the corrected extraction. Same format.` };
}

/** Sections the extraction cites, plus their parents and subsections, plus the abstract. */
function citedContext(doc, x) {
  const cited = new Set([...(x.params || []), x.reproduce, x.contrast].map(c => String(c?.source?.section || '').replace(/^§/, '')).filter(Boolean));
  const full = docText(doc);
  if (full.length <= FULL_DOC_CHARS) return `${docBlock(doc, full)}\n\nThe extraction cites: ${[...cited].map(c => `§${c}`).join(', ')}.`;
  const hit = s => s.id === 'abstract' || [...cited].some(c => s.id === c || s.id.startsWith(`${c}.`) || c.startsWith(`${s.id}.`) || s.title.toLowerCase() === c.toLowerCase());
  return docBlock(doc, docText({ ...doc, sections: doc.sections.filter(hit) }), 'document_excerpt');
}

function generationSystem(archetype) {
  const skill = read('SKILL.md').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!-- claude-code -->[\s\S]*?<!-- \/claude-code -->/g, '').trim();
  return [
    skill,
    `## kernel.d.ts\n\n\`\`\`ts\n${read('kernel.d.ts').trim()}\n\`\`\``,
    `## Worked example: the ${archetype} archetype\n\nIts extraction:\n\n\`\`\`json\n${read(`archetypes/${archetype}.json`).trim()}\n\`\`\`\n\nIts playground:\n\n\`\`\`js\n${read(`archetypes/${archetype}.js`).trim()}\n\`\`\``,
  ].join('\n\n');
}

export function generationPrompt(x, doc) {
  return {
    system: generationSystem(x.archetype),
    user: `<extraction>\n${JSON.stringify(x, null, 2)}\n</extraction>\n\n${citedContext(doc, x)}\n\nWrite the playground for this extraction.`,
  };
}

export function repairPrompt(x, doc, code, failures) {
  const g = generationPrompt(x, doc);
  return {
    system: g.system,
    user: `${g.user}\n\n<previous_attempt>\n\`\`\`js\n${code}\n\`\`\`\n</previous_attempt>\n\n<selftest_failures>\n${failures.map(f => `- ${f}`).join('\n')}\n</selftest_failures>\n\n`
      + 'The previous attempt failed its self-test. Fix the causes. If a reproduce or contrast failure comes from an honest implementation of the document, keep it honest and explain in a // NOTE: comment instead of tuning constants to pass. Output the complete corrected playground in the same format.',
  };
}

/** Last fenced block of a reply: { kind: 'code', code } | { kind: 'refuse', reason } | { kind: 'json', value } | { kind: 'none' }. */
export function parseReply(text) {
  const fences = [...String(text).matchAll(/```([a-z]*)[ \t]*\n([\s\S]*?)```/g)];
  if (!fences.length) return { kind: 'none' };
  const [, lang, body] = fences[fences.length - 1];
  if (lang === 'json' || /^\s*\{/.test(body) && !/playground\(/.test(body)) {
    try { const value = JSON.parse(body); return value.refuse ? { kind: 'refuse', reason: value.refuse } : { kind: 'json', value }; }
    catch (e) { return { kind: 'bad-json', error: e.message, body }; }
  }
  return { kind: 'code', code: body.trim() };
}
