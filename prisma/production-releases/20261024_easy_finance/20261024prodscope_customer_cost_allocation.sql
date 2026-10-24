-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_customer_cost_allocation/migration.sql SHA-256 da9365de35774e2d1497827a78b92e8b694557eea36059ca2c88b2d96abc1112.
-- Preflight de creación obligatorio, habilitado sólo por el aplicador transaccional.
DO $$
BEGIN
  IF current_setting('io.finance_easy_production_ddl', true) = '1' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'FINANCE_EASY_PRODUCTION_DDL_GUARD_REQUIRED' USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Reparto de costes de operadora entre clientes — production-only.
-- Migración aditiva preparada; NO ejecutar desde esta tarea.
-- No altera facturas_recibidas, fuentes_coste_operadora, documentos ni imputaciones heredadas.
-- El ledger no es "append-only" en sentido absoluto: una cabecera vigente puede
-- pasar una sola vez a RENUNCIADO para conservar una sustitución auditable.

CREATE TABLE "repartos_coste_cliente" (
  "id" TEXT NOT NULL,
  "fuente_coste_operadora_id" TEXT NOT NULL,
  "factura_recibida_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
  "clasificacion" TEXT NOT NULL,
  "periodo_servicio" DATE NOT NULL,
  "coste_centimos" BIGINT NOT NULL,
  "source_version" INTEGER NOT NULL,
  "source_snapshot_hash" TEXT NOT NULL,
  "snapshot_fuente" JSONB NOT NULL,
  "snapshot_seleccion" JSONB NOT NULL,
  "reversion_de_reparto_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "creado_por" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repartos_coste_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "repartos_coste_cliente_version_positiva_ck" CHECK ("version" >= 1),
  CONSTRAINT "repartos_coste_cliente_source_version_positiva_ck" CHECK ("source_version" >= 1),
  CONSTRAINT "repartos_coste_cliente_clasificacion_check"
    CHECK ("clasificacion" IN ('REPARTIBLE', 'PUNTUAL', 'ABONO_EXPLICITO')),
  CONSTRAINT "repartos_coste_cliente_estado_check"
    CHECK ("estado" IN ('VIGENTE', 'RENUNCIADO')),
  CONSTRAINT "repartos_coste_cliente_hashes_ck"
    CHECK (
      "source_snapshot_hash" ~ '^[a-f0-9]{64}$'
      AND "payload_hash" ~ '^[a-f0-9]{64}$'
      AND length(btrim("idempotency_key")) > 0
    ),
  CONSTRAINT "repartos_coste_cliente_clasificacion_importe_ck"
    CHECK (
      ("clasificacion" IN ('REPARTIBLE', 'PUNTUAL')
        AND "coste_centimos" > 0 AND "reversion_de_reparto_id" IS NULL)
      OR
      ("clasificacion" = 'ABONO_EXPLICITO'
        AND "coste_centimos" < 0 AND "reversion_de_reparto_id" IS NOT NULL)
    ),
  CONSTRAINT "repartos_coste_cliente_snapshot_schema_ck"
    CHECK (
      "snapshot_fuente"->>'schema' = 'CUSTOMER_COST_SOURCE_SNAPSHOT_V1'
      AND "snapshot_seleccion"->>'schema' = 'CUSTOMER_COST_SELECTION_V1'
    ),
  CONSTRAINT "repartos_coste_cliente_fuente_fkey"
    FOREIGN KEY ("fuente_coste_operadora_id") REFERENCES "fuentes_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_factura_fkey"
    FOREIGN KEY ("factura_recibida_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_reversion_fkey"
    FOREIGN KEY ("reversion_de_reparto_id") REFERENCES "repartos_coste_cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_creado_por_fkey"
    FOREIGN KEY ("creado_por") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "repartos_coste_cliente_fuente_version_key"
  ON "repartos_coste_cliente"("fuente_coste_operadora_id", "version");
CREATE UNIQUE INDEX "repartos_coste_cliente_idempotency_key_key"
  ON "repartos_coste_cliente"("idempotency_key");
CREATE UNIQUE INDEX "repartos_coste_cliente_fuente_vigente_key"
  ON "repartos_coste_cliente"("fuente_coste_operadora_id") WHERE "estado" = 'VIGENTE';
CREATE UNIQUE INDEX "repartos_coste_cliente_factura_vigente_key"
  ON "repartos_coste_cliente"("factura_recibida_id") WHERE "estado" = 'VIGENTE';
CREATE INDEX "repartos_coste_cliente_factura_created_idx"
  ON "repartos_coste_cliente"("factura_recibida_id", "created_at" DESC);

CREATE TABLE "repartos_coste_cliente_contratos" (
  "id" TEXT NOT NULL,
  "reparto_id" TEXT NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "contrato_id" INTEGER NOT NULL,
  "venta_periodo_centimos" BIGINT NOT NULL,
  "unidades_periodo_meses" SMALLINT NOT NULL,
  "venta_normalizada_doceavos_centimo" BIGINT NOT NULL,
  "snapshot_contrato" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repartos_coste_cliente_contratos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "repartos_coste_cliente_contratos_unidades_check"
    CHECK ("unidades_periodo_meses" IN (1, 3, 12)),
  CONSTRAINT "repartos_coste_cliente_contratos_venta_check"
    CHECK ("venta_periodo_centimos" > 0 AND "venta_normalizada_doceavos_centimo" > 0),
  CONSTRAINT "repartos_coste_cliente_contratos_snapshot_schema_ck"
    CHECK ("snapshot_contrato"->>'schema' = 'CUSTOMER_CONTRACT_SNAPSHOT_V1'),
  CONSTRAINT "repartos_coste_cliente_contratos_reparto_fkey"
    FOREIGN KEY ("reparto_id") REFERENCES "repartos_coste_cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_contratos_cliente_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes_web"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_contratos_contrato_fkey"
    FOREIGN KEY ("contrato_id") REFERENCES "contratos_servicio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_contratos_unique" UNIQUE ("reparto_id", "contrato_id")
);
CREATE INDEX "repartos_coste_cliente_contratos_cliente_idx"
  ON "repartos_coste_cliente_contratos"("cliente_id");

CREATE TABLE "repartos_coste_cliente_lineas" (
  "id" TEXT NOT NULL,
  "reparto_id" TEXT NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "venta_normalizada_doceavos_centimo" BIGINT NOT NULL,
  "resto_numerador" BIGINT NOT NULL,
  "orden_resto" INTEGER NOT NULL,
  "coste_centimos" BIGINT NOT NULL,
  "snapshot_cliente" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repartos_coste_cliente_lineas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "repartos_coste_cliente_lineas_venta_check"
    CHECK ("venta_normalizada_doceavos_centimo" > 0 AND "resto_numerador" >= 0 AND "orden_resto" >= 1),
  CONSTRAINT "repartos_coste_cliente_lineas_snapshot_ck"
    CHECK ("snapshot_cliente" ? 'id' AND "snapshot_cliente" ? 'nombre'),
  CONSTRAINT "repartos_coste_cliente_lineas_reparto_fkey"
    FOREIGN KEY ("reparto_id") REFERENCES "repartos_coste_cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_lineas_cliente_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes_web"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "repartos_coste_cliente_lineas_unique" UNIQUE ("reparto_id", "cliente_id")
);
CREATE INDEX "repartos_coste_cliente_lineas_cliente_idx"
  ON "repartos_coste_cliente_lineas"("cliente_id");

CREATE TABLE "auditorias_reparto_coste_cliente" (
  "id" TEXT NOT NULL,
  "reparto_id" TEXT NOT NULL,
  "usuario_id" INTEGER NOT NULL,
  "accion" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "antes" JSONB,
  "despues" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditorias_reparto_coste_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auditorias_reparto_coste_cliente_accion_check"
    CHECK ("accion" IN ('CREAR_DECISION', 'SUSTITUIR_DECISION', 'REGISTRAR_PUNTUAL', 'REGISTRAR_ABONO')),
  CONSTRAINT "auditorias_reparto_coste_cliente_idempotency_key_ck"
    CHECK (length(btrim("idempotency_key")) > 0),
  CONSTRAINT "auditorias_reparto_coste_cliente_snapshot_ck"
    CHECK ("despues" ? 'source' AND "despues" ? 'selection' AND "despues"->>'payloadHash' ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "auditorias_reparto_coste_cliente_reparto_fkey"
    FOREIGN KEY ("reparto_id") REFERENCES "repartos_coste_cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "auditorias_reparto_coste_cliente_usuario_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "auditorias_reparto_coste_cliente_reparto_key" UNIQUE ("reparto_id"),
  CONSTRAINT "auditorias_reparto_coste_cliente_idempotency_key_key" UNIQUE ("idempotency_key")
);
CREATE INDEX "auditorias_reparto_coste_cliente_reparto_created_idx"
  ON "auditorias_reparto_coste_cliente"("reparto_id", "created_at" DESC);

-- The application has a broader environment guard. These physical guards make
-- a copied production database and an unexpected DB role fail closed as well.
CREATE FUNCTION reparto_coste_cliente_assert_production_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_database() IS DISTINCT FROM 'railway'
     OR current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'El ledger de reparto sólo admite producción railway/postgres' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION reparto_coste_cliente_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reparto_coste_cliente_assert_production_role();

  IF TG_TABLE_NAME = 'repartos_coste_cliente' THEN
    IF NOT EXISTS (SELECT 1 FROM usuarios_admin u WHERE u.id = NEW.creado_por AND u.activo) THEN
      RAISE EXCEPTION 'El actor creador del reparto debe seguir activo' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'auditorias_reparto_coste_cliente' THEN
    IF NOT EXISTS (SELECT 1 FROM usuarios_admin u WHERE u.id = NEW.usuario_id AND u.activo) THEN
      RAISE EXCEPTION 'El actor de la auditoría debe seguir activo' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM auditorias_reparto_coste_cliente a WHERE a.reparto_id = NEW.reparto_id) THEN
      RAISE EXCEPTION 'Cada decisión de reparto requiere exactamente una auditoría de creación' USING ERRCODE = '23505';
    END IF;
  ELSIF TG_TABLE_NAME IN ('repartos_coste_cliente_lineas', 'repartos_coste_cliente_contratos') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM repartos_coste_cliente r
      WHERE r.id = NEW.reparto_id
        AND r.estado = 'VIGENTE'
        AND NOT EXISTS (SELECT 1 FROM auditorias_reparto_coste_cliente a WHERE a.reparto_id = r.id)
    ) THEN
      RAISE EXCEPTION 'Sólo se insertan líneas y contratos durante la creación todavía no auditada de un reparto vigente' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER repartos_coste_cliente_insert_production_tr
BEFORE INSERT ON repartos_coste_cliente
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_insert();
CREATE TRIGGER repartos_coste_cliente_contratos_insert_production_tr
BEFORE INSERT ON repartos_coste_cliente_contratos
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_insert();
CREATE TRIGGER repartos_coste_cliente_lineas_insert_production_tr
BEFORE INSERT ON repartos_coste_cliente_lineas
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_insert();
CREATE TRIGGER auditorias_reparto_coste_cliente_insert_production_tr
BEFORE INSERT ON auditorias_reparto_coste_cliente
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_insert();

-- The header is source-evidence immutable. Its only legal mutation is the
-- one-way state transition used to preserve the previous decision on a replace.
CREATE FUNCTION reparto_coste_cliente_guard_header_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reparto_coste_cliente_assert_production_role();
  IF OLD.estado <> 'VIGENTE' OR NEW.estado <> 'RENUNCIADO' THEN
    RAISE EXCEPTION 'Un reparto sólo puede pasar una vez de VIGENTE a RENUNCIADO' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.fuente_coste_operadora_id IS DISTINCT FROM OLD.fuente_coste_operadora_id
     OR NEW.factura_recibida_id IS DISTINCT FROM OLD.factura_recibida_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.clasificacion IS DISTINCT FROM OLD.clasificacion
     OR NEW.periodo_servicio IS DISTINCT FROM OLD.periodo_servicio
     OR NEW.coste_centimos IS DISTINCT FROM OLD.coste_centimos
     OR NEW.source_version IS DISTINCT FROM OLD.source_version
     OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
     OR NEW.snapshot_fuente IS DISTINCT FROM OLD.snapshot_fuente
     OR NEW.snapshot_seleccion IS DISTINCT FROM OLD.snapshot_seleccion
     OR NEW.reversion_de_reparto_id IS DISTINCT FROM OLD.reversion_de_reparto_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'La sustitución sólo puede cambiar estado; fuente, importe y snapshots son inmutables' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER repartos_coste_cliente_header_update_tr
BEFORE UPDATE ON repartos_coste_cliente
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_header_update();

CREATE FUNCTION reparto_coste_cliente_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reparto_coste_cliente_assert_production_role();
  RAISE EXCEPTION '% es inmutable y no admite %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END;
$$;

-- No delete path exists in the ledger. Lines, contract evidence and audit facts
-- are fully append-only; the header uses only its narrow transition above.
CREATE TRIGGER repartos_coste_cliente_no_delete_tr
BEFORE DELETE ON repartos_coste_cliente
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER repartos_coste_cliente_no_truncate_tr
BEFORE TRUNCATE ON repartos_coste_cliente
FOR EACH STATEMENT EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER repartos_coste_cliente_contratos_immutable_tr
BEFORE UPDATE OR DELETE ON repartos_coste_cliente_contratos
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER repartos_coste_cliente_contratos_no_truncate_tr
BEFORE TRUNCATE ON repartos_coste_cliente_contratos
FOR EACH STATEMENT EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER repartos_coste_cliente_lineas_immutable_tr
BEFORE UPDATE OR DELETE ON repartos_coste_cliente_lineas
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER repartos_coste_cliente_lineas_no_truncate_tr
BEFORE TRUNCATE ON repartos_coste_cliente_lineas
FOR EACH STATEMENT EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER auditorias_reparto_coste_cliente_immutable_tr
BEFORE UPDATE OR DELETE ON auditorias_reparto_coste_cliente
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();
CREATE TRIGGER auditorias_reparto_coste_cliente_no_truncate_tr
BEFORE TRUNCATE ON auditorias_reparto_coste_cliente
FOR EACH STATEMENT EXECUTE FUNCTION reparto_coste_cliente_reject_immutable_mutation();

-- A decision cannot commit with a rounded or missing distribution. It is deferred
-- because the service inserts header, contract evidence, lines and audit in one
-- SERIALIZABLE transaction. PUNTUAL explicitly commits with zero customer lines.
CREATE FUNCTION reparto_coste_cliente_assert_cierre(p_reparto_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  lineas bigint;
  contratos bigint;
  suma bigint;
  auditorias bigint;
BEGIN
  SELECT id, clasificacion, coste_centimos
    INTO r
    FROM repartos_coste_cliente
   WHERE id = p_reparto_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::bigint, COALESCE(SUM(coste_centimos), 0)::bigint
    INTO lineas, suma
    FROM repartos_coste_cliente_lineas
   WHERE reparto_id = r.id;
  SELECT COUNT(*)::bigint
    INTO contratos
    FROM repartos_coste_cliente_contratos
   WHERE reparto_id = r.id;
  SELECT COUNT(*)::bigint
    INTO auditorias
    FROM auditorias_reparto_coste_cliente
   WHERE reparto_id = r.id;

  IF r.clasificacion = 'PUNTUAL' THEN
    IF lineas <> 0 OR contratos <> 0 THEN
      RAISE EXCEPTION 'PUNTUAL no admite líneas ni contratos de cliente' USING ERRCODE = '23514';
    END IF;
  ELSIF lineas = 0 OR contratos = 0 OR suma <> r.coste_centimos
     OR EXISTS (
       SELECT 1
       FROM repartos_coste_cliente_contratos c
       LEFT JOIN repartos_coste_cliente_lineas l
         ON l.reparto_id = c.reparto_id AND l.cliente_id = c.cliente_id
       WHERE c.reparto_id = r.id AND l.id IS NULL
     ) THEN
    RAISE EXCEPTION 'REPARTIBLE/ABONO_EXPLICITO exige contratos, líneas por cliente y suma exacta de céntimos' USING ERRCODE = '23514';
  END IF;
  IF auditorias <> 1 THEN
    RAISE EXCEPTION 'Cada reparto exige exactamente una auditoría append-only' USING ERRCODE = '23514';
  END IF;
END;
$$;
CREATE FUNCTION reparto_coste_cliente_guard_cierre_cabecera_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reparto_coste_cliente_assert_cierre(NEW.id);
  RETURN NULL;
END;
$$;
CREATE FUNCTION reparto_coste_cliente_guard_cierre_lineas_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reparto_coste_cliente_assert_cierre(OLD.reparto_id);
  ELSE
    PERFORM reparto_coste_cliente_assert_cierre(NEW.reparto_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER repartos_coste_cliente_cierre_ct
AFTER INSERT OR UPDATE ON repartos_coste_cliente
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_cierre_cabecera_ct();
CREATE CONSTRAINT TRIGGER repartos_coste_cliente_lineas_cierre_ct
AFTER INSERT OR UPDATE OR DELETE ON repartos_coste_cliente_lineas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reparto_coste_cliente_guard_cierre_lineas_ct();
