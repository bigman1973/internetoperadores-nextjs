import { prisma } from '../prisma';
import request from './service';

// ==========================================
// SINCRONIZACIÓN DE FACTURAS (BATCH)
// ==========================================

// Mapeo de series a imputación
const SERIE_IMPUTACION: Record<string, string> = {
  'CLL': 'Operadora',
  'CPL': 'Operadora',
  'CMV': 'Operadora',
  'INST': 'Operadora',
  'CCM': 'Operadora',
  'DRAX': 'Draxton',
  'ZOOM': 'ZOOM',
  'HTSP': 'Hotspot',
};

// Series que son de Estructura (prefijos variables como F2602985964, AF/03830/2026/, etc.)
function getImputacion(serie: string): string {
  if (SERIE_IMPUTACION[serie]) return SERIE_IMPUTACION[serie];
  // Series que empiezan por F o AF son de Estructura
  if (serie.startsWith('F') || serie.startsWith('AF')) return 'Estructura';
  return 'Operadora'; // Default
}

export async function getAllFacturas() {
  try {
    console.log(`[ISPGestión] Obteniendo todas las facturas...`);
    const data = await request('facturacion', 'GET', null, { mostrar: 5000 });
    
    if (Array.isArray(data)) {
      console.log(`[ISPGestión] Obtenidas ${data.length} facturas`);
      return data;
    }
    console.log(`[ISPGestión] Respuesta inesperada:`, typeof data);
    return [];
  } catch (error: any) {
    console.error('Error obteniendo facturas de ISPGestión:', error.message);
    throw error;
  }
}

