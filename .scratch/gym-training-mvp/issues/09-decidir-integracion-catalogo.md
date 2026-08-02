# Decidir la estrategia de integración del catálogo de Ejercicios

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 08, 11

## Question

¿Cómo se importan, identifican, traducen, almacenan y actualizan los Ejercicios del catálogo y sus assets, y cómo conviven con los Ejercicios personalizados sin romper referencias históricas?

## Answer

El catálogo del MVP es un **snapshot local y versionado**, nunca una dependencia en tiempo de ejecución. La importación parte del commit auditado de `hasaneyldrm/exercises-dataset`, fija su revisión y checksum en un manifiesto y se ejecuta expresamente como parte de una migración o carga de datos revisada.

### Selección y contenido

El MVP importa inicialmente solo Ejercicios comunes que tengan una revisión local completa con:

- nombre visible en español;
- Forma de registro asignada expresamente;
- instrucciones españolas aceptables;
- taxonomía mínima necesaria para buscar y filtrar.

No se traduce ni se infiere contenido durante una petición. Un fichero de revisión mantenido por el proyecto relaciona cada `upstream_id` incluido con el nombre español y la Forma de registro. Los registros que todavía no tengan esa revisión no aparecen en el producto, aunque existan en el snapshot.

Los JPG y GIF no se importan ni redistribuyen mientras no exista una licencia propia que lo permita. El selector usa un placeholder común; añadir medios queda como una migración posterior y no cambia la identidad del Ejercicio.

### Identidad y almacenamiento

Todos los Ejercicios comparten una identidad interna opaca. Una única colección distingue su alcance:

| Alcance | Propiedad | Procedencia |
| --- | --- | --- |
| Catálogo | Compartido; no pertenece a una Cuenta. | `source`, `upstream_id` y `source_revision` obligatorios. |
| Personalizado | Privado y propiedad de una Cuenta. | Sin identidad externa. |

La combinación `(source, upstream_id)` es única, pero ninguna Rutina, Plan o Sesión la utiliza como referencia: todos guardan el identificador interno. La Forma de registro de un Ejercicio no cambia una vez publicado o utilizado; una corrección incompatible crea un Ejercicio nuevo y retira el anterior de usos nuevos.

Una Cuenta puede crear, renombrar, archivar y restaurar sus Ejercicios personalizados. No puede editar los del catálogo ni ver los personalizados de otra Cuenta. Los listados de selección combinan los Ejercicios disponibles del catálogo con los personalizados disponibles de la Cuenta, marcando su procedencia sin crear dos flujos distintos.

### Actualizaciones y referencias existentes

No hay sincronización programada. Una actualización exige fijar otro commit, validar esquema e invariantes y revisar un diff de altas, cambios y retiradas antes de generar una migración reproducible.

- Las altas reciben una identidad interna nueva y solo se publican si completan la revisión española.
- Los cambios compatibles actualizan los datos visibles conservando la identidad interna.
- Una retirada upstream o local marca el Ejercicio como no disponible; nunca elimina la fila.
- Un Ejercicio personalizado archivado tampoco aparece en usos nuevos, pero conserva su identidad.

Rutinas, Planes y Sesiones existentes continúan resolviendo cualquier Ejercicio no disponible. No se reasignan referencias por nombre, similitud ni posición y no se fusionan automáticamente Ejercicios del catálogo con personalizados.
