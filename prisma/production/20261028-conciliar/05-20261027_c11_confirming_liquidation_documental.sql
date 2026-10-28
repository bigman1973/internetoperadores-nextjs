-- Promoción explícita Conciliar autorizada por Víctor, 28/10/2026.
-- SQL aditivo derivado del origen; no alterar migraciones staging aplicadas.
DO $$ BEGIN IF NOT (current_database()='railway' AND current_user='postgres') THEN RAISE EXCEPTION 'CONCILIAR_PRODUCTION_IDENTITY_REQUIRED'; END IF; END $$;
-- C11 — evidencia documental versionada de liquidaciones confirming.
--
-- STAGING ONLY. DDL aditivo; NO DML, backfill, DB push, descarga Graph ni
-- creación/modificación de movimientos bancarios. Esta migración no acredita
-- cobros: sólo crea el contrato persistible que el adaptador debe consumir bajo
-- transacción serializable y confirmación humana.
--
-- Fases PostgreSQL para MotivoDiferencia. FASE A añade el valor de enum pero no
-- lo usa como literal enum en este DDL. El adaptador B4/C11 puede crear una
-- diferencia IVA_COMISION sólo en una transacción POSTERIOR al commit de esta
-- migración (FASE B, a cargo de la integración B4 autorizada). Las guardas C11
-- comparan motivo_diferencia::text en tiempo de ejecución para no introducir un
-- input enum de IVA_COMISION dentro de la transacción de ALTER TYPE.

DO $$ BEGIN
  IF NOT (current_database()='railway' AND current_user='postgres') THEN
    RAISE EXCEPTION 'C11_CONFIRMING_LIQUIDATION_NON_APPROVED_DATABASE';
  END IF;
  IF to_regclass('public.facturas_recibidas') IS NULL
     OR to_regclass('public.confirming_lineas') IS NULL
     OR to_regclass('public.facturas_emitidas') IS NULL
     OR to_regclass('public.cuentas_bancarias') IS NULL
     OR to_regclass('public.movimientos_bancarios') IS NULL
     OR to_regclass('public.vinculos_movimiento_documento') IS NULL
     OR to_regclass('public.operaciones_justificacion_b4') IS NULL
     OR to_regclass('public.lotes_soporte_interes_confirming_draxton') IS NULL THEN
    RAISE EXCEPTION 'C11_CONFIRMING_LIQUIDATION_PREREQUISITES_MISSING';
  END IF;
END $$;

-- FASE A: no insertar ni comparar como enum IVA_COMISION antes del commit de
-- esta migración. IF NOT EXISTS permite ensayar el DDL después de un intento
-- interrumpido que no haya llegado a registrar todos los objetos posteriores.
ALTER TYPE "MotivoDiferencia" ADD VALUE IF NOT EXISTS 'IVA_COMISION';

CREATE TYPE "BancoLiquidacionConfirming" AS ENUM ('BBVA', 'CAIXABANK');
CREATE TYPE "TipoDocumentoLiquidacionConfirming" AS ENUM ('LIQUIDACION', 'AVISO_CESION');
CREATE TYPE "EstadoEvidenciaLiquidacionConfirming" AS ENUM ('CUADRA', 'REQUIERE_REVISION_DOCUMENTAL');
CREATE TYPE "RolDocumentoLiquidacionConfirming" AS ENUM ('LIQUIDACION_PDF', 'DETALLE_FACTURAS_XLS', 'AVISO_CESION_PDF');
CREATE TYPE "ProcedenciaDocumentoLiquidacionConfirming" AS ENUM ('ARCHIVO_DESCARGADO_CONTROLADO');
CREATE TYPE "EstadoSoporteLiquidacionConfirming" AS ENUM ('CONFIRMADO');
CREATE TYPE "AccionAuditoriaLiquidacionConfirming" AS ENUM ('CARGA_EVIDENCIA', 'CONFIRMACION_SOPORTE', 'REVOCACION_SOPORTE');

