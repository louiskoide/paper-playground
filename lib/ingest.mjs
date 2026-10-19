// Document ingest: arXiv id or URL, direct PDF URL, other web page, PDF bytes, or pasted text
//   → { title, source, via, sections: [{ id, title, text }] }
// arXiv: prefer arxiv.org/html, then ar5iv, then the PDF. A LaTeXML page that converted badly
// ("Untitled Document", almost no text) counts as missing.
import * as cheerio from 'cheerio';
import { extractText, getDocumentProxy } from 'unpdf';

const UA = 'paper-playground/0.1 (+https://github.com/louiskoide/paper-playground)';
const MIN_TEXT = 4000;
const clean = s => String(s).replace(/\s+/g, ' ').trim();

export function arxivId(s) {
  const m = String(s).trim().match(/^(?:arxiv:)?(\d{4}\.\d{4,5})(v\d+)?$/i)
    || String(s).match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?/i)
    || String(s).match(/ar5iv(?:\.labs)?\.arxiv\.org\/html\/(\d{4}\.\d{4,5})(v\d+)?/i);
  return m ? m[1] + (m[2] || '') : null;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, type: res.headers.get('content-type') || '', url: res.url };
}
const isPdf = (bytes, type) => /pdf/i.test(type) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
/** MathML → linear text (x^2, (a)/(b), √(x)) for pages without LaTeX alttext. Annotation copies are dropped. */
function mathText($, el) {
  const wrap = s => (s.length > 1 ? `{${s}}` : s);
  const rec = n => {
    if (n.type === 'text') return n.data;
    if (n.type !== 'tag') return '';
    const name = n.tagName.toLowerCase().replace(/^m:/, ''), k = () => $(n).children().toArray().map(rec);
    if (name === 'annotation' || name === 'annotation-xml') return '';
    if (name === 'mfrac') { const [a, b] = k(); return `(${a})/(${b})`; }
    if (name === 'msup') { const [a, b] = k(); return `${a}^${wrap(b)}`; }
    if (name === 'msub') { const [a, b] = k(); return `${a}_${wrap(b)}`; }
    if (name === 'msubsup') { const [a, b, c] = k(); return `${a}_${wrap(b)}^${wrap(c)}`; }
    if (name === 'msqrt') return `√(${k().join('')})`;
    return $(n).contents().toArray().map(rec).join('');
  };
  return clean(rec(el));
}
const replaceMath = $ => $('math').each((_, m) => { const tex = $(m).attr('alttext'); $(m).replaceWith(tex ? ` $${tex}$ ` : ` ${mathText($, m)} `); });
const textLength = doc => doc.sections.reduce((n, s) => n + s.text.length, 0);

export async function ingest(input) {
  if (input.text != null) return { ...parsePlain(input.text, input.title), source: 'paste', via: 'paste' };
  if (input.pdf) return { ...(await parsePdf(input.pdf)), source: input.name || 'upload', via: 'pdf' };
  const url = String(input.url).trim(), id = arxivId(url);
  if (id) {
    const tried = [];
    for (const [via, u] of [['arxiv-html', `https://arxiv.org/html/${id}`], ['ar5iv', `https://ar5iv.labs.arxiv.org/html/${id}`]]) {
      try {
        const { bytes } = await get(u), doc = parseLatexml(new TextDecoder().decode(bytes));
        if (textLength(doc) >= MIN_TEXT && !/untitled document/i.test(doc.title)) return { ...doc, source: `arXiv:${id}`, via };
        tried.push(`${via}: conversion empty`);
      } catch (e) { tried.push(`${via}: ${e.message}`); }
    }
    const { bytes } = await get(`https://arxiv.org/pdf/${id}`), doc = await parsePdf(bytes);
    doc.title = (await arxivTitle(id).catch(() => null)) || doc.title;
    return { ...doc, source: `arXiv:${id}`, via: 'pdf', notes: tried };
  }
  const { bytes, type, url: final } = await get(url);
  if (isPdf(bytes, type)) return { ...(await parsePdf(bytes)), source: final, via: 'pdf' };
  const html = new TextDecoder().decode(bytes);
  const doc = /class="ltx_/.test(html) ? parseLatexml(html) : parseHtmlPage(html);
  return { ...doc, source: final, via: 'html' };
}

