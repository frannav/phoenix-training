# Attempt 1 — Ticket 21: Crear y reutilizar Rutinas

- **Ticket:** `.scratch/gym-training-mvp/issues/21-crear-reutilizar-rutinas.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `4686e8c35f15d893fdbca5d054a6754be50e7a6a`
- **Branch:** `feature/ticket-21`
- **Commit:** `3424b28` — «Crear y reutilizar Rutinas (ticket 21)»
- **Outcome:** succeeded

## Qué se construyó

El ciclo completo de Rutinas reutilizables: una Cuenta puede listar, crear,
obtener y sustituir el agregado completo (nombre, Ejercicios ordenados,
Series previstas con Objetivos opcionales), con concurrencia optimista por
revisión entera, archivar/restaurar sin perder identidad ni contenido, y
resolución de Ejercicios no disponibles dentro de Rutinas existentes.

**Backend** (`back/src/routines/`, montado bajo `/api`):

- `POST /api/routines` — crea una Rutina privada con revisión `1`, identidad
  opaca y servidor asigna identidad a todos los hijos. Responde `201` con el
  documento canónico (cada Ejercicio resuelto con nombre, Forma de registro,
  procedencia y disponibilidad).
- `GET /api/routines` — listado **completo** (sin paginación, spec: «Planes
  y Rutinas se listan completos»): el agregado entero por Rutina, incluidas
  las archivadas con `archived: true` para poder restaurarlas desde la UI.
- `GET /api/routines/:id` — documento canónico; `404` para lo ajeno o
  inexistente.
- `PUT /api/routines/:id` — sustituye el agregado completo exigiendo la
  `revision` leída: revisión obsoleta → `409 STALE_REVISION` sin mezclar ni
  sobrescribir; los hijos existentes **conservan su identificador** y los
  nuevos lo reciben del servidor (borrado y reinserción en la misma
  transacción con identidades calculadas antes de borrar).
- `POST /api/routines/:id/archive` y `.../restore` — transiciones explícitas
  e idempotentes; archivar retira de usos nuevos y restaurar recupera la
  misma identidad y contenido.
- Validación del agregado en el caso de uso (estado), con Zod solo para la
  forma en el límite HTTP: cada Ejercicio debe existir, ser visible para la
  Cuenta (catálogo o personalizado propio) y estar disponible para usos
  nuevos; la Forma de registro fija los objetivos admitidos (carga y
  repeticiones en fuerza, repeticiones solas, duración en tiempo y cardio) y
  la cardinalidad (cardio continuo: exactamente una Serie por aparición; el
  resto: una o más); límites de dominio —carga `0–9999,99` kg con ≤2
  decimales, repeticiones enteras `1–9999`, duración entera `1–359999` s— y
  omisión independiente de cada objetivo. Errores con claves de campo
  `exercises[i].series[j].carga`.
- Migración Drizzle `0004` con tres tablas: `routine`, `routine_exercise`
  (FK a `exercise` sin borrado: las referencias nunca se rompen) y
  `routine_series_goal` (carga REAL, repeticiones/duración enteras, FKs en
  cascada hacia la cabecera).

**Frontend** (`/rutinas`, `/rutinas/nueva`, `/rutinas/:rutinaId`):

- `RoutinesPage` — listado de disponibles con resumen (nº de Ejercicios y
  Series), «Nueva Rutina», archivo con diálogo de confirmación accesible
  (`role=dialog`, `aria-modal`, `aria-labelledby/describedby`) y sección de
  archivadas con «Restaurar».
- `RoutineEditor` — crear y editar en el mismo componente: nombre, selector
  de Ejercicios disponibles (solo usos nuevos, con búsqueda), ordenar con
  botones `Subir`/`Bajar` con `aria-label`, edición de Series previstas con
  campos según Forma de registro (cardio sin «Añadir serie»), validación
  inmediata (Zod) y errores del servidor junto al campo; ante `409`
  `STALE_REVISION` informa del conflicto y «Cargar la versión actual»
  remonta el editor con el documento vigente sin mezclar cambios.
- `NewRoutinePage` y `RoutineDetailPage` — flujos de creación y edición con
  banner de archivada y restauración desde el detalle.

## Evidencia TDD por seam (rojo → verde)

### Seam 1 — API HTTP integrada contra SQLite temporal (`back/test/routines.test.ts`)

- **Crear/listar/obtener (rojo → verde):** 7 tests iniciales fallaron con
  `404` (rutas inexistentes). Verde con esquema + migración `0004` +
  `routines.ts` (casos de uso) + `routines-router.ts` + cableado en
  `app.ts`. Un fallo real durante el verde: el middleware sin patrón de los
  sub-enrutadores montados de Hono se ejecuta para **toda** `/api`, así que
  `/api/routines` sin sesión recibía el `401` de Ejercicios («Debes iniciar
  sesión para consultar los Ejercicios.»). Se verificó con una reproducción
  mínima (`/tmp/hono-repro*.ts`: el middleware con patrón no se ejecuta en
  sub-enrutadores montados y el `path` llega completo) y se acotó cada
  middleware por prefijo de ruta (`/api/routines`, `/api/exercises`).
- **Validación del agregado (rojo → verde):** cardinalidad de cardio
  (exactamente una Serie), una o más Series por Ejercicio, objetivos no
  admitidos por Forma de registro, límites de carga/repeticiones/duración,
  omisión independiente de objetivos, y rechazo de Ejercicios inexistentes,
  ajenos o archivados con claves `exercises[i].exerciseId` /
  `exercises[i].series[j].carga`.
- **Concurrencia optimista (rojo → verde):** sustitución con conservación de
  identificadores de hijos y Serie nueva con identidad del servidor; `409`
  `STALE_REVISION` para ediciones obsoletas y verificación de que el
  contenido legítimo no se mezcla ni se sobrescribe; `404` para la Rutina de
  otra Cuenta; validación de `revision` y del agregado en el límite HTTP.
- **Archivo/restauración (rojo → verde):** archivar marca `archived: true`
  conservando identidad y contenido, restaurar recupera lo mismo, ambas
  idempotentes, `404` para ajenas/inexistentes.
- **Referencias a Ejercicios no disponibles (rojo → verde):** una Rutina
  existente sigue mostrando el Ejercicio archivado (`available: false`,
  nombre y objetivos intactos) pero la sustitución no puede volver a
  seleccionarlo (`400` en `exercises[1].exerciseId`); retirándolo, la
  edición avanza.
- **Aislamiento entre Cuentas:** listar/obtener/editar/archivar lo ajeno
  responde `404`; dos Cuentas solo ven sus propias Rutinas.

Total del seam: **18 tests, 611 asserts**.

### Seam 2 — UI de Rutinas (`front/src/features/routines/pages/RoutinesPage.test.tsx`)

6 tests (Vitest + Testing Library, contrato HTTP simulado en el límite):
listado con resumen y archivadas con «Restaurar»; archivar con diálogo
accesible (cancelar conserva, confirmar retira y mueve a archivadas);
restaurar; creación con validación inmediata y payload correcto (orden tras
«Subir», cardio con una Serie y sin «Añadir serie», objetivos por Forma de
registro); edición prellenada que sustituye con `revision` e identidades de
hijos; `409` que informa del conflicto y «Cargar la versión actual» reobtiene
el documento vigente. Se adaptó `App.test.tsx` (destino acordado de
`/rutinas/rutina-opaca`) para servir la Rutina real en el stub de fetch.

## Verificaciones enfocadas

- `rtk bun run typecheck`: 0 errores (back y front).
- `rtk bun run --cwd back test test/routines.test.ts`: **18/18**.
- `rtk bun run --cwd back test`: **86 pass / 0 fail** (1438 asserts, 6 archivos).
- `rtk bun run --cwd front test -- src/features/routines`: **6/6**.
- `rtk bun run --cwd front test`: **65 pass** (10 archivos).
- `rtk bun run build`: build de producción correcto.

## Self-review (skill `$code-review`)

El runtime de Pi no expone herramienta de sub-agentes (no hay `Agent`), igual
que en los intentos 18 y 19, por lo que no fue posible lanzar los dos agentes
paralelos del skill; ambos ejes se realizaron como auto-revisión sobre el
diff autoral y el coordinador conserva la revisión definitiva.

### Estándares

- Convenciones del repo: vocabulario del dominio en español (`CONTEXT.md`),
  error canónico `{error:{code,message,fields?}}` con `400` / `401` / `404` /
  `409`, Zod en el límite HTTP y reglas dependientes de estado en el caso de
  uso, filtrado por Cuenta autenticada nunca por identificador del cliente,
  casos de uso sin repositorios genéricos, transacciones para escrituras
  completas, listados completos para Rutinas.
- Hallazgos corregidos durante la auto-revisión: (1) duplicación
  `fieldKey`/`bracketPath` unificada en `routineFieldKey` compartida entre
  caso de uso y router (la clave de campo es contrato entre ambos);
  (2) `409` duplicaba el aviso de conflicto con el banner genérico — el
  editor ya no fija `serverError` en `STALE_REVISION`; (3) el listado
  filtraba `data?.items.filter` sin proteger `items` indefinido — se
  defiende con `?? []`; (4) durante el verde se descubrió y corrigió la
  fuga del middleware de sesión entre módulos (ver Seam 1), un cambio
  mínimo sobre `exercises-router.ts` que conserva el comportamiento de
  `/api/exercises` y evita `401` ajenos a otros módulos.
- Olores: sin Mysterious Name ni Duplicated Code restantes en el diff; sin
  Speculative Generality (los `id` opcionales de hijos materializan la
  conservación de identidad y se reasignan si no pertenecen al agregado);
  sin Shotgun Surgery (backend en `back/src/routines/`, UI en
  `features/routines/`).

### Espec

- Requisitos del ticket cubiertos uno a uno: listar/crear/obtener privadas
  con nombre, Ejercicios ordenados, Series previstas y Objetivos opcionales;
  Forma de registro y cardinalidad por Ejercicio (cardio: una Serie por
  aparición); objetivos independientes con límites de dominio; edición que
  sustituye el agregado conservando identidades de hijos y asignando las
  nuevas; revisión entera con `409` sin mezclar ni sobrescribir; archivar/
  restaurar con identidad y contenido; Ejercicios no disponibles que siguen
  resolviendo referencias existentes pero no se seleccionan para usos
  nuevos; listados completos e interfaz con crear, ordenar, editar, archivar
  y restaurar con confirmaciones accesibles; pruebas HTTP integradas de
  validación del agregado, concurrencia optimista, archivo y aislamiento.
- Sin scope creep: no se añadieron endpoints fuera del ticket (Planes y
  Sesiones son tickets 22+); no se tocó el ticket 20 (RM registrados).
- Notas de interpretación: (a) `GET /api/routines` devuelve también las
  archivadas con `archived: true` — «se listan completos» y la UI necesita
  restaurar; los tickets 22/28 podrán filtrar `archived` en el cliente o
  añadir un parámetro; (b) crear con cero Ejercicios está permitido (ninguna
  regla exige mínimo) y el editor lo permite, coherente con Sesión libre
  vacía; (c) archivar no bloquea la sustitución (es una transición explícita,
  no una sustitución) y no incrementa la revisión.

## Archivos de autor (paths)

```
back/drizzle/0004_purple_shooting_star.sql          Nuevo: migración rutinas
back/drizzle/meta/0004_snapshot.json                Nuevo: snapshot de la migración
back/drizzle/meta/_journal.json                     Registra la migración 0004
back/src/db/schema.ts                               Tablas routine, routine_exercise, routine_series_goal
back/src/routines/routines.ts                       Nuevo: casos de uso, documento canónico y validación
back/src/routines/routines-router.ts                Nuevo: sub-enrutador /api/routines
back/src/app.ts                                     Cablea el sub-enrutador de Rutinas
back/src/exercises/exercises-router.ts              Middleware acotado por prefijo /api/exercises
back/test/routines.test.ts                          Nuevo: 18 tests HTTP integrados
front/src/features/routines/api/routines-api.ts     Nuevo: cliente de la API de Rutinas
front/src/features/routines/components/RoutineEditor.tsx        Nuevo: editor crear/editar
front/src/features/routines/components/RoutineEditor.module.css
front/src/features/routines/pages/RoutinesPage.tsx             Listado, archivo y restauración
front/src/features/routines/pages/RoutinesPage.module.css
front/src/features/routines/pages/NewRoutinePage.tsx           Flujo de creación
front/src/features/routines/pages/RoutineDetailPage.tsx        Detalle/edición con conflicto 409
front/src/features/routines/pages/RoutinesPage.test.tsx        Nuevo: 6 tests de interfaz
front/src/app/App.tsx                               Imports de las páginas extraídas
front/src/app/App.test.tsx                          Stub de fetch sirve la Rutina del destino acordado
.scratch/gym-training-mvp/orchestration/21/attempt-1.md
```

## Pendiente / observaciones

- El ticket sigue `ready-for-agent` en el tracker: el coordinador conserva la
  revisión definitiva y el cierre del ticket.
- Cuando existan Planes y Sesiones (tickets 22+), los selectores de Rutina
  podrán usar `archived` del documento para excluir archivadas de usos
  nuevos y `GET /api/routines/:id` para iniciar Sesiones desde una Rutina;
  `GET /api/exercises/:id` resuelve ya las referencias no disponibles que la
  Rutina conserva.
- El diálogo de confirmación de archivo no atrapa el foco (mismo patrón que
  el de Ejercicios y el «Más» del AppShell); si la revisión de accesibilidad
  pantalla por pantalla lo exige, se puede añadir foco inicial con `ref`.
