import { Prisma } from '@prisma/client'
import type { ConciliarBankFeePrepared } from './conciliar-batch'
import { B8_SOURCE_NOTE_RULE } from './centros-coste-core'

type Tx=Prisma.TransactionClient & Record<string,any>
/** One chained statement, never reads sibling writes through base-table SELECT.
 * Each dependent insert/update consumes its predecessor's RETURNING material;
 * strict counts are checked by the provider before the transaction can commit.
 * Existing FK/check/deferred B4/P1 triggers remain active. */
export async function persistConciliarFeeFinancialPackageTx(tx:Tx,actorId:number,prepared:readonly ConciliarBankFeePrepared[]) {
  const input=prepared.map(item=>({ ...item,eventDetail:{version:item.resultState.version,origen:'MANUAL',nota:'COMISION_BANCARIA'} }))
  return tx.$queryRaw<Array<{operations:number;states:number;events:number;receipts:number;p1:number}>>(Prisma.sql`
    WITH requested AS (
      SELECT * FROM jsonb_to_recordset(CAST(${JSON.stringify(input)} AS jsonb)) AS x(
        "movementId" text,"operationB4Id" text,"idempotencyKey" text,version integer,"importeCentimos" integer,
        "b4Request" jsonb,"b4PayloadHash" text,"previousState" jsonb,"hadStoredState" boolean,"resultState" jsonb,b8 jsonb,p1 jsonb,"eventDetail" jsonb
      )
    ), operations AS (
      INSERT INTO operaciones_justificacion_b4(id,movimiento_id,estado,idempotency_key,payload_hash,version_esperada,version_resultante,solicitada_por_id,aprobada_por_id,snapshot_solicitud,snapshot_estado_previo,snapshot_resultado,aprobada_at,aplicada_at)
      SELECT CAST(r."operationB4Id" AS uuid),r."movementId",'APLICADA'::"EstadoOperacionB4",r."idempotencyKey",r."b4PayloadHash",r.version,r.version+1,${actorId},${actorId},r."b4Request",r."previousState",r."resultState",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM requested r ORDER BY r."movementId" ASC
      RETURNING id,movimiento_id,version_esperada
    ), inserted_states AS (
      INSERT INTO estado_justificacion_movimientos(movimiento_id,estado,motivo_no_requiere,version,actualizado_por_id,updated_at)
      SELECT o.movimiento_id,'NO_REQUIERE'::"EstadoJustificacionMovimiento",'COMISION_BANCARIA'::"MotivoNoRequiere",o.version_esperada+1,${actorId},CURRENT_TIMESTAMP
      FROM operations o JOIN requested r ON CAST(r."operationB4Id" AS uuid)=o.id WHERE r."hadStoredState"=false
      RETURNING movimiento_id
    ), updated_states AS (
      UPDATE estado_justificacion_movimientos e SET estado='NO_REQUIERE'::"EstadoJustificacionMovimiento",motivo_no_requiere='COMISION_BANCARIA'::"MotivoNoRequiere",version=e.version+1,actualizado_por_id=${actorId},updated_at=CURRENT_TIMESTAMP
      FROM operations o JOIN requested r ON CAST(r."operationB4Id" AS uuid)=o.id
      WHERE r."hadStoredState"=true AND e.movimiento_id=o.movimiento_id AND e.version=o.version_esperada AND e.estado='SIN_DOCUMENTO'::"EstadoJustificacionMovimiento"
      RETURNING e.movimiento_id
    ), states AS (
      SELECT movimiento_id FROM inserted_states UNION ALL SELECT movimiento_id FROM updated_states
    ), events AS (
      INSERT INTO eventos_justificacion_b4(id,operacion_id,movimiento_id,accion,actor_id,detalle)
      SELECT gen_random_uuid(),o.id,o.movimiento_id,CAST(a.accion AS "AccionEventoJustificacionB4"),${actorId},r."eventDetail"
      FROM operations o JOIN states s ON s.movimiento_id=o.movimiento_id JOIN requested r ON CAST(r."operationB4Id" AS uuid)=o.id
      CROSS JOIN (VALUES ('SOLICITUD'),('APROBACION'),('APLICACION')) AS a(accion)
      RETURNING operacion_id
    ), audited AS (
      SELECT operacion_id FROM events GROUP BY operacion_id HAVING COUNT(*)=3
    ), receipts AS (
      INSERT INTO recibos_eleccion_centro_b8(id,operacion_b4_id,actor_id,idempotency_key,metadata_hash,related_source_hash_p2,source_note_rule,snapshot_solicitud,snapshot_resultado)
      SELECT gen_random_uuid(),o.id,${actorId},r."idempotencyKey",r.b8->>'metadataHash',r.b8->>'relatedSourceHashP2',${B8_SOURCE_NOTE_RULE},r.b8->'snapshotSolicitud',r.b8->'snapshotResultado'
      FROM operations o JOIN audited a ON a.operacion_id=o.id JOIN requested r ON CAST(r."operationB4Id" AS uuid)=o.id
      RETURNING operacion_b4_id
    ), p1 AS (
      INSERT INTO decisiones_tercero_modo_facil(id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot)
      SELECT CAST(r.p1->>'decisionId' AS uuid),r."movementId",${actorId},'CONFIRMADA'::"EstadoDecisionTerceroModoFacil",'BANCO'::"TipoTerceroModoFacil",'ENTIDAD_FISCAL'::"OrigenTerceroModoFacil",r.p1->>'candidateHash',CAST(r.p1->>'idempotencyKey' AS uuid),r.p1->>'requestHash',NULL,r.p1->'snapshot'
      FROM requested r JOIN receipts b ON b.operacion_b4_id=CAST(r."operationB4Id" AS uuid) WHERE r.p1 IS NOT NULL AND r.p1<>'null'::jsonb
      ORDER BY r."movementId" ASC
      RETURNING id
    )
    SELECT (SELECT COUNT(*)::integer FROM operations) AS operations,(SELECT COUNT(*)::integer FROM states) AS states,
      (SELECT COUNT(*)::integer FROM events) AS events,(SELECT COUNT(*)::integer FROM receipts) AS receipts,(SELECT COUNT(*)::integer FROM p1) AS p1
  `)
}
