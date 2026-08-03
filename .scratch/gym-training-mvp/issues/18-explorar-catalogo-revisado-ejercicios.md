# 18 — Explorar el catálogo revisado de Ejercicios

**What to build:** Un catálogo compartido, local y versionado de Ejercicios revisados en español que el Deportista pueda buscar y consultar sin depender del dataset original en tiempo de ejecución.

**Blocked by:** 16 — Registrar, verificar y acceder a una Cuenta.

**Status:** resolved

- [x] Una importación reproducible fija el commit auditado de `hasaneyldrm/exercises-dataset`, su checksum y la revisión de origen en un manifiesto.
- [x] Solo se publican Ejercicios con nombre e instrucciones revisados en español, Forma de registro asignada expresamente y taxonomía mínima de búsqueda y filtro.
- [x] Cada Ejercicio importado recibe una identidad interna opaca; la combinación de fuente e identificador upstream es única y no se expone como referencia de dominio.
- [x] El catálogo se persiste mediante una migración o carga versionada y ninguna petición traduce, infiere ni consulta contenido upstream.
- [x] La API permite buscar y filtrar Ejercicios disponibles mediante cursor opaco y un límite máximo de 50 resultados.
- [x] La interfaz permite explorar y seleccionar Ejercicios, identifica su procedencia de catálogo y utiliza un placeholder común en lugar de JPG o GIF sin licencia.
- [x] Una actualización puede añadir, cambiar de forma compatible o retirar Ejercicios mediante un diff revisable; retirar nunca elimina la identidad ni rompe referencias existentes.
- [x] La Forma de registro no puede cambiar para un Ejercicio publicado o utilizado; una corrección incompatible requiere otra identidad.
- [x] Las pruebas HTTP integradas verifican paginación, filtros, identidad estable y que el catálogo compartido puede leerse desde Cuentas distintas sin convertirse en dato privado.

## Answer

El catálogo es un snapshot local y versionado del commit auditado `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`, fijado en `back/catalog/manifest.json` con su checksum SHA-256 y la revisión de origen. Una carga versionada (`db:load`) verifica checksum e invariantes y publica únicamente los 11 Ejercicios de la revisión local, cada uno con identidad interna opaca, procedencia conservada y la combinación (source, upstream_id) única mediante índice parcial.

La API `GET /api/exercises` busca y filtra por nombre, Forma de registro y categoría con cursor opaco y límite máximo de 50; `GET /api/exercises/categories` alimenta los filtros de la interfaz. La pantalla Ejercicios explora, busca, filtra y selecciona Ejercicios con procedencia de catálogo y un placeholder común, sin imágenes del origen.

Una actualización genera un diff revisable de altas, cambios compatibles, retiradas y formas incompatibles; aplicar el diff conserva identidades y retira sin eliminar filas. La suite final pasa con 45 pruebas de backend y 53 de frontend.

## Comments

- Implementado en el commit de esta rama junto con la verificación de typecheck, build y la suite completa.
- Reporte de intento: `orchestration/18/attempt-1.md`.
