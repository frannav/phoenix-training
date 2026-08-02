# 18 — Explorar el catálogo revisado de Ejercicios

**What to build:** Un catálogo compartido, local y versionado de Ejercicios revisados en español que el Deportista pueda buscar y consultar sin depender del dataset original en tiempo de ejecución.

**Blocked by:** 16 — Registrar, verificar y acceder a una Cuenta.

**Status:** ready-for-agent

- [ ] Una importación reproducible fija el commit auditado de `hasaneyldrm/exercises-dataset`, su checksum y la revisión de origen en un manifiesto.
- [ ] Solo se publican Ejercicios con nombre e instrucciones revisados en español, Forma de registro asignada expresamente y taxonomía mínima de búsqueda y filtro.
- [ ] Cada Ejercicio importado recibe una identidad interna opaca; la combinación de fuente e identificador upstream es única y no se expone como referencia de dominio.
- [ ] El catálogo se persiste mediante una migración o carga versionada y ninguna petición traduce, infiere ni consulta contenido upstream.
- [ ] La API permite buscar y filtrar Ejercicios disponibles mediante cursor opaco y un límite máximo de 50 resultados.
- [ ] La interfaz permite explorar y seleccionar Ejercicios, identifica su procedencia de catálogo y utiliza un placeholder común en lugar de JPG o GIF sin licencia.
- [ ] Una actualización puede añadir, cambiar de forma compatible o retirar Ejercicios mediante un diff revisable; retirar nunca elimina la identidad ni rompe referencias existentes.
- [ ] La Forma de registro no puede cambiar para un Ejercicio publicado o utilizado; una corrección incompatible requiere otra identidad.
- [ ] Las pruebas HTTP integradas verifican paginación, filtros, identidad estable y que el catálogo compartido puede leerse desde Cuentas distintas sin convertirse en dato privado.
