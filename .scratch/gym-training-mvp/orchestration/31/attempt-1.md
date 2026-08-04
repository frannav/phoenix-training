# Reporte del intento 1 — ticket 31 «Preparar la analítica del dashboard»

**Estado:** implementado (listo para revisión del coordinador; no resuelto por este worker).
**Commit:** `fa1939b` — `feat(dashboard): modelos de lectura de la analítica de Inicio (ticket 31)`.
**Fixed point:** `1e87844f9ab3329108dbcccd8a476c6b24607ae7`.
**Bloqueadores resueltos:** 20 (RM registrados) y 29 (Historial), ambos en el fixed point.

## Rutas autoradas

- `back/src/dashboard/analytics.ts` (nuevo): modelos de lectura de la analítica.
- `back/test/dashboard.test.ts` (nuevo): pruebas integradas del seam aprobado.
- `back/../.scratch/gym-training-mvp/orchestration/31/attempt-1.md` (este reporte).

No se modificó ningún archivo existente: no se registra `GET /api/dashboard` (ticket 33), no se tocó
`HomePage.tsx` ni estilos, y ningún contrato previo cambió.

## Qué se implementó

Tres modelos de lectura calculados al leer, sin cachés ni tablas derivadas, desde Sesiones finalizadas
y RM registrados, filtrando siempre por la Cuenta autenticada:

1. **`weeklyVolume(db, { accountId, today })`** — volumen semanal en `kg·rep` (suma de `carga × repeticiones`
   de Series completadas de fuerza con carga de Sesiones finalizadas), agrupado por la semana de la Fecha
   realizada (lunes a domingo). Devuelve total actual, total de la semana anterior, comparación porcentual
   (un decimal; nula si no hay volumen anterior, porque no se expresa una proporción frente a cero) y las
   barras de las últimas seis semanas (constante `weeklyVolumeWeeks = 6`).
2. **`recentRecordedMaxes(db, { accountId })`** — hasta tres RM expresos (constante
   `recentRecordedMaxesLimit = 3`) del más reciente al más antiguo por fecha, con el mismo orden que el
   listado de RM del área de Ejercicios. Solo lee la tabla `recorded_max`: una Sesión completada nunca
   crea un RM y no se presentan resultados calculados como récords.
3. **`exerciseEvolution(db, { accountId, exerciseId })`** — serie temporal con un punto por Sesión
   finalizada donde el Ejercicio tiene Series completadas, en orden cronológico. La métrica del punto
   depende de la Forma de registro (mapa `metricByMode`): carga máxima para fuerza con carga,
   repeticiones totales para repeticiones sin carga, duración total para tiempo por serie; cardio
   continuo devuelve `metric: null` y `points: []` (sin analítica). Cada punto incluye además
   `rpeMedio` (media aritmética sin ponderar de las Series completadas con RPE, un decimal, nula sin
   observaciones) e `intensidadRelativaMax` (mayor `carga / RM vigente de una repetición × 100`, un
   decimal, puede superar el 100 %, nula sin RM vigente: nunca se estima un 1RM). Varias apariciones del
   mismo Ejercicio en una Sesión se agregan bajo su identidad. Un Ejercicio ajeno o inexistente se
   comporta como ausente (`null`).

## TDD por rebanadas verticales en el seam aprobado

Seam aprobado: API HTTP completa contra SQLite temporal con migraciones de producción, con las
aseveraciones sobre los modelos de analítica en `back/test/dashboard.test.ts` (el seam «equivalent
analytic service/API integration test» listado por el coordinador; los datos se preparan por la API y
la lectura se comprueba en los servicios sobre la misma base). No se pidió ningún seam nuevo.

1. **Volumen semanal (rojo → verde):** 9 pruebas (suma de la semana, comparación con la anterior,
   seis semanas, exclusiones de Series/Sesiones/Formas, objetivos excluidos, comparación nula sin
   semana anterior, corrección de fecha, eliminación, aislamiento). Rojas por módulo inexistente;
   verdes al implementar `weeklyVolume`.
