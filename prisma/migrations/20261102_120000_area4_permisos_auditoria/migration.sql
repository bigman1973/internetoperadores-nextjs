-- Área 4: capacidades explícitas, catálogo aprobado, perfiles no asignados y auditoría append-only.
-- Esta migración es aditiva: no modifica ni asigna cuentas, perfiles o permisos existentes.

ALTER TABLE "permiso_usuarios"
  ADD COLUMN "confirmar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "exportar" BOOLEAN NOT NULL DEFAULT false;

-- La política viva se activa únicamente al aplicar una plantilla o ajuste
-- explícito. El valor por defecto conserva los accesos legacy hasta que Víctor
-- confirme cada transición de persona.
ALTER TABLE "usuarios_admin"
  ADD COLUMN "permisos_area4_vivos" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "auditoria_permisos_area4" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" INTEGER NOT NULL,
  "objetivo_usuario_id" INTEGER,
  "operacion" TEXT NOT NULL,
  "area_codigo" TEXT,
  "antes" JSONB,
  "despues" JSONB,
  "origen" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditoria_permisos_area4_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auditoria_permisos_area4_actor_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "auditoria_permisos_area4_target_fkey"
    FOREIGN KEY ("objetivo_usuario_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "auditoria_permisos_area4_created_idx" ON "auditoria_permisos_area4"("created_at" DESC);
CREATE INDEX "auditoria_permisos_area4_actor_idx" ON "auditoria_permisos_area4"("actor_id", "created_at" DESC);
CREATE INDEX "auditoria_permisos_area4_target_idx" ON "auditoria_permisos_area4"("objetivo_usuario_id", "created_at" DESC);

-- Interruptor persistente y reversible del menú agrupado. No se inserta fila:
-- hasta que Víctor la habilite expresamente se conserva el menú histórico.
CREATE TABLE "configuracion_panel_area4" (
  "id" TEXT NOT NULL,
  "menu_agrupado_para_propietario" BOOLEAN NOT NULL DEFAULT false,
  "menu_agrupado_para_todos" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_id" INTEGER,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "configuracion_panel_area4_pkey" PRIMARY KEY ("id")
);

CREATE FUNCTION "area4_auditoria_permisos_bloquear_mutacion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría de permisos de Área 4 es inmutable';
END;
$$;

CREATE TRIGGER "area4_auditoria_permisos_no_update_delete"
BEFORE UPDATE OR DELETE ON "auditoria_permisos_area4"
FOR EACH ROW EXECUTE FUNCTION "area4_auditoria_permisos_bloquear_mutacion"();

CREATE TRIGGER "area4_auditoria_permisos_no_truncate"
BEFORE TRUNCATE ON "auditoria_permisos_area4"
FOR EACH STATEMENT EXECUTE FUNCTION "area4_auditoria_permisos_bloquear_mutacion"();

-- Catálogo mínimo requerido por las plantillas y las superficies controladas.
INSERT INTO "permiso_areas" ("id", "codigo", "nombre", "padre", "orden", "activo") VALUES
  ('area4_admin_permisos', 'admin.permisos', 'Permisos', 'admin', 90, true),
  ('area4_admin_auditoria', 'admin.auditoria', 'Auditoría de accesos', 'admin', 91, true),
  ('area4_admin_peticiones', 'admin.peticiones', 'Peticiones', 'admin', 92, true),
  ('area4_admin_asistente', 'admin.asistente', 'Asistente IA', 'admin', 93, true),
  ('area4_admin_aapp', 'admin.aapp', 'AAPP', 'admin', 94, true),
  ('area4_admin_certificaciones', 'admin.certificaciones', 'Certificaciones', 'admin', 95, true),
  ('area4_admin_imputaciones', 'admin.imputaciones', 'Imputaciones', 'admin', 96, true),
  ('area4_admin_proyectos_internos', 'admin.proyectos_internos', 'Proyectos internos', 'admin', 97, true),
  ('area4_admin_clientes_todos', 'admin.clientes.todos', 'Clientes > Todos los clientes', 'admin.clientes', 1, true),
  ('area4_admin_clientes_exagrid', 'admin.clientes.ggcc.exagrid', 'Clientes > GGCC > Exagrid', 'admin.clientes.ggcc', 2, true),
  ('area4_draxton_actualizaciones', 'admin.clientes.ggcc.draxton.actualizaciones', 'Draxton > Actualizaciones', 'admin.clientes.ggcc.draxton', 11, true),
  ('area4_draxton_contrato_guardias', 'admin.clientes.ggcc.draxton.contrato_guardias', 'Draxton > Contrato de guardias', 'admin.clientes.ggcc.draxton', 12, true),
  ('area4_draxton_informes', 'admin.clientes.ggcc.draxton.informes', 'Draxton > Informes', 'admin.clientes.ggcc.draxton', 13, true),
  ('area4_draxton_kpis', 'admin.clientes.ggcc.draxton.kpis', 'Draxton > KPIs', 'admin.clientes.ggcc.draxton', 14, true),
  ('area4_draxton_organigrama', 'admin.clientes.ggcc.draxton.organigrama', 'Draxton > Organigrama', 'admin.clientes.ggcc.draxton', 12, true),
  ('area4_draxton_personal', 'admin.clientes.ggcc.draxton.personal', 'Draxton > Personal', 'admin.clientes.ggcc.draxton', 16, true),
  ('area4_draxton_proyectos', 'admin.clientes.ggcc.draxton.proyectos', 'Draxton > Proyectos', 'admin.clientes.ggcc.draxton', 17, true),
  ('area4_draxton_seguimiento', 'admin.clientes.ggcc.draxton.seguimiento', 'Draxton > Seguimiento', 'admin.clientes.ggcc.draxton', 18, true),
  ('area4_empleado', 'empleado', 'Portal del empleado', NULL, 200, true),
  ('area4_empleado_portal', 'empleado.portal', 'Portal del empleado > Propio', 'empleado', 1, true),
  ('area4_empleado_peticiones', 'empleado.peticiones', 'Portal del empleado > Peticiones propias', 'empleado', 2, true)
ON CONFLICT ("codigo") DO NOTHING;

-- Plantillas listas para revisión y asignación manual. No se sustituye ningún perfil existente.
INSERT INTO "perfiles_permisos" ("id", "nombre", "descripcion", "color", "permisos", "activo") VALUES
  (
    'area4-gerente-operativo',
    'AREA4 · Gerente operativo',
    'Todo el negocio salvo Usuarios, permisos, auditoría y Actuar como.',
    '#FF5300',
    '[
      {"areaCodigo":"admin.crm","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.tarifas","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.clientes","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.leads","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.asistente","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.comunicados","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.altas_pendientes","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.contratos","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.facturacion","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.finanzas","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.estadisticas","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.subida_precios","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.empleados","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.proyectos","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.proyectos_internos","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.aapp","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.certificaciones","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.peticiones","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.historial","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.configuracion","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.imputaciones","lectura":true,"escritura":true,"confirmar":true,"exportar":true}
    ]'::jsonb,
    true
  ),
  (
    'area4-contabilidad-clientes-rrhh',
    'AREA4 · Contabilidad + Clientes (ver) + RRHH',
    'Contabilidad y RRHH completos; Clientes solo consulta, incluidos sus subapartados.',
    '#2D2A26',
    '[
      {"areaCodigo":"admin.facturacion","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.finanzas","lectura":true,"escritura":true,"confirmar":true,"exportar":true},
      {"areaCodigo":"admin.clientes","lectura":true,"escritura":false,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.empleados","lectura":true,"escritura":true,"confirmar":true,"exportar":true}
    ]'::jsonb,
    true
  ),
  (
    'area4-empleado-portal-peticiones',
    'AREA4 · Empleado: Portal y Peticiones',
    'Portal propio y sus peticiones de mejora o incidencia; sin acceso administrativo.',
    '#64748b',
    '[
      {"areaCodigo":"empleado.portal","lectura":true,"escritura":true,"confirmar":true,"exportar":false},
      {"areaCodigo":"empleado.peticiones","lectura":true,"escritura":true,"confirmar":true,"exportar":false}
    ]'::jsonb,
    true
  ),
  (
    'area4-tecnico-draxton-8',
    'AREA4 · Técnico Draxton (8 subáreas)',
    'Equivalente a las ocho subáreas actuales de Alejandro y Jesús. No se asigna automáticamente.',
    '#2563EB',
    '[
      {"areaCodigo":"admin.clientes.ggcc.draxton.actualizaciones","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.contrato_guardias","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.informes","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.kpis","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.organigrama","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.personal","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.proyectos","lectura":true,"escritura":true,"confirmar":false,"exportar":false},
      {"areaCodigo":"admin.clientes.ggcc.draxton.seguimiento","lectura":true,"escritura":true,"confirmar":false,"exportar":false}
    ]'::jsonb,
    true
  )
ON CONFLICT ("nombre") DO NOTHING;