async function arxivTitle(id) {
  const { bytes } = await get(`https://export.arxiv.org/api/query?id_list=${id.replace(/v\d+$/, '')}`);
  const m = new TextDecoder().decode(bytes).match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
  return m ? clean(m[1]) : null;
}

/** LaTeXML output (arxiv.org/html, ar5iv). Math becomes $alttext$, footnotes are kept inline. */
export function parseLatexml(html) {
  const $ = cheerio.load(html);
  replaceMath($);
  $('.ltx_note').each((_, n) => {
    const c = $(n).find('.ltx_note_content').first(); c.find('.ltx_note_mark, .ltx_tag_note').remove();
    $(n).replaceWith(c.length ? ` [footnote: ${clean(c.text())}] ` : '');
  });
  $('script, style, nav, header, footer, .ltx_bibliography, .ltx_page_footer, .ltx_page_header, .ltx_dates, .ltx_authors, .ltx_TOC, .package-alerts, .ltx_role_footnotetext').remove();
  const title = clean($('h1.ltx_title_document').first().text()) || clean($('title').text());
  const sections = [];
  const abs = $('.ltx_abstract').first();
  if (abs.length) { sections.push({ id: 'abstract', title: 'Abstract', parts: abs.find('p').map((_, p) => clean($(p).text())).get() }); abs.remove(); }
  let cur = null;
  const push = t => { if (!t) return; if (!cur) { cur = { id: 'intro', title: '', parts: [] }; sections.push(cur); } cur.parts.push(t); };
  const containers = 'table.ltx_tabular, figcaption, table.ltx_equation, table.ltx_equationgroup, .ltx_listing';
  $('h2, h3, h4, h5, h6, p.ltx_p, table.ltx_equation, table.ltx_equationgroup, figcaption, .ltx_listing, table.ltx_tabular').each((_, el) => {
    const e = $(el), tag = el.tagName.toLowerCase();
    if (e.parents(containers).length) return;
    if (/^h[2-6]$/.test(tag)) {
      if (e.hasClass('ltx_title_paragraph') || e.hasClass('ltx_title_subparagraph')) { push(`**${clean(e.text())}**`); return; }
      const tagText = clean(e.find('.ltx_tag').first().text()).replace(/[.:]$/, '');
      e.find('.ltx_tag').remove();
      cur = { id: tagText || clean(e.text()).toLowerCase().slice(0, 40), title: clean(e.text()), parts: [] };
      sections.push(cur);
    } else if (tag === 'table' && e.hasClass('ltx_tabular')) {
      push(e.find('tr').map((_, r) => $(r).find('td, th').map((_, c) => clean($(c).text())).get().join(' | ')).get().join('\n'));
    } else if (e.hasClass('ltx_listing')) {
      push(e.find('.ltx_listingline').map((_, l) => clean($(l).text())).get().join('\n') || clean(e.text()));
    } else push(clean(e.text()));
  });
  return finish(title, sections);
}

/** Generic article page: headings split sections, paragraphs and list items become text. */
export function parseHtmlPage(html) {
  const $ = cheerio.load(html);
  replaceMath($);
  $('script, style, nav, header, footer, aside, form, noscript, svg, button').remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  const title = clean(root.find('h1').first().text()) || clean($('title').text());
  const sections = []; let cur = null, n = 0;
  root.find('[data-type="equation"]').each((_, el) => {
    const e = $(el), num = clean(e.find('.os-number').text()); e.find('.os-equation-number, .os-number').remove();
    e.replaceWith(`<p>${clean(e.text())}${num ? ` (${num})` : ''}</p>`);
  });
  root.find('h1, h2, h3, h4, p, li, blockquote, pre, figcaption, tr').each((_, el) => {
    const e = $(el), tag = el.tagName.toLowerCase();
    if (e.parents('li, blockquote, figcaption, tr').length && tag !== 'tr') return;
    if (/^h[1-4]$/.test(tag)) {
      const t = clean(e.text()), num = t.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);
      cur = { id: num ? num[1] : `s${++n}`, title: num ? num[2] : t, parts: [] }; sections.push(cur); return;
    }
    const t = tag === 'tr' ? e.find('td, th').map((_, c) => clean($(c).text())).get().join(' | ') : clean(e.text());
    if (!t) return;
    if (!cur) { cur = { id: 's0', title: '', parts: [] }; sections.push(cur); }
    cur.parts.push(tag === 'li' ? `- ${t}` : t);
  });
  const doc = finish(title, sections);
  return textLength(doc) >= 500 ? doc : parsePlain(htmlToText(html), title);
}