CREATE TABLE liquidaciones_confirming_documentales (
  id UUID PRIMARY KEY,
  confirming_id TEXT NOT NULL REFERENCES facturas_recibidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  liquidacion_key TEXT NOT NULL CHECK(length(btrim(liquidacion_key)) BETWEEN 1 AND 160),
  version INTEGER NOT NULL CHECK(version >= 1),
  banco "BancoLiquidacionConfirming" NOT NULL,
  tipo_documento "TipoDocumentoLiquidacionConfirming" NOT NULL,
  estado_documental "EstadoEvidenciaLiquidacionConfirming" NOT NULL,
  fecha_liquidacion DATE NOT NULL,
  cuenta_depositaria_id TEXT NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  nominal_centimos INTEGER NOT NULL CHECK(nominal_centimos BETWEEN 1 AND 2147483647),
  intereses_centimos INTEGER NOT NULL CHECK(intereses_centimos BETWEEN 0 AND 2147483647),
  comision_centimos INTEGER NOT NULL CHECK(comision_centimos BETWEEN 0 AND 2147483647),
  iva_comision_centimos INTEGER NOT NULL CHECK(iva_comision_centimos BETWEEN 0 AND 2147483647),
  deduccion_total_centimos INTEGER CHECK(deduccion_total_centimos BETWEEN 0 AND 2147483647),
  neto_bancario_centimos INTEGER NOT NULL CHECK(neto_bancario_centimos BETWEEN 1 AND 2147483647),
  fuente_hash CHAR(64) NOT NULL CHECK(fuente_hash ~ '^[a-f0-9]{64}$'),
  fuente_snapshot JSONB NOT NULL CHECK(
    jsonb_typeof(fuente_snapshot)='object'
    AND fuente_snapshot->>'schema'='CONFIRMING_LIQUIDATION_DOCUMENTAL_V1'
    AND fuente_snapshot ?& ARRAY['documentos','resumen','lineas','sourceHash']
    AND jsonb_typeof(fuente_snapshot->'documentos')='array'
    AND jsonb_typeof(fuente_snapshot->'lineas')='array'
  ),
  actor_real_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_efectivo_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT liquidaciones_confirming_tipo_liquidacion_ck CHECK(tipo_documento='LIQUIDACION'::"TipoDocumentoLiquidacionConfirming"),
  CONSTRAINT liquidaciones_confirming_estado_cuadra_ck CHECK(estado_documental='CUADRA'::"EstadoEvidenciaLiquidacionConfirming"),
  CONSTRAINT liquidaciones_confirming_cierre_ck CHECK(
    nominal_centimos = intereses_centimos + comision_centimos + iva_comision_centimos + neto_bancario_centimos
    AND (deduccion_total_centimos IS NULL OR deduccion_total_centimos = intereses_centimos + comision_centimos + iva_comision_centimos)
  ),
  CONSTRAINT liquidaciones_confirming_version_uk UNIQUE(confirming_id, liquidacion_key, version)
);

CREATE TABLE documentos_liquidacion_confirming (
  id UUID PRIMARY KEY,
  liquidacion_id UUID NOT NULL REFERENCES liquidaciones_confirming_documentales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  factura_recibida_id TEXT NOT NULL REFERENCES facturas_recibidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  rol "RolDocumentoLiquidacionConfirming" NOT NULL,
  hash_binario CHAR(64) NOT NULL CHECK(hash_binario ~ '^[a-f0-9]{64}$'),
  procedencia "ProcedenciaDocumentoLiquidacionConfirming" NOT NULL,
  archivo_controlado_id TEXT NOT NULL CHECK(length(btrim(archivo_controlado_id)) BETWEEN 1 AND 220),
  onedrive_drive_id TEXT,
  onedrive_item_id TEXT,
  nombre_original TEXT,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT documentos_liquidacion_confirming_rol_uk UNIQUE(liquidacion_id, rol),
  CONSTRAINT documentos_liquidacion_confirming_no_cesion_ck CHECK(rol <> 'AVISO_CESION_PDF'::"RolDocumentoLiquidacionConfirming")
);

