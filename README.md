# édit — La app de armario digital y estilismo

Landing estática de [édit](https://editstudio.app), la app de estilismo personal para iPhone y Android, y de édit profesionales, el estudio digital para asesoras de imagen.

> No va de ropa. Va de vestirse con intención.

La portada es `index.html`, con sus estilos y scripts en línea. El blog se escribe en Markdown y se convierte en páginas con un script de Node sin dependencias (`tools/build.mjs`). Las páginas generadas se guardan en el repositorio: el alojamiento publica la carpeta tal cual, sin paso de build.

> Subir a `main` publica el sitio. Antes de subir: `node tools/build.mjs` y `node tools/check.mjs`, y repasa «Antes de publicar».

## Estructura de la portada

Una sola página. Cada función de édit y cada vídeo aparecen una vez.

| # | Bloque | Ancla | Qué lleva |
| --- | --- | --- | --- |
| 0 | Barra | — | Marca, anclas, Blog, «Iniciar sesión» y «Descargar». Cambia a umber sobre el bloque de profesionales |
| 1 | Portada | `#top` | Rótulo «App de armario digital y estilismo» y titular «Una foto tuya. Tres looks.» en el único `<h1>`, y la película `hero.mp4` |
| 2 | Índice | `#indice` | «Lo que hace édit.», una entradilla que dice qué es édit y siete filas (N.º 01-07), cada una con su glosa, que enlazan a cada bloque |
| 3 | Recorrido | `#armario`, `#probador` | Tres capítulos con escenario fijo y cinta métrica: una foto (rótulo «Armario digital»), en orden y probador (rótulo «Probador virtual») |
| 4 | Tira de looks | `#looks` | «Un pantalón negro. Ocho looks.»: ocho imágenes enteras, sin recortar |
| 5 | Respiro | — | «Tu armario no necesita estar lleno. Necesita tener sentido.» |
| 6 | Carrusel | `#a-tu-medida` | Tu semana, Tu color y Tu estilo: sello con icono, vídeo a la derecha desde 700 px y avance automático |
| 7 | Láminas | `#planes` | Planes y maleta, buscador del armario y compras con criterio |
| 8 | Asesora | `#asesora` | Tres pasos para trabajar con una asesora de imagen |
| 9 | Manifiesto | — | «La tecnología no sustituye el criterio. Lo amplifica.» |
| 10 | Profesionales | `#profesionales` | édit Pro: el estudio en vídeo y tres frases que lo siguen |
| 11 | Preguntas | `#preguntas` | Rótulo «Preguntas frecuentes» y diez preguntas con `<details>` nativo |
| 12 | Del blog | `#blog` | Los tres últimos artículos (lista generada) |
| 13 | Descarga | `#descargar` | «Vístete sin dudas.» y las dos insignias de tienda |
| 14 | Colofón | — | Enlaces de la página, blog, redes, acceso, textos legales y el nombre de la empresa |

Las anclas de la tabla son estables: las usan la barra, el índice, el blog, `llms.txt` y enlaces de fuera. `tools/check.mjs` falla si falta alguna.

Comportamiento que hay que conservar al tocar la página:

- **Vídeo.** Un solo motor para todos: se reproduce una película a la vez y solo si está en pantalla, cada una con su botón de pausa. Nada se descarga por adelantado salvo la película de la portada; el resto lleva `preload="none"` y viaja dentro de `<noscript>` hasta que le toca.
- **Sin JavaScript** todo el contenido está a la vista, con los controles nativos de vídeo. Si un script falla, la página vuelve sola a ese modo.
- **`prefers-reduced-motion`**, ahorro de datos o red lenta: sin reproducción ni avance automáticos; se ve el último fotograma de cada vídeo (`*-fin.jpg`) y un botón para reproducir.
- **Textura de sastre**: papel de patronaje solo entre bloques, nunca detrás de texto ni de vídeo; cinta métrica en el recorrido y pespunte en el colofón.
- **Primer pantallazo**: la película de la portada tiene que verse al cargar. El rótulo del `<h1>` no le quita sitio: en ordenador se descuenta del alto de la película (`--fh`) y en móvil, de los márgenes. Si cambias el rótulo, el titular o los botones, vuelve a mirar la portada a 1366×657, 1020×740, 390×844 y 360×740.

## Archivos

| Ruta | Qué es | Se edita a mano |
| --- | --- | --- |
| `index.html` | Portada | Sí (salvo los dos tramos generados: datos estructurados y lista «Del blog») |
| `assets/video/` | Vídeos de la portada. Cada `nombre.mp4` tiene su fotograma inicial `nombre.jpg` y el final `nombre-fin.jpg` | Sí |
| `assets/img/` | Looks de la tira, capturas de la app, insignias de tienda, icono e imagen para compartir (`og.png`, que sale de `tools/og.html`) | Sí |
| `content/blog/*.md` | Artículos del blog | Sí |
| `content/blog.css` | Estilos propios del blog y de `404.html` | Sí |
| `content/llms.txt` | Plantilla de `llms.txt` | Sí |
| `robots.txt` | Reglas para robots y dirección del sitemap | Sí |
| `assets/css/blog.css` | Hoja de estilos del blog y de `404.html` | No, la genera `tools/build.mjs` |
| `blog/` | Páginas del blog | No, las genera `tools/build.mjs` |
| `sitemap.xml`, `llms.txt` | Mapa del sitio y resumen para asistentes | No, los genera `tools/build.mjs` |
| `404.html` | Página de «no encontrada» | No, la genera `tools/build.mjs` |
| `tools/build.mjs` | Generador | |
| `tools/check.mjs` | Comprobaciones antes de publicar | |
| `tools/og.html` | Origen de la imagen para compartir | Sí |
| `.assetsignore` | Lo que el alojamiento no publica: `README.md`, `content/` y `tools/` | Sí |
| `new/` | Prototipos de las propuestas de diseño, con `noindex` | No se toca |

### Por qué los estilos de la portada van en línea

La portada se pinta con una sola petición: sus estilos van dentro de `index.html` y el fotograma de la cabecera se precarga con prioridad alta. El blog y `404.html` usan el mismo lenguaje visual sin copiar nada a mano: en la hoja de la portada hay tramos marcados con `/* común:inicio … */` y `/* común:fin */` (variables, tipografía, barra, botones, filas de artículos, insignias y colofón), y `tools/build.mjs` los junta con `content/blog.css` en `assets/css/blog.css`. Lo que cambies dentro de un tramo «común» cambia en todo el sitio al generar.

El generador también copia de la portada al blog y a `404.html` la barra, el colofón, las insignias de tienda, la hoja de fuentes y el script de «Descargar». Se cambian en `index.html`.

## Generar y comprobar

Hace falta Node (probado con la versión 24). No hay nada que instalar.

```bash
node tools/build.mjs          # genera lo que haya cambiado
node tools/build.mjs --check  # no escribe nada; falla si falta generar algo
node tools/check.mjs          # revisa todas las páginas; falla si hay errores
```

`tools/build.mjs` hace seis cosas:

1. En la portada, escribe la lista «Del blog» (entre los comentarios `blog:inicio` y `blog:fin`) y los datos estructurados (entre `datos-estructurados:inicio` y `datos-estructurados:fin`, un nodo por línea). Todo sale de lo que se ve en la página: las preguntas del marcado son las de `#preguntas`, las funciones de la app son las filas del índice, la captura es la pantalla «Mi armario» con su texto alternativo, la imagen principal es el fotograma de la película de la portada y la descripción de la película es el `aria-label` de su vídeo. La app se declara como «édit», con sus dos nombres de tienda como nombres alternativos (`appStoreNames`).
2. Genera `assets/css/blog.css`.
3. Genera `blog/index.html` y una página por artículo en `blog/<slug>/index.html`.
4. Genera `sitemap.xml`. La fecha de la portada sale de la constante `homeUpdated` de `tools/build.mjs`: actualízala a mano cuando cambies el contenido de `index.html` (`tools/check.mjs` avisa si se ha quedado atrás).
5. Genera `llms.txt` a partir de `content/llms.txt` (sustituye `{{blog}}` por la lista de artículos y `{{actualizado}}` por esa misma fecha).
6. Genera `404.html`. Lleva `noindex` y no entra en el sitemap.

`tools/check.mjs` comprueba, entre otras cosas:

- En todas las páginas: título (único) y descripción, dirección canónica única, un solo `<h1>`, titulares sin saltos de nivel, datos estructurados válidos, sin valoraciones y con fechas con zona horaria, enlaces internos y anclas, archivos que existen (también pósters y vídeos), textos alternativos (solo el fotograma de un vídeo puede llevarlo vacío) y medidas de las imágenes, tamaño y texto alternativo de la imagen para compartir, la tarjeta grande al compartir (`twitter:card` y `twitter:image`), enlaces a las tiendas en pestaña nueva, y que no haya enlaces a los prototipos de `/new/`, dominios ajenos ni términos que no usamos, ni en el texto ni en los atributos ni en los datos estructurados.
- En la portada: las anclas estables, que las preguntas del marcado sean las visibles, que cada vídeo tenga su fotograma con medidas, su póster, su descripción y `preload="none"`, la precarga del póster de la cabecera, los botones «Descargar», que `offers` siga con precio 0 y que `homeUpdated` no sea anterior al último cambio de `index.html` (aviso).
- Que `sitemap.xml`, `llms.txt`, `assets/css/blog.css` y `404.html` estén al día, que las páginas públicas no lleven `noindex`, que `404.html` sí lo lleve y no aparezca en el sitemap, y que en `assets/` no quede ningún archivo sin usar (aviso).

## Cambiar la portada

- **Textos.** Se editan en `index.html`. Si cambias el título, la descripción, una fila del índice, una pregunta o el texto alternativo de la captura «Mi armario», ejecuta `node tools/build.mjs`: los datos estructurados se actualizan solos. El título no debería pasar de 60 caracteres ni la descripción de 160.
- **Rótulos.** Los titulares son frases de marca; el término con el que se busca va encima, en versalitas y dentro del propio titular: `<h2 class="h2"><span class="sc rotulo">Probador virtual</span> ¿Te queda <em>bien</em>?</h2>`. Lo llevan el `<h1>` y tres `<h2>` (armario digital, probador virtual y preguntas frecuentes). No hace falta en todos: solo donde el titular no dice de qué va el bloque.
- **Preguntas frecuentes.** Cada una es un `<details>` con este formato exacto, dentro de `#preguntas`:

  ```html
  <details>
    <summary><h3>¿Pregunta?</h3></summary>
    <p class="faq-a">Respuesta.</p>
  </details>
  ```

  Después, `node tools/build.mjs`. El generador falla si alguna no sigue el formato. Las respuestas pueden llevar enlaces; si la lista cambia, actualiza también la línea «Preguntas frecuentes» de `content/llms.txt`.
- **Vídeos.** Para cambiar una película sustituye en `assets/video/` sus tres archivos con el mismo nombre: `nombre.mp4` (sin audio), `nombre.jpg` (primer fotograma) y `nombre-fin.jpg` (el último, que se ve con movimiento reducido). Si cambia el tamaño, corrige `width` y `height` en la imagen y en el `<video>`. Actualiza el `aria-label` del vídeo con lo que se ve: es la descripción para lectores de pantalla y buscadores, y todo lo que diga el vídeo tiene que estar ahí o en el texto de al lado. El vídeo de profesionales tiene dos cortes (`pro-estudio.mp4` y `pro-estudio-m.mp4`, para móvil); sus tres frases llevan el segundo en que empieza y acaba cada parte (`data-t` y `data-fin`).
- **Película de la portada.** Además está descrita en los datos estructurados (`VideoObject`): si la sustituyes, cambia `heroVideo` en `tools/build.mjs` (nombre, duración y fecha de publicación). No esperamos resultados enriquecidos de vídeo: Google solo los da a páginas cuyo contenido principal es el vídeo. El marcado sirve para que buscadores y asistentes sepan qué enseña.
- **Looks de la tira.** `assets/img/look-01.jpg` a `look-08.jpg`, cuadradas, con la prenda entera. Cada una lleva su texto alternativo y su pie en `index.html`.
- **Botones «Descargar».** Llevan `href="#descargar"` y el atributo `data-tienda`. Sin JavaScript van al ancla con las dos insignias; con JavaScript, en iPhone y iPad van al App Store y en Android a Google Play (script entre `tienda:inicio` y `tienda:fin`). Los robots de los buscadores se quedan con el ancla. No uses `dashboard.editstudio.app/descargar`: en un ordenador acaba en el inicio de sesión.
- **Imagen para compartir.** `assets/img/og.png` (1200 × 630) es una captura de `tools/og.html`, que lleva el rótulo, el titular de la portada y el último fotograma de su película. Si cambian, edita `tools/og.html`, vuelve a capturarla y actualiza su texto alternativo (`og:image:alt` y `twitter:image:alt` en `index.html`; el blog lo copia de ahí):

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
    --window-size=1200,630 --virtual-time-budget=8000 --screenshot=assets/img/og.png "file://$PWD/tools/og.html"
  ```

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

Los tres artículos más recientes salen solos en el bloque «Del blog» de la portada (constante `homePosts`), con su título y su descripción.

Para retirar un artículo, borra su `.md` y su carpeta en `blog/` (el generador avisa de las carpetas que sobran).

## Buscadores y asistentes

- `robots.txt` permite todo salvo `content/`, `tools/` y `README.md`, y declara el sitemap. Cloudflare añade delante sus propias reglas: el acceso de los robots de los asistentes y de entrenamiento se decide en su panel (Security → Settings → Bot traffic), no aquí. Si allí se bloquean, los asistentes no pueden leer ni citar la web, diga lo que diga este archivo.
- `.assetsignore` deja fuera de lo publicado `README.md`, `content/` y `tools/` (lo aplica el alojamiento cuando publica la carpeta como recursos estáticos de un Worker). Los tres `Disallow` de `robots.txt` se mantienen por si esos archivos llegaran a servirse.
- `llms.txt` resume el producto y enlaza cada bloque de la portada, el blog, la descarga y los textos legales. Es una convención todavía poco adoptada: cuesta poco mantenerla, pero no sustituye a un buen contenido.
- Los datos estructurados describen la organización, la web, la página, la app (con sus funciones, una captura y las dos tiendas), la película de la portada, las preguntas frecuentes y cada artículo. No incluyen valoraciones. La app declara precio 0 porque la descarga es gratuita. Las preguntas frecuentes ya no dan resultados enriquecidos en Google; el marcado se mantiene porque describe lo que se ve.
- En el texto de la portada conviven «armario digital» y «armario virtual», «looks» y «outfits», «probador virtual», «qué me pongo», «asesora de imagen», «personal shopper», «colorimetría», «hacer la maleta» y «preguntas frecuentes»: son las palabras con las que se busca. Van en rótulos, en las glosas del índice (que también se ven en móvil) y en el texto; pocas veces cada una, sin relleno. «Gratis» solo acompaña a la descarga («Descargar édit es gratis», «Descarga gratis»): parte de las funciones es de la suscripción Premium.
- `404.html` solo se sirve en las direcciones que no existen si está activado en la configuración del alojamiento (en un Worker con recursos estáticos, `not_found_handling: "404-page"`).

## Antes de publicar

1. `node tools/build.mjs` y `node tools/check.mjs`: cero errores y cero avisos.
2. Fechas: `homeUpdated` y, si la película de la portada es nueva, `heroVideo.published` en `tools/build.mjs` llevan el día en que se publica (salen en `sitemap.xml`, `llms.txt` y los datos estructurados). Lo mismo con `fecha:` en los artículos que se estrenen ese día. Después, `node tools/build.mjs`.
3. `new/` guarda los prototipos de las propuestas, con `noindex`. Se publica con el resto mientras siga en el repositorio: para retirarla, bórrala o añade `new/` a `.assetsignore`.
4. Tras publicar: comprueba que `https://editstudio.app/README.md` y una dirección inventada devuelven 404 (la segunda, con la página de `404.html`), y que los robots de los asistentes reciben un 200, por ejemplo `curl -A "PerplexityBot/1.0" -o /dev/null -w "%{http_code}" https://editstudio.app/`.

## Enlaces

| Destino | URL |
| --- | --- |
| Descargar (web) | https://editstudio.app/#descargar |
| Iniciar sesión | https://dashboard.editstudio.app/login |
| Soporte | https://dashboard.editstudio.app/soporte |
| App Store | https://apps.apple.com/es/app/id6796045067 |
| Google Play | https://play.google.com/store/apps/details?id=edit.studio.app |
| Privacidad | https://dashboard.editstudio.app/legal/privacidad |
| Términos | https://dashboard.editstudio.app/legal/terminos |
| Instagram | https://www.instagram.com/editstudio.app/ |
| LinkedIn | https://www.linkedin.com/company/146595565/ |

## Ver en local

Sirve la carpeta con cualquier servidor estático (por ejemplo `python3 -m http.server 8000`) y visita la raíz. El blog y `404.html` usan rutas desde la raíz (`/assets/…`), así que hay que verlos con servidor, no abriendo el archivo. El idioma de la página es español.