export async function syncFacturasBatch() {
  try {
    const allFacturas = await getAllFacturas();
    
    if (!allFacturas.length) {
      return { success: true, total: 0, upserted: 0, errors: 0 };
    }
    
    // Process in batches of 200
    const BATCH_SIZE = 200;
    let upserted = 0;
    let errors = 0;
    let upsertedEmitidas = 0;
    let errorsEmitidas = 0;
    
    for (let i = 0; i < allFacturas.length; i += BATCH_SIZE) {
      const batch = allFacturas.slice(i, i + BATCH_SIZE);
      
      // 1) Upsert en tabla 'facturas' (datos crudos ISPGestión)
      try {
        const values = batch.map((f: any) => {
          const ispId = parseInt(f.id) || 0;
          const fecha = f.fecha ? new Date(f.fecha).toISOString() : new Date().toISOString();
          const ejercicio = new Date(fecha).getFullYear();
          const serieFactura = (f.serie_factura || '').replace(/'/g, "''");
          const numDoc = (f.numero_documento || '').replace(/'/g, "''");
          const documento = f.documento ? `'${f.documento.replace(/'/g, "''")}'` : 'NULL';
          const idCliente = parseInt(f.id_cliente) || 0;
          const codigoCliente = (f.codigo_cliente || '').replace(/'/g, "''");
          const nombre = (f.nombrecompleto || '').replace(/'/g, "''");
          const nifCif = f.nif_cif ? `'${f.nif_cif.replace(/'/g, "''")}'` : 'NULL';
          const base = parseFloat(f.base) || 0;
          const totalImpuesto = parseFloat(f.total_impuesto) || 0;
          const total = parseFloat(f.total) || 0;
          const situacion = (f.situacion || 'PENDIENTE').replace(/'/g, "''");
          const totalPendiente = parseFloat(f.total_pendiente) || 0;
          
          return `(${ispId}, '${serieFactura}', '${numDoc}', ${documento}, '${fecha}'::timestamp, ${idCliente}, '${codigoCliente}', '${nombre}', ${nifCif}, ${base}, ${totalImpuesto}, ${total}, '${situacion}', ${totalPendiente}, ${ejercicio}, NOW(), NOW())`;
        }).join(',\n');
        
        const sql = `
          INSERT INTO facturas (
            isp_gestion_id, serie_factura, numero_documento, documento,
            fecha, id_cliente, codigo_cliente, nombre_completo, nif_cif,
            base, total_impuesto, total, situacion, total_pendiente,
            ejercicio, created_at, updated_at
          ) VALUES ${values}
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            serie_factura = EXCLUDED.serie_factura,
            numero_documento = EXCLUDED.numero_documento,
            documento = EXCLUDED.documento,
            fecha = EXCLUDED.fecha,
            id_cliente = EXCLUDED.id_cliente,
            codigo_cliente = EXCLUDED.codigo_cliente,
            nombre_completo = EXCLUDED.nombre_completo,
            nif_cif = EXCLUDED.nif_cif,
            base = EXCLUDED.base,
            total_impuesto = EXCLUDED.total_impuesto,
            total = EXCLUDED.total,
            situacion = EXCLUDED.situacion,
            total_pendiente = EXCLUDED.total_pendiente,
            ejercicio = EXCLUDED.ejercicio,
            updated_at = NOW()
        `;
        
        await prisma.$executeRawUnsafe(sql);
        upserted += batch.length;
      } catch (err: any) {
        errors += batch.length;
        console.error(`[SyncFacturas] Error en batch facturas ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
      }
      
      // 2) Upsert en tabla 'facturas_emitidas' (modelo Prisma FacturaEmitida)
      try {
        const valuesEmitidas = batch.map((f: any) => {
          const idExterno = (parseInt(f.id) || 0).toString();
          const fecha = f.fecha ? new Date(f.fecha).toISOString() : new Date().toISOString();
          const serie = (f.serie_factura || '').replace(/'/g, "''");
          const numFactura = (f.numero_documento || '').replace(/'/g, "''");
          const cliente = (f.nombrecompleto || 'Sin nombre').replace(/'/g, "''");
          const cif = f.nif_cif ? `'${f.nif_cif.replace(/'/g, "''")}'` : 'NULL';
          const concepto = f.documento ? `'${f.documento.replace(/'/g, "''")}'` : 'NULL';
          
          const base = parseFloat(f.base) || 0;
          const importeIva = parseFloat(f.total_impuesto) || 0;
          const total = parseFloat(f.total) || 0;
          const totalPendiente = parseFloat(f.total_pendiente) || 0;
          const importeCobrado = Math.max(0, total - totalPendiente);
          
          // Calcular tipo IVA
          let tipoIva = 21;
          if (importeIva === 0 && base > 0) tipoIva = 0;
          else if (base > 0) tipoIva = Math.round((importeIva / base) * 100);
          
          // Mapear situación a estado
          const estado = f.situacion === 'COBRADA' ? 'COBRADA' : 'EMITIDA';
          
          // Determinar imputación por serie
          const imputacion = getImputacion(serie).replace(/'/g, "''");
          
          // Forma de cobro
          const formaCobro = serie === 'DRAX' ? 'Confirming' : 'Remesa';
          
          // Fecha cobro (si está cobrada)
          const fechaCobro = estado === 'COBRADA' ? `'${fecha}'::timestamp` : 'NULL';
          
          return `(gen_random_uuid(), '${cliente}', ${cif}, '${numFactura}', '${serie}', '${fecha}'::timestamp, ${base}, ${tipoIva}, ${importeIva}, 0, 0, ${total}, ${concepto}, '${estado}', '${imputacion}', '${formaCobro}', ${importeCobrado}, ${fechaCobro}, 'ISPGestion', '${idExterno}', NOW(), NOW())`;
        }).join(',\n');
        
        const sqlEmitidas = `
          INSERT INTO facturas_emitidas (
            id, cliente, cif, num_factura, serie, fecha,
            base, tipo_iva, importe_iva, tipo_irpf, importe_irpf, total,
            concepto, estado, imputacion, forma_cobro, importe_cobrado,
            fecha_cobro, origen_sistema, id_externo, created_at, updated_at
          ) VALUES ${valuesEmitidas}
          ON CONFLICT (id_externo) DO UPDATE SET
            cliente = EXCLUDED.cliente,
            cif = EXCLUDED.cif,
            num_factura = EXCLUDED.num_factura,
            serie = EXCLUDED.serie,
            fecha = EXCLUDED.fecha,
            base = EXCLUDED.base,
            tipo_iva = EXCLUDED.tipo_iva,
            importe_iva = EXCLUDED.importe_iva,
            total = EXCLUDED.total,
            concepto = EXCLUDED.concepto,
            -- Solo actualizar estado si pasa de EMITIDA a COBRADA (no al revés)
            estado = CASE
              WHEN facturas_emitidas.estado = 'COBRADA' THEN facturas_emitidas.estado
              ELSE EXCLUDED.estado
            END,
            importe_cobrado = CASE
              WHEN facturas_emitidas.estado = 'COBRADA' THEN facturas_emitidas.importe_cobrado
              ELSE EXCLUDED.importe_cobrado
            END,
            fecha_cobro = CASE
              WHEN facturas_emitidas.estado = 'COBRADA' THEN facturas_emitidas.fecha_cobro
              ELSE EXCLUDED.fecha_cobro
            END,
            -- No sobrescribir imputacion ni forma_cobro si ya fueron editados manualmente
            imputacion = COALESCE(facturas_emitidas.imputacion, EXCLUDED.imputacion),
            forma_cobro = COALESCE(facturas_emitidas.forma_cobro, EXCLUDED.forma_cobro),
            updated_at = NOW()
        `;
        
        await prisma.$executeRawUnsafe(sqlEmitidas);
        upsertedEmitidas += batch.length;
        console.log(`[SyncFacturas] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} facturas procesadas (ambas tablas)`);
      } catch (err: any) {
        errorsEmitidas += batch.length;
        console.error(`[SyncFacturas] Error en batch facturas_emitidas ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
      }
    }
    
    const cobradas = allFacturas.filter((f: any) => f.situacion === 'COBRADA').length;
    const pendientes = allFacturas.filter((f: any) => f.situacion === 'PENDIENTE').length;
    const totalFacturado = allFacturas.reduce((sum: number, f: any) => sum + (parseFloat(f.total) || 0), 0);
    
    return {
      success: true,
      total: allFacturas.length,
      upserted,
      upsertedEmitidas,
      cobradas,
      pendientes,
      totalFacturado: Math.round(totalFacturado * 100) / 100,
      errors,
      errorsEmitidas
    };
  } catch (error: any) {
    console.error('Error en syncFacturasBatch:', error);
    throw error;
  }
}

// ==========================================
// SINCRONIZACIÓN DE REMESAS (BATCH)
// ==========================================

export async function getAllRemesas() {
  try {
    console.log(`[ISPGestión] Obteniendo todas las remesas...`);
    const data = await request('remesas', 'GET', null, { mostrar: 500 });
    
    if (Array.isArray(data)) {
      console.log(`[ISPGestión] Obtenidas ${data.length} remesas`);
      return data;
    }
    console.log(`[ISPGestión] Respuesta inesperada:`, typeof data);
    return [];
  } catch (error: any) {
    console.error('Error obteniendo remesas de ISPGestión:', error.message);
    throw error;
  }
}

export async function syncRemesasBatch() {
  try {
    const allRemesas = await getAllRemesas();
    
    if (!allRemesas.length) {
      return { success: true, total: 0, upserted: 0, errors: 0 };
    }
    
    let upserted = 0;
    let errors = 0;
    
    // Remesas are few (17), can do in one batch
    try {
      const values = allRemesas.map((r: any) => {
        const ispId = parseInt(r.id) || 0;
        const nombre = (r.nombre || '').replace(/'/g, "''");
        const fecha = r.fecha ? new Date(r.fecha).toISOString() : new Date().toISOString();
        const ejercicio = new Date(fecha).getFullYear();
        const nifPresentador = r.nif_presentador ? `'${r.nif_presentador.replace(/'/g, "''")}'` : 'NULL';
        const nombrePresentador = r.nombre_presentador ? `'${r.nombre_presentador.replace(/'/g, "''")}'` : 'NULL';
        const ibanAcreedor = r.iban_acredor || r.iban_acreedor;
        const ibanVal = ibanAcreedor ? `'${ibanAcreedor.replace(/'/g, "''")}'` : 'NULL';
        const remesado = r.remesado === '1' || r.remesado === true;
        const contabilizado = r.contabilizado === '1' || r.contabilizado === true;
        const totalImporte = parseFloat(r.total_importe) || 0;
        const numRegistros = parseInt(r.numero_registros) || 0;
        const archivoGenerado = r.archivo_generado ? `'${r.archivo_generado.replace(/'/g, "''")}'` : 'NULL';
        
        return `(${ispId}, '${nombre}', '${fecha}'::timestamp, ${nifPresentador}, ${nombrePresentador}, ${ibanVal}, ${remesado}, ${contabilizado}, ${totalImporte}, ${numRegistros}, ${archivoGenerado}, ${ejercicio}, NOW(), NOW())`;
      }).join(',\n');
      
      const sql = `
        INSERT INTO remesas (
          isp_gestion_id, nombre, fecha, nif_presentador, nombre_presentador,
          iban_acreedor, remesado, contabilizado, total_importe, numero_registros,
          archivo_generado, ejercicio, created_at, updated_at
        ) VALUES ${values}
        ON CONFLICT (isp_gestion_id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          fecha = EXCLUDED.fecha,
          nif_presentador = EXCLUDED.nif_presentador,
          nombre_presentador = EXCLUDED.nombre_presentador,
          iban_acreedor = EXCLUDED.iban_acreedor,
          remesado = EXCLUDED.remesado,
          contabilizado = EXCLUDED.contabilizado,
          total_importe = EXCLUDED.total_importe,
          numero_registros = EXCLUDED.numero_registros,
          archivo_generado = EXCLUDED.archivo_generado,
          ejercicio = EXCLUDED.ejercicio,
          updated_at = NOW()
      `;
      
      await prisma.$executeRawUnsafe(sql);
      upserted = allRemesas.length;
    } catch (err: any) {
      errors = allRemesas.length;
      console.error('[SyncRemesas] Error en batch:', err.message);
    }
    
    const totalRemesado = allRemesas.reduce((sum: number, r: any) => sum + (parseFloat(r.total_importe) || 0), 0);
    
    return {
      success: true,
      total: allRemesas.length,
      upserted,
      totalRemesado: Math.round(totalRemesado * 100) / 100,
      errors
    };
  } catch (error: any) {
    console.error('Error en syncRemesasBatch:', error);
    throw error;
  }
}
