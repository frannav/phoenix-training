# `hasaneyldrm/exercises-dataset`: encaje y riesgos para el MVP

Investigación realizada el 31 de julio de 2026 sobre `main` en el commit [`7455efae41b330c265e7cd4b78dfa848e7ce5ebd`](https://github.com/hasaneyldrm/exercises-dataset/commit/7455efae41b330c265e7cd4b78dfa848e7ce5ebd). Las cantidades y comprobaciones de integridad indicadas como «auditoría del snapshot» se calcularon directamente sobre los archivos de ese commit.

## Conclusión

El MVP puede importar y redistribuir el **dataset no multimedia** bajo MIT, conservando el aviso de copyright y la licencia. No debe incorporar ni servir los JPG/GIF del repositorio hasta obtener una licencia propia de Gym visual que cubra expresamente la web, su forma de alojamiento y el acceso de los usuarios. El permiso concedido al repositorio no se transmite a quienes lo clonan.

Técnicamente conviene importar un snapshot fijado por commit, usar un identificador interno propio y conservar `(source, upstream_id, source_revision)`. El dataset sirve como catálogo base, pero no resuelve tres necesidades del producto: nombres en español, la forma de registro de cada ejercicio y una estrategia estable de actualizaciones.

## Licencia, redistribución y atribución

- La licencia MIT declara cubiertos el código, las herramientas, la estructura del dataset y los textos/traducciones; permite usar, copiar, modificar, publicar, distribuir, sublicenciar y vender, pero exige incluir el copyright y el permiso en copias o porciones sustanciales. La propia licencia excluye de forma explícita `images/` y `videos/`. Véase [`LICENSE`](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/LICENSE).
- El repositorio declara que nombres, categorías, partes corporales, equipamiento, objetivos, grupos musculares e instrucciones multilingües son datos MIT. Por tanto, el MVP puede versionar o cargar esos datos si incorpora el aviso MIT en sus avisos de terceros. Véase [`NOTICE.md`](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/NOTICE.md).
- Los 1.324 JPG y 1.324 GIF pertenecen a Gym visual. El repositorio los distribuye con un permiso escrito propio, únicamente a 180×180 y con la atribución `© Gym visual — https://gymvisual.com/`; tanto `LICENSE` como `NOTICE.md` dicen expresamente que clonar el repositorio **no concede una licencia para reutilizarlos** y remiten a obtener una licencia propia.
- Los [términos oficiales de Gym visual](https://gymvisual.com/content/3-terms-and-conditions-of-use) permiten, para medios no marcados comprados bajo su N-CRFL, ilustrar una app o web, pero la licencia es personal/no transferible y prohíbe revender, redistribuir, facilitar la descarga o ceder derechos. También reservan cambios de términos y remedios por uso no autorizado. Antes de publicar los assets hay que confirmar por escrito que la licencia adquirida cubre este SaaS, su CDN/caché y el acceso de usuarios; no debe existir un endpoint de descarga masiva ni copiarse los medios a un repositorio público.
- Si se consigue esa licencia, el MVP debe mantener la atribución requerida por el snapshot en cada uso de los medios y respetar el límite 180×180 que acompaña al permiso del repositorio, salvo que el acuerdo propio con Gym visual autorice otra cosa.

Esto es una lectura técnica de los textos de licencia, no asesoramiento jurídico.

## Estructura e identificadores

El archivo principal es un array JSON de 1.324 objetos y existe un [JSON Schema Draft 2020-12](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/data/exercises.schema.json). Cada objeto exige 15 campos y no admite campos adicionales:

`id`, `name`, `category`, `body_part`, `equipment`, `instructions`, `instruction_steps`, `muscle_group`, `secondary_muscles`, `target`, `media_id`, `image`, `gif_url`, `attribution` y `created_at`.

Hallazgos de la auditoría del [`exercises.json`](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/data/exercises.json):

- Los 1.324 `id` son strings únicos de cuatro dígitos, pero **no son una secuencia**: van de `0001` a `5201` con 3.877 huecos. No deben convertirse en posición de array ni generarse con `max + 1`.
- Los 1.324 `media_id` también son únicos en este snapshot. `image` y `gif_url` son rutas locales, no URLs, y sus nombres siguen `<id>-<media_id>.<ext>`.
- El esquema describe `id` como único, pero no puede imponer unicidad de una propiedad entre elementos del array. El importador debe comprobar duplicados de `id`, `media_id` y rutas por su cuenta.
- Hay 1.318 nombres distintos y seis grupos de nombres exactamente duplicados, entre ellos `barbell seated calf raise`, `lever chest press` y `push-up (on stability ball)`. El nombre no es una clave válida; las variantes deben conservarse por ID.
- `category` y `body_part` coinciden en los 1.324 registros actuales. Son datos redundantes y no debe asumirse que seguirán coincidiendo sin validación.
- `created_at` existe, pero los 1.324 valores corresponden a una carga en bloque de unos 52 ms el 18 de marzo de 2026. No hay `updated_at`, versión por registro ni marca de borrado: no sirve para sincronización incremental.

Recomendación de persistencia: clave interna del MVP (UUID), `source = hasaneyldrm/exercises-dataset`, `upstream_id`, `source_revision`, y restricción única sobre `(source, upstream_id)`. Las rutinas y sesiones deben referenciar la clave interna para no quedar acopladas a futuras renumeraciones o sustituciones del catálogo.

## Idiomas

El esquema exige instrucciones completas y también separadas en pasos para diez códigos ISO 639-1: `en`, `es`, `it`, `tr`, `ru`, `zh`, `hi`, `pl`, `ko` y `fr`. En el snapshot, los 1.324 ejercicios tienen texto y al menos un paso no vacío para los diez idiomas; el [README oficial](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/README.md) enumera los mismos diez.

El multidioma se limita a `instructions` e `instruction_steps`: `name`, `category`, `body_part`, `equipment`, `target`, `muscle_group` y `secondary_muscles` permanecen en inglés. Una interfaz española mostraría nombres como `barbell bench press` si el MVP no añade una capa propia de traducción o alias.

La presencia estructural no demuestra calidad lingüística o técnica. El repositorio no documenta fuente de traducción, revisión por especialistas, control editorial ni garantías médicas. Antes de presentar las instrucciones como orientación al usuario conviene revisar una muestra en español y permitir correcciones locales sin sobrescribir el valor importado.

## Cobertura y encaje de dominio

La distribución por `body_part` del snapshot coincide con la [estadística publicada](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/README.md#-statistics):

| Parte corporal | Ejercicios |
|---|---:|
| upper arms | 292 |
| upper legs | 227 |
| back | 203 |
| waist | 169 |
| chest | 163 |
| shoulders | 143 |
| lower legs | 59 |
| lower arms | 37 |
| cardio | 29 |
| neck | 2 |

También hay 28 valores de equipamiento, 19 targets y 29 grupos musculares distintos. Los más representados son `body weight` (325), `dumbbell` (294), `cable` (157) y `barbell` (154).

El dataset no contiene una propiedad equivalente a las cuatro formas de registro del MVP —fuerza con carga, repeticiones sin carga, tiempo por serie y cardio por duración— ni objetivos de series/repeticiones/peso/RPE. La categoría `cardio` solo cubre 29 entradas y no clasifica ejercicios isométricos como planchas. El MVP necesita un `recording_mode` local, editable y desacoplado del snapshot; no debe inferirlo automáticamente solo desde `body_part` o `equipment`.

## Assets, formatos y coste de entrega

La [estructura oficial](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/README.md#-file-structure) promete un thumbnail y un GIF por ejercicio. La auditoría confirma que todas las rutas referenciadas existen, no hay ficheros extra y todos los assets son realmente 180×180.

| Recurso | Cantidad | Formato actual | Total | Mediana | Rango por fichero |
|---|---:|---|---:|---:|---:|
| `data/exercises.json` | 1 | JSON | 17.391.530 B (16,59 MiB) | — | — |
| `images/` | 1.324 | JPG | 8.875.057 B (8,46 MiB) | 6.583 B | 3.324–11.118 B |
| `videos/` | 1.324 | GIF | 128.741.397 B (122,78 MiB) | 94.002 B | 46.144–232.578 B |

Aunque el esquema permite JPG, JPEG o PNG para `image`, el snapshot solo contiene JPG; `gif_url` solo admite GIF. Datos y medios suman aproximadamente 147,83 MiB sin contar Git. Los GIF representan el mayor coste de red y decodificación móvil: aun con licencia, no deben precargarse en el dashboard o selector. El listado debería usar thumbnails con carga diferida y solicitar el GIF solo al abrir el detalle del ejercicio.

## Estabilidad y actualización

El proyecto es reciente: su [historial oficial](https://github.com/hasaneyldrm/exercises-dataset/commits/main/) comienza el 8 de julio de 2026 y el snapshot estudiado es del 16 de julio. En esos ocho días añadió el schema y cuatro idiomas mediante cambios grandes. A 31 de julio no hay [tags](https://github.com/hasaneyldrm/exercises-dataset/tags) ni [releases](https://github.com/hasaneyldrm/exercises-dataset/releases), y el repositorio no publica SemVer, changelog, política de compatibilidad, feed de cambios ni cadencia de actualización.

Por ello, `main` no debe ser una dependencia en tiempo de ejecución ni actualizarse automáticamente. La importación del MVP debería:

1. fijar commit y checksum del JSON;
2. validar schema más invariantes propias —IDs y rutas únicas, idiomas requeridos y assets esperados—;
3. generar un diff legible de altas, bajas y cambios antes de cada actualización;
4. conservar registros referenciados por históricos aunque desaparezcan del siguiente snapshot;
5. someter traducciones, cambios de clasificación y licencias a revisión humana;
6. desplegar el nuevo snapshot solo como migración explícita y reversible.

## Decisión recomendada para el MVP

1. **Aceptar ahora los datos MIT**, fijados al commit auditado, con el texto MIT en avisos de terceros.
2. **Bloquear la redistribución de imágenes y GIFs** hasta disponer de una licencia propia y confirmación escrita de Gym visual; mientras tanto usar placeholders o ninguna imagen.
3. Mantener IDs internos y procedencia/versionado del upstream; nunca usar nombre, posición o `id` numérico como identidad del dominio.
4. Añadir localmente `recording_mode` y, si se necesita una experiencia totalmente española, nombre/alias en español. Las instrucciones importadas se conservan como contenido de origen, no como autoridad clínica.
5. Actualizar mediante snapshots revisados, no mediante sincronización automática con `main`.
