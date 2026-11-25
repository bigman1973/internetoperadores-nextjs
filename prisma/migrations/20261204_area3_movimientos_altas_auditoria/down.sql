-- Vuelta atrás: solo si NO hay filas de auditoría que conservar (la tabla es el rastro de las altas).
DROP TRIGGER IF EXISTS area3_mov_altas_aud_solo_insertar ON "area3_movimientos_altas_auditoria";
DROP TABLE IF EXISTS "area3_movimientos_altas_auditoria";
DROP FUNCTION IF EXISTS area3_movimientos_altas_solo_insertar();
