# 20 — Mantener RM registrados

**What to build:** La gestión de marcas reales introducidas expresamente por el Deportista para cualquier Ejercicio propio o del catálogo, con vigencia temporal determinista.

**Blocked by:** 19 — Gestionar Ejercicios personalizados.

**Status:** ready-for-agent

- [ ] Una Cuenta puede registrar un RM indicando Ejercicio, carga, número de repeticiones y fecha.
- [ ] La Cuenta puede listar, editar y eliminar sus RM registrados desde el área de Ejercicios.
- [ ] Para un Ejercicio y número de repeticiones, el RM vigente en una fecha es el registro más reciente de esa fecha o anterior.
- [ ] Los RM pueden referenciar Ejercicios del catálogo o personalizados, incluso si después dejan de estar disponibles para usos nuevos.
- [ ] Registrar una Serie nunca crea ni actualiza automáticamente un RM.
- [ ] La aplicación no calcula ni presenta 1RM estimado ni utiliza fórmulas de estimación.
- [ ] Los RM pertenecen a la Cuenta autenticada; otra Cuenta no puede leerlos, modificarlos ni inferir su existencia.
- [ ] La interfaz muestra Ejercicio, carga, repeticiones y fecha con validación explícita y confirmación antes de eliminar.
- [ ] Las pruebas HTTP integradas cubren vigencia por fecha y repeticiones, edición, eliminación y aislamiento usando SQLite migrada.
