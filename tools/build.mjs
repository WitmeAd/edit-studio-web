#!/usr/bin/env node
// Genera lo que no se escribe a mano en esta web. Sin dependencias (Node 18 o superior).
//
//   node tools/build.mjs           escribe los archivos que hayan cambiado
//   node tools/build.mjs --check   no escribe nada; falla si algo quedaría distinto
//
// Qué hace:
//   1. Datos estructurados (JSON-LD) de index.html, a partir de las preguntas frecuentes visibles.
//   2. Blog: content/blog/*.md  ->  blog/<slug>/index.html  y  blog/index.html
//   3. sitemap.xml
//   4. llms.txt, a partir de content/llms.txt
//
// No borra nada: si quitas un artículo, borra tú su carpeta en blog/ (el script avisa).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ───────────────────────────── Datos del sitio ─────────────────────────────
const SITE = {
  url: 'https://editstudio.app',
  name: 'édit',
  // Otros nombres del sitio, por si el buscador no elige «édit» como nombre: el descriptivo y el dominio.
  alternateNames: ['édit studio', 'editstudio.app'],
  legalName: 'WITME ADVERTISING S.L.',
  appName: 'édit: armario y estilo',
  appLanguages: ['es', 'en', 'fr', 'it', 'pt'],
  appStore: 'https://apps.apple.com/es/app/id6796045067',
  googlePlay: 'https://play.google.com/store/apps/details?id=edit.studio.app',
  // Páginas de desarrollador en las tiendas (comprobadas el 10/11/2026).
  appStoreDeveloper: 'https://apps.apple.com/es/developer/id6796045069',
  googlePlayDeveloper: 'https://play.google.com/store/apps/developer?id=Witme',
  appScreenshot: '/assets/img/app-plan.webp',
  login: 'https://dashboard.editstudio.app/login',
  download: 'https://dashboard.editstudio.app/descargar',
  privacy: 'https://dashboard.editstudio.app/legal/privacidad',
  terms: 'https://dashboard.editstudio.app/legal/terminos',
  sameAs: ['https://www.instagram.com/editstudio.app/', 'https://www.linkedin.com/company/146595565/'],
  logo: '/assets/img/icon-512.png',
  ogImage: '/assets/img/og.png',
  author: 'Equipo édit',
  fonts: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400;1,9..144,500&family=Inter:wght@300;400;500;600&display=swap',
  blogTitle: 'Blog de édit: armario, looks y estilo con intención',
  blogDescription: 'Ideas prácticas para ordenar tu armario, crear looks con la ropa que ya tienes y vestirte con más intención.',
};
const ORG_ID = SITE.url + '/#organization';
const WEB_ID = SITE.url + '/#website';
const APP_ID = SITE.url + '/#app';

// ───────────────────────────── Utilidades ─────────────────────────────
const changed = [];
function write(rel, content) {
  const abs = join(ROOT, rel);
  const prev = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (prev === content) return;
  changed.push(rel);
  if (CHECK) return;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (html) => unesc(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const abs = (path) => (path.startsWith('https://') ? path : SITE.url + path);
function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function jsonLd(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">\n' + json + '\n</script>';
}
const orgNode = () => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE.name,
  legalName: SITE.legalName,
  url: SITE.url + '/',
  logo: { '@type': 'ImageObject', url: abs(SITE.logo), width: 512, height: 512 },
  sameAs: [...SITE.sameAs, SITE.appStoreDeveloper, SITE.googlePlayDeveloper],
});
// Ancho y alto de una imagen PNG, JPEG, WebP o GIF leyendo su cabecera. Devuelve null si no existe o no la entiende.
export function imageSize(file) {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('latin1', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | (b[22] >> 6)) };
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
// Texto alternativo de la imagen para compartir: el que está escrito en la portada.
let ogAltCache;
function ogImageAlt() {
  if (ogAltCache === undefined) ogAltCache = unesc((/<meta property="og:image:alt" content="([^"]*)"/.exec(read('index.html')) || [])[1] || '');
  if (!ogAltCache) fail('index.html: falta og:image:alt');
  return ogAltCache;
}
// Etiquetas og:image con ancho, alto (si la imagen es del sitio) y texto alternativo.
function ogImageTags(image, alt, where) {
  let out = `<meta property="og:image" content="${esc(abs(image))}">\n`;
  if (image.startsWith('/')) {
    const size = imageSize(join(ROOT, image));
    if (!size) fail(`${where}: no puedo leer el tamaño de ${image} (tiene que existir y ser PNG, JPEG, WebP o GIF)`);
    out += `<meta property="og:image:width" content="${size.width}">\n<meta property="og:image:height" content="${size.height}">\n`;
  }
  return out + `<meta property="og:image:alt" content="${esc(alt)}">\n`;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) fail(`fecha no válida «${iso}» (usa AAAA-MM-DD)`);
  return `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}`;
}
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ───────────────────────────── 1. Datos estructurados de la portada ─────────────────────────────
const INI = '<!-- datos-estructurados:inicio (generado por tools/build.mjs a partir de la página; no editar a mano) -->';
const FIN = '<!-- datos-estructurados:fin -->';

