# 26 — Registrar resultados por Serie

**What to build:** El registro inmediato y válido de Objetivos, Resultados y RPE para las cuatro Formas de registro dentro de una Sesión activa.

**Blocked by:** 25 — Iniciar y reanudar una Sesión libre.

**Status:** ready-for-agent

- [ ] Cada Serie está exactamente pendiente, completada u omitida y solo conserva los datos permitidos por su estado.
- [ ] Fuerza con carga exige carga y repeticiones al completar; repeticiones sin carga exige repeticiones; tiempo por serie y cardio continuo exigen duración.
- [ ] Cardio continuo admite exactamente una Serie por aparición del Ejercicio; otro esfuerzo requiere añadir de nuevo el Ejercicio.
- [ ] Se validan sin corrección silenciosa carga de `0` a `9999,99`, repeticiones de `1` a `9999`, duración de `1` a `359999` segundos y RPE de `1` a `10` en pasos de `0,5`.
- [ ] Los Objetivos de serie inicializan los campos de resultado sin cambiar el estado hasta que el Deportista complete expresamente la Serie.
- [ ] Un resultado solo se guarda si contiene atómicamente todos los valores exigidos; una entrada parcial permanece en el formulario y se pierde al recargar.
- [ ] Cada acción válida sustituye el agregado completo con su revisión y muestra “Guardando”, “Guardado” o “Error al guardar” con posibilidad de reintento.
- [ ] Una revisión obsoleta detiene nuevas mutaciones, recupera la versión vigente y no fusiona ni duplica Series.
- [ ] La interfaz usa filas compactas, errores próximos a los campos e icono y texto además de color para comunicar estados.
- [ ] Las pruebas HTTP integradas cubren todos los límites, estados y Formas de registro, atomicidad, repetición de peticiones y conflictos entre pestañas.
