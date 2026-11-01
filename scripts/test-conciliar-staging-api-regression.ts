/*
 * Compatibilidad de invocación para el gate STAGE de Conciliar.
 *
 * La validación activa vive en scripts/areas/conciliar/live-api.ts. Reexportar
 * su entrada evita mantener un segundo contrato legacy de seis cambios: el
 * manifiesto V2 exige el Golden original inmutable, su derivado PROD C1/P1/C4
 * y los ocho overrides de STAGE.
 */
import './areas/conciliar/live-api'