export function extractFaq(html) {
  const out = [];
  const re = /<details>\s*<summary><h3>([\s\S]*?)<\/h3><\/summary>\s*<p class="faq-a">([\s\S]*?)<\/p>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html))) out.push({ q: plain(m[1]), a: plain(m[2]) });
  return out;
}

function buildHome() {
  let html = read('index.html');
  const title = plain((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '');
  const description = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  if (!title || !description) fail('index.html: falta <title> o la descripción');
  const faq = extractFaq(html);
  const nDetails = (html.match(/<details>/g) || []).length;
  if (faq.length !== nDetails) fail(`index.html: hay ${nDetails} preguntas pero solo se han podido leer ${faq.length}; revisa el formato de <details>`);

  const shot = imageSize(join(ROOT, SITE.appScreenshot));
  if (!shot) fail(`no puedo leer el tamaño de ${SITE.appScreenshot}`);
  const shotAlt = unesc((new RegExp(`<img\\s[^>]*src="${SITE.appScreenshot.slice(1).replace(/\./g, '\\.')}"[^>]*\\salt="([^"]*)"`).exec(html) || [])[1] || '');
  const stores = [SITE.appStore, SITE.googlePlay];

  const graph = [
    orgNode(),
    { '@type': 'WebSite', '@id': WEB_ID, url: SITE.url + '/', name: SITE.name, alternateName: SITE.alternateNames, inLanguage: 'es', publisher: { '@id': ORG_ID } },
    {
      '@type': 'WebPage',
      '@id': SITE.url + '/#webpage',
      url: SITE.url + '/',
      name: title,
      description,
      inLanguage: 'es',
      isPartOf: { '@id': WEB_ID },
      about: { '@id': APP_ID },
      mainEntity: { '@id': APP_ID },
      primaryImageOfPage: { '@type': 'ImageObject', url: abs(SITE.ogImage), width: 1200, height: 630 },
    },
    {
      '@type': 'MobileApplication',
      '@id': APP_ID,
      name: SITE.appName,
      alternateName: SITE.name,
      description,
      url: SITE.url + '/',
      image: abs(SITE.logo),
      screenshot: { '@type': 'ImageObject', url: abs(SITE.appScreenshot), width: shot.width, height: shot.height, ...(shotAlt ? { caption: shotAlt } : {}) },
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'iOS, Android',
      inLanguage: SITE.appLanguages,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      installUrl: stores,
      downloadUrl: stores,
      sameAs: stores,
      publisher: { '@id': ORG_ID },
    },
  ];
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': SITE.url + '/#preguntas',
      inLanguage: 'es',
      isPartOf: { '@id': SITE.url + '/#webpage' },
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  const block = INI + '\n' + jsonLd(graph) + '\n' + FIN;
  const a = html.indexOf(INI), b = html.indexOf(FIN);
  if (a !== -1 && b > a) html = html.slice(0, a) + block + html.slice(b + FIN.length);
  else if (html.includes('</head>')) html = html.replace('</head>', block + '\n</head>');
  else fail('index.html: no encuentro </head>');
  write('index.html', html);
}

// ───────────────────────────── 2. Blog ─────────────────────────────
function safeUrl(u, where) {
  if (/^(https:\/\/|\/(?!\/)|#|mailto:)/.test(u)) return u;
  fail(`${where}: enlace no admitido «${u}» (usa https://, una ruta que empiece por / o un ancla #)`);
}
function inline(s, where) {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const url = safeUrl(unesc(u), where);
    const ext = url.startsWith('https://') && !url.startsWith(SITE.url);
    return `<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}
const mdPlain = (s) => s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_>#`]/g, ' ').replace(/\s+/g, ' ').trim();

// Markdown reducido: ## y ###, párrafos, **negrita**, *cursiva*, [enlaces](url), listas, citas (>), imágenes en línea propia y ---.
function markdown(src, where) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const ids = new Set();
  const isBlock = (l) => /^(#{1,6}\s|>\s?|[-*]\s+|\d+\.\s+|---+\s*$|!\[)/.test(l);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      const level = m[1].length;
      if (level === 1) fail(`${where}: no uses «# » en el texto; el título va en la cabecera (titulo:)`);
      if (level > 3) fail(`${where}: solo se admiten titulares ## y ###`);
      let id = slugify(mdPlain(m[2])) || 'seccion';
      while (ids.has(id)) id += '-2';
      ids.add(id);
      out.push(`<h${level} id="${id}">${inline(m[2].trim(), where)}</h${level}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l))) {
      const srcUrl = safeUrl(m[2], where);
      if (!m[1].trim()) fail(`${where}: la imagen ${m[2]} necesita un texto alternativo: ![descripción](ruta)`);
      out.push(`<figure><img src="${esc(srcUrl)}" alt="${esc(m[1])}" loading="lazy" decoding="async"></figure>`);
      i++; continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' ').trim(), where)}</p></blockquote>`);
      continue;
    }
    const listRe = /^[-*]\s+/.test(l) ? /^[-*]\s+/ : /^\d+\.\s+/.test(l) ? /^\d+\.\s+/ : null;
    if (listRe) {
      const tag = /^\d/.test(l) ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && (listRe.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (listRe.test(lines[i])) items.push(lines[i].replace(listRe, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<${tag}>\n${items.map((t) => `  <li>${inline(t.trim(), where)}</li>`).join('\n')}\n</${tag}>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && isBlock(lines[i]))) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(' '), where)}</p>`);
  }
  return out.join('\n');
}

function loadPosts() {
  const dir = join(ROOT, 'content/blog');
  if (!existsSync(dir)) return [];
  const posts = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const where = 'content/blog/' + file;
    const raw = readFileSync(join(dir, file), 'utf8').replace(/\r\n?/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    if (!m) fail(`${where}: falta la cabecera entre líneas ---`);
    const meta = {};
    for (const line of m[1].split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const k = /^([a-z_]+):\s*(.*)$/.exec(line);
      if (!k) fail(`${where}: línea de cabecera no válida «${line}»`);
      meta[k[1]] = k[2].trim().replace(/^"(.*)"$/, '$1');
    }
    for (const req of ['titulo', 'descripcion', 'fecha']) if (!meta[req]) fail(`${where}: falta «${req}:» en la cabecera`);
    if (meta.borrador === 'si' || meta.borrador === 'sí') continue;
    const slug = meta.slug || slugify(file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`${where}: slug no válido «${slug}»`);
    if (posts.some((p) => p.slug === slug)) fail(`${where}: slug repetido «${slug}»`);
    fechaLarga(meta.fecha);
    if (meta.actualizado) fechaLarga(meta.actualizado);
    const body = m[2];
    const words = mdPlain(body).split(' ').filter(Boolean).length + (meta.resumen ? mdPlain(meta.resumen).split(' ').length : 0);
    posts.push({
      slug,
      where,
      title: meta.titulo,
      description: meta.descripcion,
      summary: meta.resumen || '',
      date: meta.fecha,
      updated: meta.actualizado && meta.actualizado > meta.fecha ? meta.actualizado : meta.fecha,
      author: meta.autor || SITE.author,
      image: meta.imagen ? safeUrl(meta.imagen, where) : SITE.ogImage,
      imageAlt: meta.imagen_alt || '',
      words,
      minutes: Math.max(1, Math.round(words / 200)),
      html: markdown(body, where),
      path: `/blog/${slug}/`,
    });
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1));
}

function head({ title, description, path, type, image, imageAlt, extra = '', ld }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
<meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="es_ES">
<meta property="og:url" content="${abs(path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${ogImageTags(image, imageAlt || ogImageAlt(), path)}${extra}<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="${esc(SITE.fonts)}" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/blog.css">
${jsonLd(ld)}
</head>
<body>
<nav>
  <a href="/" class="logo" aria-label="édit, inicio"><span class="e">é</span>dit</a>
  <div class="nav-links">
    <a href="/#app" class="nav-text">édit</a>
    <a href="/#pro" class="nav-pro nav-text">édit profesionales</a>
    <a href="/blog/" class="nav-blog">Blog</a>
    <a href="${SITE.login}" class="btn btn-outline-olive">Iniciar sesión</a>
  </div>
</nav>
`;
}

const BADGES = `<div class="store-badges">
        <a href="${SITE.appStore}" target="_blank" rel="noopener" aria-label="Descargar en el App Store"><img src="/assets/img/badge-app-store.png" width="431" height="144" loading="lazy" decoding="async" alt="Descargar en el App Store"></a>
        <a href="${SITE.googlePlay}" target="_blank" rel="noopener" aria-label="Disponible en Google Play"><img src="/assets/img/badge-google-play.png" width="486" height="144" loading="lazy" decoding="async" alt="Disponible en Google Play"></a>
      </div>`;

const CTA = `<aside class="wrap cta">
  <div class="signup">
    <div class="signup-head">
      <h2>Empezamos por lo que ya tienes.</h2>
      <p>Descarga édit y empieza a vestirte con más intención hoy mismo.</p>
      ${BADGES}
    </div>
  </div>
</aside>`;

const FOOT = `<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a href="/" class="logo"><span class="e">é</span>dit</a>
        <p>Vestirse desde tu eje.</p>
        <div class="foot-social">
          <a href="https://www.instagram.com/editstudio.app/" target="_blank" rel="noopener" aria-label="Instagram"><img src="/assets/img/icon-instagram.png" width="36" height="36" loading="lazy" decoding="async" alt="Instagram"></a>
          <a href="https://www.linkedin.com/company/146595565/" target="_blank" rel="noopener" aria-label="LinkedIn"><img src="/assets/img/icon-linkedin.png" width="36" height="36" loading="lazy" decoding="async" alt="LinkedIn"></a>
        </div>
      </div>
      <div class="foot-cols">
        <div class="foot-col">
          <h2>Ecosistema</h2>
          <a href="/#app">édit · para ti</a>
          <a href="/#pro">édit profesionales</a>
          <a href="/#como-funciona">Cómo funciona</a>
        </div>
        <div class="foot-col">
          <h2>Recursos</h2>
          <a href="/blog/">Blog</a>
          <a href="/#preguntas">Preguntas frecuentes</a>
        </div>
        <div class="foot-col">
          <h2>Empieza</h2>
          <a href="${SITE.download}">Descargar édit</a>
          <a href="${SITE.login}">Iniciar sesión</a>
        </div>
      </div>
    </div>
    <div class="foot-bottom">© 2026 édit · El ecosistema de estilismo digital. <span class="foot-legal"><a href="${SITE.privacy}">Privacidad</a> · <a href="${SITE.terms}">Términos</a></span></div>
  </div>
</footer>
</body>
</html>
`;

const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
});

