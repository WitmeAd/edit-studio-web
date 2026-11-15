// Traducción de la portada sin duplicar su código.
//
// La portada (index.html, en español) se recorre en «tramos» de texto: el texto seguido que queda entre dos etiquetas de
// bloque (p, h2, li, summary…), con sus etiquetas de línea (em, strong, span, a, br, svg…) sustituidas por marcas:
//   «Tres <em>looks</em>.»  ->  «Tres {0}looks{/0}.»     (las de un solo elemento, como <br> o <svg>, son {0/})
// También se traducen los atributos que se leen (alt, aria-label, title, data-tema, data-num, data-nombre y el content de
// las etiquetas para buscadores y para compartir) y unas pocas frases de los scripts (SCRIPT_STRINGS).
//
// content/i18n/<idioma>.json lleva { "portada": { "texto en español": "traducción" } }. Si cambia un texto de la
// portada, su traducción deja de encajar y tools/build.mjs lo dice: hay que traducir de nuevo esa frase.
// tools/build.mjs escribe además content/i18n/_catalogo-portada.json con todos los textos que se traducen.

const INLINE = new Set(['em', 'strong', 'b', 'i', 'span', 'a', 'small', 'time', 'abbr', 'sup', 'sub', 'u', 'mark', 'bdi', 'q', 'cite', 'code']);
const ATOMIC = new Set(['br', 'img', 'svg', 'wbr', 'input', 'source']);
const SKIP_BLOCKS = ['script', 'style', 'template'];
const ATTRS = ['alt', 'aria-label', 'title', 'placeholder', 'data-tema', 'data-num', 'data-nombre'];
const META_CONTENT = /^(?:name="(?:description|twitter:image:alt|twitter:title|twitter:description)"|property="og:(?:title|description|image:alt)")$/;
export const SCRIPT_STRINGS = ['Pausar vídeo: ', 'Reproducir vídeo: ', 'Pausar carrusel', 'Reanudar carrusel'];

// Tramos que no se traducen: lo que genera el propio build (datos estructurados, lista del blog) y los comentarios.
const REGIONS = [
  ['<!-- datos-estructurados:inicio', '<!-- datos-estructurados:fin -->'],
  ['<!-- blog:inicio', '<!-- blog:fin -->'],
  ['<!-- idiomas:inicio', '<!-- idiomas:fin -->'],
];

const hasWords = (s) => /\p{L}{2,}/u.test(s.replace(/\{\/?\d+\/?\}/g, '').replace(/\bédit\b|\bé\b|\bdit\b/g, ''));
const norm = (s) => s.replace(/[ \t\n\r]+/g, ' ').replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
const unesc = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const esc = (s) => s.replace(/&(?!(?:[a-z]+|#\d+);)/g, '&amp;').replace(/ /g, '&nbsp;');

// Divide el HTML en piezas: { t: 'text' | 'tag' | 'raw', s }.
function tokenize(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    // Tramos generados y comentarios: tal cual.
    const region = REGIONS.find(([a]) => html.startsWith(a, i));
    if (region) {
      const end = html.indexOf(region[1], i);
      const j = end === -1 ? html.length : end + region[1].length;
      out.push({ t: 'raw', s: html.slice(i, j) }); i = j; continue;
    }
    if (html.startsWith('<!DOCTYPE', i) || html.startsWith('<!doctype', i)) {
      const j = html.indexOf('>', i) + 1;
      out.push({ t: 'raw', s: html.slice(i, j) }); i = j; continue;
    }
    if (html.startsWith('<!--', i)) {
      const j = html.indexOf('-->', i) + 3;
      out.push({ t: 'raw', s: html.slice(i, j) }); i = j; continue;
    }
    if (html[i] === '<') {
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/.exec(html.slice(i, i + 4000));
      if (!m) { out.push({ t: 'text', s: '<' }); i++; continue; }
      const name = m[2].toLowerCase();
      if (!m[1] && SKIP_BLOCKS.includes(name)) {
        const close = html.indexOf(`</${name}>`, i);
        const j = close + name.length + 3;
        out.push({ t: 'raw', s: html.slice(i, j), script: name === 'script' }); i = j; continue;
      }
      if (!m[1] && name === 'svg') {
        const close = html.indexOf('</svg>', i) + 6;
        out.push({ t: 'tag', s: html.slice(i, close), name, atomic: true }); i = close; continue;
      }
      out.push({ t: 'tag', s: m[0], name, close: !!m[1], attrs: m[3] }); i += m[0].length; continue;
    }
    const j = html.indexOf('<', i);
    const end = j === -1 ? html.length : j;
    out.push({ t: 'text', s: html.slice(i, end) }); i = end;
  }
  return out;
}

// Atributos de una etiqueta que se traducen, con su valor.
function translatableAttrs(tagStr) {
  const out = [];
  for (const a of ATTRS) {
    const m = new RegExp(`\\s${a}="([^"]*)"`).exec(tagStr);
    if (m && hasWords(unesc(m[1]))) out.push({ attr: a, value: m[1] });
  }
  if (/^<meta\s/i.test(tagStr)) {
    const sel = /\s((?:name|property)="[^"]*")/.exec(tagStr);
    const c = /\scontent="([^"]*)"/.exec(tagStr);
    if (sel && c && META_CONTENT.test(sel[1]) && hasWords(unesc(c[1]))) out.push({ attr: 'content', value: c[1] });
  }
  return out;
}

