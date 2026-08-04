# 28 — Iniciar Sesiones desde Rutinas y Planes

**What to build:** El inicio de una Sesión desde una Rutina o un Entrenamiento planificado, conservando su origen y haciendo independientes los objetivos desde el momento de empezar.

**Blocked by:** 23 — Gestionar el ciclo de vida completo de un Plan; 27 — Adaptar y finalizar una Sesión.

**Status:** resolved

- [x] “Iniciar” desde una Rutina o un Entrenamiento planificado pendiente crea la Sesión y abre directamente su pantalla, salvo que ya exista otra activa.
- [x] La Sesión conserva como Origen de sesión la Rutina o el Entrenamiento planificado, pero copia los objetivos vigentes y nunca vuelve a sincronizar contenido.
- [x] Editar la Rutina o el Plan después de iniciar no modifica los Objetivos ni Resultados guardados en la Sesión.
- [x] Un Entrenamiento planificado pendiente puede iniciar una Sesión aunque su Fecha prevista sea pasada o futura; la Fecha realizada se guarda por separado.
- [x] Cada Entrenamiento planificado origina como máximo una Sesión finalizada y pasa a realizado únicamente cuando esa Sesión finaliza.
- [x] Las Series previstas y los Ejercicios del origen conservan la intención original: no se eliminan individualmente y se resuelven mediante omisión; los añadidos mantienen las reglas del ticket 27.
- [x] Una Sesión iniciada directamente desde una Rutina no cambia el estado de ningún día del Plan.
- [x] Completar un Plan devuelve conflicto mientras tenga una Sesión activa originada en él; eliminar esa Sesión activa deja de bloquear el Plan y mantiene el día pendiente.
- [x] Si ya existe una Sesión activa, las entradas desde Rutinas y Planes conducen a ella en lugar de crear otra.
- [x] Las pruebas HTTP integradas cubren copia e independencia, fechas, origen, unicidad por Entrenamiento planificado, finalización y aislamiento entre Cuentas.

## Answer

Implementado y mergeado en `main` mediante la PR #8 (`5138753`), con las reparaciones incluidas en `cd2378a`.

Verificación actual: las pruebas específicas de Sesiones pasan (62 pruebas backend), incluyendo copia e independencia, fechas, origen, unicidad, finalización, aislamiento y bloqueo/desbloqueo del Plan.