function renderPost(p, posts) {
  const title = `${p.title} · édit`;
  const ld = [
    {
      '@type': 'BlogPosting',
      '@id': abs(p.path) + '#articulo',
      headline: p.title,
      description: p.description,
      inLanguage: 'es',
      datePublished: p.date,
      dateModified: p.updated,
      wordCount: p.words,
      image: abs(p.image),
      mainEntityOfPage: abs(p.path),
      author: { '@type': 'Organization', '@id': ORG_ID, name: p.author === SITE.author ? SITE.name : p.author },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@type': 'Blog', '@id': abs('/blog/') + '#blog', name: SITE.blogTitle },
    },
    crumbs([['Inicio', '/'], ['Blog', '/blog/'], [p.title, p.path]]),
    orgNode(),
  ];
  if (p.author !== SITE.author) ld[0].author = { '@type': 'Person', name: p.author };
  const extra = `<meta property="article:published_time" content="${p.date}">\n<meta property="article:modified_time" content="${p.updated}">\n`;
  const others = posts.filter((o) => o.slug !== p.slug).slice(0, 3);
  const upd = p.updated !== p.date ? ` · Actualizado el <time datetime="${p.updated}">${fechaLarga(p.updated)}</time>` : '';
  return head({ title, description: p.description, path: p.path, type: 'article', image: p.image, imageAlt: p.image !== SITE.ogImage ? p.imageAlt || p.title : '', extra, ld }) + `
<main>
<article class="post">
  <header class="post-head">
    <nav class="crumbs" aria-label="Estás en"><a href="/">Inicio</a> <span aria-hidden="true">›</span> <a href="/blog/">Blog</a></nav>
    <h1>${inline(p.title, p.where)}</h1>
    <p class="post-meta">${esc(p.author)} · <time datetime="${p.date}">${fechaLarga(p.date)}</time>${upd} · ${p.minutes} min de lectura</p>
  </header>
  <div class="post-body">
${p.summary ? `<p class="post-summary"><strong>En breve.</strong> ${inline(p.summary, p.where)}</p>\n` : ''}${p.image !== SITE.ogImage ? `<figure><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}"></figure>\n` : ''}${p.html}
  </div>
