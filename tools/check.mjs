#!/usr/bin/env node
// Comprobaciones antes de publicar. Sin dependencias (Node 18 o superior).
//
//   node tools/check.mjs
//
// Revisa: que lo generado esté al día, que los datos estructurados sean JSON válido y coincidan
// con las preguntas visibles, que los enlaces y archivos internos existan (también pósters y vídeos),
// que cada página tenga título (único), descripción, canonical, un solo <h1> y titulares sin saltos
// de nivel, que las imágenes tengan texto alternativo y medidas, que la imagen para compartir declare
// su tamaño y su texto alternativo, que las fechas de los datos estructurados lleven zona horaria,
// que 404.html tenga noindex y no esté en el sitemap, y que no se cuelen dominios ajenos, enlaces a los
// prototipos de /new/ ni palabras que no usamos de cara al público (en el texto, en los atributos y en
// los datos estructurados). En la portada, además: las anclas estables, los vídeos (póster con medidas,
// descripción, sin precarga), la precarga del póster de cabecera, los botones de descarga y que la fecha
// de la portada (homeUpdated) no se haya quedado atrás.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extractFaq, imageSize, homeUpdated } from './build.mjs';

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

// Dominio propio. Cualquier otro dominio escrito en el texto visible (por ejemplo «edit.app») es ajeno.
const OWN_DOMAIN = 'editstudio.app';
const DOMAIN_RE = /(?<![\p{L}\p{N}@.-])((?:[a-z0-9-]+\.)+(?:app|com|es|net|org|io|studio|dev|co|eu|me|info|shop|store|online|site|web|xyz))(?![\p{L}\p{N}-])/gu;
function foreignDomains(text) {
  const out = new Set();
  for (const m of text.matchAll(DOMAIN_RE)) if (m[1] !== OWN_DOMAIN && !m[1].endsWith('.' + OWN_DOMAIN)) out.add(m[1]);
  return [...out];
}

// Fechas de los datos estructurados: con hora y zona horaria (2026-11-10T09:00:00+01:00).
const DATE_KEYS = new Set(['datePublished', 'dateModified', 'dateCreated', 'uploadDate']);
const DATE_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;

// Anclas de la portada que no se pueden perder: las usan la barra, el índice, el blog, llms.txt y enlaces de fuera.
const HOME_ANCHORS = ['indice', 'armario', 'probador', 'looks', 'a-tu-medida', 'planes', 'asesora', 'profesionales', 'preguntas', 'blog', 'descargar'];
// «Descargar» va al ancla con las dos insignias (y, con JavaScript, a la tienda del móvil): esta dirección, en un
// ordenador, acaba en el inicio de sesión.
const OLD_DOWNLOAD = 'dashboard.editstudio.app/descargar';
const STORE_RE = /^https:\/\/(apps\.apple\.com|play\.google\.com)\//;
// Archivos del sitio a los que apunta alguna página (para avisar de los que sobran en assets/).
const used = new Set();

// ── 1. Lo generado está al día ──
try {
  execFileSync(process.execPath, [join(ROOT, 'tools/build.mjs'), '--check'], { stdio: 'pipe' });
} catch (e) {
  err('Lo generado no está al día: ' + String(e.stderr || e.stdout || e.message).trim());
}