2. **RM recientes (rojo → verde):** 4 pruebas (hasta tres por fecha, vacío sin RM, Sesiones no crean
   RM, aislamiento). Rojas por exportación faltante; verdes al implementar `recentRecordedMaxes`.
3. **Evolución (rojo → verde):** 13 pruebas (métrica por Forma, cardio sin analítica, serie vacía,
   RPE medio sin ponderar y con un decimal, RPE omitido sin observaciones, intensidad relativa >100 %,
   sin RM de una repetición no se estima 1RM, agregación de apariciones, corrección de fecha y estado,
   eliminación, Ejercicio archivado conserva histórico, Ejercicio ajeno inexistente). Rojas por
   exportación faltante; verdes al implementar `exerciseEvolution`.

Dos correcciones del rojo fueron bugs de las propias pruebas (no del dominio): una Sesión activa
bloqueaba el inicio de las siguientes (se elimina tras comprobar su exclusión) y una revisión obsoleta
al eliminar tras corregir la fecha (se usa el documento vigente). Ninguna requirió tocar el dominio.

## Verificaciones

- `bun run typecheck` — PASS (back y front).
- `bun test back/test/dashboard.test.ts` — 28 pruebas, 0 fallos.
- `bun test back/test/` — 286 pruebas (incluidas las 28 del dashboard), 0 fallos.
- No se reclamó resultado de la suite completa (front): la validación completa pertenece al coordinador.

## Autorevisión (skill code-review)

**Limitación del runtime:** el skill `code-review` lanza dos sub-agentes en paralelo; este runtime de Pi
no expone una herramienta para crear sub-agentes, así que la revisión de ambos ejes se hizo
manualmente en el mismo contexto. El coordinador mantiene la revisión definitiva.

### Eje Standards

- Nombres y tipos con vocabulario del dominio y documentación JSDoc en español, patrón de dependencias
  `(database, { ... })` y consultas específicas de caso de uso, coherentes con el resto del backend.
- Smell resuelto durante la revisión: «Repeated Switches» (la cascada de Forma de registro → métrica se
  sustituyó por el mapa `metricByMode`); «Speculative Generality» (se eliminó el parámetro `limit` sin
  uso en `recentRecordedMaxes`); campo `sessionId` no usado en la consulta de volumen (se simplificó a
  `GROUP BY datePerformed`).
- Smell aceptado y documentado: `recentRecordedMaxes` repite la forma de unión/orden de
  `listRecordedMaxes` (recorded-max.ts). Es deliberado para mantener la propiedad del ticket (el módulo
  de analítica no modifica el módulo del ticket 20) y añade el límite del bloque; se dejó constancia.
- Sin otros smells de la línea base detectados (nombres, clumps, envy, cadenas, middle men, etc.).

### Eje Spec

- Los diez criterios del ticket tienen prueba: exclusión de Series/Sesiones (1), fórmulas por Forma de
  registro (2), RPE medio sin ponderar/un decimal/sin observaciones (3), intensidad relativa con RM de
  una repetición, >100 %, sin estimación (4), agrupación por Fecha realizada con semanas lunes-domingo
  y recálculo tras corregir fecha/resultado/estado o eliminar (5), volumen semanal con comparación y
  seis barras (6), RM recientes ≤3 sin récords calculados (7), evolución por Forma con cardio sin
  analítica (8), cálculo al leer sin cachés (9) y datos agregados suficientes para el cliente (10).
- Decisiones documentadas que la spec no fija: la comparación porcentual del volumen se redondea a un
  decimal y es nula frente a una semana anterior sin volumen; la evolución agrupa por Sesión (una de las
  agrupaciones que la spec admite) y reporta la intensidad relativa máxima de la Sesión.
- Sin alcance excedido: no hay ruta HTTP, ni cambios de frontend, ni contratos previos alterados.

## Lo que queda

- El coordinador debe componer `GET /api/dashboard` (ticket 33) llamando a estos tres modelos y
  resolver el ticket 31 tras su revisión definitiva.
- Al fusionar con el ticket 30 (mismo fixed point) conviene revisar solo nombres de archivo del módulo
  `dashboard/`; los modelos de este intento no dependen de los del ticket 30.