</article>
${CTA}
${others.length ? `<section class="more">
  <h2>Sigue leyendo</h2>
  <ul>
${others.map((o) => `    <li><a href="${o.path}">${inline(o.title, o.where)}</a><span>${esc(o.description)}</span></li>`).join('\n')}
  </ul>
</section>
` : ''}</main>

` + FOOT;
}

function renderIndex(posts) {
  const ld = [
    {
      '@type': 'Blog',
      '@id': abs('/blog/') + '#blog',
      url: abs('/blog/'),
      name: SITE.blogTitle,
      description: SITE.blogDescription,
      inLanguage: 'es',
      publisher: { '@id': ORG_ID },
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', '@id': abs(p.path) + '#articulo', headline: p.title, url: abs(p.path), datePublished: p.date, dateModified: p.updated })),
    },
    crumbs([['Inicio', '/'], ['Blog', '/blog/']]),
    orgNode(),
  ];
  return head({ title: SITE.blogTitle, description: SITE.blogDescription, path: '/blog/', type: 'website', image: SITE.ogImage, ld }) + `
<main>
<header class="blog-head">
  <span class="eyebrow">Blog</span>
  <h1>Ideas para vestirte con <em>intención</em>.</h1>
  <p>${esc(SITE.blogDescription)}</p>
