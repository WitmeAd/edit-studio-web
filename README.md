# édit — El ecosistema de estilismo digital

Landing estática de [édit](https://editstudio.app): une tecnología, criterio personal y acompañamiento profesional para vestir con más intención.

> No va de ropa. Va de vestirse con intención.

La portada es `index.html`, con estilos y scripts en línea. El blog se escribe en Markdown y se convierte en páginas con un script de Node sin dependencias (`tools/build.mjs`). Las páginas generadas se guardan en el repositorio: el alojamiento publica la carpeta tal cual, sin paso de build.

> Subir a `main` publica el sitio. Antes de subir: `node tools/build.mjs` y `node tools/check.mjs`.

## Dos productos, una plataforma

| | édit · para ti | édit profesionales |
| --- | --- | --- |
| Para quién | Mujeres que quieren vestir con más intención y sacar más partido a su armario | Asesoras, estilistas y personal shoppers |
| Promesa | Tu armario, por fin con sentido | Tu estudio digital de estilismo |
| Sección | `#app` | `#pro` |

**édit · para ti**

- Digitaliza el armario: las prendas se reconocen y se organizan al subirlas.
- Propone looks según la agenda, el clima y cómo quieres sentirte.
- Recupera prendas olvidadas y combinaciones nuevas.
- Ayuda a comprar con criterio: qué falta de verdad y qué ya no encaja.

**édit profesionales**

- Ficha y armario de clienta: tallas, preferencias, prendas y notas en un solo lugar.
- Lookbooks editables en minutos.
- Cápsulas coherentes que se comparten al instante.
- Escala la metodología sin perder el sello de la profesional.

## Cómo funciona

1. **Entiende tu armario.** Digitaliza, organiza y visualiza las prendas.
2. **Crea combinaciones con intención.** Looks adaptados al estilo, los planes y las necesidades.
3. **Toma mejores decisiones.** Compra con más criterio y construye un estilo más coherente.

El mismo sistema se aplica a las clientas de una profesional: una experiencia más visual, organizada y escalable.

## Estructura de la página

1. Navegación fija: édit, édit profesionales, Cómo funciona e inicio de sesión.
2. Hero con dos caminos: usuaria y profesional.
3. Bifurcación de producto.
4. Puente: la tecnología amplifica el criterio, no lo sustituye.
5. Mundo édit (`#app`) y mundo profesionales (`#pro`).
6. Visión.
7. Cómo funciona (`#como-funciona`).
8. Ecosistema.
9. Preguntas frecuentes (`#preguntas`).
10. Descarga (`#descargar`): App Store y Google Play.
11. Pie: redes, enlaces del ecosistema, blog, preguntas, acceso a la cuenta y textos legales.

## Archivos

| Ruta | Qué es | Se edita a mano |
| --- | --- | --- |
| `index.html` | Portada | Sí (salvo el bloque de datos estructurados) |
| `assets/img/` | Imágenes de la portada, iconos e imagen para compartir | Sí |
| `assets/css/blog.css` | Estilos del blog | Sí |
| `content/blog/*.md` | Artículos del blog | Sí |
| `content/llms.txt` | Plantilla de `llms.txt` | Sí |
| `robots.txt` | Reglas para robots y dirección del sitemap | Sí |
| `blog/` | Páginas del blog | No, las genera `tools/build.mjs` |
| `sitemap.xml`, `llms.txt` | Mapa del sitio y resumen para asistentes | No, los genera `tools/build.mjs` |
| `404.html` | Página de «no encontrada» | No, la genera `tools/build.mjs` |
| `tools/build.mjs` | Generador | |
| `tools/check.mjs` | Comprobaciones antes de publicar | |

## Generar y comprobar

Hace falta Node (probado con la versión 24). No hay nada que instalar.

```bash
node tools/build.mjs          # genera lo que haya cambiado
node tools/build.mjs --check  # no escribe nada; falla si falta generar algo
node tools/check.mjs          # revisa todas las páginas; falla si hay errores
```

`tools/build.mjs` hace cinco cosas:

1. Escribe los datos estructurados (JSON-LD) de la portada entre los comentarios `datos-estructurados:inicio` y `datos-estructurados:fin`. Las preguntas frecuentes del marcado salen del texto visible de `#preguntas`, así que siempre coinciden.
2. Genera `blog/index.html` y una página por artículo en `blog/<slug>/index.html`.
3. Genera `sitemap.xml`. La fecha de la portada sale de la constante `homeUpdated` de `tools/build.mjs`: actualízala a mano cuando cambies el contenido de `index.html`.
4. Genera `llms.txt` a partir de `content/llms.txt` (sustituye `{{blog}}` por la lista de artículos).
5. Genera `404.html`, con la barra y el pie del blog. Lleva `noindex` y no entra en el sitemap.

`tools/check.mjs` comprueba, entre otras cosas: título (único) y descripción de cada página, dirección canónica única, un solo `<h1>`, datos estructurados válidos, sin valoraciones y con fechas que llevan zona horaria, que las preguntas del marcado sean las visibles, enlaces internos y anclas, textos alternativos de las imágenes, tamaño y texto alternativo de la imagen para compartir, que `sitemap.xml`, `llms.txt` y `404.html` estén al día, que `404.html` no aparezca en el sitemap y que en los textos no haya dominios ajenos ni términos que no usamos.

## Cambiar las preguntas frecuentes

Edita la sección `#preguntas` de `index.html` y ejecuta `node tools/build.mjs`: el marcado se actualiza solo.

## Publicar un artículo

1. Crea `content/blog/AAAA-MM-DD-titulo-del-articulo.md` con esta cabecera:

   ```
   ---
   titulo: Cómo digitalizar tu armario paso a paso
   descripcion: Una o dos frases (entre 70 y 165 caracteres) para buscadores y para el listado.
   fecha: 2026-11-10
   resumen: Dos o tres frases con la respuesta corta. Sale en un recuadro al principio.
   ---
   ```

   Opcionales: `actualizado` (fecha), `slug`, `autor`, `imagen` y `imagen_alt`, `borrador: si` (no se publica). Si el título lleva dos puntos, va entre comillas. En los datos estructurados la fecha sale con hora y zona horaria: las 09:00 de la península (constante `publishTime` de `tools/build.mjs`).
2. Escribe el texto en Markdown: `##` y `###` para los apartados, párrafos, negrita, cursiva, enlaces, listas, citas e imágenes con texto alternativo. Funciona mejor si cada `##` es la pregunta que se haría una lectora y el primer párrafo la responde.
3. Ejecuta `node tools/build.mjs` y `node tools/check.mjs`.
4. Sube juntos el `.md` y los archivos generados.

Para retirar un artículo, borra su `.md` y su carpeta en `blog/` (el generador avisa de las carpetas que sobran).

## Buscadores y asistentes

- `robots.txt` permite todo salvo `content/`, `tools/` y `README.md`, y declara el sitemap. Cloudflare añade delante sus propias reglas: el bloqueo de los robots de entrenamiento se gestiona en su panel, no aquí.
- `llms.txt` resume el producto y enlaza las páginas principales. Es una convención todavía poco adoptada: cuesta poco mantenerla, pero no sustituye a un buen contenido.
- Los datos estructurados describen la organización, la web, la app, las preguntas frecuentes y cada artículo. No incluyen valoraciones. La app declara precio 0 porque la descarga es gratuita.
- `404.html` solo se sirve en las direcciones que no existen si está activado en la configuración del alojamiento.

## Enlaces

| Destino | URL |
| --- | --- |
| Descargar | https://dashboard.editstudio.app/descargar |
| Iniciar sesión | https://dashboard.editstudio.app/login |
| Soporte | https://dashboard.editstudio.app/soporte |
| App Store | https://apps.apple.com/es/app/id6796045067 |
| Google Play | https://play.google.com/store/apps/details?id=edit.studio.app |
| Web | https://editstudio.app |
| Instagram | https://www.instagram.com/editstudio.app/ |
| LinkedIn | https://www.linkedin.com/company/146595565/ |

## Ver en local

Sirve la carpeta con cualquier servidor estático (por ejemplo `python3 -m http.server 8000`), o ábrela en MAMP y visita la raíz del sitio. El blog usa rutas desde la raíz (`/assets/…`), así que hay que verlo con servidor, no abriendo el archivo. El idioma de la página es español.
