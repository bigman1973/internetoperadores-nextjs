-- Vuelta atrás de 20261128_area3_impuestos_presupuesto (no la ejecuta Prisma; solo manual y con copia previa).
DROP TABLE IF EXISTS area3_pre_auditoria;
DROP TABLE IF EXISTS area3_pre_lineas;
DROP TABLE IF EXISTS area3_pre_versiones;
DROP TABLE IF EXISTS area3_imp_auditoria;
DROP TABLE IF EXISTS area3_imp_presentados;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128_area3_impuestos_presupuesto';
