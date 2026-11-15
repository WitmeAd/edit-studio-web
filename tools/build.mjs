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
//   7. Páginas temáticas: content/paginas/*.md  ->  <slug>/index.html (armario digital, probador, profesionales…)
//
// El blog y 404.html toman de la portada la barra, el colofón, las insignias de tienda, la precarga de las fuentes y el
// script de «Descargar»: se cambian en index.html y aquí se copian.
//
// No borra nada: si quitas un artículo, borra tú su carpeta en blog/ (el script avisa).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform as i18nTransform, catalog as i18nCatalog } from './i18n.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ───────────────────────────── Datos del sitio ─────────────────────────────
const SITE = {
  url: 'https://editstudio.app',
  name: 'édit',
  // Fecha del último cambio de contenido de la portada (AAAA-MM-DD). Se actualiza a mano el día en que se publica; sale en
  // sitemap.xml, en llms.txt y en los datos estructurados. tools/check.mjs avisa si index.html ha cambiado después.
  homeUpdated: '2026-11-15',
  // Otros nombres del sitio, por si el buscador no elige «édit» como nombre: el descriptivo y el dominio.
  alternateNames: ['édit studio', 'editstudio.app'],
  legalName: 'WITME ADVERTISING S.L.',
  // Nombre de la app en cada tienda (App Store y Google Play, comprobados el 10/11/2026). En los datos estructurados la app
  // se llama «édit» y estos dos van como nombres alternativos.
  appStoreNames: ['édit: armario y estilo', 'édit: armario, estilo y looks'],
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
export const homeUpdated = SITE.homeUpdated;
const ORG_ID = SITE.url + '/#organization';
const WEB_ID = SITE.url + '/#website';
const APP_ID = SITE.url + '/#app';

// ───────────────────────────── Idiomas ─────────────────────────────
// El español vive en la raíz; los demás, en /en/, /fr/, /it/ y /pt/. Cada idioma tiene content/i18n/<idioma>.json con
// «ui» (los textos de las plantillas) y «portada» (las traducciones de los textos de index.html), y sus páginas
// temáticas en content/paginas/<idioma>/*.md (con «traduce: <slug en español>»).
export const LANGS = ['es', 'en', 'fr', 'it', 'pt'];
const LANG_INFO = {
  es: { name: 'Español', locale: 'es_ES', hreflang: 'es' },
  en: { name: 'English', locale: 'en_US', hreflang: 'en' },
  fr: { name: 'Français', locale: 'fr_FR', hreflang: 'fr' },
  it: { name: 'Italiano', locale: 'it_IT', hreflang: 'it' },
  pt: { name: 'Português', locale: 'pt_PT', hreflang: 'pt' },
};
const UI_ES = {
  inicio: 'Inicio', estasEn: 'Estás en', actualizado: 'Actualizado el', enBreve: 'En breve.', masSobre: 'Más sobre {0}édit{/0}.',
  videoSinSonido: 'Vídeo sin sonido.', saltar: 'Saltar al contenido', idioma: 'Idioma',
  cierreTitulo: 'Empezamos por lo que ya {0}tienes{/0}.', cierreTexto: 'Descarga édit y empieza a vestirte con más intención hoy mismo.',
  proTitulo: 'Tu estudio, en un {0}sitio{/0}.', proTexto: 'Crea tu cuenta de asesora en la web y trabaja desde el ordenador o desde la app.',
  proBoton: 'Crear mi cuenta de asesora', proLogin: 'Ya tengo cuenta',
  enEstaPagina: 'En esta página', enLaPortada: 'En la portada', volverArriba: 'édit, volver arriba', marcaInicio: 'édit, inicio',
  preguntasFrecuentes: 'Preguntas frecuentes', paginasTitulo: 'Más sobre {0}édit{/0}.',
};
const I18N = {};
function i18n(lang) {
  if (lang === 'es') return { ui: UI_ES, portada: null };
  if (!I18N[lang]) {
    const rel = `content/i18n/${lang}.json`;
    if (!existsSync(join(ROOT, rel))) return null;
    let data;
    try { data = JSON.parse(read(rel)); } catch (e) { fail(`${rel}: JSON no válido (${e.message})`); }
    const ui = { ...data.ui };
    for (const k of Object.keys(UI_ES)) if (!ui[k]) fail(`${rel}: falta ui.${k}`);
    I18N[lang] = { ui, portada: data.portada || {} };
  }
  return I18N[lang];
}
// Idiomas activos: el español y los que tienen su archivo de traducciones.
export const activeLangs = () => LANGS.filter((l) => l === 'es' || existsSync(join(ROOT, `content/i18n/${l}.json`)));
const homePath = (lang) => (lang === 'es' ? '/' : `/${lang}/`);
function fechaLang(iso, lang) {
  if (lang === 'es') return fechaLarga(iso);
  fechaLarga(iso);
  return new Intl.DateTimeFormat(LANG_INFO[lang].hreflang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
}
// «Texto con {0}marca{/0}» -> «Texto con <em>marca</em>».
const em = (s) => esc(s).replace(/\{0\}/g, '<em>').replace(/\{\/0\}/g, '</em>');
// Enlaces <link rel="alternate" hreflang> de una página que existe en varios idiomas (alts: { es: '/', en: '/en/' … }).
function hreflangTags(alts) {
  const langs = LANGS.filter((l) => alts && alts[l]);
  if (langs.length < 2) return '';
  return langs.map((l) => `<link rel="alternate" hreflang="${LANG_INFO[l].hreflang}" href="${abs(alts[l])}">`).join('\n') +
    (alts.es ? `\n<link rel="alternate" hreflang="x-default" href="${abs(alts.es)}">` : '') + '\n';
}
// Selector de idioma del colofón: la misma página en cada idioma, o su portada si no está traducida.
const IDIOMAS_INI = '<!-- idiomas:inicio (generado por tools/build.mjs; no editar a mano) -->';
const IDIOMAS_FIN = '<!-- idiomas:fin -->';
function langNav(lang, alts) {
  const langs = activeLangs();
  if (langs.length < 2) return '';
  const ui = i18n(lang).ui;
  return `<nav class="idiomas" aria-label="${esc(ui.idioma)}">` + langs.map((l) => {
    const href = (alts && alts[l]) || homePath(l);
    return `<a href="${href}" hreflang="${LANG_INFO[l].hreflang}" lang="${LANG_INFO[l].hreflang}"${l === lang ? ' aria-current="page"' : ''}>${LANG_INFO[l].name}</a>`;
  }).join(' ') + '</nav>';
}
function fillLangNav(html, lang, alts, where) {
  const a = html.indexOf(IDIOMAS_INI), b = html.indexOf(IDIOMAS_FIN);
  if (a === -1 || b < a) fail(`${where}: faltan las marcas «idiomas:inicio» y «idiomas:fin» del colofón`);
  const indent = (/\n([ \t]*)$/.exec(html.slice(0, a)) || ['', ''])[1];
  const nav = langNav(lang, alts);
  return html.slice(0, a) + IDIOMAS_INI + '\n' + (nav ? indent + nav + '\n' : '') + indent + html.slice(b);
}
// Pone (o renueva) los <link rel="alternate" hreflang> justo después de la canónica.
function setHreflang(html, alts) {
  html = html.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n/g, '');
  const tags = hreflangTags(alts);
  return tags ? html.replace(/(<link rel="canonical" href="[^"]*">\n)/, `$1${tags}`) : html;
}

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
// Un nodo por línea y sin sangría: pesa menos y, cuando cambia algo, cambia solo la línea de su nodo.
function jsonLd(graph) {
  const json = '{"@context":"https://schema.org","@graph":[\n' + graph.map((n) => JSON.stringify(n)).join(',\n') + '\n]}';
  return '<script type="application/ld+json">\n' + json.replace(/</g, '\\u003c') + '\n</script>';
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
const ogAltCache = {};
function ogImageAlt(lang = 'es') {
  if (ogAltCache[lang] === undefined) ogAltCache[lang] = unesc((/<meta property="og:image:alt" content="([^"]*)"/.exec(lang === 'es' ? read('index.html') : LOCAL_HOME[lang] || '') || [])[1] || '');
  if (!ogAltCache[lang]) fail(`${lang === 'es' ? 'index.html' : lang + '/index.html'}: falta og:image:alt`);
  return ogAltCache[lang];
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
// Las tres últimas palabras de un párrafo corto no se separan: no queda media cita sola en la última línea.
const sinViuda = (html) => html.replace(/ (\S+) (\S+)$/, '&nbsp;$1&nbsp;$2');

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
let partsCache = {};
const LOCAL_HOME = {};
function homeParts(lang = 'es') {
  if (partsCache[lang]) return partsCache[lang];
  const html = lang === 'es' ? read('index.html') : LOCAL_HOME[lang];
  if (!html) fail(`no hay portada en «${lang}» todavía`);
  const where = lang === 'es' ? 'index.html' : `${lang}/index.html`;
  const ui = i18n(lang).ui;
  const home = homePath(lang);
  const fromRoot = (s) => s.replace(/href="#top"/g, `href="${home}"`).replace(/href="#/g, `href="${home}#`).replace(/(src|srcset)="assets\//g, '$1="/assets/');
  // Fuentes propias: las mismas precargas de la portada (las @font-face viajan en los estilos comunes).
  const fonts = [...html.matchAll(/<link rel="preload" href="([^"]+\.woff2)" as="font" type="font\/woff2" crossorigin>/g)].map((m) => m[1]);
  if (!fonts.length) fail(`${where}: no encuentro la precarga de las fuentes (<link rel="preload" … as="font">)`);
  const NAV = '<header class="nav" id="nav">', FOOTER = '<footer class="colofon">', BADGES = '<div class="tiendas">';
  const nav = fromRoot(NAV + between(html, NAV, '</header>', where) + '</header>');
  const foot = fromRoot(FOOTER + between(html, FOOTER, '</footer>', where) + '</footer>')
    .replace(`aria-label="${esc(ui.volverArriba)}"`, `aria-label="${esc(ui.marcaInicio)}"`)
    .split(esc(ui.enEstaPagina)).join(esc(ui.enLaPortada));
  const badges = fromRoot(BADGES + between(html, BADGES, '</div>', where) + '</div>').replace(/\n\s+/g, '\n      ');
  const store = (/\/\* tienda:inicio[\s\S]*?\*\/\n([\s\S]*?)\n\/\* tienda:fin \*\//.exec(html) || [])[1];
  if (!store) fail(`${where}: no encuentro el script entre «/* tienda:inicio … */» y «/* tienda:fin */»`);
  if (lang === 'es') {
    for (const [name, piece] of [['la barra', nav], ['el colofón', foot]]) {
      if (!piece.includes('href="/blog/"')) fail(`${where}: ${name} no enlaza al blog`);
    }
  }
  return (partsCache[lang] = { fonts, nav, foot, badges, store });
}

// Filas de artículos (las mismas en la portada, en el índice del blog y en «Sigue leyendo»).
function notas(posts, { tag, meta, indent, cls = 'notas' }) {
  return `${indent}<ol class="${cls}">\n` +
    posts.map((p, i) => `${indent}  <li class="nota"><a href="${p.path}"><span class="sc">${meta(p, i)}</span><${tag} class="h4">${inline(p.title, p.where)}</${tag}><p>${sinViuda(esc(p.description))}</p>${GO}</a></li>`).join('\n') +
    `\n${indent}</ol>`;
}

// Sustituye la lista entre las marcas del bloque «Del blog» por la que se le pase.
function fillBlogList(html, items, where) {
  const b0 = html.indexOf(BLOG_INI), b1 = html.indexOf(BLOG_FIN);
  if (b0 === -1 || b1 < b0) fail(`${where}: faltan las marcas «blog:inicio» y «blog:fin» del bloque «Del blog»`);
  const indent = (/\n([ \t]*)$/.exec(html.slice(0, b0)) || ['', ''])[1];
  return html.slice(0, b0) + BLOG_INI + '\n' + notas(items, { tag: 'h3', meta: (p, i) => dos(i + 1), indent }) + '\n' + indent + html.slice(b1);
}

function buildHome(posts, alts) {
  let html = read('index.html');
  html = fillBlogList(html, posts.slice(0, SITE.homePosts), 'index.html');
  html = fillLangNav(html, 'es', alts, 'index.html');
  html = setHreflang(html, alts);
  html = setHomeLd(html, 'es', 'index.html');
  write('index.html', html);
  partsCache = {};
  return html;
}

// Datos estructurados de una portada (la española o una traducida), sacados de lo que se ve en ella.
function setHomeLd(html, lang, where) {
  const path = homePath(lang);
  const title = plain((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '');
  const description = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  if (!title || !description) fail(`${where}: falta <title> o la descripción`);
  const faq = extractFaq(html);
  const nDetails = (html.match(/<details>/g) || []).length;
  if (faq.length !== nDetails) fail(`${where}: hay ${nDetails} preguntas pero solo se han podido leer ${faq.length}; revisa el formato de <details>`);
  const inLang = LANG_INFO[lang].hreflang;
  const pageId = abs(path) + '#webpage';

  const shot = imageSize(join(ROOT, SITE.appScreenshot));
  if (!shot) fail(`no puedo leer el tamaño de ${SITE.appScreenshot}`);
  const shotAlt = unesc((new RegExp(`<img\\s[^>]*src="/?${SITE.appScreenshot.slice(1).replace(/\./g, '\\.')}"[^>]*\\salt="([^"]*)"`).exec(html) || [])[1] || '');
  if (!shotAlt) fail(`${where}: la captura ${SITE.appScreenshot} tiene que estar en la página, con su texto alternativo`);
  const features = extractFeatures(html);

  // Película de la portada: su descripción es la que lleva el vídeo en la página (aria-label).
  const film = SITE.heroVideo;
  const filmLabel = unesc((/id="film-hero"[\s\S]*?<video\s[^>]*\saria-label="([^"]*)"/.exec(html) || [])[1] || '').replace(new RegExp('^' + i18n(lang).ui.videoSinSonido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '');
  if (!filmLabel) fail(`${where}: el vídeo de la portada (#film-hero) necesita un aria-label que cuente lo que se ve`);
  for (const f of [film.file, film.poster]) if (!existsSync(join(ROOT, f))) fail(`no existe ${f} (SITE.heroVideo)`);
  // Imagen principal de la página: el fotograma de la película de la portada, que es lo primero que se ve.
  const posterSize = imageSize(join(ROOT, film.poster));
  if (!posterSize) fail(`no puedo leer el tamaño de ${film.poster}`);
  const FILM_ID = abs(path) + '#pelicula';
  const stores = storeLinks(lang);

  const graph = [
    orgNode(),
    { '@type': 'WebSite', '@id': WEB_ID, url: SITE.url + '/', name: SITE.name, alternateName: SITE.alternateNames, inLanguage: activeLangs().map((l) => LANG_INFO[l].hreflang), publisher: { '@id': ORG_ID } },
    {
      '@type': 'WebPage',
      '@id': pageId,
      url: abs(path),
      name: title,
      description,
      inLanguage: inLang,
      dateModified: fechaHora(SITE.homeUpdated),
      isPartOf: { '@id': WEB_ID },
      about: { '@id': APP_ID },
      mainEntity: { '@id': APP_ID },
      primaryImageOfPage: { '@type': 'ImageObject', url: abs(film.poster), width: posterSize.width, height: posterSize.height },
      video: { '@id': FILM_ID },
    },
    {
      '@type': 'MobileApplication',
      '@id': APP_ID,
      name: SITE.name,
      alternateName: SITE.appStoreNames,
      description,
      url: abs(path),
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
      '@id': abs(path) + '#preguntas',
      inLanguage: inLang,
      isPartOf: { '@id': pageId },
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  const block = INI + '\n' + jsonLd(graph) + '\n' + FIN;
  const a = html.indexOf(INI), b = html.indexOf(FIN);
  if (a !== -1 && b > a) return html.slice(0, a) + block + html.slice(b + FIN.length);
  if (html.includes('</head>')) return html.replace('</head>', block + '\n</head>');
  fail(`${where}: no encuentro </head>`);
}

// Tiendas: en español, la ficha española; en los demás idiomas, la que corresponda al país de quien la abra.
function storeLinks(lang) {
  if (lang === 'es') return [SITE.appStore, SITE.googlePlay];
  return [SITE.appStore.replace('/es/app/', '/app/'), `${SITE.googlePlay}&hl=${LANG_INFO[lang].hreflang}`];
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
  const isBlock = (l) => /^(#{1,6}\s|>\s?|[-*]\s+|\d+\.\s+|---+\s*$|!\[|\|)/.test(l);
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
    // Tabla: líneas que empiezan por «|». La primera es la cabecera; la de guiones que la sigue se ignora.
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim(), where));
      const [hd, ...rest] = rows.filter((r) => !/^\|[\s:|-]+\|?\s*$/.test(r));
      out.push(`<div class="tabla"><table>\n<thead><tr>${cells(hd).map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>\n<tbody>\n${rest.map((r) => { const [first, ...o] = cells(r); return `<tr><th scope="row">${first}</th>${o.map((c) => `<td>${c}</td>`).join('')}</tr>`; }).join('\n')}\n</tbody>\n</table></div>`);
      continue;
    }
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

// Lee un .md con cabecera entre líneas ---. Devuelve null si es un borrador.
function parseMd(dirRel, file) {
  const where = dirRel + '/' + file;
  const raw = readFileSync(join(ROOT, dirRel, file), 'utf8').replace(/\r\n?/g, '\n');
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
  if (meta.borrador === 'si' || meta.borrador === 'sí') return null;
  const slug = meta.slug || slugify(file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`${where}: slug no válido «${slug}»`);
  fechaLarga(meta.fecha);
  if (meta.actualizado) fechaLarga(meta.actualizado);
  return { where, meta, body: m[2], slug };
}

function loadPosts() {
  const dir = join(ROOT, 'content/blog');
  if (!existsSync(dir)) return [];
  const posts = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const parsed = parseMd('content/blog', file);
    if (!parsed) continue;
    const { where, meta, slug } = parsed;
    if (posts.some((p) => p.slug === slug)) fail(`${where}: slug repetido «${slug}»`);
    const body = parsed.body;
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
function head({ title, description, path, type, image, imageAlt, extra = '', ld, noindex = false, lang = 'es', alts = null }) {
  const parts = homeParts(lang);
  const ui = i18n(lang).ui;
  const seo = noindex
    ? `<meta name="robots" content="noindex">`
    : `<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
${hreflangTags(alts)}<meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1">`;
  const alt = noindex ? '' : imageAlt || ogImageAlt(lang);
  const share = noindex
    ? ''
    : `<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="${LANG_INFO[lang].locale}">
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
<html lang="${LANG_INFO[lang].hreflang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${seo}
<meta name="theme-color" content="${SITE.themeColor}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${share}${parts.fonts.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<link rel="stylesheet" href="/assets/css/blog.css">
${noindex ? '' : jsonLd(ld) + '\n'}</head>
<body id="top">

<a class="salto" href="#contenido">${esc(ui.saltar)}</a>

${nav}
`;
}

// Cierre con las insignias de tienda (las de la portada).
function cta(lang = 'es') {
  const ui = i18n(lang).ui;
  return `<aside class="cierre" aria-labelledby="t-cierre">
  <div class="cierre__in">
    <h2 class="h2" id="t-cierre">${em(ui.cierreTitulo)}</h2>
    <p>${esc(ui.cierreTexto)}</p>
    ${homeParts(lang).badges.replace(/\n {6}/g, '\n    ')}
  </div>
</aside>`;
}

// Colofón de la portada y el script que lleva «Descargar» a la tienda del móvil.
function foot(lang = 'es', alts = null) {
  const parts = homeParts(lang);
  return `${fillLangNav(parts.foot, lang, alts, lang + ': colofón')}

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

// ───────────────────────────── 3b. Páginas temáticas ─────────────────────────────
// content/paginas/*.md  ->  <slug>/index.html (en la raíz: /armario-digital/, /profesionales/…).
// Cabecera: titulo (el <h1>), descripcion, fecha, y opcionales: titulo_seo (el <title>, si no, «titulo · édit»), rotulo
// (versalitas sobre el <h1>), migas (nombre corto en las migas, el colofón y las listas), resumen, actualizado, orden,
// tipo (producto | comparativa | profesionales), video (nombre de un clip de assets/video) con video_alt, y cta (app | pro).
// Si el texto lleva un apartado «## Preguntas frecuentes», sus «###» y sus respuestas salen como FAQPage.
const RESERVED = new Set(['blog', 'assets', 'new', 'content', 'tools', ...LANGS]);

export function faqFromMarkdown(body, heading = 'Preguntas frecuentes') {
  const FAQ_HEAD = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  const at = body.search(FAQ_HEAD);
  if (at === -1) return [];
  const rest = body.slice(at).replace(FAQ_HEAD, '');
  const end = rest.search(/^## /m);
  const block = end === -1 ? rest : rest.slice(0, end);
  return [...block.matchAll(/^### (.+)\n+([\s\S]*?)(?=^### |(?![\s\S]))/gm)].map((m) => ({ q: mdPlain(m[1]), a: mdPlain(m[2]) }));
}

function loadPages(lang = 'es') {
  const rel = lang === 'es' ? 'content/paginas' : `content/paginas/${lang}`;
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) return [];
  const pages = [];
  const ui = i18n(lang).ui;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const parsed = parseMd(rel, file);
    if (!parsed) continue;
    const { where, meta, body, slug } = parsed;
    if (lang !== 'es' && !meta.traduce) fail(`${where}: falta «traduce:» con el slug de la página en español`);
    if (RESERVED.has(slug)) fail(`${where}: «${slug}» es una carpeta reservada`);
    if (pages.some((p) => p.slug === slug)) fail(`${where}: slug repetido «${slug}»`);
    const tipo = meta.tipo || 'producto';
    if (!['producto', 'comparativa', 'profesionales'].includes(tipo)) fail(`${where}: tipo no válido «${tipo}»`);
    let video = null;
    if (meta.video) {
      const base = `/assets/video/${meta.video}`;
      for (const f of [base + '.mp4', base + '.jpg']) if (!existsSync(join(ROOT, f))) fail(`${where}: no existe ${f}`);
      if (!meta.video_alt || meta.video_alt.length < 40) fail(`${where}: el vídeo necesita video_alt (qué se ve, 40 caracteres o más)`);
      const size = imageSize(join(ROOT, base + '.jpg'));
      video = { file: base + '.mp4', poster: base + '.jpg', alt: meta.video_alt, ...size };
    }
    pages.push({
      slug,
      where,
      tipo,
      title: meta.titulo,
      seoTitle: meta.titulo_seo || `${meta.titulo} · édit`,
      short: meta.migas || meta.titulo,
      rotulo: meta.rotulo || '',
      description: meta.descripcion,
      summary: meta.resumen || '',
      date: meta.fecha,
      updated: meta.actualizado && meta.actualizado > meta.fecha ? meta.actualizado : meta.fecha,
      order: Number(meta.orden || 99),
      cta: meta.cta || (tipo === 'profesionales' ? 'pro' : 'app'),
      video,
      faq: faqFromMarkdown(body, ui.preguntasFrecuentes),
      html: markdown(body, where),
      path: lang === 'es' ? `/${slug}/` : `/${lang}/${slug}/`,
      lang,
      es: lang === 'es' ? slug : meta.traduce,
    });
  }
  return pages.sort((a, b) => a.order - b.order || (a.slug < b.slug ? -1 : 1));
}

// Cierre para profesionales: alta como asesora en la web, y la app en las tiendas.
function ctaPro(lang = 'es') {
  const ui = i18n(lang).ui;
  return `<aside class="cierre cierre--pro" aria-labelledby="t-cierre">
  <div class="cierre__in">
    <h2 class="h2" id="t-cierre">${em(ui.proTitulo)}</h2>
    <p>${esc(ui.proTexto)}</p>
    <p class="cierre__btns"><a class="btn" href="https://dashboard.editstudio.app/signup?role=stylist">${esc(ui.proBoton)}</a> <a class="link" href="https://dashboard.editstudio.app/login">${esc(ui.proLogin)}</a></p>
    ${homeParts(lang).badges.replace(/\n {6}/g, '\n    ')}
  </div>
</aside>`;
}

// Enlaces internos de una página traducida: a la versión de ese idioma cuando existe.
function localizeLinks(html, lang, routes) {
  if (lang === 'es') return html;
  return html.replace(/href="(\/[^"#?]*)((?:#[^"]*)?)"/g, (m, path, hash) => {
    const to = routes[path];
    return to ? `href="${to}${hash}"` : m;
  });
}

function renderPage(p, pages, posts, alts, routes) {
  const lang = p.lang;
  const ui = i18n(lang).ui;
  const inLang = LANG_INFO[lang].hreflang;
  const webpageId = abs(p.path) + '#webpage';
  const ld = [
    {
      '@type': 'WebPage',
      '@id': webpageId,
      url: abs(p.path),
      name: p.title,
      headline: p.title,
      description: p.description,
      inLanguage: inLang,
      datePublished: fechaHora(p.date),
      dateModified: fechaHora(p.updated),
      isPartOf: { '@type': 'WebSite', '@id': WEB_ID, url: SITE.url + '/', name: SITE.name },
      about: { '@type': 'MobileApplication', '@id': APP_ID, name: SITE.name, url: SITE.url + '/', applicationCategory: 'LifestyleApplication', operatingSystem: 'iOS, Android' },
      publisher: { '@id': ORG_ID },
      ...(p.video ? { video: { '@type': 'VideoObject', name: p.title, description: p.video.alt, thumbnailUrl: abs(p.video.poster), contentUrl: abs(p.video.file), uploadDate: fechaHora(p.date), inLanguage: 'es', publisher: { '@id': ORG_ID } } } : {}),
    },
    crumbs([[ui.inicio, homePath(lang)], [p.short, p.path]]),
    orgNode(),
  ];
  if (p.faq.length) {
    ld.push({
      '@type': 'FAQPage',
      '@id': abs(p.path) + '#preguntas-frecuentes',
      inLanguage: inLang,
      isPartOf: { '@id': webpageId },
      mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  const others = pages.filter((o) => o.slug !== p.slug);
  const film = p.video
    ? `<figure class="pagina__film"><video src="${p.video.file}" poster="${p.video.poster}" width="${p.video.width}" height="${p.video.height}" muted playsinline loop controls preload="none" aria-label="${esc(ui.videoSinSonido)} ${esc(p.video.alt)}"></video></figure>\n`
    : '';
  const more = lang === 'es' ? [...others, ...posts.slice(0, 2)] : others;
  return head({ title: p.seoTitle, description: p.description, path: p.path, type: 'website', image: SITE.ogImage, ld, lang, alts }) + localizeLinks(`
<main id="contenido" tabindex="-1">
<article class="post pagina calma">
  <header class="post__cab lectura">
    <nav class="migas sc" aria-label="${esc(ui.estasEn)}"><a href="${homePath(lang)}">${esc(ui.inicio)}</a> <span aria-hidden="true">/</span> <span>${esc(p.short)}</span></nav>
${p.rotulo ? `    <p class="sc rotulo">${esc(p.rotulo)}</p>\n` : ''}    <h1>${inline(p.title, p.where)}</h1>
    <p class="post-meta sc">${esc(ui.actualizado)} <time datetime="${p.updated}">${fechaLang(p.updated, lang)}</time></p>
  </header>
  <div class="post__body lectura">
${p.summary ? `<p class="post__resumen"><strong class="sc">${esc(ui.enBreve)}</strong> ${inline(p.summary, p.where)}</p>\n` : ''}${film}${p.html}
  </div>
</article>
${p.cta === 'pro' ? ctaPro(lang) : cta(lang)}
<section class="section calma mas" aria-labelledby="t-mas">
  <div class="wrap">
    <header class="cab"><h2 class="h2" id="t-mas">${em(ui.masSobre)}</h2></header>
${notas(more.map((o) => ({ ...o, title: o.short || o.title })), { tag: 'h3', meta: (o, i) => dos(i + 1), indent: '    ' })}
  </div>
</section>
</main>

`, lang, routes) + foot(lang, alts);
}

function buildPages(pages, posts, altsOf, routes) {
  for (const p of pages) write(`${p.path.slice(1)}index.html`, renderPage(p, pages, posts, altsOf(p.es), routes));
}

// ───────────────────────────── 7. Portada en otros idiomas ─────────────────────────────
// Se genera a partir de index.html (ya con su lista del blog y sus datos estructurados) y content/i18n/<idioma>.json.
function buildLocalHome(lang, esHtml, pages, alts, routes) {
  const where = `content/i18n/${lang}.json`;
  const { portada } = i18n(lang);
  const missing = [];
  const used = new Set();
  let html;
  try {
    html = i18nTransform(esHtml, (src) => {
      const t = portada[src];
      if (typeof t !== 'string' || !t.trim()) { missing.push(src); return src; }
      used.add(src);
      return t;
    });
  } catch (e) { fail(`${where}: ${e.message}`); }
  if (missing.length) fail(`${where}: faltan ${missing.length} traducciones de la portada; la primera: «${missing[0]}». La lista completa está en content/i18n/_catalogo-portada.json`);
  const stale = Object.keys(portada).filter((k) => !used.has(k));
  if (stale.length) console.warn(`AVISO: ${where}: ${stale.length} traducciones ya no corresponden a ningún texto de la portada (la primera: «${stale[0]}»)`);
  const info = LANG_INFO[lang];
  const home = homePath(lang);
  html = html.replace('<html lang="es"', `<html lang="${info.hreflang}"`);
  // Rutas desde la raíz: la página vive en /<idioma>/.
  html = html.replace(/(\s(?:href|src|srcset|poster|data-ancho|data-movil)=")([^"]*)"/g, (m, a, v) => a + v.replace(/(^|[\s,])(assets\/|favicon\.|apple-touch-icon\.)/g, '$1/$2') + '"');
  html = html.replace(/(<link rel="canonical" href=")[^"]*"/, `$1${abs(home)}"`).replace(/(<meta property="og:url" content=")[^"]*"/, `$1${abs(home)}"`);
  html = html.replace(/(<meta property="og:locale" content=")[^"]*"/, `$1${info.locale}"`);
  // Tiendas e insignias del idioma.
  const [appStore, googlePlay] = storeLinks(lang);
  html = html.split(SITE.appStore).join(appStore).split(SITE.googlePlay + '"').join(googlePlay + '"').split(SITE.googlePlay + "'").join(googlePlay + "'");
  html = html.replace(/\/assets\/img\/badge-app-store\.png/g, '/assets/img/badge-app-store-en.svg')
    .replace(/(\/assets\/img\/badge-google-play)\.png"([^>]*?)width="486"/g, `$1-${lang}.png"$2width="490"`);
  // El blog solo está en español: fuera sus enlaces, y en su bloque, las páginas de este idioma.
  html = html.replace(/[ \t]*<li>\s*<a href="\/blog\/"[^>]*>[\s\S]*?<\/a>\s*<\/li>\n?/g, '').replace(/\s*<a(?:\s[^>]*)?\shref="\/blog\/"[^>]*>[\s\S]*?<\/a>/g, '');
  html = fillBlogList(html, pages.map((p) => ({ ...p, title: p.short })), `${lang}/index.html`);
  html = localizeLinks(html, lang, routes);
  html = fillLangNav(html, lang, alts, `${lang}/index.html`);
  html = setHreflang(html, alts);
  html = setHomeLd(html, lang, `${lang}/index.html`);
  LOCAL_HOME[lang] = html;
  delete partsCache[lang];
  delete ogAltCache[lang];
  write(`${lang}/index.html`, html);
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
function buildSitemap(posts, pages = [], homeAlts = null, altsOf = () => null) {
  fechaLarga(SITE.homeUpdated);
  const urls = [];
  for (const l of Object.keys(homeAlts || { es: '/' })) urls.push({ loc: homePath(l), lastmod: SITE.homeUpdated, alts: homeAlts });
  for (const p of pages) urls.push({ loc: p.path, lastmod: p.updated, alts: altsOf(p.es) });
  if (posts.length) {
    urls.push({ loc: '/blog/', lastmod: posts.map((p) => p.updated).sort().pop() });
    for (const p of posts) urls.push({ loc: p.path, lastmod: p.updated });
  }
  const links = (alts) => {
    const ls = LANGS.filter((l) => alts && alts[l]);
    if (ls.length < 2) return '';
    return ls.map((l) => `<xhtml:link rel="alternate" hreflang="${LANG_INFO[l].hreflang}" href="${abs(alts[l])}"/>`).join('') +
      (alts.es ? `<xhtml:link rel="alternate" hreflang="x-default" href="${abs(alts.es)}"/>` : '');
  };
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.map((u) => `  <url><loc>${abs(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${links(u.alts)}</url>`).join('\n') +
    '\n</urlset>\n';
  write('sitemap.xml', xml);
}

// ───────────────────────────── 5. llms.txt ─────────────────────────────
function buildLlms(posts, pages = []) {
  if (!existsSync(join(ROOT, 'content/llms.txt'))) return;
  const tpl = read('content/llms.txt');
  if (!tpl.includes('{{blog}}')) fail('content/llms.txt: falta la marca {{blog}}');
  const list = posts.length
    ? posts.map((p) => `- [${p.title}](${abs(p.path)}): ${p.description}`).join('\n')
    : '- Todavía no hay artículos publicados.';
  // {{actualizado}} (opcional) es la fecha del último cambio de la portada, la misma del sitemap.
  const guides = pages.map((p) => `- [${p.short}](${abs(p.path)}): ${p.description}`).join('\n');
  if (pages.length && !tpl.includes('{{paginas}}')) fail('content/llms.txt: falta la marca {{paginas}}');
  write('llms.txt', tpl.replace('{{blog}}', list).replace('{{paginas}}', guides).replace('{{actualizado}}', fechaLarga(SITE.homeUpdated)));
}

// ───────────────────────────── Ejecución ─────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const posts = loadPosts();
  const langs = activeLangs();
  const pagesBy = Object.fromEntries(langs.map((l) => [l, loadPages(l)]));
  // Versiones de cada página: portada y páginas temáticas, por idioma.
  const homeAlts = Object.fromEntries(langs.map((l) => [l, homePath(l)]));
  const altsOf = (esSlug) => {
    const out = {};
    for (const l of langs) { const p = pagesBy[l].find((x) => x.es === esSlug); if (p) out[l] = p.path; }
    return out;
  };
  for (const l of langs) for (const p of pagesBy[l]) if (l !== 'es' && !pagesBy.es.some((e) => e.slug === p.es)) fail(`${p.where}: «traduce: ${p.es}» no es ninguna página en español`);
  const routesOf = (l) => Object.fromEntries([['/', homePath(l)], ...pagesBy.es.map((e) => [e.path, altsOf(e.slug)[l]]).filter(([, to]) => to)]);
  const esHtml = buildHome(posts, homeAlts);
  write('content/i18n/_catalogo-portada.json', JSON.stringify(i18nCatalog(esHtml).map((u) => u.src), null, 1) + '\n');
  for (const l of langs) if (l !== 'es') buildLocalHome(l, esHtml, pagesBy[l], homeAlts, routesOf(l));
  buildCss();
  buildBlog(posts);
  for (const l of langs) buildPages(pagesBy[l], posts, altsOf, routesOf(l));
  const allPages = langs.flatMap((l) => pagesBy[l]);
  buildSitemap(posts, allPages, homeAlts, altsOf);
  buildLlms(posts, pagesBy.es);
  build404();
  if (CHECK) {
    if (changed.length) { console.error('Sin generar o desactualizado: ' + changed.join(', ') + '\nEjecuta: node tools/build.mjs'); process.exit(1); }
    console.log('Todo al día.');
  } else {
    console.log(changed.length ? 'Actualizado: ' + changed.join(', ') : 'Sin cambios.');
  }
}
