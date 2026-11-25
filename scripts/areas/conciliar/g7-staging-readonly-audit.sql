-- Área 3 / G7 — auditoría parametrizada de staging, sólo lectura.
--
-- Este fichero NO confirma ni deshace. El operador proporciona valores privados
-- en psql y conserva la transacción READ ONLY: el objetivo es comprobar después
-- de ensayos explícitamente autorizados que las operaciones pertenecen a Lorena,
-- que el lote conserva exactamente veinte patas y que sus deshaceres son propios.
--
-- Ejemplo (no ejecutar desde esta tarea):
-- psql "$DATABASE_URL" -v lorena_actor_id=... -v confirmacion_unica_id=... \
--   -v confirmacion_lote20_id=... -f scripts/areas/conciliar/g7-staging-readonly-audit.sql

\if :{?lorena_actor_id}
\else
  \echo 'Falta lorena_actor_id'
  \quit 3
\endif
\if :{?confirmacion_unica_id}
\else
  \echo 'Falta confirmacion_unica_id'
  \quit 3
\endif
\if :{?confirmacion_lote20_id}
\else
  \echo 'Falta confirmacion_lote20_id'
  \quit 3
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Identidad de destino. El operador debe rechazar cualquier DB/rol no aislado
-- antes de leer el resto; no se muestran referencias, importes ni documentos.
SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('transaction_isolation') AS transaction_isolation;

SELECT CASE
  WHEN COUNT(*) = 1 AND bool_and(activo) AND bool_and(nombre ILIKE '%lorena%')
  THEN 'AREA3_G7_LORENA_IDENTIDAD_OK'
  ELSE 'AREA3_G7_LORENA_IDENTIDAD_AMBAR'
END AS code
FROM usuarios_admin
WHERE id = :lorena_actor_id::integer;

-- Confirmación humana única: debe ser de Lorena y conservar una sola pata G7
-- con la auditoría sellada, pero esta consulta no interpreta ni reconstruye los
-- datos financieros de la pata.
WITH one_receipt AS (
  SELECT o.id,o.actor_id,o.estado::text AS estado,
         COUNT(p.id)::integer AS patas,
         bool_or(p.resultado->'review'->>'schema' = 'AREA3_REVIEW_APPROVED_V1') AS review_sealed,
         bool_or(p.resultado->'review'->>'decisionHash' ~ '^[a-f0-9]{64}$') AS decision_hash_sealed,
         bool_or(p.resultado->'review'->>'sourceHash' ~ '^[a-f0-9]{64}$') AS source_hash_sealed
  FROM operaciones_conciliar o
  LEFT JOIN patas_operacion_conciliar p ON p.operacion_conciliar_id=o.id
  WHERE o.id=:'confirmacion_unica_id'::uuid
    AND o.actor_id=:lorena_actor_id::integer
    AND o.accion='CONFIRMAR'::"AccionOperacionConciliar"
  GROUP BY o.id,o.actor_id,o.estado
)
SELECT CASE
  WHEN COUNT(*)=1 AND bool_and(patas=1 AND review_sealed AND decision_hash_sealed AND source_hash_sealed)
  THEN 'AREA3_G7_CONFIRMACION_UNICA_AUDITADA'
  ELSE 'AREA3_G7_CONFIRMACION_UNICA_AMBAR'
END AS code,
CASE WHEN COUNT(*)=1 THEN min(estado) ELSE NULL END AS estado_confirmacion
FROM one_receipt;

-- Lote ordinario de veinte: se limita al recibo propio y no acepta inferir patas
-- desde filas de proyección actuales. La prueba sólo acredita el ledger durable.
WITH batch_receipt AS (
  SELECT o.id,o.actor_id,o.estado::text AS estado,
         COUNT(p.id)::integer AS patas,
         COUNT(DISTINCT p.fila_id)::integer AS filas_distintas
  FROM operaciones_conciliar o
  LEFT JOIN patas_operacion_conciliar p ON p.operacion_conciliar_id=o.id
  WHERE o.id=:'confirmacion_lote20_id'::uuid
    AND o.actor_id=:lorena_actor_id::integer
    AND o.accion='CONFIRMAR'::"AccionOperacionConciliar"
  GROUP BY o.id,o.actor_id,o.estado
)
SELECT CASE
  WHEN COUNT(*)=1 AND bool_and(patas=20 AND filas_distintas=20)
  THEN 'AREA3_G7_CONFIRMACION_20_AUDITADA'
  ELSE 'AREA3_G7_CONFIRMACION_20_AMBAR'
END AS code,
CASE WHEN COUNT(*)=1 THEN min(estado) ELSE NULL END AS estado_confirmacion
FROM batch_receipt;

-- Cada deshacer debe ser propio y anclarse al recibo original. Si no existe el
-- recibo reversible o pertenece a otro actor, queda ámbar sin tocarlo.
WITH originals AS (
  SELECT unnest(ARRAY[:'confirmacion_unica_id'::uuid, :'confirmacion_lote20_id'::uuid]) AS id
), audit AS (
  SELECT original.id AS original_id,
         o.actor_id AS original_actor,
         o.estado::text AS original_state,
         COUNT(undo.id)::integer AS own_undo_receipts,
         bool_and(undo.actor_id=:lorena_actor_id::integer) FILTER (WHERE undo.id IS NOT NULL) AS all_undo_own
  FROM originals original
  LEFT JOIN operaciones_conciliar o ON o.id=original.id
  LEFT JOIN operaciones_conciliar undo
    ON undo.operacion_padre_id=original.id
   AND undo.accion='DESHACER'::"AccionOperacionConciliar"
   AND undo.estado='APLICADA'::"EstadoOperacionConciliar"
  GROUP BY original.id,o.actor_id,o.estado
)
SELECT CASE
  WHEN COUNT(*)=2
   AND bool_and(original_actor=:lorena_actor_id::integer)
   AND bool_and(original_state='REVERTIDA')
   AND bool_and(own_undo_receipts>=1)
   AND bool_and(COALESCE(all_undo_own,false))
  THEN 'AREA3_G7_DESHACER_PROPIO_AUDITADO'
  ELSE 'AREA3_G7_DESHACER_PROPIO_AMBAR'
END AS code
FROM audit;

ROLLBACK;