/** Visible text of a page, with block boundaries as blank lines (for pages that are bare text and <br>s). */
export function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, aside, form, noscript, svg, button, title').remove();
  $('br').replaceWith('\n');
  $('p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre').each((_, el) => { $(el).prepend('\n\n').append('\n\n'); });
  return $('body').text().split(/\n{2,}/).map(clean).filter(Boolean).join('\n\n');
}

/** Pasted text: markdown or numbered headings split sections; otherwise one section. */
export function parsePlain(text, title) {
  const lines = String(text).replace(/\r/g, '').split('\n'), sections = []; let cur = null, n = 0;
  for (const raw of lines) {
    const l = raw.trim(), md = l.match(/^#{1,4}\s+(.*)$/), num = !md && l.length < 90 && !/[.:;,]$/.test(l) && l.match(/^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z].*)$/);
    if (md || num) {
      const t = md ? md[1].trim() : num[2], tagged = md && t.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);
      cur = { id: num ? num[1] : tagged ? tagged[1] : `s${++n}`, title: tagged ? tagged[2] : t, parts: [] }; sections.push(cur); continue;
    }
    if (!cur) { cur = { id: 's0', title: '', parts: [] }; sections.push(cur); }
    cur.parts.push(raw);
  }
  const doc = finish(title || sections.find(s => s.title)?.title || 'Pasted text', sections, '\n');
  if (!title && sections[0]?.id === 's1' && !sections[0].text) doc.sections.shift();
  return doc;
}

/** PDF: numbered headings (monotonically increasing) split sections; otherwise one section per page. */
export async function parsePdf(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map(t => t.replace(/-\n(?=[a-z])/g, '').split('\n').map(l => l.trim()));
  const firstLines = pages[0].filter(Boolean);
  const title = clean(firstLines.slice(0, 2).join(' ')).slice(0, 200);
  const key = id => id.split('.').map(Number).reduce((a, v, i) => a + v * 100 ** (3 - i), 0);
  const sections = []; let cur = { id: 'front', title: '', parts: [] }, last = -1, stop = false;
  sections.push(cur);
  pages.forEach((lines, p) => {
    if (stop) return;
    for (const l of lines) {
      if (/^(references|bibliography)$/i.test(l)) { stop = true; break; }
      const h = l.length < 90 && !/[.,;]$/.test(l) && l.match(/^(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+([A-Z][^=<>]{2,80})$/);
      if (h && key(h[1]) > last && key(h[1]) - last < 2e6 + 1) { last = key(h[1]); cur = { id: h[1], title: h[2], parts: [] }; sections.push(cur); continue; }
      if (/^(abstract)$/i.test(l)) { cur = { id: 'abstract', title: 'Abstract', parts: [] }; sections.push(cur); continue; }
      cur.parts.push(l);
    }
  });
  const numbered = sections.filter(s => /^\d/.test(s.id)).length;
  if (numbered >= 2) return finish(title, sections, '\n');
  return finish(title, pages.map((lines, i) => ({ id: `p. ${i + 1}`, title: '', parts: lines })), '\n');
}

function finish(title, sections, joiner = '\n\n') {
  return {
    title: clean(title),
    sections: sections
      .map(s => ({ id: s.id, title: s.title, text: s.parts.join(joiner).replace(/\n{3,}/g, '\n\n').trim() }))
      .filter(s => s.text || s.title),
  };
}

/** The document as one string with section markers, for prompts. */
const GENERATED_ID = /^(abstract|intro|front|s\d+)$/; // ids ingest made up; everything else is the document's own label (3.2.1, II.1, A, p. 4)
export const docText = doc => doc.sections.map(s => `## ${GENERATED_ID.test(s.id) ? '' : `§${s.id} `}${s.title}\n\n${s.text}`).join('\n\n');

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node lib/ingest.mjs <arXiv id | url | file.pdf | file.txt>'); process.exit(2); }
  const { readFileSync, existsSync } = await import('node:fs');
  const input = existsSync(arg) ? (arg.endsWith('.pdf') ? { pdf: readFileSync(arg), name: arg } : { text: readFileSync(arg, 'utf8') }) : { url: arg };
  const doc = await ingest(input);
  console.log(JSON.stringify(doc, null, 2));
}
