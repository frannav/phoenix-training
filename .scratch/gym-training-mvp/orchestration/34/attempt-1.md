# Reporte del intento 1 — ticket 34 «Integrar el dashboard en Inicio»

**Estado:** implementado (listo para la revisión definitiva del coordinador).
**Fixed point:** `ccca48bb3135781f57eb07be101c534abcca4afc`.
**Rama:** `feature/ticket-34`.

## Resumen

La interfaz responsive de los cinco bloques de Inicio (entrenamiento actual,
Plan activo, volumen semanal, RM recientes y evolución) consume ahora el
contrato de `GET /api/dashboard` compuesto en el ticket 33, sin recalcular
reglas de dominio en el navegador: los bloques presentan los datos agregados
que entrega la API y delegan el inicio de Sesión a la acción correspondiente.
Se instaló Recharts (decisión de arquitectura del ticket 14) para las barras
del volumen semanal y la línea de la evolución, con alternativa textual
completa en cada gráfica y sin gráficas vacías. Vitest/Testing Library cubren
el selector, los estados vacíos, las acciones, las alternativas textuales y
la presentación responsive en el seam aprobado `HomePage.test.tsx`.

## Commit

`71064f3` — `feat(dashboard): integrar los cinco bloques de Inicio con el contrato del dashboard (ticket 34)` (23 archivos: +2044 −187; árbol de trabajo limpio).

## Rutas autoradas en este intento

Nuevas:

- `front/src/features/dashboard/api/dashboard-api.ts` — cliente HTTP y contrato tipado de `GET /api/dashboard` (acción de entrenamiento, Plan activo, volumen semanal, RM recientes y evolución) con claves de consulta, incluida la variante `?exerciseId=` del bloque Evolución.
- `front/src/features/dashboard/components/TrainingBlock.tsx` + `.module.css` — primer bloque: Continuar la Sesión activa (nombre, progreso en Series), iniciar el próximo Entrenamiento planificado pendiente («Iniciar») o iniciar una Sesión libre.
- `front/src/features/dashboard/components/ActivePlanBlock.tsx` + `.module.css` — segundo bloque: nombre, semana actual, realizados/omitidos, dos barras de avance y cumplimiento (`role="progressbar"`), enlace al detalle y estado vacío con acción.
- `front/src/features/dashboard/components/WeeklyVolumeBlock.tsx` + `.module.css` — tercer bloque: total en `kg·rep`, comparación con la semana anterior y barras Recharts de las últimas seis semanas con `role="img"` + alternativa textual; sin datos no se dibuja gráfica.
- `front/src/features/dashboard/components/RecentMaxesBlock.tsx` + `.module.css` — cuarto bloque: hasta tres RM expresos con Ejercicio, carga, repeticiones y fecha; estado vacío que enlaza a Ejercicios.
- `front/src/features/dashboard/components/EvolutionBlock.tsx` + `.module.css` — quinto bloque: selector de Ejercicio y serie temporal con la métrica propia de la Forma de registro (carga máxima kg, repeticiones totales rep, duración total s); cardio informa de que no dispone de analítica; sin opciones no se dibuja gráfica.
- `front/src/shared/format.ts` — `formatNumber`/`formatLoad` y `formatDomainDate` extraídas a compartido porque dos funcionalidades las usan (regla «solo se comparten primitivas que aparezcan en varias áreas»).
- `front/src/test/dashboard-fixtures.ts` — dashboard vacío compartido por los tests que montan la app en `/`.

Modificadas:

