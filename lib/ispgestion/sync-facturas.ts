import { prisma } from '../prisma';
import request from './service';

// ==========================================
// SINCRONIZACIÓN DE FACTURAS (BATCH)
// ==========================================

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
    
    for (let i = 0; i < allFacturas.length; i += BATCH_SIZE) {
      const batch = allFacturas.slice(i, i + BATCH_SIZE);
      
      try {
        // Build VALUES clause for batch insert
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
        console.log(`[SyncFacturas] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} facturas procesadas`);
      } catch (err: any) {
        errors += batch.length;
        console.error(`[SyncFacturas] Error en batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
      }
    }
    
    const cobradas = allFacturas.filter((f: any) => f.situacion === 'COBRADA').length;
    const pendientes = allFacturas.filter((f: any) => f.situacion === 'PENDIENTE').length;
    const totalFacturado = allFacturas.reduce((sum: number, f: any) => sum + (parseFloat(f.total) || 0), 0);
    
    return {
      success: true,
      total: allFacturas.length,
      upserted,
      cobradas,
      pendientes,
      totalFacturado: Math.round(totalFacturado * 100) / 100,
      errors
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
