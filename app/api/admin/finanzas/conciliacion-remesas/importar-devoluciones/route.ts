import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listFolderByPath, downloadFileById } from '@/lib/microsoft-graph';
import * as XLSX from 'xlsx';

/**
 * API para importar devoluciones SEPA desde OneDrive
 * 
 * Ruta OneDrive: 2. Contabilidad y finanzas > 4. Clientes > 1. Devoluciones clientes > 2026 > X. Devoluciones [Mes] 2026
 * 
 * El Excel DevSEPA contiene:
 * - Referencia remesa (ej: CLL137)
 * - Nombre cliente
 * - Importe
 * - Nº factura (en concepto: "FACTURA N. CLL26/137 - 1")
 * - Motivo devolución
 */

const DEVOLUCIONES_BASE_PATH = '2. Contabilidad y finanzas/4. Clientes/1. Devoluciones clientes';

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

// POST - Importar devoluciones de un mes específico
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year = new Date().getFullYear(), mes } = body;

    if (!mes) {
      return NextResponse.json({ error: 'Se requiere el parámetro "mes" (1-12)' }, { status: 400 });
    }

    const resultados = {
      archivosEncontrados: 0,
      devolucionesImportadas: 0,
      devolucionesDuplicadas: 0,
      facturasEnlazadas: 0,
      remesasEnlazadas: 0,
      errores: [] as string[],
    };

    // 1. Buscar carpeta del mes en OneDrive
    const mesNombre = MESES_NOMBRES[mes];
    const carpetaMes = `${DEVOLUCIONES_BASE_PATH}/${year}/${mes}. Devoluciones ${mesNombre} ${year}`;
    
    let archivos;
    try {
      archivos = await listFolderByPath(carpetaMes);
    } catch (e) {
      // Intentar formato alternativo
      try {
        const carpetaAlt = `${DEVOLUCIONES_BASE_PATH}/${year}/${mes < 10 ? '0' + mes : mes}. Devoluciones ${mesNombre} ${year}`;
        archivos = await listFolderByPath(carpetaAlt);
      } catch (e2) {
        return NextResponse.json({ 
          error: `No se encontró la carpeta de devoluciones para ${mesNombre} ${year}`,
          rutaIntentada: carpetaMes,
        }, { status: 404 });
      }
    }

    // 2. Filtrar archivos Excel DevSEPA
    const excelFiles = archivos.filter(f => 
      f.file && 
      (f.name.toLowerCase().includes('devsepa') || f.name.toLowerCase().includes('dev_sepa') || f.name.toLowerCase().includes('devoluciones')) &&
      (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))
    );

    if (excelFiles.length === 0) {
      return NextResponse.json({ 
        error: `No se encontraron archivos DevSEPA en la carpeta de ${mesNombre} ${year}`,
        archivosDisponibles: archivos.map(f => f.name),
      }, { status: 404 });
    }

    resultados.archivosEncontrados = excelFiles.length;

    // 3. Procesar cada archivo Excel
    for (const excelFile of excelFiles) {
      try {
        const buffer = await downloadFileById(excelFile.id);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        // Detectar cabeceras (buscar fila con "Importe" o "Cliente")
        let headerRow = -1;
        let colImporte = -1, colCliente = -1, colConcepto = -1, colReferencia = -1, colMotivo = -1, colFecha = -1;

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          if (!row) continue;
          const rowStr = row.map(c => String(c || '').toLowerCase());
          
          if (rowStr.some(c => c.includes('importe') || c.includes('amount'))) {
            headerRow = i;
            for (let j = 0; j < rowStr.length; j++) {
              if (rowStr[j].includes('importe') || rowStr[j].includes('amount')) colImporte = j;
              if (rowStr[j].includes('cliente') || rowStr[j].includes('nombre') || rowStr[j].includes('deudor')) colCliente = j;
              if (rowStr[j].includes('concepto') || rowStr[j].includes('factura')) colConcepto = j;
              if (rowStr[j].includes('referencia') || rowStr[j].includes('ref')) colReferencia = j;
              if (rowStr[j].includes('motivo') || rowStr[j].includes('razon') || rowStr[j].includes('razón')) colMotivo = j;
              if (rowStr[j].includes('fecha')) colFecha = j;
            }
            break;
          }
        }

        if (headerRow === -1 || colImporte === -1) {
          // Intentar formato alternativo - columnas fijas conocidas del DevSEPA
          headerRow = 0;
          // Formato típico DevSEPA: Referencia | Nombre | Importe | Concepto | Motivo
          if (rows.length > 1 && rows[1] && rows[1].length >= 3) {
            colReferencia = 0;
            colCliente = 1;
            colImporte = 2;
            colConcepto = 3;
            colMotivo = 4;
          } else {
            resultados.errores.push(`No se pudo detectar formato del archivo: ${excelFile.name}`);
            continue;
          }
        }

        // 4. Procesar filas de datos
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[colImporte]) continue;

          const importe = typeof row[colImporte] === 'number' 
            ? Math.abs(row[colImporte]) 
            : parseFloat(String(row[colImporte]).replace(',', '.').replace(/[^\d.-]/g, ''));
          
          if (isNaN(importe) || importe === 0) continue;

          const nombreCliente = colCliente >= 0 ? String(row[colCliente] || '').trim() : '';
          const concepto = colConcepto >= 0 ? String(row[colConcepto] || '').trim() : '';
          const referencia = colReferencia >= 0 ? String(row[colReferencia] || '').trim() : '';
          const motivo = colMotivo >= 0 ? String(row[colMotivo] || '').trim() : '';

          // Extraer número de factura del concepto (ej: "FACTURA N. CLL26/137 - 1")
          let numeroFactura = '';
          const matchFactura = concepto.match(/(?:FACTURA\s*N\.?\s*|Fra\.?\s*)([A-Z]{2,4}\d{2}\/\d+)/i);
          if (matchFactura) {
            numeroFactura = matchFactura[1].toUpperCase();
          } else if (referencia) {
            // La referencia puede ser tipo "CLL137" → convertir a "CLL26/137"
            const matchRef = referencia.match(/^([A-Z]{2,4})(\d+)$/i);
            if (matchRef) {
              const serie = matchRef[1].toUpperCase();
              const num = matchRef[2];
              // Asumir año actual (26 para 2026)
              const yearShort = String(year).slice(-2);
              numeroFactura = `${serie}${yearShort}/${num}`;
            }
          }

          if (!numeroFactura && !nombreCliente) continue;

          // Verificar duplicado
          const existente = await prisma.devolucionRemesa.findFirst({
            where: {
              numeroFactura: numeroFactura || 'DESCONOCIDA',
              importe: importe,
              mesDevolucion: mes,
              anioDevolucion: year,
            },
          });

          if (existente) {
            resultados.devolucionesDuplicadas++;
            continue;
          }

          // Buscar factura en BD
          let facturaId: number | null = null;
          if (numeroFactura) {
            const factura = await prisma.factura.findFirst({
              where: { numeroDocumento: numeroFactura },
            });
            if (factura) {
              facturaId = factura.id;
              resultados.facturasEnlazadas++;
            }
          }

          // Buscar remesa asociada (por referencia)
          let remesaId: number | null = null;
          if (referencia) {
            // Buscar remesa del mismo mes/año
            const remesaMatch = await prisma.remesa.findFirst({
              where: {
                ejercicio: year,
                fecha: {
                  gte: new Date(year, mes - 1, 1),
                  lte: new Date(year, mes, 0, 23, 59, 59),
                },
              },
              orderBy: { fecha: 'desc' },
            });
            if (remesaMatch) {
              remesaId = remesaMatch.id;
              resultados.remesasEnlazadas++;
            }
          }

          // Fecha de devolución
          let fechaDevolucion = new Date(year, mes - 1, 15); // Default: mitad del mes
          if (colFecha >= 0 && row[colFecha]) {
            const fechaRaw = row[colFecha];
            if (typeof fechaRaw === 'number') {
              // Excel serial date
              fechaDevolucion = new Date((fechaRaw - 25569) * 86400 * 1000);
            } else {
              const parsed = new Date(fechaRaw);
              if (!isNaN(parsed.getTime())) fechaDevolucion = parsed;
            }
          }

          // Crear devolución
          await prisma.devolucionRemesa.create({
            data: {
              remesaId,
              facturaId,
              numeroFactura: numeroFactura || 'DESCONOCIDA',
              referenciaRemesa: referencia || null,
              nombreCliente: nombreCliente || 'DESCONOCIDO',
              importe,
              motivo: motivo || null,
              fechaDevolucion,
              estado: 'PENDIENTE',
              mesDevolucion: mes,
              anioDevolucion: year,
              archivoOrigen: excelFile.name,
            },
          });

          resultados.devolucionesImportadas++;
        }
      } catch (fileError: any) {
        resultados.errores.push(`Error procesando ${excelFile.name}: ${fileError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      resultados,
    });
  } catch (error: any) {
    console.error('Error importando devoluciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Listar meses disponibles con archivos de devoluciones en OneDrive
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    const carpetaAnio = `${DEVOLUCIONES_BASE_PATH}/${year}`;
    
    let carpetas;
    try {
      carpetas = await listFolderByPath(carpetaAnio);
    } catch (e) {
      return NextResponse.json({ 
        meses: [],
        error: `No se encontró la carpeta de devoluciones para ${year}`,
      });
    }

    const mesesDisponibles = carpetas
      .filter(f => f.folder)
      .map(f => {
        // Extraer número de mes del nombre de carpeta (ej: "6. Devoluciones Junio 2026")
        const match = f.name.match(/^(\d+)\./);
        return {
          nombre: f.name,
          mes: match ? parseInt(match[1]) : 0,
          id: f.id,
        };
      })
      .filter(m => m.mes > 0)
      .sort((a, b) => a.mes - b.mes);

    return NextResponse.json({ meses: mesesDisponibles });
  } catch (error: any) {
    console.error('Error listando meses devoluciones:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