- `front/src/features/dashboard/pages/HomePage.tsx` + `.module.css` — reescritas: lectura única con TanStack Query (clave con `exerciseId` y `placeholderData` para no perder la lectura al cambiar de Ejercicio), mutación de inicio (libre o desde Plan) con recuperación del conflicto `ACTIVE_SESSION_EXISTS` e invalidación amplia de Inicio, y filas responsive (entrenamiento+Plan en la primera fila de escritorio; volumen+RM en la segunda; evolución a todo el ancho).
- `front/src/features/dashboard/pages/HomePage.test.tsx` — reescrito/extendido: 14 pruebas en el seam aprobado (abajo).
- `front/src/features/exercises/components/RecordedMaxSection.tsx` — pasa a importar `formatLoad`/`formatDomainDate` de `shared/format` (mismo comportamiento).
- `front/src/app/App.test.tsx` y `front/src/app/AppShell.test.tsx` — sus stubs de `fetch` responden ahora `/api/dashboard` (Inicio lo consume al montar la app en `/`); usan el fixture compartido.
- `front/package.json` y `bun.lock` — se añade `recharts@3.10.1` (decisión del ticket 14; Recharts aún no estaba instalado).
- Eliminada `front/src/features/dashboard/api/get-system-health.ts` — su único consumidor era la antigua HomePage (indicador «Aplicación conectada» que no forma parte de los cinco bloques del ticket); quedaba como código muerto.

## TDD por rebanadas verticales en el seam aprobado

Seam aprobado y único: `front/src/features/dashboard/pages/HomePage.test.tsx`
(Vitest + Testing Library renderizando `<App />` en `/`, con el contrato HTTP
sustituido en el límite de la funcionalidad). No se pidió ningún seam nuevo;
los bloques se prueban siempre a través de la página completa.

1. **Rebanada 1 — primer bloque desde el contrato (rojo → verde):** las tres
   pruebas preexistentes (Sesión libre, priorizar Continuar, conflicto al
   iniciar) se adaptaron al contrato (`/api/dashboard` + `/api/sessions/*`) y
   se añadió la acción «Iniciar» del Entrenamiento planificado pendiente
   (POST `{origin:"plan", planId, trainingId}` y navegación a `/sesion/:id`).
   Rojo sobre la HomePage antigua: 2 fallos (la prueba nueva y la de
   Continuar con progreso). Verde tras `dashboard-api.ts` + `TrainingBlock` +
   HomePage: 4/4.
2. **Rebanada 2 — Plan activo (rojo → verde):** pruebas de resumen (nombre,
   «Semana 1 de 2», «1 realizado · 1 omitido», barras `progressbar` con
   `aria-valuenow`, enlace al detalle) y de estado vacío con acción. Rojo
   2/6; verde tras `ActivePlanBlock`: 6/6.
3. **Rebanada 3 — Volumen semanal y RM recientes (rojo → verde):** pruebas
   de total/comparación/barras con alternativa textual (`role="img"`), de
   «sin datos no se dibuja gráfica», de las tres marcas con sus campos y del
   estado vacío de RM. Rojo 4/10; verde tras los dos bloques: 10/10. Corrección
   de fixture en el camino: `es-ES` no agrupa números de 4 cifras («2400», no
   «2.400»), se usó un total de 5 cifras («12.400»).
4. **Rebanada 4 — Evolución (rojo → verde):** pruebas del selector (cambio de
   Ejercicio reconsulta con `?exerciseId=`, se verifica la consulta emitida),
   de cardio sin analítica y de estado vacío sin opciones. Rojo 3/13; verde
   tras `EvolutionBlock`: 13/13 (se extrajo la tarjeta de gráfica a un
   componente interno para conservar el estrechamiento de tipos de `metric`).
5. **Rebanada 5 — Presentación responsive (rojo → verde):** la prueba agrupa
   «Entrenamiento y Plan» en la primera fila y «Volumen y RM recientes» en la
   segunda, verifica que la evolución queda fuera de ambas y conserva el orden
   vertical. Rojo 1/14; verde con las filas y la media query de escritorio:
   14/14.

## Verificaciones

