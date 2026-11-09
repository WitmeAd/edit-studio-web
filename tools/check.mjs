#!/usr/bin/env node
// Comprobaciones antes de publicar. Sin dependencias (Node 18 o superior).
//
//   node tools/check.mjs
//
// Revisa: que lo generado esté al día, que los datos estructurados sean JSON válido y coincidan
// con las preguntas visibles, que los enlaces y archivos internos existan, que cada página tenga
// título, descripción, canonical y un solo <h1>, que las imágenes tengan texto alternativo,
// y que no se cuelen palabras que no usamos de cara al público.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extractFaq } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://editstudio.app';
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// Palabras que no usamos de cara al público (ni en la web, ni en el blog, ni en llms.txt).
const FORBIDDEN = [
  [/(^|[^\p{L}\p{N}])IA(?![\p{L}\p{N}])/u, '«IA»'],
  [/(^|[^\p{L}])AI(?![\p{L}\p{N}])/u, '«AI»'],
  [/inteligencia\s+artificial/i, '«inteligencia artificial»'],
  [/\b(openai|chatgpt|gpt-?\d|gemini|anthropic|claude|replicate|midjourney|llm)\b/i, 'nombre de proveedor o de modelo'],
];

// ── 1. Lo generado está al día ──
try {
  execFileSync(process.execPath, [join(ROOT, 'tools/build.mjs'), '--check'], { stdio: 'pipe' });
} catch (e) {
  err('Lo generado no está al día: ' + String(e.stderr || e.stdout || e.message).trim());
}

