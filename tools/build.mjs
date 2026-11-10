#!/usr/bin/env node
// Genera lo que no se escribe a mano en esta web. Sin dependencias (Node 18 o superior).
//
//   node tools/build.mjs           escribe los archivos que hayan cambiado
//   node tools/build.mjs --check   no escribe nada; falla si algo quedaría distinto
//
// Qué hace:
//   1. Portada (index.html): la lista «Del blog» y los datos estructurados (JSON-LD), a partir de lo que se ve en la página.
//   2. assets/css/blog.css: los estilos comunes de la portada (tramos «común») más content/blog.css.
//   3. Blog: content/blog/*.md  ->  blog/<slug>/index.html  y  blog/index.html
//   4. sitemap.xml
//   5. llms.txt, a partir de content/llms.txt
//   6. 404.html, la página de «no encontrada»
//
// El blog y 404.html toman de la portada la barra, el colofón, las insignias de tienda, la hoja de fuentes y el
// script de «Descargar»: se cambian en index.html y aquí se copian.
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
  // Fecha del último cambio de contenido de la portada (AAAA-MM-DD). Se actualiza a mano; sale en sitemap.xml.
  homeUpdated: '2026-11-10',
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
  // Captura de la app que se declara en los datos estructurados: la pantalla «Mi armario» de la portada.
  appScreenshot: '/assets/img/app-mi-armario.webp',
  // Película de la portada (VideoObject). «published» es el día en que se publicó en la web: cámbialo si se sustituye el vídeo.
  heroVideo: { name: 'édit en marcha: una foto tuya, tres looks', file: '/assets/video/hero.mp4', poster: '/assets/video/hero.jpg', duration: 'PT7S', published: '2026-11-10' },
  sameAs: ['https://www.instagram.com/editstudio.app/', 'https://www.linkedin.com/company/146595565/'],
  logo: '/assets/img/icon-512.png',
  ogImage: '/assets/img/og.png',
  themeColor: '#FBF8F3',
  author: 'Equipo édit',
  // Hora de publicación que se declara en los datos estructurados (hora peninsular); los artículos solo llevan fecha.
  publishTime: '09:00',
  // Cuántos artículos salen en el bloque «Del blog» de la portada.
  homePosts: 3,
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
// Fecha con hora y zona horaria para los datos estructurados, con el horario de verano de la península
// (del último domingo de marzo al último domingo de octubre): 2026-11-10 -> 2026-11-10T09:00:00+01:00.
export function fechaHora(iso) {
  fechaLarga(iso);
  const [y, m, d] = iso.split('-').map(Number);
  const ultimoDomingo = (mes) => { const fin = new Date(Date.UTC(y, mes, 0)); return fin.getUTCDate() - fin.getUTCDay(); };
  const verano = (m > 3 && m < 10) || (m === 3 && d >= ultimoDomingo(3)) || (m === 10 && d < ultimoDomingo(10));
  return `${iso}T${SITE.publishTime}:00${verano ? '+02:00' : '+01:00'}`;
}
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ───────────────────────────── 1. Portada: lo que se toma de ella y lo que se escribe en ella ─────────────────────────────
const INI = '<!-- datos-estructurados:inicio (generado por tools/build.mjs a partir de la página; no editar a mano) -->';
const FIN = '<!-- datos-estructurados:fin -->';
const BLOG_INI = '<!-- blog:inicio (generado por tools/build.mjs a partir de content/blog; no editar a mano) -->';
const BLOG_FIN = '<!-- blog:fin -->';
const GO = '<svg class="go" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 9h13M10 4l5 5-5 5"/></svg>';
const dos = (n) => String(n).padStart(2, '0');

// Trozo de un texto entre dos marcas, sin ellas. Falla con un mensaje claro si no están.
function between(s, a, b, where) {
  const i = s.indexOf(a), j = i === -1 ? -1 : s.indexOf(b, i + a.length);
  if (j === -1) fail(`${where}: no encuentro el tramo entre «${a}» y «${b}»`);
  return s.slice(i + a.length, j);
}