- `cd front && bun run typecheck` — PASS.
- `cd front && bun run test -- src/features/dashboard/pages/HomePage.test.tsx` — 14 pruebas, 0 fallos.
- `cd front && bun run test` (suite completa del frontend) — 14 archivos, 146 pruebas, 0 fallos (132 preexistentes + 14 del ticket; las adaptaciones de stubs de App/AppShell mantienen sus pruebas verdes).
- `cd back && bun run typecheck` — PASS (backend intacto).
- `cd front && bun run build` — PASS (aviso de tamaño de chunk preexistente al no haber code-splitting en el MVP; Recharts añade peso al bundle).

El coordinador conserva la validación completa (incluida la suite del backend).

## Autorevisión (skill code-review)

**Limitación del runtime:** el skill `code-review` lanza dos sub-agentes en
paralelo mediante una herramienta `Agent` que este runtime no expone (misma
limitación que en los intentos del ticket 33). La revisión de ambos ejes se
hizo manualmente en el mismo contexto sobre el diff
`ccca48b..HEAD`. El coordinador mantiene la revisión definitiva.

### Eje Standards

Fuentes: «Arquitectura del frontend» y «API y concurrencia» de la spec,
`docs/agents/domain.md`, patrones del código existente.
- Organización por funcionalidad (`features/dashboard/{api,components,pages}`), CSS Modules por componente, claves de TanStack Query por recurso+filtro, `retry: false`, vocabulario en español del dominio — coherentes con el resto del frontend.
- Sin olores del baseline en el diff: nombres autoexplicativos, sin lógica duplicada de dominio (las métricas llegan agregadas), sin cadenas de mensajes ni envidia de características. El bloque de evolución usa Recharts con `role="img"` y alternativa textual completa; las barras del Plan usan `role="progressbar"` con `aria-valuenow`.
- Juicio de valor (no aplicado): el patrón «tarjeta de estado vacío» se repite en los cuatro bloques con pequeñas variaciones; podría extraerse a un componente compartido, pero el ticket no lo exige y la duplicación es local (3 clases CSS por bloque). Se deja anotado para la revisión del coordinador.
- El refactor de `RecordedMaxSection` a `shared/format.ts` sigue la regla «solo se comparten primitivas que aparezcan en varias áreas»; comportamiento idéntico (las pruebas de Ejercicios pasan).

### Eje Spec

- Cumplidos los nueve criterios del ticket: primer bloque con las tres acciones prioritarias (Continuar con nombre+progreso, Iniciar del próximo Entrenamiento pendiente, Sesión libre); Plan activo con semana, realizados, omitidos, barras y enlace; volumen con total, comparación y seis semanas en `kg·rep`; hasta tres RM con Ejercicio, carga, repeticiones y fecha; evolución con selector y métrica propia de la Forma de registro (cardio informa sin analítica); recorrido vertical en móvil y filas acordadas en escritorio; gráficas con texto, unidad e indicadores accesibles y sin gráficas sin datos; pruebas en el seam acordado que no duplican reglas de dominio.
- Alcance contenido: no se tocó el backend, no se modificaron los modelos de lectura, no se recalcularon métricas en el navegador y no se añadió ningún seam de prueba nuevo. Se retiró el indicador de salud «Aplicación conectada» de la antigua HomePage (no forma parte de los cinco bloques) y su archivo quedó sin consumidores.
- Comportamiento añadido no pedido explícitamente pero alineado con la spec: invalidación amplia de Inicio al iniciar una Sesión («las mutaciones invalidan ampliamente Inicio») y `placeholderData` para que cambiar de Ejercicio en Evolución no deje la página en blanco durante la relectura.

## Lo que queda

- El coordinador revisa el ticket 34 (Standards y Spec) y valida visualmente la presentación responsive y las gráficas en el navegador (jsdom no evalúa media queries ni el aspecto de Recharts).
- Los tickets siguientes (finalizar/eliminar Sesión, corregir Historial, omitir Entrenamientos, registrar RM, editar Planes) deberían invalidar Inicio desde sus mutaciones; la clave `["dashboard"]` está lista como prefijo compartido.