// ── 2. Páginas ──
// 404.html se sirve en cualquier dirección que no exista: lleva noindex y no lleva descripción, canonical,
// etiquetas para compartir ni datos estructurados.
const NOT_FOUND = '404.html';
if (!existsSync(join(ROOT, NOT_FOUND))) err('falta 404.html (lo genera tools/build.mjs)');
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
  if (existsSync(join(ROOT, NOT_FOUND))) out.push(NOT_FOUND);
  return out;
}
const unesc = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function visibleText(html) {
  return unesc(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/?(?:a|em|strong|span|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}
function attrTexts(html) {
  const out = [];
  const re = /\s(?:alt|title|aria-label|aria-description|placeholder|content|data-[\w-]+)="([^"]*)"/g;
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

// Comprobaciones propias de la portada.
function checkHome(html, where) {
  const ids = idsOf('index.html');
  for (const a of HOME_ANCHORS) if (!ids.has(a)) err(where + `falta el ancla #${a}`);

  // Vídeos: cada película lleva su fotograma fijo (una imagen con medidas) y un vídeo mudo, con medidas, sin precarga
  // y con la descripción de lo que se ve.
  const films = html.split(/(?=<div class="film[\s"])/).slice(1);
  const nVideos = (html.match(/<video[\s>]/g) || []).length;
  if (!films.length) err(where + 'no encuentro ninguna película (<div class="film" data-film>)');
  if (nVideos !== films.length) err(where + `hay ${nVideos} <video> y ${films.length} películas: cada vídeo va dentro de su <div class="film">`);
  films.forEach((chunk, i) => {
    const w = `${where}vídeo «${(/data-nombre="([^"]*)"/.exec(chunk) || [])[1] || 'n.º ' + (i + 1)}»: `;
    const poster = /<img class="film__poster"[^>]*>/.exec(chunk);
    const video = /<video\s[^>]*>/.exec(chunk);
    if (!poster) err(w + 'falta el fotograma fijo (<img class="film__poster">)');
    else if (!/\swidth="\d+"/.test(poster[0]) || !/\sheight="\d+"/.test(poster[0])) err(w + 'el fotograma fijo no declara width y height');
    if (!video) { err(w + 'falta <video>'); return; }
    const v = video[0];
    for (const a of ['muted', 'playsinline']) if (!new RegExp(`\\s${a}[\\s>=]`).test(v)) err(w + 'falta ' + a);
    if (!/\swidth="\d+"/.test(v) || !/\sheight="\d+"/.test(v)) err(w + 'el vídeo no declara width y height');
    if (!/\spreload="none"/.test(v)) err(w + 'debe llevar preload="none": nada se descarga hasta que toca');
    if (unesc((/\saria-label="([^"]*)"/.exec(v) || [])[1] || '').length < 40) err(w + 'falta un aria-label que cuente lo que se ve');
    // Sin JavaScript el vídeo se ve con sus controles: necesita su póster (con JavaScript, el motor se lo quita).
    if (!/\sposter="[^"]+"/.test(v)) err(w + 'falta poster');
  });

  // Cabecera: el póster del primer pantallazo se precarga con prioridad alta y las fuentes tienen preconnect.
  const first = (/<img class="film__poster" src="([^"]*)"/.exec(html) || [])[1];
  const pre = /<link rel="preload" as="image" href="([^"]*)"[^>]*>/.exec(html);
  if (!pre) err(where + 'falta la precarga del póster de la cabecera (<link rel="preload" as="image">)');
  else {
    if (pre[1] !== first) err(where + `se precarga ${pre[1]} y el póster de la cabecera es ${first}`);
    if (!/fetchpriority="high"/.test(pre[0])) err(where + 'la precarga del póster debe llevar fetchpriority="high"');
  }
  if (!/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/.test(html)) err(where + 'falta el preconnect de las fuentes');

  // Descarga: botones con data-tienda, el script que los lleva a la tienda del móvil y las dos insignias en #descargar.
  if (!/\sdata-tienda[\s>=]/.test(html)) err(where + 'no hay ningún botón «Descargar» con data-tienda');
  if (!html.includes('/* tienda:inicio')) err(where + 'falta el script «tienda» que lleva «Descargar» a la tienda del móvil');
  const section = (id) => (new RegExp(`<section[^>]*\\sid="${id}"[\\s\\S]*?</section>`).exec(html) || [''])[0];
  for (const s of ['apps.apple.com', 'play.google.com']) if (!section('descargar').includes(s)) err(where + `la sección #descargar no enlaza a ${s}`);
  if (!/href="\/blog\/[a-z0-9-]+\/"/.test(section('blog'))) err(where + 'el bloque «Del blog» no enlaza a ningún artículo');
  if (!extractFaq(html).length) err(where + 'no hay preguntas frecuentes');
}

