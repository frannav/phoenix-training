# 28 — Iniciar Sesiones desde Rutinas y Planes

**What to build:** El inicio de una Sesión desde una Rutina o un Entrenamiento planificado, conservando su origen y haciendo independientes los objetivos desde el momento de empezar.

**Blocked by:** 24 — Omitir, completar y duplicar Planes; 27 — Adaptar y finalizar una Sesión.

**Status:** ready-for-agent

- [ ] “Iniciar” desde una Rutina o un Entrenamiento planificado pendiente crea la Sesión y abre directamente su pantalla, salvo que ya exista otra activa.
- [ ] La Sesión conserva como Origen de sesión la Rutina o el Entrenamiento planificado, pero copia los objetivos vigentes y nunca vuelve a sincronizar contenido.
- [ ] Editar la Rutina o el Plan después de iniciar no modifica los Objetivos ni Resultados guardados en la Sesión.
- [ ] Un Entrenamiento planificado pendiente puede iniciar una Sesión aunque su Fecha prevista sea pasada o futura; la Fecha realizada se guarda por separado.
- [ ] Cada Entrenamiento planificado origina como máximo una Sesión finalizada y pasa a realizado únicamente cuando esa Sesión finaliza.
- [ ] Las Series previstas y los Ejercicios del origen conservan la intención original: no se eliminan individualmente y se resuelven mediante omisión; los añadidos mantienen las reglas del ticket 27.
- [ ] Una Sesión iniciada directamente desde una Rutina no cambia el estado de ningún día del Plan.
- [ ] Completar un Plan devuelve conflicto mientras tenga una Sesión activa originada en él; eliminar esa Sesión activa deja de bloquear el Plan y mantiene el día pendiente.
- [ ] Si ya existe una Sesión activa, las entradas desde Rutinas y Planes conducen a ella en lugar de crear otra.
- [ ] Las pruebas HTTP integradas cubren copia e independencia, fechas, origen, unicidad por Entrenamiento planificado, finalización y aislamiento entre Cuentas.