export function extractFaq(html) {
  const out = [];
  const re = /<details>\s*<summary><h3>([\s\S]*?)<\/h3><\/summary>\s*<p class="faq-a">([\s\S]*?)<\/p>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html))) out.push({ q: plain(m[1]), a: plain(m[2]) });
  return out;
}

// Funciones de la app, tal como se leen en el índice de la portada: «Armario: tu armario digital, foto a foto».
export function extractFeatures(html) {
  const out = [];
  const re = /<span class="tit">([^<]+)<\/span><span class="glosa">([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    const glosa = plain(m[2]);
    out.push(`${plain(m[1])}: ${/^\p{Lu}\p{Ll}/u.test(glosa) ? glosa[0].toLowerCase() + glosa.slice(1) : glosa}`);
  }
  return out;
}

// Estilos comunes: los tramos de la hoja de la portada marcados con «común:inicio» y «común:fin».
export function commonCss(html) {
  const css = between(html, '<style>', '</style>', 'index.html');
  const parts = [...css.matchAll(/\/\* común:inicio[^*]*\*\/\n([\s\S]*?)\n\/\* común:fin \*\//g)].map((m) => m[1]);
  if (!parts.length) fail('index.html: no hay ningún tramo de estilos entre «/* común:inicio … */» y «/* común:fin */»');
  return parts.join('\n\n');
}

// Piezas de la portada que repiten el blog y 404.html, con las rutas y las anclas vistas desde cualquier página.
let partsCache;
function homeParts() {
  if (partsCache) return partsCache;
  const html = read('index.html');
  const where = 'index.html';
  const fromRoot = (s) => s.replace(/href="#top"/g, 'href="/"').replace(/href="#/g, 'href="/#').replace(/(src|srcset)="assets\//g, '$1="/assets/');
  const fonts = (/<link href="(https:\/\/fonts\.googleapis\.com\/[^"]+)" rel="stylesheet">/.exec(html) || [])[1];
  if (!fonts) fail(`${where}: no encuentro la hoja de fuentes`);
  const NAV = '<header class="nav" id="nav">', FOOTER = '<footer class="colofon">', BADGES = '<div class="tiendas">';
  const nav = fromRoot(NAV + between(html, NAV, '</header>', where) + '</header>');
  const foot = fromRoot(FOOTER + between(html, FOOTER, '</footer>', where) + '</footer>')
    .replace('aria-label="édit, volver arriba"', 'aria-label="édit, inicio"')
    .replace(/En esta página/g, 'En la portada');
  const badges = fromRoot(BADGES + between(html, BADGES, '</div>', where) + '</div>').replace(/\n\s+/g, '\n      ');
  const store = (/\/\* tienda:inicio[\s\S]*?\*\/\n([\s\S]*?)\n\/\* tienda:fin \*\//.exec(html) || [])[1];
  if (!store) fail(`${where}: no encuentro el script entre «/* tienda:inicio … */» y «/* tienda:fin */»`);
  for (const [name, piece] of [['la barra', nav], ['el colofón', foot]]) {
    if (!piece.includes('href="/blog/"')) fail(`${where}: ${name} no enlaza al blog`);
  }
  return (partsCache = { fonts, nav, foot, badges, store });
}

// Filas de artículos (las mismas en la portada, en el índice del blog y en «Sigue leyendo»).
function notas(posts, { tag, meta, indent, cls = 'notas' }) {
  return `${indent}<ol class="${cls}">\n` +
    posts.map((p, i) => `${indent}  <li class="nota"><a href="${p.path}"><span class="sc">${meta(p, i)}</span><${tag} class="h4">${inline(p.title, p.where)}</${tag}><p>${esc(p.description)}</p>${GO}</a></li>`).join('\n') +
    `\n${indent}</ol>`;
}

function buildHome(posts) {
  let html = read('index.html');
  const title = plain((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '');
  const description = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  if (!title || !description) fail('index.html: falta <title> o la descripción');
  const faq = extractFaq(html);
  const nDetails = (html.match(/<details>/g) || []).length;
  if (faq.length !== nDetails) fail(`index.html: hay ${nDetails} preguntas pero solo se han podido leer ${faq.length}; revisa el formato de <details>`);

  // Bloque «Del blog»: los últimos artículos, entre sus dos marcas.
  const b0 = html.indexOf(BLOG_INI), b1 = html.indexOf(BLOG_FIN);
  if (b0 === -1 || b1 < b0) fail('index.html: faltan las marcas «blog:inicio» y «blog:fin» del bloque «Del blog»');
  const indent = (/\n([ \t]*)$/.exec(html.slice(0, b0)) || ['', ''])[1];
  html = html.slice(0, b0) + BLOG_INI + '\n' +
    notas(posts.slice(0, SITE.homePosts), { tag: 'h3', meta: (p, i) => dos(i + 1), indent }) +
    '\n' + indent + html.slice(b1);

  const shot = imageSize(join(ROOT, SITE.appScreenshot));
  if (!shot) fail(`no puedo leer el tamaño de ${SITE.appScreenshot}`);
  const shotAlt = unesc((new RegExp(`<img\\s[^>]*src="${SITE.appScreenshot.slice(1).replace(/\./g, '\\.')}"[^>]*\\salt="([^"]*)"`).exec(html) || [])[1] || '');
  if (!shotAlt) fail(`index.html: la captura ${SITE.appScreenshot} tiene que estar en la página, con su texto alternativo`);
  const features = extractFeatures(html);
  const stores = [SITE.appStore, SITE.googlePlay];

  // Película de la portada: su descripción es la que lleva el vídeo en la página (aria-label).
  const film = SITE.heroVideo;
  const filmLabel = unesc((/id="film-hero"[\s\S]*?<video\s[^>]*\saria-label="([^"]*)"/.exec(html) || [])[1] || '').replace(/^Vídeo sin sonido\.\s*/, '');
  if (!filmLabel) fail('index.html: el vídeo de la portada (#film-hero) necesita un aria-label que cuente lo que se ve');
  for (const f of [film.file, film.poster]) if (!existsSync(join(ROOT, f))) fail(`no existe ${f} (SITE.heroVideo)`);
  const FILM_ID = SITE.url + '/#pelicula';

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
      dateModified: fechaHora(SITE.homeUpdated),
      isPartOf: { '@id': WEB_ID },
      about: { '@id': APP_ID },
      mainEntity: { '@id': APP_ID },
      primaryImageOfPage: { '@type': 'ImageObject', url: abs(SITE.ogImage), width: 1200, height: 630 },
      video: { '@id': FILM_ID },
    },
    {
      '@type': 'MobileApplication',
      '@id': APP_ID,
      name: SITE.appName,
      alternateName: SITE.name,
      description,
      url: SITE.url + '/',
      image: abs(SITE.logo),
      screenshot: { '@type': 'ImageObject', url: abs(SITE.appScreenshot), width: shot.width, height: shot.height, caption: shotAlt },
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'iOS, Android',
      inLanguage: SITE.appLanguages,
      ...(features.length ? { featureList: features } : {}),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      installUrl: stores,
      downloadUrl: stores,
      sameAs: stores,
      publisher: { '@id': ORG_ID },
    },
    {
      '@type': 'VideoObject',
      '@id': FILM_ID,
      name: film.name,
      description: filmLabel,
      thumbnailUrl: abs(film.poster),
      contentUrl: abs(film.file),
      uploadDate: fechaHora(film.published),
      duration: film.duration,
      inLanguage: 'es',
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
  partsCache = null;
}

// ───────────────────────────── 2. Hoja de estilos del blog y de 404.html ─────────────────────────────
function buildCss() {
  if (!existsSync(join(ROOT, 'content/blog.css'))) fail('falta content/blog.css (los estilos propios del blog)');
  write('assets/css/blog.css',
    '/* Generado por tools/build.mjs: no editar a mano.\n' +
    '   Primera parte: los estilos comunes de la portada (tramos «común» de index.html). Segunda: content/blog.css. */\n\n' +
    commonCss(read('index.html')) + '\n\n' + read('content/blog.css'));
}

// ───────────────────────────── 3. Blog ─────────────────────────────
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

// Cabecera común, con la barra de la portada. Con noindex (404.html) la página se sirve en cualquier dirección: no lleva
// descripción, canonical, etiquetas para compartir ni datos estructurados.
function head({ title, description, path, type, image, imageAlt, extra = '', ld, noindex = false }) {
  const parts = homeParts();
  const seo = noindex
    ? `<meta name="robots" content="noindex">`
    : `<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
<meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1">`;
  const alt = noindex ? '' : imageAlt || ogImageAlt();
  const share = noindex
    ? ''
    : `<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="es_ES">
<meta property="og:url" content="${abs(path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${ogImageTags(image, alt, path)}${extra}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(abs(image))}">
<meta name="twitter:image:alt" content="${esc(alt)}">
`;
  // La barra es la de la portada; en el blog, su enlace queda marcado (como página actual en el índice; como sección en los artículos).
  const nav = path && path.startsWith('/blog/') ? parts.nav.replace('<a href="/blog/">', `<a href="/blog/" aria-current="${path === '/blog/' ? 'page' : 'true'}">`) : parts.nav;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${seo}
<meta name="theme-color" content="${SITE.themeColor}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${share}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="${parts.fonts}" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/blog.css">
${noindex ? '' : jsonLd(ld) + '\n'}</head>
<body id="top">

<a class="salto" href="#contenido">Saltar al contenido</a>

${nav}
`;
}

// Cierre con las insignias de tienda (las de la portada).
function cta() {
  return `<aside class="cierre" aria-labelledby="t-cierre">
  <div class="cierre__in">
    <h2 class="h2" id="t-cierre">Empezamos por lo que ya <em>tienes</em>.</h2>
    <p>Descarga édit y empieza a vestirte con más intención hoy mismo.</p>
    ${homeParts().badges.replace(/\n {6}/g, '\n    ')}
  </div>
</aside>`;
}

// Colofón de la portada y el script que lleva «Descargar» a la tienda del móvil.
function foot() {
  const parts = homeParts();
  return `${parts.foot}

<script>
${parts.store}
</script>
</body>
</html>
`;
}

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
      url: abs(p.path),
      headline: p.title,
      description: p.description,
      inLanguage: 'es',
      datePublished: fechaHora(p.date),
      dateModified: fechaHora(p.updated),
      wordCount: p.words,
      image: abs(p.image),
      mainEntityOfPage: { '@type': 'WebPage', '@id': abs(p.path) },
      // El nombre es el mismo que se ve bajo el titular.
      author: p.author === SITE.author
        ? { '@type': 'Organization', name: p.author, parentOrganization: { '@id': ORG_ID } }
        : { '@type': 'Person', name: p.author },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@type': 'Blog', '@id': abs('/blog/') + '#blog', name: SITE.blogTitle },
    },
    crumbs([['Inicio', '/'], ['Blog', '/blog/'], [p.title, p.path]]),
    orgNode(),
  ];
  const extra = `<meta property="article:published_time" content="${fechaHora(p.date)}">\n<meta property="article:modified_time" content="${fechaHora(p.updated)}">\n`;
  const others = posts.filter((o) => o.slug !== p.slug).slice(0, 3);
  const upd = p.updated !== p.date ? ` · Actualizado el <time datetime="${p.updated}">${fechaLarga(p.updated)}</time>` : '';
  return head({ title, description: p.description, path: p.path, type: 'article', image: p.image, imageAlt: p.image !== SITE.ogImage ? p.imageAlt || p.title : '', extra, ld }) + `
<main id="contenido" tabindex="-1">
<article class="post calma">
  <header class="post__cab lectura">
    <nav class="migas sc" aria-label="Estás en"><a href="/">Inicio</a> <span aria-hidden="true">/</span> <a href="/blog/">Blog</a></nav>
    <h1>${inline(p.title, p.where)}</h1>
    <p class="post-meta sc">${esc(p.author)} · <time datetime="${p.date}">${fechaLarga(p.date)}</time>${upd} · ${p.minutes} min de lectura</p>
  </header>
  <div class="post__body lectura">
${p.summary ? `<p class="post__resumen"><strong class="sc">En breve.</strong> ${inline(p.summary, p.where)}</p>\n` : ''}${p.image !== SITE.ogImage ? `<figure><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}"></figure>\n` : ''}${p.html}
  </div>
</article>
${cta()}
${others.length ? `<section class="section calma mas" aria-labelledby="t-mas">
  <div class="wrap">
    <header class="cab"><h2 class="h2" id="t-mas">Sigue <em>leyendo</em>.</h2></header>
${notas(others, { tag: 'h3', meta: (o, i) => dos(i + 1), indent: '    ' })}
  </div>
</section>
` : ''}</main>

` + foot();
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
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', '@id': abs(p.path) + '#articulo', headline: p.title, url: abs(p.path), datePublished: fechaHora(p.date), dateModified: fechaHora(p.updated) })),
    },
    crumbs([['Inicio', '/'], ['Blog', '/blog/']]),
    orgNode(),
  ];
  const meta = (p) => `<time datetime="${p.date}">${fechaLarga(p.date)}</time> <span>${p.minutes} min de lectura</span>`;
  return head({ title: SITE.blogTitle, description: SITE.blogDescription, path: '/blog/', type: 'website', image: SITE.ogImage, ld }) + `
<main id="contenido" tabindex="-1">
<section class="section calma portadilla" aria-labelledby="titulo">
  <div class="wrap">
    <header class="portadilla__cab">
      <p class="sc">Blog</p>
      <h1 class="display" id="titulo">Ideas para vestirte con <em>intención</em>.</h1>
      <p>${esc(SITE.blogDescription)}</p>
    </header>
${notas(posts, { tag: 'h2', meta, indent: '    ', cls: 'notas notas--fecha' })}
  </div>
</section>
${cta()}
</main>

` + foot();
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

// ───────────────────────────── 6. 404.html ─────────────────────────────
// No va en sitemap.xml. Para que el alojamiento la sirva hay que activarlo en su configuración.
function build404() {
  write('404.html', head({ title: 'No encontramos esa página · édit', noindex: true }) + `
<main id="contenido" tabindex="-1">
<section class="nohay" aria-labelledby="titulo">
  <p class="sc">Error 404</p>
  <h1 class="display" id="titulo">No encontramos esa <em>página</em>.</h1>
  <p class="nohay__ir"><a class="btn" href="/">Ir a la portada</a> <a class="link" href="/blog/">Ir al blog <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5 9.5 7 5 11.5"/></svg></a></p>
</section>
</main>

` + foot());
}

// ───────────────────────────── 4. sitemap.xml ─────────────────────────────
function buildSitemap(posts) {
  fechaLarga(SITE.homeUpdated);
  const urls = [{ loc: '/', lastmod: SITE.homeUpdated }];
  if (posts.length) {
    urls.push({ loc: '/blog/', lastmod: posts.map((p) => p.updated).sort().pop() });
    for (const p of posts) urls.push({ loc: p.path, lastmod: p.updated });
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${abs(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  write('sitemap.xml', xml);
}

// ───────────────────────────── 5. llms.txt ─────────────────────────────
function buildLlms(posts) {
  if (!existsSync(join(ROOT, 'content/llms.txt'))) return;
  const tpl = read('content/llms.txt');
  if (!tpl.includes('{{blog}}')) fail('content/llms.txt: falta la marca {{blog}}');
  const list = posts.length
    ? posts.map((p) => `- [${p.title}](${abs(p.path)}): ${p.description}`).join('\n')
    : '- Todavía no hay artículos publicados.';
  // {{actualizado}} (opcional) es la fecha del último cambio de la portada, la misma del sitemap.
  write('llms.txt', tpl.replace('{{blog}}', list).replace('{{actualizado}}', fechaLarga(SITE.homeUpdated)));
}

// ───────────────────────────── Ejecución ─────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const posts = loadPosts();
  buildHome(posts);
  buildCss();
  buildBlog(posts);
  buildSitemap(posts);
  buildLlms(posts);
  build404();
  if (CHECK) {
    if (changed.length) { console.error('Sin generar o desactualizado: ' + changed.join(', ') + '\nEjecuta: node tools/build.mjs'); process.exit(1); }
    console.log('Todo al día.');
  } else {
    console.log(changed.length ? 'Actualizado: ' + changed.join(', ') : 'Sin cambios.');
  }
}
