#!/usr/bin/env node
// Avisa a los buscadores que usan IndexNow (Bing, Yandex, Seznam, Naver…) de las direcciones del sitemap.
//
//   node tools/indexnow.mjs                 todas las direcciones de sitemap.xml
//   node tools/indexnow.mjs /blog/x/ /y/    solo esas
//
// Se ejecuta DESPUÉS de publicar (las páginas tienen que estar ya en producción). La clave es el archivo
// <clave>.txt de la raíz: si se cambia, se borra el viejo y se crea otro con 32 caracteres hexadecimales.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'editstudio.app';
const keyFile = readdirSync(ROOT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('No hay archivo de clave IndexNow (<32 hex>.txt) en la raíz.'); process.exit(1); }
const key = readFileSync(join(ROOT, keyFile), 'utf8').trim();
if (key + '.txt' !== keyFile) { console.error(`${keyFile}: el contenido tiene que ser la propia clave.`); process.exit(1); }

const args = process.argv.slice(2);
const urlList = args.length
  ? args.map((p) => (p.startsWith('https://') ? p : `https://${HOST}${p.startsWith('/') ? '' : '/'}${p}`))
  : [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const live = await fetch(`https://${HOST}/${keyFile}`);
if (!live.ok || (await live.text()).trim() !== key) { console.error(`La clave no está publicada en https://${HOST}/${keyFile}: publica antes de avisar.`); process.exit(1); }

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} · ${urlList.length} direcciones`);
if (res.status >= 400) process.exit(1);
