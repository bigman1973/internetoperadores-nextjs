-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_easy_counterparty_uuid_guard/migration.sql SHA-256 60bb94106bb764c0b4cfa205c122402714b4e680b385e48018c684f15ced1e11.
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

-- Production-only: corrige la forma UUID 8-4-4-4-12 del recibo P1.
-- El patrón anterior omitía un grupo de cuatro caracteres y rechazaba todo UUID
-- canónico. No cambia tablas, datos, permisos, clases ni pruebas de recibo B4.
-- Sustitución revisada de una función nueva de este encargo, no del modelo legacy.
CREATE OR REPLACE FUNCTION easy_counterparty_guard_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_APPEND_ONLY' USING ERRCODE='55000';
  END IF;
  IF current_database() <> 'railway' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_PRODUCTION_ONLY' USING ERRCODE='55000';
  END IF;
  IF NEW.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" THEN
    IF NEW.origen='MANUAL'::"OrigenTerceroModoFacil" THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_MANUAL_ORIGIN_RESERVED' USING ERRCODE='23514';
    END IF;
    -- AUTO_RECIBO sigue reservado a un recibo vigente con prueba diferida bilateral.
    IF NEW.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
       AND (NOT (NEW.snapshot ? 'autoReceiptId') OR COALESCE(NEW.snapshot->>'autoReceiptId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_AUTO_RECEIPT_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF NEW.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil" AND NOT EXISTS (
      SELECT 1 FROM recibos_auto_modo_facil r
      JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
      JOIN operaciones_justificacion_b4 o ON o.id=p.operacion_b4_id
      WHERE r.id=CAST(NEW.snapshot->>'autoReceiptId' AS uuid)
        AND r.actor_id=NEW.actor_id AND p.movimiento_id=NEW.movimiento_id
        AND r.origen='REGLA' AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
        AND ((r.clase='COMISION_BANCARIA' AND NEW.tipo_tercero='BANCO'::"TipoTerceroModoFacil")
          OR (r.clase='TRASPASO_PROPIO' AND NEW.tipo_tercero='CUENTA_PROPIA'::"TipoTerceroModoFacil"))
        AND NOT EXISTS (SELECT 1 FROM reversiones_auto_modo_facil rv WHERE rv.recibo_id=r.id)
    ) THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_AUTO_RECEIPT_NOT_PROVEN' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO original FROM "decisiones_tercero_modo_facil" d WHERE d.id=NEW.revierte_id FOR KEY SHARE;
    IF NOT FOUND OR original.accion <> 'CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
       OR original.movimiento_id <> NEW.movimiento_id
       OR original.tipo_tercero <> NEW.tipo_tercero OR original.origen <> NEW.origen
       OR original.candidato_hash <> NEW.candidato_hash THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_REVERSAL_ORIGIN_INVALID' USING ERRCODE='23514';
    END IF;
    -- La reversión conserva al autor original y sólo admite otro actor gestor vivo,
    -- no restringido. Nunca confía en el rol que declara el navegador.
    IF original.actor_id <> NEW.actor_id AND NOT EXISTS (
      SELECT 1 FROM usuarios_admin u
      WHERE u.id=NEW.actor_id AND u.activo=true AND u.rol::text IN ('SUPER_ADMIN','GERENTE')
        AND COALESCE((SELECT p.perfil FROM perfiles_acceso_modo_facil p WHERE p.usuario_id=u.id ORDER BY p.version DESC LIMIT 1),'RESTABLECIDO') <> 'MODO_FACIL_ONLY'
    ) THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_DELEGATED_REVERSAL_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    IF NEW.snapshot->>'revertedOriginalActorId' IS DISTINCT FROM original.actor_id::text
       OR NEW.snapshot->>'revertedByActorId' IS DISTINCT FROM NEW.actor_id::text THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_REVERSAL_AUDIT_INVALID' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "decisiones_tercero_modo_facil" r WHERE r.revierte_id=NEW.revierte_id) THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_ALREADY_REVERSED' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('easy-counterparty:'||NEW.movimiento_id,0));
  RETURN NEW;
END $$;
