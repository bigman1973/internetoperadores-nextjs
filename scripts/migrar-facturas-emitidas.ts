/**
 * Script para migrar facturas de la tabla 'facturas' (ISP Gestión) 
 * a la tabla 'facturas_emitidas' del módulo financiero
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  'F2602985964': 'Estructura',
  'F260005889': 'Estructura',
  'AF/03830/2026/': 'Estructura',
};

// Mapeo de situación a estado
function mapearEstado(situacion: string): string {
  switch (situacion) {
    case 'COBRADA': return 'COBRADA';
    case 'PENDIENTE': return 'EMITIDA';
    default: return 'EMITIDA';
  }
}

async function main() {
  console.log('Iniciando migración de facturas emitidas...');

  // Leer todas las facturas de la tabla original
  const facturas: any[] = await prisma.$queryRaw`
    SELECT * FROM facturas ORDER BY fecha ASC
  `;

  console.log(`Total facturas a migrar: ${facturas.length}`);

  let insertadas = 0;
  let duplicadas = 0;
  let errores = 0;

  for (const f of facturas) {
    try {
      const estado = mapearEstado(f.situacion);
      const imputacion = SERIE_IMPUTACION[f.serie_factura] || 'Estructura';
      const base = parseFloat(f.base) || 0;
      const importeIva = parseFloat(f.total_impuesto) || 0;
      const total = parseFloat(f.total) || 0;
      const totalPendiente = parseFloat(f.total_pendiente) || 0;
      const importeCobrado = total - totalPendiente;

      // Determinar tipo IVA
      let tipoIva = 21;
      if (importeIva === 0 && base > 0) tipoIva = 0; // Exento (intracomunitarias)
      else if (base > 0) tipoIva = Math.round((importeIva / base) * 100);

      await prisma.facturaEmitida.create({
        data: {
          cliente: f.nombre_completo || 'Sin nombre',
          cif: f.nif_cif || null,
          numFactura: f.numero_documento,
          serie: f.serie_factura,
          fecha: new Date(f.fecha),
          base,
          tipoIva,
          importeIva,
          tipoIrpf: 0,
          importeIrpf: 0,
          total,
          concepto: f.documento || null,
          estado: estado as any,
          imputacion,
          formaCobro: f.serie_factura === 'DRAX' ? 'Confirming' : 'Remesa',
          importeCobrado: importeCobrado > 0 ? importeCobrado : 0,
          fechaCobro: estado === 'COBRADA' ? new Date(f.fecha) : null,
          origenSistema: 'ISPGestion',
          idExterno: f.isp_gestion_id?.toString() || null,
        },
      });
      insertadas++;
    } catch (e: any) {
      if (e.code === 'P2002') {
        duplicadas++;
      } else {
        errores++;
        if (errores <= 5) console.error(`Error en ${f.numero_documento}:`, e.message);
      }
    }
  }

  console.log(`\nMigración completada:`);
  console.log(`  Insertadas: ${insertadas}`);
  console.log(`  Duplicadas: ${duplicadas}`);
  console.log(`  Errores: ${errores}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