// Recorre la portada y llama a tr(textoFuente, tipo) por cada texto traducible. Devuelve el HTML con lo que devuelva tr.
export function transform(html, tr) {
  const toks = tokenize(html);
  let out = '';
  let run = [];
  const fixTag = (tok) => {
    if (tok.t !== 'tag') return tok.s;
    let s = tok.s;
    if (tok.atomic) {
      // Dentro de un <svg> solo se traducen los <title> y aria-label que lleve.
      return s.replace(/(\saria-label=")([^"]*)"/g, (m, a, v) => (hasWords(unesc(v)) ? `${a}${esc(tr(norm(unesc(v)), 'attr'))}"` : m))
        .replace(/<title>([^<]*)<\/title>/g, (m, v) => (hasWords(unesc(v)) ? `<title>${esc(tr(norm(unesc(v)), 'attr'))}</title>` : m));
    }
    for (const { attr, value } of translatableAttrs(s)) {
      const t = tr(norm(unesc(value)), 'attr');
      s = s.replace(`${attr}="${value}"`, `${attr}="${esc(t).replace(/"/g, '&quot;')}"`);
    }
    return s;
  };
  const flush = () => {
    if (!run.length) return;
    // Marcas para las etiquetas de línea, en orden de aparición.
    const tags = [];
    const open = [];
    let src = '';
    for (const tok of run) {
      if (tok.t === 'text') { src += tok.s; continue; }
      const fixed = fixTag(tok);
      if (tok.atomic || ATOMIC.has(tok.name)) { tags.push(fixed); src += `{${tags.length - 1}/}`; continue; }
      if (!tok.close) { tags.push(fixed); open.push({ name: tok.name, n: tags.length - 1 }); src += `{${tags.length - 1}}`; continue; }
      const k = open.map((o) => o.name).lastIndexOf(tok.name);
      if (k === -1) { tags.push(fixed); src += `{${tags.length - 1}/}`; continue; }
      const { n } = open.splice(k, 1)[0];
      tags[n] = { open: tags[n], close: fixed };
      src += `{/${n}}`;
    }
    // Etiquetas abiertas que no se cierran en el tramo: pasan a ser marcas sueltas.
    for (const { n } of open) { src = src.replace(`{${n}}`, `{${n}/}`); }
    const lead = /^[ \t\n\r]*/.exec(src)[0], trail = /[ \t\n\r]*$/.exec(src)[0];
    const key = norm(unesc(src));
    let body;
    if (hasWords(key)) {
      const t = tr(key, 'text');
      body = lead + restore(t, tags, key) + trail;
    } else {
      body = restore(src, tags, null);
    }
    out += body;
    run = [];
  };
  for (const tok of toks) {
    if (tok.t === 'raw') { flush(); out += tok.script ? scriptStrings(tok.s, tr) : tok.s; continue; }
    if (tok.t === 'text' || (tok.t === 'tag' && (INLINE.has(tok.name) || ATOMIC.has(tok.name) || tok.atomic))) { run.push(tok); continue; }
    flush();
    out += fixTag(tok);
  }
  flush();
  return out;
}

function restore(text, tags, key) {
  const want = (s) => (s.match(/\{\/?\d+\/?\}/g) || []).sort().join();
  if (key !== null && want(text) !== want(key)) throw new Error(`las marcas no coinciden:\n  original: ${key}\n  traducción: ${text}`);
  let s = key === null ? text : esc(text);
  s = s.replace(/\{(\/?)(\d+)(\/?)\}/g, (_, c, n, a) => {
    const t = tags[+n];
    if (a) return typeof t === 'string' ? t : t.open + t.close;
    if (c) return t.close;
    return typeof t === 'string' ? t : t.open;
  });
  return s;
}

function scriptStrings(s, tr) {
  if (/type="application\/ld\+json"/.test(s)) return s;
  let out = s;
  for (const str of SCRIPT_STRINGS) {
    if (out.includes(`'${str}'`)) out = out.split(`'${str}'`).join(`'${tr(str, 'script').replace(/'/g, "\\'")}'`);
  }
  return out;
}

// Todos los textos traducibles de una página, sin repetir.
export function catalog(html) {
  const seen = new Map();
  transform(html, (src, kind) => { if (!seen.has(src)) seen.set(src, kind); return src; });
  return [...seen.entries()].map(([src, kind]) => ({ src, kind }));
}
