# Investigar el dataset de ejercicios y sus assets

Type: research
Status: resolved
Triage: ready-for-agent

## Question

¿Qué permiten realmente la licencia, el esquema, los identificadores, los idiomas, la cobertura y los formatos o tamaños de imágenes y GIFs de `hasaneyldrm/exercises-dataset`, y qué riesgos condicionan su redistribución y actualización dentro del MVP?

## Context

- Fuente propuesta: <https://github.com/hasaneyldrm/exercises-dataset>
- Hallazgos: [Investigación de `hasaneyldrm/exercises-dataset`](../research/exercises-dataset.md).

## Answer

El MVP puede importar y redistribuir los metadatos e instrucciones bajo MIT, conservando el aviso de licencia, pero no puede reutilizar los 1.324 JPG y 1.324 GIF solo por clonar el repositorio: Gym visual exige licencia propia, atribución y control de redistribución. El snapshot auditado contiene 1.324 ejercicios e instrucciones completas en diez idiomas, aunque nombres y taxonomía siguen en inglés; sus IDs son únicos pero dispersos, hay nombres duplicados y falta la forma de registro propia del MVP. Todos los assets son 180×180 y están íntegros, pero los GIF pesan 122,78 MiB. Al no existir tags, releases, versionado estable ni campos para sincronización incremental, se debe fijar un commit, mantener identidad interna y actualizar mediante snapshots validados y revisados. Informe y riesgos detallados: [Investigación de `hasaneyldrm/exercises-dataset`](../research/exercises-dataset.md).