CREATE TABLE lineas_liquidacion_confirming (
  id UUID PRIMARY KEY,
  liquidacion_id UUID NOT NULL REFERENCES liquidaciones_confirming_documentales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  confirming_linea_id TEXT REFERENCES confirming_lineas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  factura_emitida_id TEXT NOT NULL REFERENCES facturas_emitidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  numero_factura TEXT NOT NULL CHECK(length(btrim(numero_factura)) BETWEEN 1 AND 160),
  nominal_centimos INTEGER NOT NULL CHECK(nominal_centimos BETWEEN 1 AND 2147483647),
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  intereses_explicitos_centimos INTEGER CHECK(intereses_explicitos_centimos BETWEEN 0 AND 2147483647),
  comision_explicita_centimos INTEGER CHECK(comision_explicita_centimos BETWEEN 0 AND 2147483647),
  fuente_snapshot JSONB NOT NULL CHECK(jsonb_typeof(fuente_snapshot)='object'),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lineas_liquidacion_confirming_factura_uk UNIQUE(liquidacion_id, factura_emitida_id),
  CONSTRAINT lineas_liquidacion_confirming_fechas_ck CHECK(fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE TABLE soportes_liquidacion_confirming (
  id UUID PRIMARY KEY,
  liquidacion_id UUID NOT NULL REFERENCES liquidaciones_confirming_documentales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  movimiento_id TEXT NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operacion_b4_id UUID NOT NULL REFERENCES operaciones_justificacion_b4(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vinculo_intereses_id UUID REFERENCES vinculos_movimiento_documento(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vinculo_comision_id UUID REFERENCES vinculos_movimiento_documento(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vinculo_iva_comision_id UUID REFERENCES vinculos_movimiento_documento(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  estado "EstadoSoporteLiquidacionConfirming" NOT NULL DEFAULT 'CONFIRMADO',
  fuente_hash CHAR(64) NOT NULL CHECK(fuente_hash ~ '^[a-f0-9]{64}$'),
  fuente_snapshot JSONB NOT NULL CHECK(
    jsonb_typeof(fuente_snapshot)='object'
    AND fuente_snapshot->>'schema'='CONFIRMING_LIQUIDATION_DOCUMENTAL_V1'
    AND fuente_snapshot ?& ARRAY['liquidacionId','movimientoId','operacionB4Id','sourceHash','lineasB4']
    AND jsonb_typeof(fuente_snapshot->'lineasB4')='array'
  ),
  actor_real_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_efectivo_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  confirmado_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version=1),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT soportes_liquidacion_confirming_operacion_uk UNIQUE(operacion_b4_id),
  CONSTRAINT soportes_liquidacion_confirming_vinculo_intereses_uk UNIQUE(vinculo_intereses_id),
  CONSTRAINT soportes_liquidacion_confirming_vinculo_comision_uk UNIQUE(vinculo_comision_id),
  CONSTRAINT soportes_liquidacion_confirming_vinculo_iva_uk UNIQUE(vinculo_iva_comision_id)
);

CREATE TABLE revocaciones_soporte_liquidacion_confirming (
  id UUID PRIMARY KEY,
  soporte_id UUID NOT NULL REFERENCES soportes_liquidacion_confirming(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_real_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_efectivo_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version_soporte INTEGER NOT NULL CHECK(version_soporte=1),
  motivo TEXT NOT NULL CHECK(length(btrim(motivo)) BETWEEN 1 AND 2000),
  idempotency_key TEXT NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 1 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schema'='CONFIRMING_LIQUIDATION_DOCUMENTAL_V1'),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT revocaciones_liquidacion_actor_key_uk UNIQUE(actor_real_id,idempotency_key),
  CONSTRAINT revocaciones_liquidacion_soporte_version_uk UNIQUE(soporte_id,version_soporte)
);

CREATE TABLE auditorias_liquidacion_confirming (
  id UUID PRIMARY KEY,
  liquidacion_id UUID REFERENCES liquidaciones_confirming_documentales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  soporte_id UUID REFERENCES soportes_liquidacion_confirming(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_real_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_efectivo_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  accion "AccionAuditoriaLiquidacionConfirming" NOT NULL,
  idempotency_key TEXT NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 1 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schema'='CONFIRMING_LIQUIDATION_DOCUMENTAL_V1'),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auditorias_liquidacion_actor_key_uk UNIQUE(actor_real_id,idempotency_key),
  CONSTRAINT auditorias_liquidacion_destino_ck CHECK(
    (accion='CARGA_EVIDENCIA'::"AccionAuditoriaLiquidacionConfirming" AND liquidacion_id IS NOT NULL AND soporte_id IS NULL)
    OR (accion IN ('CONFIRMACION_SOPORTE'::"AccionAuditoriaLiquidacionConfirming", 'REVOCACION_SOPORTE'::"AccionAuditoriaLiquidacionConfirming") AND liquidacion_id IS NULL AND soporte_id IS NOT NULL)
  )
);

CREATE INDEX liquidaciones_confirming_documentales_confirming_idx ON liquidaciones_confirming_documentales(confirming_id,created_at DESC);
CREATE INDEX liquidaciones_confirming_documentales_cuenta_fecha_idx ON liquidaciones_confirming_documentales(cuenta_depositaria_id,fecha_liquidacion);
CREATE INDEX documentos_liquidacion_confirming_factura_idx ON documentos_liquidacion_confirming(factura_recibida_id);
CREATE INDEX lineas_liquidacion_confirming_factura_idx ON lineas_liquidacion_confirming(factura_emitida_id);
CREATE INDEX lineas_liquidacion_confirming_confirming_linea_idx ON lineas_liquidacion_confirming(confirming_linea_id);
CREATE INDEX soportes_liquidacion_confirming_movimiento_idx ON soportes_liquidacion_confirming(movimiento_id,created_at DESC);
CREATE INDEX soportes_liquidacion_confirming_liquidacion_idx ON soportes_liquidacion_confirming(liquidacion_id,created_at DESC);
CREATE INDEX revocaciones_liquidacion_soporte_idx ON revocaciones_soporte_liquidacion_confirming(soporte_id,created_at DESC);
CREATE INDEX auditorias_liquidacion_liquidacion_idx ON auditorias_liquidacion_confirming(liquidacion_id,created_at DESC);
CREATE INDEX auditorias_liquidacion_soporte_idx ON auditorias_liquidacion_confirming(soporte_id,created_at DESC);

-- Todas las líneas hijas se escriben sólo en la misma transacción de la versión
-- principal. Así no existen liquidaciones parcialmente documentadas al commit.
CREATE FUNCTION c11_liquidacion_documento_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_tx bigint;
BEGIN
  SELECT transaction_id INTO source_tx FROM liquidaciones_confirming_documentales WHERE id=NEW.liquidacion_id FOR KEY SHARE;
  IF NOT FOUND OR source_tx <> txid_current() OR NEW.transaction_id <> txid_current() THEN
    RAISE EXCEPTION 'C11_DOCUMENTO_FUERA_TRANSACCION_DE_CARGA' USING ERRCODE='23514';
  END IF;
  IF NEW.procedencia <> 'ARCHIVO_DESCARGADO_CONTROLADO'::"ProcedenciaDocumentoLiquidacionConfirming"
     OR NOT EXISTS (SELECT 1 FROM facturas_recibidas fr WHERE fr.id=NEW.factura_recibida_id
       AND (COALESCE(fr.onedrive_item_id,'')<>'' OR COALESCE(fr.archivo_onedrive,'')<>'' OR COALESCE(fr.archivo_url,'')<>'')) THEN
    RAISE EXCEPTION 'C11_FUENTE_DOCUMENTAL_NO_CONTROLADA' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documentos_liquidacion_confirming_guard_tr
  BEFORE INSERT ON documentos_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION c11_liquidacion_documento_guard();

CREATE FUNCTION c11_liquidacion_linea_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_tx bigint; expected_confirming text; source_confirming text; fe_numero text; fe_fecha date; fe_total numeric;
BEGIN
  SELECT transaction_id,confirming_id INTO source_tx,expected_confirming
    FROM liquidaciones_confirming_documentales WHERE id=NEW.liquidacion_id FOR KEY SHARE;
  SELECT num_factura,fecha::date,total::text::numeric INTO fe_numero,fe_fecha,fe_total
    FROM facturas_emitidas WHERE id=NEW.factura_emitida_id FOR KEY SHARE;
  IF NOT FOUND OR source_tx <> txid_current() OR NEW.transaction_id <> txid_current()
     OR btrim(fe_numero) <> btrim(NEW.numero_factura) OR fe_fecha <> NEW.fecha_emision
     OR (fe_total * 100) <> NEW.nominal_centimos::numeric THEN
    RAISE EXCEPTION 'C11_LINEA_IDENTIDAD_O_NOMINAL_NO_EXACTO' USING ERRCODE='23514';
  END IF;
  IF NEW.confirming_linea_id IS NOT NULL THEN
    SELECT confirming_id INTO source_confirming FROM confirming_lineas WHERE id=NEW.confirming_linea_id FOR KEY SHARE;
    IF source_confirming IS DISTINCT FROM expected_confirming THEN
      RAISE EXCEPTION 'C11_LINEA_CONFIRMING_FUERA_DE_LIQUIDACION' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lineas_liquidacion_confirming_guard_tr
  BEFORE INSERT ON lineas_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION c11_liquidacion_linea_guard();

CREATE FUNCTION c11_assert_liquidacion_cargada(p_liquidacion uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE l record; docs integer; details integer; lines integer; line_total bigint;
  interest_lines integer; commission_lines integer; interest_total bigint; commission_total bigint;
BEGIN
  SELECT * INTO l FROM liquidaciones_confirming_documentales WHERE id=p_liquidacion FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C11_LIQUIDACION_NO_ENCONTRADA' USING ERRCODE='23514'; END IF;
  IF NOT (current_database()='railway' AND current_user='postgres') THEN
    RAISE EXCEPTION 'C11_CONFIRMING_LIQUIDATION_NON_APPROVED_DATABASE' USING ERRCODE='42501';
  END IF;
  SELECT count(*) FILTER (WHERE rol='LIQUIDACION_PDF'::"RolDocumentoLiquidacionConfirming"),
         count(*) FILTER (WHERE rol='DETALLE_FACTURAS_XLS'::"RolDocumentoLiquidacionConfirming")
    INTO docs,details FROM documentos_liquidacion_confirming WHERE liquidacion_id=p_liquidacion;
  SELECT count(*),COALESCE(sum(nominal_centimos),0) INTO lines,line_total FROM lineas_liquidacion_confirming WHERE liquidacion_id=p_liquidacion;
  IF docs<>1 OR (l.banco='CAIXABANK'::"BancoLiquidacionConfirming" AND details<>1)
     OR (l.banco='BBVA'::"BancoLiquidacionConfirming" AND details<>0)
     OR lines<1 OR line_total<>l.nominal_centimos THEN
    RAISE EXCEPTION 'C11_EVIDENCIA_LIQUIDACION_INCOMPLETA_O_NO_CUADRA' USING ERRCODE='23514';
  END IF;
  IF l.banco='BBVA'::"BancoLiquidacionConfirming" THEN
    SELECT count(intereses_explicitos_centimos),count(comision_explicita_centimos),
      sum(intereses_explicitos_centimos),sum(comision_explicita_centimos)
      INTO interest_lines,commission_lines,interest_total,commission_total
      FROM lineas_liquidacion_confirming WHERE liquidacion_id=p_liquidacion;
    IF interest_lines<>lines OR commission_lines<>lines
       OR interest_total IS DISTINCT FROM l.intereses_centimos::bigint
       OR commission_total IS DISTINCT FROM l.comision_centimos::bigint THEN
      RAISE EXCEPTION 'C11_BBVA_DETALLE_NO_SUMA_RESUMEN' USING ERRCODE='23514';
    END IF;
  END IF;
END $$;
CREATE FUNCTION c11_liquidacion_cierre_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='liquidaciones_confirming_documentales' THEN
    PERFORM c11_assert_liquidacion_cargada(NEW.id);
  ELSE
    PERFORM c11_assert_liquidacion_cargada(NEW.liquidacion_id);
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER liquidaciones_confirming_documentales_cierre_ct
  AFTER INSERT ON liquidaciones_confirming_documentales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c11_liquidacion_cierre_guard();
CREATE CONSTRAINT TRIGGER documentos_liquidacion_confirming_cierre_ct
  AFTER INSERT ON documentos_liquidacion_confirming DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c11_liquidacion_cierre_guard();
CREATE CONSTRAINT TRIGGER lineas_liquidacion_confirming_cierre_ct
  AFTER INSERT ON lineas_liquidacion_confirming DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c11_liquidacion_cierre_guard();

-- No hay reparto de IVA global: la guarda de soporte comprueba el resumen contra
-- tres diferencias B4 independientes. Las comparaciones se hacen como TEXT para
-- que la función sea creada en FASE A sin consumir el enum recién añadido.
CREATE FUNCTION c11_soporte_liquidacion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l record; op record; docs integer; expected_lines integer; expected_diffs integer; c10_exists boolean;
BEGIN
  SELECT * INTO l FROM liquidaciones_confirming_documentales WHERE id=NEW.liquidacion_id FOR KEY SHARE;
  SELECT o.movimiento_id,o.estado::text AS estado,o.revertida_at,e.estado::text AS estado_b4
    INTO op FROM operaciones_justificacion_b4 o
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=o.movimiento_id
    WHERE o.id=NEW.operacion_b4_id FOR KEY SHARE OF o;
  IF NOT FOUND OR NEW.transaction_id<>txid_current() OR NEW.estado<>'CONFIRMADO'::"EstadoSoporteLiquidacionConfirming"
     OR NEW.version<>1 OR NEW.fuente_hash<>l.fuente_hash OR NEW.movimiento_id<>op.movimiento_id
     OR op.estado<>'APLICADA' OR op.revertida_at IS NOT NULL OR op.estado_b4<>'JUSTIFICADO' THEN
    RAISE EXCEPTION 'C11_SOPORTE_B4_O_FUENTE_NO_VIGENTE' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO expected_lines FROM lineas_liquidacion_confirming WHERE liquidacion_id=NEW.liquidacion_id;
  SELECT count(*) INTO docs FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    JOIN lineas_liquidacion_confirming x ON x.liquidacion_id=NEW.liquidacion_id
      AND x.factura_emitida_id=d.factura_emitida_id AND x.nominal_centimos=v.importe_centimos
    WHERE v.operacion_creacion_id=NEW.operacion_b4_id AND v.movimiento_id=NEW.movimiento_id
      AND v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo";
  IF docs<>expected_lines THEN RAISE EXCEPTION 'C11_B4_FACTURAS_NO_SON_NOMINALES_COMPLETAS' USING ERRCODE='23514'; END IF;
  IF (l.intereses_centimos=0 AND NEW.vinculo_intereses_id IS NOT NULL)
     OR (l.intereses_centimos>0 AND NOT EXISTS (SELECT 1 FROM vinculos_movimiento_documento v WHERE v.id=NEW.vinculo_intereses_id AND v.operacion_creacion_id=NEW.operacion_b4_id AND v.movimiento_id=NEW.movimiento_id AND v.activo AND v.tipo_linea='DIFERENCIA'::"TipoLineaVinculo" AND v.motivo_diferencia::text='INTERESES' AND v.importe_centimos=-l.intereses_centimos))
     OR (l.comision_centimos=0 AND NEW.vinculo_comision_id IS NOT NULL)
     OR (l.comision_centimos>0 AND NOT EXISTS (SELECT 1 FROM vinculos_movimiento_documento v WHERE v.id=NEW.vinculo_comision_id AND v.operacion_creacion_id=NEW.operacion_b4_id AND v.movimiento_id=NEW.movimiento_id AND v.activo AND v.tipo_linea='DIFERENCIA'::"TipoLineaVinculo" AND v.motivo_diferencia::text='COMISION' AND v.importe_centimos=-l.comision_centimos))
     OR (l.iva_comision_centimos=0 AND NEW.vinculo_iva_comision_id IS NOT NULL)
     OR (l.iva_comision_centimos>0 AND NOT EXISTS (SELECT 1 FROM vinculos_movimiento_documento v WHERE v.id=NEW.vinculo_iva_comision_id AND v.operacion_creacion_id=NEW.operacion_b4_id AND v.movimiento_id=NEW.movimiento_id AND v.activo AND v.tipo_linea='DIFERENCIA'::"TipoLineaVinculo" AND v.motivo_diferencia::text='IVA_COMISION' AND v.importe_centimos=-l.iva_comision_centimos)) THEN
    RAISE EXCEPTION 'C11_TRES_DEDUCCIONES_B4_NO_EXACTAS' USING ERRCODE='23514';
  END IF;
  expected_diffs := (CASE WHEN l.intereses_centimos>0 THEN 1 ELSE 0 END) + (CASE WHEN l.comision_centimos>0 THEN 1 ELSE 0 END) + (CASE WHEN l.iva_comision_centimos>0 THEN 1 ELSE 0 END);
  IF (SELECT count(*) FROM vinculos_movimiento_documento v WHERE v.operacion_creacion_id=NEW.operacion_b4_id AND v.movimiento_id=NEW.movimiento_id AND v.activo) <> expected_lines+expected_diffs THEN
    RAISE EXCEPTION 'C11_B4_CONTIENE_LINEAS_AJENAS_A_LIQUIDACION' USING ERRCODE='23514';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM lotes_soporte_interes_confirming_draxton c10
    JOIN vinculos_movimiento_documento v ON v.id=c10.vinculo_diferencia_id
    WHERE c10.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" AND v.operacion_creacion_id=NEW.operacion_b4_id
  ) INTO c10_exists;
  IF c10_exists THEN RAISE EXCEPTION 'C11_DUPLICA_SOPORTE_C10_DE_INTERESES' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER soportes_liquidacion_confirming_guard_tr
  BEFORE INSERT ON soportes_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION c11_soporte_liquidacion_guard();

-- Simetría: después de C11 no se puede volver a insertar un soporte C10 sobre la
-- misma operación B4. Se evita duplicar el componente INTERESES.
CREATE FUNCTION c11_bloquear_c10_duplicado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op_id uuid;
BEGIN
  SELECT operacion_creacion_id INTO op_id FROM vinculos_movimiento_documento WHERE id=NEW.vinculo_diferencia_id FOR KEY SHARE;
  IF EXISTS (SELECT 1 FROM soportes_liquidacion_confirming s WHERE s.operacion_b4_id=op_id) THEN
    RAISE EXCEPTION 'C11_SOPORTE_C10_DUPLICARIA_LIQUIDACION' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lotes_soporte_interes_confirming_c11_no_duplicar_tr
  BEFORE INSERT ON lotes_soporte_interes_confirming_draxton FOR EACH ROW EXECUTE FUNCTION c11_bloquear_c10_duplicado();

-- Reversión es otro recibo append-only y sólo es válida después de revertir B4.
CREATE FUNCTION c11_revocacion_soporte_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; op record;
BEGIN
  SELECT * INTO s FROM soportes_liquidacion_confirming WHERE id=NEW.soporte_id FOR KEY SHARE;
  SELECT estado::text AS estado,revertida_at INTO op FROM operaciones_justificacion_b4 WHERE id=s.operacion_b4_id FOR KEY SHARE;
  IF NOT FOUND OR NEW.transaction_id<>txid_current() OR s.version<>NEW.version_soporte OR op.estado<>'REVERTIDA' OR op.revertida_at IS NULL THEN
    RAISE EXCEPTION 'C11_REVOCACION_EXIGE_B4_REVERTIDA' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revocaciones_soporte_liquidacion_confirming_guard_tr
  BEFORE INSERT ON revocaciones_soporte_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION c11_revocacion_soporte_guard();

CREATE FUNCTION c11_auditoria_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_tx bigint; expected_action text;
BEGIN
  IF NEW.accion='CARGA_EVIDENCIA'::"AccionAuditoriaLiquidacionConfirming" THEN
    SELECT transaction_id INTO source_tx FROM liquidaciones_confirming_documentales WHERE id=NEW.liquidacion_id FOR KEY SHARE;
  ELSIF NEW.accion='CONFIRMACION_SOPORTE'::"AccionAuditoriaLiquidacionConfirming" THEN
    SELECT transaction_id INTO source_tx FROM soportes_liquidacion_confirming WHERE id=NEW.soporte_id FOR KEY SHARE;
  ELSE
    SELECT transaction_id INTO source_tx FROM revocaciones_soporte_liquidacion_confirming WHERE soporte_id=NEW.soporte_id FOR KEY SHARE;
  END IF;
  IF source_tx IS NULL OR source_tx<>txid_current() OR NEW.transaction_id<>txid_current() THEN
    RAISE EXCEPTION 'C11_AUDITORIA_FUERA_DE_TRANSACCION_ORIGEN' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auditorias_liquidacion_confirming_guard_tr
  BEFORE INSERT ON auditorias_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION c11_auditoria_guard();

CREATE FUNCTION c11_rechazar_mutacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'C11_EVIDENCIA_APPEND_ONLY:%',TG_TABLE_NAME USING ERRCODE='55000';
END $$;
CREATE TRIGGER liquidaciones_confirming_documentales_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON liquidaciones_confirming_documentales FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();
CREATE TRIGGER documentos_liquidacion_confirming_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON documentos_liquidacion_confirming FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();
CREATE TRIGGER lineas_liquidacion_confirming_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON lineas_liquidacion_confirming FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();
CREATE TRIGGER soportes_liquidacion_confirming_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON soportes_liquidacion_confirming FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();
CREATE TRIGGER revocaciones_soporte_liquidacion_confirming_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON revocaciones_soporte_liquidacion_confirming FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();
CREATE TRIGGER auditorias_liquidacion_confirming_no_mutation_tr BEFORE UPDATE OR DELETE OR TRUNCATE ON auditorias_liquidacion_confirming FOR EACH STATEMENT EXECUTE FUNCTION c11_rechazar_mutacion();

-- La evidencia nueva invalida la foto igual que las demás fuentes documentales.
CREATE TRIGGER conciliar_dirty_liquidaciones_confirming_tr
  AFTER INSERT ON liquidaciones_confirming_documentales
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER conciliar_dirty_soportes_liquidacion_confirming_tr
  AFTER INSERT ON soportes_liquidacion_confirming
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER conciliar_dirty_revocaciones_liquidacion_confirming_tr
  AFTER INSERT ON revocaciones_soporte_liquidacion_confirming
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