// ── 2. Páginas ──
function pages() {
  const out = ['index.html'];
  const walk = (rel) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    for (const f of readdirSync(abs).sort()) {
      const r = rel + '/' + f;
      if (statSync(join(ROOT, r)).isDirectory()) walk(r);
      else if (f.endsWith('.html')) out.push(r);
    }
  };
  walk('blog');
  return out;
}
const unesc = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function visibleText(html) {
  return unesc(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/?(?:a|em|strong|span|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}
function attrTexts(html) {
  const out = [];
  const re = /\s(?:alt|title|aria-label|content)="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(unesc(m[1]));
  return out.join(' \n ');
}
function resolveLocal(page, url) {
  // Devuelve [ruta de archivo relativa a la raíz, ancla] o null si es externo.
  if (/^(https?:|mailto:|tel:|data:)/.test(url)) {
    if (!url.startsWith(SITE + '/') && url !== SITE) return null;
    url = url.slice(SITE.length) || '/';
  }
  let [path, hash = ''] = url.split('#');
  path = path.split('?')[0];
  let rel;
  if (path === '') rel = page;
  else if (path.startsWith('/')) rel = path.slice(1);
  else rel = join(dirname(page), path);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  else if (existsSync(join(ROOT, rel)) && statSync(join(ROOT, rel)).isDirectory()) rel += '/index.html';
  return [rel, hash];
}
const idCache = new Map();
function idsOf(rel) {
  if (!idCache.has(rel)) {
    const html = read(rel);
    idCache.set(rel, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(rel);
}

const canonicals = new Map();
for (const page of pages()) {
  const html = read(page);
  const where = page + ': ';

  // Cabecera
  const title = unesc((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '');
  const desc = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  const canon = (/<link rel="canonical" href="([^"]*)"/.exec(html) || [])[1];
  if (!title) err(where + 'falta <title>');
  else if (title.length > 65) warn(where + `título largo (${title.length} caracteres): los buscadores suelen cortar hacia los 60`);
  if (!desc) err(where + 'falta la descripción');
  else if (desc.length > 165) warn(where + `descripción larga (${desc.length} caracteres): los buscadores suelen cortar hacia los 155`);
  else if (desc.length < 70) warn(where + `descripción corta (${desc.length} caracteres)`);
  const expected = SITE + '/' + page.replace(/index\.html$/, '');
  if (!canon) err(where + 'falta el canonical');
  else if (canon !== expected) err(where + `canonical «${canon}», esperado «${expected}»`);
  if (canon) {
    if (canonicals.has(canon)) err(where + 'canonical repetido con ' + canonicals.get(canon));
    canonicals.set(canon, page);
  }
  if (!/<html lang="es"/.test(html)) err(where + 'falta lang="es"');
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
    if (!new RegExp(`<meta property="${p}" content="[^"]+"`).test(html)) err(where + 'falta ' + p);
  }
  const ogUrl = (/<meta property="og:url" content="([^"]*)"/.exec(html) || [])[1];
  if (ogUrl && canon && ogUrl !== canon) err(where + 'og:url distinto del canonical');
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(where + `tiene ${h1} <h1> (debe haber uno)`);
  if ((html.match(/<main[\s>]/g) || []).length !== 1) err(where + 'debe tener un <main>');

  // Datos estructurados
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) err(where + 'no tiene datos estructurados');
  const nodes = [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1]);
      if (data['@context'] !== 'https://schema.org') err(where + 'JSON-LD sin @context de schema.org');
      nodes.push(...(data['@graph'] || [data]));
    } catch (e) {
      err(where + 'JSON-LD no válido: ' + e.message);
    }
  }
  const ids = new Set(nodes.map((n) => n['@id']).filter(Boolean));
  const walkRefs = (v) => {
    if (Array.isArray(v)) return v.forEach(walkRefs);
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === '@id' && v['@id'].startsWith(SITE + '/#') && !ids.has(v['@id'])) {
        err(where + `JSON-LD: referencia a ${v['@id']} que no está definida en la página`);
      }
      keys.forEach((k) => walkRefs(v[k]));
    }
  };
  walkRefs(nodes);
  const ldText = JSON.stringify(nodes);
  if (/aggregateRating|"review"/i.test(ldText)) err(where + 'JSON-LD con valoraciones: solo si son reales y están visibles en la página');
  for (const u of ldText.match(/https:\/\/editstudio\.app\/[^"\\]*/g) || []) {
    const r = resolveLocal(page, u);
    if (r && !existsSync(join(ROOT, r[0]))) err(where + `JSON-LD apunta a ${u}, que no existe`);
  }
  if (page === 'index.html') {
    const faq = extractFaq(html);
    const node = nodes.find((n) => n['@type'] === 'FAQPage');
    if (faq.length && !node) err(where + 'hay preguntas visibles pero no FAQPage');
    if (node) {
      const ld = node.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));
      if (JSON.stringify(ld) !== JSON.stringify(faq)) err(where + 'las preguntas del JSON-LD no coinciden con las visibles');
      const vis = visibleText(html);
      for (const f of faq) if (!vis.includes(f.q) || !vis.includes(f.a)) err(where + `la pregunta «${f.q}» no está tal cual en el texto visible`);
    }
    for (const t of ['Organization', 'WebSite', 'MobileApplication']) if (!nodes.some((n) => n['@type'] === t)) err(where + 'falta ' + t + ' en el JSON-LD');
  } else if (page !== 'blog/index.html') {
    const post = nodes.find((n) => n['@type'] === 'BlogPosting');
    if (!post) err(where + 'falta BlogPosting');
    else {
      for (const k of ['headline', 'datePublished', 'dateModified', 'author', 'publisher', 'image', 'description']) if (!post[k]) err(where + 'BlogPosting sin ' + k);
      const h1Text = unesc(((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
      if (post.headline !== h1Text) err(where + 'el titular del JSON-LD no coincide con el <h1>');
      if (!visibleText(html).includes('min de lectura')) err(where + 'falta la línea de autoría y fecha');
    }
    if (!nodes.some((n) => n['@type'] === 'BreadcrumbList')) err(where + 'falta BreadcrumbList');
  }

  // Enlaces y archivos
  for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const url = unesc(m[2]);
    if (!url) { err(where + `${m[1]} vacío`); continue; }
    if (/^http:\/\//.test(url)) err(where + `enlace sin https: ${url}`);
    const r = resolveLocal(page, url);
    if (!r) continue;
    const [rel, hash] = r;
    if (!existsSync(join(ROOT, rel))) { err(where + `${url} no existe (${rel})`); continue; }
    if (hash && rel.endsWith('.html') && !idsOf(rel).has(hash)) err(where + `${url}: no hay ningún id="${hash}" en ${rel}`);
  }
  for (const m of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0])) err(where + 'enlace en pestaña nueva sin rel="noopener"');
  for (const m of html.matchAll(/<img\s[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) err(where + 'imagen sin alt: ' + m[0].slice(0, 80));
    if (!/\swidth="\d+"/.test(m[0]) || !/\sheight="\d+"/.test(m[0])) warn(where + 'imagen sin width/height: ' + ((/src="([^"]*)"/.exec(m[0]) || [])[1] || ''));
  }

  // Palabras que no usamos
  const text = visibleText(html) + ' \n ' + attrTexts(html) + ' \n ' + ldText;
  for (const [re, name] of FORBIDDEN) {
    const m = re.exec(text);
    if (m) err(where + `aparece ${name}: «…${text.slice(Math.max(0, m.index - 30), m.index + 30).trim()}…»`);
  }
}

// ── 3. Textos fuente y llms.txt ──
const textFiles = ['llms.txt', 'content/llms.txt'];
if (existsSync(join(ROOT, 'content/blog'))) for (const f of readdirSync(join(ROOT, 'content/blog')).sort()) if (f.endsWith('.md')) textFiles.push('content/blog/' + f);
for (const f of textFiles) {
  if (!existsSync(join(ROOT, f))) { if (f === 'llms.txt') err('falta llms.txt'); continue; }
  const text = read(f);
  for (const [re, name] of FORBIDDEN) {
    const m = re.exec(text);
    if (m) err(`${f}: aparece ${name}: «…${text.slice(Math.max(0, m.index - 30), m.index + 30).trim()}…»`);
  }
}
if (existsSync(join(ROOT, 'llms.txt'))) {
  const t = read('llms.txt');
  if (!/^# \S/.test(t)) err('llms.txt: debe empezar por un título «# »');
  if (!/^> \S/m.test(t)) err('llms.txt: falta el resumen en una cita «> »');
  if (t.includes('{{')) err('llms.txt: queda una marca sin sustituir');
  for (const m of t.matchAll(/\]\((https:\/\/editstudio\.app[^)\s]*)\)/g)) {
    const r = resolveLocal('index.html', m[1]);
    if (r && !existsSync(join(ROOT, r[0]))) err(`llms.txt: ${m[1]} no existe`);
    else if (r && r[1] && !idsOf(r[0]).has(r[1])) err(`llms.txt: ${m[1]}: no existe ese apartado`);
  }
}

// ── 4. sitemap.xml y robots.txt ──
if (!existsSync(join(ROOT, 'sitemap.xml'))) err('falta sitemap.xml');
else {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) {
    const r = resolveLocal('index.html', l);
    if (!r || !existsSync(join(ROOT, r[0]))) err(`sitemap.xml: ${l} no existe`);
    else if (!canonicals.has(l)) err(`sitemap.xml: ${l} no coincide con el canonical de su página`);
  }
  for (const c of canonicals.keys()) if (!locs.includes(c)) err(`sitemap.xml: falta ${c}`);
}
if (!existsSync(join(ROOT, 'robots.txt'))) err('falta robots.txt');
else if (!read('robots.txt').includes(`Sitemap: ${SITE}/sitemap.xml`)) err('robots.txt: falta la línea Sitemap');

// ── Resultado ──
for (const w of warns) console.log('AVISO  ' + w);
for (const e of errors) console.log('ERROR  ' + e);
console.log(`\n${pages().length} páginas revisadas · ${errors.length} errores · ${warns.length} avisos`);
process.exit(errors.length ? 1 : 0);