const canonicals = new Map();
const titles = new Map();
const meta = (html, prop) => (new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html) || [])[1] || '';
for (const page of pages()) {
  const html = read(page);
  const where = page + ': ';
  const is404 = page === NOT_FOUND;

  // Cabecera
  const title = unesc((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '');
  const desc = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  const canon = (/<link rel="canonical" href="([^"]*)"/.exec(html) || [])[1];
  const robots = (/<meta name="robots" content="([^"]*)"/.exec(html) || [])[1] || '';
  if (!title) err(where + 'falta <title>');
  else {
    if (title.length > 65) warn(where + `título largo (${title.length} caracteres): los buscadores suelen cortar hacia los 60`);
    if (titles.has(title)) err(where + 'título repetido con ' + titles.get(title));
    titles.set(title, page);
  }
  if (!/<html lang="es"/.test(html)) err(where + 'falta lang="es"');
  if (is404) {
    if (!/\bnoindex\b/.test(robots)) err(where + 'debe llevar <meta name="robots" content="noindex">');
    if (canon) err(where + 'no debe llevar canonical: se sirve en cualquier dirección');
  } else {
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
    if (/\bnoindex\b/.test(robots)) err(where + 'lleva noindex');
    if (!/max-image-preview:large/.test(robots)) err(where + 'falta <meta name="robots"> con max-image-preview:large');
    for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
      if (!meta(html, p)) err(where + 'falta ' + p);
    }
    if (meta(html, 'og:url') && canon && meta(html, 'og:url') !== canon) err(where + 'og:url distinto del canonical');
    // Tarjeta grande al compartir: sin estas dos etiquetas algunas redes enseñan solo el enlace.
    const tw = (name) => (new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html) || [])[1] || '';
    if (tw('twitter:card') !== 'summary_large_image') err(where + 'falta <meta name="twitter:card" content="summary_large_image">');
    if (!tw('twitter:image')) err(where + 'falta twitter:image');
    else if (tw('twitter:image') !== meta(html, 'og:image')) err(where + 'twitter:image distinto de og:image');
    // Imagen para compartir: texto alternativo siempre; ancho y alto reales si la imagen es del sitio.
    if (!meta(html, 'og:image:alt')) err(where + 'falta og:image:alt');
    const og = meta(html, 'og:image') && resolveLocal(page, meta(html, 'og:image'));
    if (og) {
      const size = imageSize(join(ROOT, og[0]));
      const w = meta(html, 'og:image:width'), h = meta(html, 'og:image:height');
      if (!existsSync(join(ROOT, og[0]))) err(where + `og:image apunta a ${og[0]}, que no existe`);
      else if (!w || !h) err(where + 'faltan og:image:width y og:image:height');
      else if (size && (+w !== size.width || +h !== size.height)) err(where + `og:image declara ${w}×${h} y ${og[0]} mide ${size.width}×${size.height}`);
    }
  }
  if (page === 'index.html' && /\.no-js\s/.test(html) && !/<html[^>]*\sclass="[^"]*\bno-js\b/.test(html)) {
    err(where + 'hay reglas .no-js pero <html> no lleva class="no-js": sin JavaScript el contenido tarda en verse');
  }
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(where + `tiene ${h1} <h1> (debe haber uno)`);
  // Titulares sin saltos de nivel: después de un h2 puede venir un h3, no un h4.
  let level = 0;
  for (const m of html.matchAll(/<h([1-6])[\s>][\s\S]*?<\/h\1>/g)) {
    if (level && +m[1] > level + 1) err(where + `salto de titular: <h${m[1]}> «${visibleText(m[0]).trim().slice(0, 50)}» después de un <h${level}>`);
    level = +m[1];
  }
  if ((html.match(/<main[\s>]/g) || []).length !== 1) err(where + 'debe tener un <main>');

  // Datos estructurados
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length && !is404) err(where + 'no tiene datos estructurados');
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
  const walkDates = (v) => {
    if (Array.isArray(v)) return v.forEach(walkDates);
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (!DATE_KEYS.has(k)) walkDates(x);
      else if (typeof x !== 'string' || !DATE_TZ.test(x)) err(where + `JSON-LD: ${k} «${x}» debe llevar hora y zona horaria (2026-11-10T09:00:00+01:00)`);
    }
  };
  walkDates(nodes);
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
    for (const t of ['Organization', 'WebSite', 'WebPage', 'MobileApplication']) if (!nodes.some((n) => n['@type'] === t)) err(where + 'falta ' + t + ' en el JSON-LD');
    const app = nodes.find((n) => n['@type'] === 'MobileApplication');
    if (app) {
      if (!app.offers || app.offers.price !== '0') err(where + 'MobileApplication: offers debe seguir con precio 0 (la descarga es gratuita)');
      for (const k of ['screenshot', 'downloadUrl', 'sameAs']) if (!app[k]) err(where + 'MobileApplication sin ' + k);
      const vis = visibleText(html).toLowerCase();
      for (const f of app.featureList || []) if (!vis.includes(f.split(': ').pop().toLowerCase())) err(where + `MobileApplication: la función «${f}» no está en el texto visible`);
    }
    // Película de la portada: los cinco datos que pide el tipo y la misma descripción que lleva el vídeo en la página.
    const film = nodes.find((n) => n['@type'] === 'VideoObject');
    if (film) {
      for (const k of ['name', 'description', 'thumbnailUrl', 'uploadDate', 'contentUrl']) if (!film[k]) err(where + 'VideoObject sin ' + k);
      if (film.description && !attrTexts(html).includes(film.description)) err(where + 'VideoObject: la descripción no es la del vídeo de la página (aria-label)');
    }
    checkHome(html, where);
  } else if (page !== 'blog/index.html' && !is404) {
    const post = nodes.find((n) => n['@type'] === 'BlogPosting');
    if (!post) err(where + 'falta BlogPosting');
    else {
      for (const k of ['headline', 'datePublished', 'dateModified', 'author', 'publisher', 'image', 'description']) if (!post[k]) err(where + 'BlogPosting sin ' + k);
      const h1Text = unesc(((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
      if (post.headline !== h1Text) err(where + 'el titular del JSON-LD no coincide con el <h1>');
      if (!visibleText(html).includes('min de lectura')) err(where + 'falta la línea de autoría y fecha');
      const byline = visibleText((/<p class="post-meta[^"]*">([\s\S]*?)<\/p>/.exec(html) || [])[1] || '').split(' · ')[0].trim();
      const author = post.author && post.author.name;
      if (author && author !== byline) err(where + `la autora del JSON-LD («${author}») no es la que se ve en el artículo («${byline}»)`);
    }
    if (!nodes.some((n) => n['@type'] === 'BreadcrumbList')) err(where + 'falta BreadcrumbList');
  }

  // Enlaces y archivos (también pósters, variantes de imagen y los dos cortes del vídeo de profesionales)
  for (const m of html.matchAll(/\s(href|src|srcset|poster|data-ancho|data-movil)="([^"]*)"/g)) {
    for (const url of m[1] === 'srcset' ? unesc(m[2]).split(',').map((u) => u.trim().split(/\s+/)[0]) : [unesc(m[2])]) {
      if (!url) { err(where + `${m[1]} vacío`); continue; }
      if (/^http:\/\//.test(url)) err(where + `enlace sin https: ${url}`);
      if (url.includes(OLD_DOWNLOAD)) err(where + `${url}: en un ordenador acaba en el inicio de sesión; «Descargar» va a #descargar`);
      if (/^(?:https:\/\/editstudio\.app)?\/?new\//.test(url)) err(where + `${url}: las páginas públicas no enlazan a los prototipos de /new/`);
      if (is404 && !/^(https:|\/|#|mailto:)/.test(url)) err(where + `${url}: en esta página las rutas deben empezar por /`);
      const r = resolveLocal(page, url);
      if (!r) continue;
      const [rel, hash] = r;
      if (!existsSync(join(ROOT, rel))) { err(where + `${url} no existe (${rel})`); continue; }
      used.add(rel);
      if (hash && rel.endsWith('.html') && !idsOf(rel).has(hash)) err(where + `${url}: no hay ningún id="${hash}" en ${rel}`);
    }
  }
  for (const u of [meta(html, 'og:image'), ...(ldText.match(/https:\/\/editstudio\.app\/[^"\\]*/g) || [])]) {
    const r = u && resolveLocal(page, u);
    if (r) used.add(r[0]);
  }
  for (const m of html.matchAll(/<a\s[^>]*>/g)) {
    const href = (/\shref="([^"]*)"/.exec(m[0]) || [])[1] || '';
    const blank = /\starget="_blank"/.test(m[0]);
    if (blank && !/rel="[^"]*noopener/.test(m[0])) err(where + 'enlace en pestaña nueva sin rel="noopener"');
    if (STORE_RE.test(href) && !blank) err(where + `el enlace a la tienda (${href}) debe abrirse en una pestaña nueva`);
    if (/\sdata-tienda[\s>=]/.test(m[0]) && !/#descargar$/.test(href)) err(where + `un botón «Descargar» (data-tienda) apunta a «${href}» y debe ir al ancla #descargar`);
  }
  for (const m of html.matchAll(/<img\s[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) err(where + 'imagen sin alt: ' + m[0].slice(0, 80));
    // Solo el fotograma fijo de un vídeo va con alt vacío: lo que se ve lo cuenta el aria-label del vídeo.
    else if (/\salt=""/.test(m[0]) && !/\sclass="[^"]*\bfilm__poster\b/.test(m[0])) err(where + 'imagen con alt vacío: ' + ((/src="([^"]*)"/.exec(m[0]) || [])[1] || ''));
    if (!/\swidth="\d+"/.test(m[0]) || !/\sheight="\d+"/.test(m[0])) warn(where + 'imagen sin width/height: ' + ((/src="([^"]*)"/.exec(m[0]) || [])[1] || ''));
  }

  // Dominios ajenos escritos en el texto
  for (const d of foreignDomains(visibleText(html))) err(where + `aparece el dominio «${d}» en el texto visible y no es de édit (${OWN_DOMAIN})`);

  // Palabras que no usamos
  const text = visibleText(html) + ' \n ' + attrTexts(html) + ' \n ' + ldText;
  for (const [re, name] of FORBIDDEN) {
    const m = re.exec(text);
    if (m) err(where + `aparece ${name}: «…${text.slice(Math.max(0, m.index - 30), m.index + 30).trim()}…»`);
  }
}

// ── 2a. La fecha de la portada no se ha quedado atrás ──
// Sale en sitemap.xml, en llms.txt y en los datos estructurados (WebPage.dateModified). Si index.html ha cambiado después
// (último commit o cambios sin guardar en git), hay que ponerla al día. Sin git, no se comprueba.
try {
  const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const hoy = new Date();
  const last = git('status', '--porcelain', '--', 'index.html')
    ? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    : git('log', '-1', '--format=%cs', '--', 'index.html');
  if (/^\d{4}-\d{2}-\d{2}$/.test(last) && last > homeUpdated) {
    warn(`index.html cambió el ${last} y la fecha de la portada es ${homeUpdated}: actualiza SITE.homeUpdated en tools/build.mjs y ejecuta node tools/build.mjs`);
  }
} catch { /* sin git */ }

// ── 2b. Recursos que ya no usa ninguna página ──
{
  const walk = (rel) => readdirSync(join(ROOT, rel)).flatMap((f) => (statSync(join(ROOT, rel, f)).isDirectory() ? walk(rel + '/' + f) : [rel + '/' + f]));
  if (existsSync(join(ROOT, 'assets'))) for (const f of walk('assets')) if (!f.endsWith('.DS_Store') && !used.has(f)) warn(`${f}: ninguna página lo usa; bórralo si sobra`);
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
  if (locs.some((l) => /\/404(\.html)?\/?$/.test(l))) err('sitemap.xml: 404.html no debe aparecer');
  for (const m of read('sitemap.xml').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(m[1])) err(`sitemap.xml: ${(/<loc>([^<]+)<\/loc>/.exec(m[1]) || [])[1]} sin <lastmod> (AAAA-MM-DD)`);
  }
}
if (!existsSync(join(ROOT, 'robots.txt'))) err('falta robots.txt');
else if (!read('robots.txt').includes(`Sitemap: ${SITE}/sitemap.xml`)) err('robots.txt: falta la línea Sitemap');

// ── Resultado ──
for (const w of warns) console.log('AVISO  ' + w);
for (const e of errors) console.log('ERROR  ' + e);
console.log(`\n${pages().length} páginas revisadas · ${errors.length} errores · ${warns.length} avisos`);
process.exit(errors.length ? 1 : 0);
