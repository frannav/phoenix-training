# 26 — Registrar resultados por Serie

**What to build:** El registro inmediato y válido de Objetivos, Resultados y RPE para las cuatro Formas de registro dentro de una Sesión activa.

**Blocked by:** 25 — Iniciar y reanudar una Sesión libre.

**Status:** resolved

- [x] Cada Serie está exactamente pendiente, completada u omitida y solo conserva los datos permitidos por su estado.
- [x] Fuerza con carga exige carga y repeticiones al completar; repeticiones sin carga exige repeticiones; tiempo por serie y cardio continuo exigen duración.
- [x] Cardio continuo admite exactamente una Serie por aparición del Ejercicio; otro esfuerzo requiere añadir de nuevo el Ejercicio.
- [x] Se validan sin corrección silenciosa carga de `0` a `9999,99`, repeticiones de `1` a `9999`, duración de `1` a `359999` segundos y RPE de `1` a `10` en pasos de `0,5`.
- [x] Los Objetivos de serie inicializan los campos de resultado sin cambiar el estado hasta que el Deportista complete expresamente la Serie.
- [x] Un resultado solo se guarda si contiene atómicamente todos los valores exigidos; una entrada parcial permanece en el formulario y se pierde al recargar.
- [x] Cada acción válida sustituye el agregado completo con su revisión y muestra “Guardando”, “Guardado” o “Error al guardar” con posibilidad de reintento.
- [x] Una revisión obsoleta detiene nuevas mutaciones, recupera la versión vigente y no fusiona ni duplica Series.
- [x] La interfaz usa filas compactas, errores próximos a los campos e icono y texto además de color para comunicar estados.
- [x] Las pruebas HTTP integradas cubren todos los límites, estados y Formas de registro, atomicidad, repetición de peticiones y conflictos entre pestañas.

## Answer

Implementado en `33a1b03` (merge de `bf2efef`), con la reparación de
propuestas de la Serie anterior en `842f6c1`. El agregado de Series de la
Sesión activa, validación atómica por Forma de registro, RPE, guardado
inmediato con revisión optimista, interfaz compacta y conflictos entre
versiones quedaron completados.

Verificación del intento y la reparación: `bun run typecheck` pasa; el
backend registra 143 pruebas pasadas; el frontend registra 91 pruebas pasadas;
la prueba focalizada de la interfaz registra 16/16; y `bun run build` pasa.
Las pruebas HTTP cubren estados, límites, atomicidad, cardio, repetición de
peticiones y conflictos entre pestañas.
