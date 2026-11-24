-- Área 5 · Gastos del trabajador y nóminas — registro en desarrollo_historial.
-- NO ejecutado: lo lanza la integradora cuando junte area5-gastos en staging (no se ha usado la BD de Railway).
-- El commit_hash queda a NULL a propósito: la integradora puede rellenarlo con el hash resultante del merge.
INSERT INTO desarrollo_historial (titulo, descripcion, tipo, estado, autor, commit_hash, rama, fecha) VALUES
('Área 5 · Gastos del trabajador: Mis gastos con OCR y kilometraje',
 'Nueva pantalla /empleado/mis-gastos: el trabajador sube foto o PDF del ticket (se guarda en la propia BD, privado), con lectura automática (OCR) que solo propone y que el trabajador revisa; fecha, importe, IVA, concepto, cliente/proyecto y kilometraje (km × €/km). Borrador, envío, corrección tras petición de aclaración y avisos dentro del panel. Cada trabajador solo ve lo suyo.',
 'feat', 'completado', 'Manus (Área 5)', NULL, 'area5-gastos', NOW()),
('Área 5 · Revisión de gastos por David y Víctor',
 'Nueva pantalla /admin/gastos-nominas (solo revisores David y Víctor; Lorena no): aprobar, rechazar con motivo, pedir aclaración y reabrir. Nadie revisa sus propios gastos. Registro de eventos y avisos al trabajador. Tablas area5_* (migración aditiva 20261127_area5_gastos_nominas).',
 'feat', 'completado', 'Manus (Área 5)', NULL, 'area5-gastos', NOW()),
('Área 5 · Cierre mensual y paquete para la gestoría',
 'Cierre por periodo AAAA-MM con los gastos aprobados por trabajador: Excel (resumen + detalle) y PDF por trabajador con los tickets. El correo a la gestoría queda como borrador (el panel no envía nada); una persona lo envía y lo marca como enviado.',
 'feat', 'completado', 'Manus (Área 5)', NULL, 'area5-gastos', NOW()),
('Área 5 · Cuadre de gastos aprobados con las nóminas',
 'Importación de nóminas individuales guardando los conceptos de gasto (area5_nomina_conceptos, sin tocar la tabla nominas) y cuadre por trabajador entre gastos aprobados y nómina: CUADRA / DIFERENCIA / SIN NÓMINA / SIN DESGLOSE / REVISAR. Líneas ambiguas se marcan para revisión manual.',
 'feat', 'completado', 'Manus (Área 5)', NULL, 'area5-gastos', NOW());