</header>
<div class="post-list">
${posts.map((p) => `  <article>
    <p class="post-meta"><time datetime="${p.date}">${fechaLarga(p.date)}</time> · ${p.minutes} min de lectura</p>
    <h2><a href="${p.path}">${inline(p.title, p.where)}</a></h2>
    <p>${esc(p.description)}</p>
    <a class="read" href="${p.path}" aria-label="Leer: ${esc(p.title)}">Leer el artículo</a>
  </article>`).join('\n')}
</div>
${CTA}
</main>

` + FOOT;
}

function buildBlog(posts) {
  if (!posts.length) return;
  for (const p of posts) write(`blog/${p.slug}/index.html`, renderPost(p, posts));
  write('blog/index.html', renderIndex(posts));
  const dir = join(ROOT, 'blog');
  if (existsSync(dir)) {
    for (const d of readdirSync(dir)) {
      if (statSync(join(dir, d)).isDirectory() && !posts.some((p) => p.slug === d)) {
        console.warn(`AVISO: blog/${d}/ ya no corresponde a ningún artículo de content/blog; bórrala a mano si sobra.`);
      }
    }
  }
}

// ───────────────────────────── 3. sitemap.xml ─────────────────────────────
function buildSitemap(posts) {
  const urls = [{ loc: '/' }];
  if (posts.length) {
    urls.push({ loc: '/blog/', lastmod: posts.map((p) => p.updated).sort().pop() });
    for (const p of posts) urls.push({ loc: p.path, lastmod: p.updated });
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${abs(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  write('sitemap.xml', xml);
}

// ───────────────────────────── 4. llms.txt ─────────────────────────────
function buildLlms(posts) {
  if (!existsSync(join(ROOT, 'content/llms.txt'))) return;
  const tpl = read('content/llms.txt');
  if (!tpl.includes('{{blog}}')) fail('content/llms.txt: falta la marca {{blog}}');
  const list = posts.length
    ? posts.map((p) => `- [${p.title}](${abs(p.path)}): ${p.description}`).join('\n')
    : '- Todavía no hay artículos publicados.';
  write('llms.txt', tpl.replace('{{blog}}', list));
}

// ───────────────────────────── Ejecución ─────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildHome();
  const posts = loadPosts();
  buildBlog(posts);
  buildSitemap(posts);
  buildLlms(posts);
  if (CHECK) {
    if (changed.length) { console.error('Sin generar o desactualizado: ' + changed.join(', ') + '\nEjecuta: node tools/build.mjs'); process.exit(1); }
    console.log('Todo al día.');
  } else {
    console.log(changed.length ? 'Actualizado: ' + changed.join(', ') : 'Sin cambios.');
  }
}
