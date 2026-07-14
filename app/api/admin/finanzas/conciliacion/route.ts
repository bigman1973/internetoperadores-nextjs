import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extraerTercero } from '@/lib/finanzas/extraer-tercero';

/**
 * Motor de conciliación automática MEJORADO
 * 
 * Estrategias de conciliación (por orden de prioridad):
 * 1. Match EXACTO por importe + proveedor en concepto
 * 2. Match por nº factura en concepto/referencia
 * 3. Match por importe exacto + fecha cercana (±60 días)
 * 4. Match por domiciliaciones recurrentes (Telefónica, Aire, etc.)
 * 5. Confirming Draxton
 * 6. Facturas emitidas (remesas/transferencias recibidas)
 * 7. Traspasos entre cuentas propias
 * 
 * Clasificación automática por patrones de concepto
 */

// Reglas de clasificación automática por concepto
const REGLAS_CLASIFICACION = [
  // Nóminas
  { patron: /Concepto\s*(Nomina|Nómina)/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina', tipoDocumento: 'justificante' },
  { patron: /Concepto\s*Adelanto\s*Nomina/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina', tipoDocumento: 'justificante' },
  { patron: /Concepto\s*Liquidacion\s/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina', tipoDocumento: 'justificante' },
  
  // Impuestos
  { patron: /Domiciliacion\s*Impuesto|Impuesto:\s*2\.\d{3}/i, categoria: 'IMPUESTOS', tipoPago: 'IVA', tipoDocumento: 'justificante' },
  { patron: /A\.?E\.?A\.?T/i, categoria: 'IMPUESTOS', tipoPago: 'IVA', tipoDocumento: 'justificante' },
  { patron: /Imp\.\s*Sociedades/i, categoria: 'IMPUESTOS', tipoPago: 'IS', tipoDocumento: 'justificante' },
  
  // Seguridad Social
  { patron: /TGSS|Cotizacion\s*\d{3}/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS', tipoDocumento: 'justificante' },
  { patron: /R\.E\.Autonomos|R\.E\.AUTONOMOS/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS', tipoDocumento: 'justificante' },
  
  // Confirming
  { patron: /Cesion De Creditos.*Draxton/i, categoria: 'Draxton', tipoPago: 'Confirming' },
  { patron: /Confirming.*Claveria/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Santander Factoring.*Confirming/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Liquidacion Anticipo/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /ANTICIPS CONFIRMING/i, categoria: 'Draxton', tipoPago: 'Confirming' },
  
  // Remesas (cobros)
  { patron: /Emision Remesa Sepa/i, categoria: 'Operadora', tipoPago: 'Remesa' },
  { patron: /Liquidacion Por Emision/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Traspasos propios (SOLO cuando ordenante Y destinatario son Internet Operadores)
  // Santander: "Transferencia Inmediata A Favor De Internet Operadores Concepto Traspas..."
  { patron: /Transferencia.*A Favor De Internet Operadores.*(Concepto\s*)?(Traspas|Traspaso)/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Santander: "Transferencia Inmediata A Favor De Internet Operadores Concepto Enviado Por Banco"
  { patron: /Transferencia.*A Favor De Internet Operadores.*Enviado Por Banco/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Santander (entrada): "Transferencia Inmediata De Internet Operadores S.l., Concepto Traspas..."
  { patron: /Transferencia.*De Internet Operadores.*(Concepto\s*)?(Traspas|Traspaso)/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // BBVA: "TRANSFERÈNCIES - TRASPAS..." o "TRANSFERÈNCIES - TRASPASO..."
  { patron: /TRANSFER(È|E)NCIES\s*-\s*(TRASPAS|TRASPASO)/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Caixa Guissona: "TF/INTERNET OPERADORES SL TRASPAS..." o "TF/INTERNET OPERADORES SL TRASPASO..."
  { patron: /TF\/INTERNET OPERADORES.*(TRASPAS|TRASPASO)/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Caixa Guissona: "TF/INTERNET OPERADORES SL ENVIADO POR..."
  { patron: /TF\/INTERNET OPERADORES.*ENVIADO POR/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Vivid: "Internet Operadores Sl - TRASPAS..."
  { patron: /Internet Operadores\s+S\.?l\.?\s*-\s*TRASPAS/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Vivid: "TRANSFER INMEDIATA Internet Operadores Sl" (recepción de traspaso)
  { patron: /TRANSFER INMEDIATA\s+Internet Operadores\s+S/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Vivid: "Internet Operadores Sl NOTPROVIDE TRASPASO..." (recepción de traspaso en Vivid)
  { patron: /NOTPROVIDE\s*TRASPASO/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  // Caixa Guissona: "TRASPAS A GIRO" (interno)
  { patron: /TRASPAS A GIRO/i, categoria: 'Traspaso', tipoPago: 'Transferencia', tipoDocumento: 'justificante' },
  
  // Proveedores conocidos
  { patron: /Instant Byte/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Neutra Fiber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Vola Los Del Internet/i, categoria: 'Vola', tipoPago: 'Factura' },
  { patron: /Looking Forward Giro Dolcet/i, categoria: 'Estructura', tipoPago: 'Factura' },
  { patron: /V-valley/i, categoria: 'Comisiones V-Valley', tipoPago: 'Factura' },
  { patron: /Santber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Aire Networks/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Xfera|Masmovil/i, categoria: 'Operadora', tipoPago: 'Factura' },
  
  // Telecomunicaciones (recibos/domiciliaciones)
  { patron: /Telefonica De Espana|TELEFONICA DE ESPAÑA/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Telefonica Moviles/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Acens.*Telefonica/i, categoria: 'Estructura', tipoPago: 'Domiciliación' },
  
  // Tarjeta - Restaurantes/Comida
  { patron: /Glovo|Uber\s*Eats|Just\s*Eat|Deliveroo/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Restaurant|Restaurante|Pizz|Burger|Kebab|Wok|Sushi|Bar\s|Cafe\s|Cafeteria/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Mcdonalds|Mcdonald|Telepizza|Dominos/i, categoria: 'Dietas', tipoPago: 'Débito' },
  
  // Tarjeta - Gasolina/Desplazamientos
  { patron: /Benzinera|Gasolinera|Repsol|Cepsa|Shell|Bp\s|Bonarea.*Gasoil|Estacion Servicio/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Renfe|Alsa|Blabla|Parking|Peaje|Autopista|Toll/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Saltoki/i, categoria: 'Operadora', tipoPago: 'Débito' },
  
  // Tarjeta - Suscripciones tech
  { patron: /Apple\.com|Itunes|Google\s*(Cloud|Storage|Play)|Microsoft|Github|Aws|Amazon\s*Web/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Zoom|Slack|Notion|Figma|Canva|Adobe|Dropbox|Openai|Manus\s*Ai/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Nominalia|Ovh|Hetzner|Digitalocean|Cloudflare/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  
  // Tarjeta - Material oficina/hardware
  { patron: /Amazon\.es|Amazon\.com|Pccomponentes|Mediamarkt/i, categoria: 'Estructura', tipoPago: 'Débito' },
  { patron: /Www\.amazon/i, categoria: 'Estructura', tipoPago: 'Débito' },
  
  // Préstamos
  { patron: /Venciment Prestec|PRES\.\d+/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo', tipoDocumento: 'justificante' },
  { patron: /AMORTITZACI.*PR(É|E)STEC/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo', tipoDocumento: 'justificante' },
  
  // Comisiones bancarias
  { patron: /Manteniment|Cobrament Pendent|Gastos Devoluciones/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /Targeta Visa|V\.Negocis/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /COMISSIONS|Comision\s*\d/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Devoluciones de recibos
  { patron: /Devolucion De Recibo/i, categoria: 'Morosos', tipoPago: 'Devolución' },
  
  // Seguros
  { patron: /Mutua Madrile/i, categoria: 'Estructura', tipoPago: 'Seguro' },
  { patron: /Quiron Prevencion/i, categoria: 'Sueldos y Salarios', tipoPago: 'PRL' },
];

// Mapeo de proveedores conocidos para match por concepto
const PROVEEDORES_CONCEPTO: { patron: RegExp; proveedor: string }[] = [
  { patron: /Instant Byte/i, proveedor: 'INSTANT BYTE' },
  { patron: /Neutra Fiber/i, proveedor: 'NEUTRA FIBER' },
  { patron: /Aire Networks/i, proveedor: 'AIRE NETWORKS' },
  { patron: /Telefonica De Espana|TELEFONICA DE ESPAÑA/i, proveedor: 'TELEFÓNICA DE ESPAÑA' },
  { patron: /Telefonica Moviles/i, proveedor: 'TELEFÓNICA MÓVILES' },
  { patron: /Xfera|Masmovil/i, proveedor: 'XFERA MOVILES' },
  { patron: /V-valley/i, proveedor: 'V-VALLEY' },
  { patron: /Vola Los Del Internet/i, proveedor: 'VOLA' },
  { patron: /Santber/i, proveedor: 'SANTBER' },
  { patron: /Looking Forward/i, proveedor: 'LOOKING FORWARD' },
  { patron: /Draxton/i, proveedor: 'DRAXTON' },
  { patron: /Acens/i, proveedor: 'ACENS' },
];

// POST - Ejecutar conciliación automática
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modo = 'todo' } = body; // 'clasificar', 'conciliar', 'todo'

    const resultados = {
      clasificados: 0,
      conciliadosFacturasRecibidas: 0,
      conciliadosFacturasEmitidas: 0,
      conciliadosConfirming: 0,
      conciliadosTraspasos: 0,
      conciliadosGastos: 0,
      conciliadosNominas: 0,
      errores: [] as string[],
    };

    // 1. CLASIFICACIÓN AUTOMÁTICA
    if (modo === 'clasificar' || modo === 'todo') {
      const sinCategoria = await prisma.movimientoBancario.findMany({
        where: { categoria: null },
        select: { id: true, concepto: true, importe: true, cuentaId: true, tercero: true },
      });

      // Helper: detectar si el tercero es Internet Operadores
      const esIO = (nombre: string | null) => {
        if (!nombre) return false;
        return /internet\s*operadores/i.test(nombre);
      };

      for (const mov of sinCategoria) {
        // 1º: Usar campo 'tercero' de la BD para detectar traspasos
        // Un traspaso es cuando el tercero es Internet Operadores Y el concepto indica traspaso
        if (esIO(mov.tercero)) {
          // Verificar que el concepto indica traspaso (no un pago/cobro)
          const esConceptoTraspaso = /traspas|traspaso|enviado por banco|sin concepto/i.test(mov.concepto)
            && !/pago|factura|fra\b|zoom|suara/i.test(mov.concepto);
          if (esConceptoTraspaso) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: {
                categoria: 'Traspaso',
                tipoPago: 'Transferencia',
                tipoDocumento: 'justificante',
                documentoRecibido: true,
              },
            });
            resultados.clasificados++;
            continue;
          }
        }

        // 2º: Fallback con extraerTercero para movimientos sin campo tercero
        if (!mov.tercero) {
          const infoTercero = extraerTercero(mov.concepto, mov.importe, mov.cuentaId);
          if (infoTercero.esInternetOperadores || infoTercero.tipo === 'traspaso') {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: {
                categoria: 'Traspaso',
                tipoPago: 'Transferencia',
                tipoDocumento: 'justificante',
                documentoRecibido: true,
                tercero: infoTercero.nombre,
              },
            });
            resultados.clasificados++;
            continue;
          }
        }

        // 3º: Reglas de clasificación por patrón regex (NO traspasos)
        for (const regla of REGLAS_CLASIFICACION) {
          if (regla.categoria === 'Traspaso') continue; // Traspasos solo por campo tercero
          if (regla.patron.test(mov.concepto)) {
            const data: any = {
              categoria: regla.categoria,
              tipoPago: regla.tipoPago,
            };
            if ((regla as any).tipoDocumento) {
              data.tipoDocumento = (regla as any).tipoDocumento;
              data.documentoRecibido = true;
            }
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data,
            });
            resultados.clasificados++;
            break;
          }
        }
      }

      // También aplicar reglas personalizadas de la BD
      try {
        const reglasDB = await prisma.reglaImputacion.findMany({
          where: { activa: true },
          orderBy: { confianza: 'desc' },
        });

        const aun_sin_categoria = await prisma.movimientoBancario.findMany({
          where: { categoria: null },
          select: { id: true, concepto: true },
        });

        for (const mov of aun_sin_categoria) {
          for (const regla of reglasDB) {
            if (mov.concepto.toLowerCase().includes(regla.patron.toLowerCase())) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: {
                  categoria: regla.imputacion,
                  tipoPago: regla.tipoPago,
                },
              });
              await prisma.reglaImputacion.update({
                where: { id: regla.id },
                data: { vecesUsada: { increment: 1 } },
              });
              resultados.clasificados++;
              break;
            }
          }
        }
      } catch (e) {
        // reglaImputacion puede no existir aún
      }

      // Identificar proveedores por patrones bancarios de entidades fiscales
      try {
        const entidadesConPatron = await prisma.entidadFiscal.findMany({
          where: { patronesBancarios: { not: null }, activo: true },
          select: { id: true, patronesBancarios: true },
        });

        const sinProveedor = await prisma.movimientoBancario.findMany({
          where: { entidadFiscalId: null, importe: { lt: 0 } },
          select: { id: true, concepto: true },
        });

        for (const mov of sinProveedor) {
          for (const entidad of entidadesConPatron) {
            try {
              const patrones = JSON.parse(entidad.patronesBancarios!);
              if (Array.isArray(patrones) && patrones.some((p: string) => mov.concepto.toLowerCase().includes(p.toLowerCase()))) {
                await prisma.movimientoBancario.update({
                  where: { id: mov.id },
                  data: { entidadFiscalId: entidad.id },
                });
                break;
              }
            } catch {}
          }
        }
      } catch (e) {
        // entidadFiscal puede no tener patrones
      }

      // Identificar proveedor/cliente usando el campo 'tercero' de la BD
      try {
        const sinProveedorAun = await prisma.movimientoBancario.findMany({
          where: { entidadFiscalId: null, categoria: { notIn: ['Traspaso', 'Sueldos y Salarios', 'IMPUESTOS'] } },
          select: { id: true, concepto: true, importe: true, cuentaId: true, tercero: true },
        });

        // Cargar todas las entidades fiscales para buscar por nombre
        const todasEntidades = await prisma.entidadFiscal.findMany({
          where: { activo: true },
          select: { id: true, razonSocial: true, nombreComercial: true },
        });

        // Helper para normalizar nombre y buscar entidad
        const buscarEntidad = (nombre: string) => {
          const nombreNorm = nombre.toLowerCase().replace(/[,.]|\s*(s\.?l\.?u?\.?|s\.?a\.?u?\.?|sociedad limitada)\s*$/gi, '').trim();
          if (nombreNorm.length < 3) return null;
          return todasEntidades.find(e => {
            const razon = (e.razonSocial || '').toLowerCase().replace(/[,.]|\s*(s\.?l\.?u?\.?|s\.?a\.?u?\.?)\s*$/gi, '').trim();
            const comercial = (e.nombreComercial || '').toLowerCase();
            return (razon && (razon.includes(nombreNorm) || nombreNorm.includes(razon)))
              || (comercial && (comercial.includes(nombreNorm) || nombreNorm.includes(comercial)));
          }) || null;
        };

        for (const mov of sinProveedorAun) {
          // 1º: Usar campo tercero de la BD (directo del extracto)
          if (mov.tercero && !/internet\s*operadores/i.test(mov.tercero)) {
            const entidad = buscarEntidad(mov.tercero);
            if (entidad) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { entidadFiscalId: entidad.id },
              });
              continue;
            }
          }

          // 2º: Fallback con extraerTercero del concepto
          const info = extraerTercero(mov.concepto, mov.importe, mov.cuentaId);
          if (info.nombre && !info.esInternetOperadores && info.nombre.length > 3) {
            const entidad = buscarEntidad(info.nombre);
            if (entidad) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { entidadFiscalId: entidad.id, tercero: mov.tercero || info.nombre },
              });
            }
          }
        }
      } catch (e) {
        // Error en vinculación por tercero
      }
    }

    // 2. CONCILIACIÓN CON FACTURAS RECIBIDAS (MEJORADA)
    if (modo === 'conciliar' || modo === 'todo') {
      const gastosSinConciliar = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { lt: 0 },
          OR: [
            { categoria: null },
            { categoria: { notIn: ['Traspaso', 'Sueldos y Salarios', 'IMPUESTOS', 'Gastos Financieros', 'Dietas', 'Desplazamientos'] } },
          ],
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true, referencia: true, tercero: true, cuentaId: true },
      });

      for (const mov of gastosSinConciliar) {
        const importeAbs = Math.abs(mov.importe);
        let matched = false;

        // ESTRATEGIA 1: Match por proveedor en concepto + importe exacto
        for (const prov of PROVEEDORES_CONCEPTO) {
          if (prov.patron.test(mov.concepto)) {
            const fechaDesde = new Date(mov.fechaOperacion);
            fechaDesde.setDate(fechaDesde.getDate() - 90);
            const fechaHasta = new Date(mov.fechaOperacion);
            fechaHasta.setDate(fechaHasta.getDate() + 10);

            // Buscar entidad fiscal asociada al proveedor
            const entidadFiscal = await prisma.entidadFiscal.findFirst({
              where: {
                razonSocial: { contains: prov.proveedor, mode: 'insensitive' },
                tipo: 'PROVEEDOR',
              },
            });

            const facturaMatch = await prisma.facturaRecibida.findFirst({
              where: {
                proveedor: { contains: prov.proveedor, mode: 'insensitive' },
                total: { gte: importeAbs - 0.05, lte: importeAbs + 0.05 },
                fecha: { gte: fechaDesde, lte: fechaHasta },
                movimientos: { none: {} },
              },
              orderBy: { fecha: 'desc' },
            });

            if (facturaMatch) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: {
                  conciliado: true,
                  facturaId: facturaMatch.id,
                  ...(entidadFiscal ? { entidadFiscalId: entidadFiscal.id } : {}),
                },
              });
              resultados.conciliadosFacturasRecibidas++;
              matched = true;
            } else if (entidadFiscal) {
              // No hay factura pero identificamos el proveedor (primer nivel)
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { entidadFiscalId: entidadFiscal.id },
              });
            }
            break;
          }
        }
        if (matched) continue;

        // ESTRATEGIA 2: Match por nº factura en concepto/referencia (regex mejorado)
        const numFacturaMatch = mov.concepto.match(/(?:FACTURA|Fra|FRS|Ref|FAC)(?:\s*N\.?)?[:\s./]*([A-Z0-9][A-Z0-9\-\/]+)/i)
          || mov.concepto.match(/(?:Concepto|Pago)\s+(?:Factura|Fra)\s+([A-Z0-9][A-Z0-9\-\/]+)/i)
          || (mov.referencia && mov.referencia.match(/([A-Z0-9][A-Z0-9\-\/]{3,})/i));
        
        if (numFacturaMatch) {
          const numFactura = numFacturaMatch[1].replace(/\s+-\s+\d+$/, '').trim(); // Limpiar: quitar " - 1" al final (no tocar Va-999)
          const facturaMatch = await prisma.facturaRecibida.findFirst({
            where: {
              numFactura: { contains: numFactura, mode: 'insensitive' },
              movimientos: { none: {} },
            },
          });

          if (facturaMatch) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: { conciliado: true, facturaId: facturaMatch.id },
            });
            resultados.conciliadosFacturasRecibidas++;
            continue;
          }
        }

        // ESTRATEGIA 3: Match por tercero + importe exacto (usando campo tercero de la BD)
        if (mov.tercero) {
          // Normalizar tercero: quitar S.L., S.A., puntos, comas para buscar parcial
          const terceroNorm = mov.tercero.replace(/[,.]|\b(S\.?L\.?|S\.?A\.?|S\.?L\.?U\.?)\b/gi, '').trim();
          const palabrasClave = terceroNorm.split(/\s+/).filter((p: string) => p.length > 3).slice(0, 2);
          
          if (palabrasClave.length > 0) {
            const fechaDesde = new Date(mov.fechaOperacion);
            fechaDesde.setDate(fechaDesde.getDate() - 90);
            const fechaHasta = new Date(mov.fechaOperacion);
            fechaHasta.setDate(fechaHasta.getDate() + 10);

            const facturaMatch = await prisma.facturaRecibida.findFirst({
              where: {
                AND: palabrasClave.map((p: string) => ({ proveedor: { contains: p, mode: 'insensitive' as const } })),
                total: { gte: importeAbs - 0.10, lte: importeAbs + 0.10 },
                fecha: { gte: fechaDesde, lte: fechaHasta },
                movimientos: { none: {} },
              },
              orderBy: { fecha: 'desc' },
            });

            if (facturaMatch) {
              await prisma.movimientoBancario.update({
                where: { id: mov.id },
                data: { conciliado: true, facturaId: facturaMatch.id },
              });
              resultados.conciliadosFacturasRecibidas++;
              continue;
            }
          }
        }

        // ESTRATEGIA 4: Match por importe exacto + fecha cercana (solo si importe > 50€ y hay una única factura)
        if (importeAbs > 50) {
          const fechaDesde = new Date(mov.fechaOperacion);
          fechaDesde.setDate(fechaDesde.getDate() - 60);
          const fechaHasta = new Date(mov.fechaOperacion);
          fechaHasta.setDate(fechaHasta.getDate() + 5);

          const facturasMatch = await prisma.facturaRecibida.findMany({
            where: {
              total: { gte: importeAbs - 0.02, lte: importeAbs + 0.02 },
              fecha: { gte: fechaDesde, lte: fechaHasta },
              movimientos: { none: {} },
            },
            orderBy: { fecha: 'desc' },
            take: 2,
          });

          // Solo vincular si hay exactamente 1 factura con ese importe (evitar ambigüedad)
          if (facturasMatch.length === 1) {
            await prisma.movimientoBancario.update({
              where: { id: mov.id },
              data: { conciliado: true, facturaId: facturasMatch[0].id },
            });
            resultados.conciliadosFacturasRecibidas++;
            continue;
          }
        }
      }

      // 3. CONCILIACIÓN CONFIRMING DRAXTON
      const ingresosConfirming = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          OR: [
            { concepto: { contains: 'Draxton', mode: 'insensitive' } },
            { concepto: { contains: 'ANTICIPS CONFIRMING', mode: 'insensitive' } },
          ],
        },
        select: { id: true, importe: true, fechaOperacion: true },
      });

      for (const mov of ingresosConfirming) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: {
            conciliado: true,
            categoria: 'Draxton',
            tipoPago: 'Confirming',
          },
        });
        resultados.conciliadosConfirming++;
      }

      // 4. TRASPASOS ENTRE CUENTAS PROPIAS
      // Buscar traspasos clasificados como 'Traspaso' que no están conciliados
      const traspasos = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          categoria: 'Traspaso',
        },
        select: { id: true, importe: true, fechaOperacion: true, cuentaId: true, traspasoRelacionadoId: true },
      });

      // Intentar vincular pares cruzados: salida de un banco = entrada en otro
      const sinVincular = traspasos.filter(t => !t.traspasoRelacionadoId);
      const usados = new Set<string>();

      for (const mov of sinVincular) {
        if (usados.has(mov.id)) continue;
        const fechaMin = new Date(mov.fechaOperacion);
        fechaMin.setDate(fechaMin.getDate() - 7);
        const fechaMax = new Date(mov.fechaOperacion);
        fechaMax.setDate(fechaMax.getDate() + 7);

        // Primero buscar entre los otros traspasos clasificados
        let contrapartida = sinVincular.find(c => 
          c.id !== mov.id && 
          !usados.has(c.id) &&
          c.cuentaId !== mov.cuentaId &&
          Math.abs(c.importe + mov.importe) < 0.05 &&
          new Date(c.fechaOperacion) >= fechaMin &&
          new Date(c.fechaOperacion) <= fechaMax
        );

        // Si no se encuentra entre los clasificados, buscar en TODOS los movimientos sin conciliar
        // (la contrapartida puede no tener categoría 'Traspaso' aún)
        if (!contrapartida) {
          const contrapartidaDB = await prisma.movimientoBancario.findFirst({
            where: {
              conciliado: false,
              cuentaId: { not: mov.cuentaId },
              importe: { gte: -mov.importe - 0.05, lte: -mov.importe + 0.05 },
              fechaOperacion: { gte: fechaMin, lte: fechaMax },
              id: { notIn: [...usados] },
            },
            select: { id: true, importe: true, fechaOperacion: true, cuentaId: true },
          });
          if (contrapartidaDB) {
            contrapartida = contrapartidaDB as any;
          }
        }

        if (contrapartida) {
          // Vincular ambos
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true, tipoDocumento: 'traspaso', categoria: 'Traspaso', traspasoRelacionadoId: contrapartida.id },
          });
          await prisma.movimientoBancario.update({
            where: { id: contrapartida.id },
            data: { conciliado: true, tipoDocumento: 'traspaso', categoria: 'Traspaso', traspasoRelacionadoId: mov.id },
          });
          usados.add(mov.id);
          usados.add(contrapartida.id);
          resultados.conciliadosTraspasos += 2;
        } else {
          // No hay contrapartida — marcar como traspaso pero NO conciliar (pendiente de contrapartida)
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: false, tipoDocumento: 'traspaso' },
          });
        }
      }

      // Conciliar los que ya tenían traspasoRelacionadoId
      for (const mov of traspasos.filter(t => t.traspasoRelacionadoId)) {
        if (usados.has(mov.id)) continue;
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: { conciliado: true, tipoDocumento: 'traspaso' },
        });
        resultados.conciliadosTraspasos++;
      }

      // 4.5 CONCILIACIÓN AUTOMÁTICA: tercero + justificante = conciliado
      const conTerceroYJustificante = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          entidadFiscalId: { not: null },
          tipoDocumento: 'justificante',
        },
        select: { id: true },
      });

      for (const mov of conTerceroYJustificante) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: { conciliado: true },
        });
        resultados.conciliadosTraspasos++;
      }

      // 4.6 CONCILIACIÓN AUTOMÁTICA DE NÓMINAS: vincular movimiento con nómina por empleado + importe + mes
      const movNominas = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          nominaId: null,
          categoria: 'Sueldos y Salarios',
          tipoPago: 'Nómina',
          importe: { lt: 0 },
          entidadFiscalId: { not: null },
        },
        select: { id: true, importe: true, fechaOperacion: true, entidadFiscalId: true },
      });

      // Obtener mapeo NIF → empleadoId para las entidades fiscales tipo PERSONAL
      const entidadesFiscalesIds = [...new Set(movNominas.map(m => m.entidadFiscalId!))]; 
      const entidadesFiscales = await prisma.entidadFiscal.findMany({
        where: { id: { in: entidadesFiscalesIds }, tipo: 'PERSONAL' },
        select: { id: true, nifCif: true },
      });
      const nifPorEntidad = new Map(entidadesFiscales.map(e => [e.id, e.nifCif]));
      const nifsUnicos = [...new Set(entidadesFiscales.map(e => e.nifCif).filter(Boolean))] as string[];
      const empleados = await prisma.empleado.findMany({
        where: { nif: { in: nifsUnicos } },
        select: { id: true, nif: true },
      });
      const empleadoPorNif = new Map(empleados.map(e => [e.nif, e.id]));

      // Obtener todas las nóminas de esos empleados
      const empleadoIds = [...new Set(empleados.map(e => e.id))];
      const todasNominas = await prisma.nomina.findMany({
        where: { empleadoId: { in: empleadoIds } },
        select: { id: true, empleadoId: true, mes: true, anio: true, netoPercibir: true },
      });

      for (const mov of movNominas) {
        const nif = nifPorEntidad.get(mov.entidadFiscalId!);
        if (!nif) continue;
        const empId = empleadoPorNif.get(nif);
        if (!empId) continue;

        const importeAbs = Math.abs(mov.importe);
        const fechaMov = new Date(mov.fechaOperacion);
        // Las nóminas se pagan el mes siguiente o el mismo mes
        // Buscar nómina del mes anterior o del mismo mes
        const mesActual = fechaMov.getMonth() + 1;
        const anioActual = fechaMov.getFullYear();
        const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
        const anioAnterior = mesActual === 1 ? anioActual - 1 : anioActual;

        // Buscar nómina que coincida en importe (tolerancia 0.05€)
        const nominaMatch = todasNominas.find(n => 
          n.empleadoId === empId &&
          Math.abs(n.netoPercibir - importeAbs) < 0.05 &&
          ((n.mes === mesAnterior && n.anio === anioAnterior) || (n.mes === mesActual && n.anio === anioActual))
        );

        if (nominaMatch) {
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: {
              nominaId: nominaMatch.id,
              conciliado: true,
              tipoDocumento: 'justificante',
            },
          });
          resultados.conciliadosNominas++;
        }
      }

      // 5. CONCILIACIÓN CON TICKETS/GASTOS
      const gastosCategorizados = ['Dietas', 'Desplazamientos'];
      const movGastos = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { lt: 0 },
          gastoId: null,
          categoria: { in: gastosCategorizados },
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true },
      });


      for (const mov of movGastos) {
        const importeAbs = Math.abs(mov.importe);
        const fechaDesde = new Date(mov.fechaOperacion);
        fechaDesde.setDate(fechaDesde.getDate() - 3);
        const fechaHasta = new Date(mov.fechaOperacion);
        fechaHasta.setDate(fechaHasta.getDate() + 3);

        const gastoMatch = await prisma.gasto.findFirst({
          where: {
            importe: { gte: importeAbs - 0.05, lte: importeAbs + 0.05 },
            fecha: { gte: fechaDesde, lte: fechaHasta },
            conciliado: false,
          },
          orderBy: { fecha: 'desc' },
        });

        if (gastoMatch) {
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true, gastoId: gastoMatch.id },
          });
          await prisma.gasto.update({
            where: { id: gastoMatch.id },
            data: { conciliado: true },
          });
          resultados.conciliadosGastos++;
        }
      }

      // 6. CONCILIACIÓN CON FACTURAS EMITIDAS (Remesas y transferencias recibidas)
      const ingresosClientes = await prisma.movimientoBancario.findMany({
        where: {
          conciliado: false,
          importe: { gt: 0 },
          categoria: { notIn: ['Draxton', 'Traspaso'] },
        },
        select: { id: true, importe: true, fechaOperacion: true, concepto: true },
      });

      for (const mov of ingresosClientes) {
        // Buscar factura emitida con total similar y estado EMITIDA o ENVIADA
        const facturaMatch = await prisma.facturaEmitida.findFirst({
          where: {
            total: { gte: mov.importe - 0.02, lte: mov.importe + 0.02 },
            estado: { in: ['EMITIDA', 'ENVIADA'] },
          },
        });

        if (facturaMatch) {
          await prisma.facturaEmitida.update({
            where: { id: facturaMatch.id },
            data: {
              estado: 'COBRADA',
              importeCobrado: mov.importe,
              fechaCobro: mov.fechaOperacion,
            },
          });
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { conciliado: true },
          });
          resultados.conciliadosFacturasEmitidas++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      resultados,
    });
  } catch (error: any) {
    console.error('Error en conciliación:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Estado de conciliación
export async function GET() {
  try {
    const totalMovimientos = await prisma.movimientoBancario.count();
    const conciliados = await prisma.movimientoBancario.count({ where: { conciliado: true } });
    const sinCategorizar = await prisma.movimientoBancario.count({ where: { categoria: null } });
    const sinConciliar = totalMovimientos - conciliados;

    // Facturas emitidas pendientes de cobro
    const facturasEmitidas = await prisma.facturaEmitida.aggregate({
      _sum: { total: true, importeCobrado: true },
      _count: true,
    });
    const pendienteCobro = (facturasEmitidas._sum.total || 0) - (facturasEmitidas._sum.importeCobrado || 0);

    // Facturas recibidas sin conciliar
    const facturasRecibidasSinConciliar = await prisma.facturaRecibida.count({
      where: { movimientos: { none: {} }, total: { gt: 0 } },
    });

    // Conteos especiales para KPIs
    const pendienteFacturaCount = await prisma.movimientoBancario.count({ where: { pendienteFactura: true } });
    const pendienteFacturaImporte = await prisma.movimientoBancario.aggregate({ where: { pendienteFactura: true }, _sum: { importe: true } });
    const pagosVolaCount = await prisma.movimientoBancario.count({ where: { pagoACuentaVola: true } });
    const entregasACuentaCount = await prisma.movimientoBancario.count({ where: { entregaACuentaEmpleadoId: { not: null } } });
    const sinDocumentoCount = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'factura', documentoRecibido: false } });
    const sinDocumentoImporte = await prisma.movimientoBancario.aggregate({ where: { tipoDocumento: 'factura', documentoRecibido: false }, _sum: { importe: true } });

    // KPI: Facturas pendientes de validar (PENDIENTE_REVISION)
    // Solo cuenta facturas que tienen movimientos con tipo doc factura o ticket (documento físico)
    const facturasPendientesValidar = await prisma.facturaRecibida.aggregate({
      where: { 
        estado: 'PENDIENTE_REVISION',
        movimientos: { some: { tipoDocumento: { in: ['factura', 'ticket'] } } }
      },
      _sum: { base: true, importeIva: true, total: true },
      _count: true,
    });
    // También contar las que no tienen movimiento vinculado (facturas subidas manualmente)
    const facturasSinVincularPendientes = await prisma.facturaRecibida.aggregate({
      where: { 
        estado: 'PENDIENTE_REVISION',
        movimientos: { none: {} }
      },
      _sum: { base: true, importeIva: true, total: true },
      _count: true,
    });

    // Importes de pagos Vola y entregas a cuenta
    const pagosVolaImporte = await prisma.movimientoBancario.aggregate({ where: { pagoACuentaVola: true }, _sum: { importe: true } });
    const entregasACuentaImporte = await prisma.movimientoBancario.aggregate({ where: { entregaACuentaEmpleadoId: { not: null } }, _sum: { importe: true } });

    // KPIs de niveles de conciliación
    const conProveedorIdentificado = await prisma.movimientoBancario.count({ where: { entidadFiscalId: { not: null } } });
    const conFacturaVinculada = await prisma.movimientoBancario.count({ where: { facturaId: { not: null } } });
    const conFacturaEmitidaVinculada = await prisma.movimientoBancario.count({ where: { facturaEmitidaId: { not: null } } });
    const sinProveedorGastos = await prisma.movimientoBancario.count({ where: { entidadFiscalId: null, importe: { lt: 0 }, categoria: { notIn: ['Traspaso', 'Sueldos y Salarios', 'IMPUESTOS'] } } });

    // KPIs de traspasos
    const traspasosTotal = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso' } });
    const traspasosConContrapartida = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso', traspasoRelacionadoId: { not: null } } });
    const traspasosPendientes = await prisma.movimientoBancario.count({ where: { tipoDocumento: 'traspaso', traspasoRelacionadoId: null } });
    const traspasosImporte = await prisma.movimientoBancario.aggregate({ where: { tipoDocumento: 'traspaso', importe: { lt: 0 } }, _sum: { importe: true } });

    // Distribución por categoría
    const porCategoria = await prisma.movimientoBancario.groupBy({
      by: ['categoria'],
      _sum: { importe: true },
      _count: true,
      orderBy: { _sum: { importe: 'asc' } },
    });

    // Distribución por banco
    const porBanco = await prisma.movimientoBancario.groupBy({
      by: ['cuentaId'],
      _count: true,
      where: { conciliado: false },
    });

    return NextResponse.json({
      totalMovimientos,
      conciliados,
      sinConciliar,
      sinCategorizar,
      porcentajeConciliado: totalMovimientos > 0 ? Math.round((conciliados / totalMovimientos) * 100) : 0,
      // Niveles de conciliación
      conProveedorIdentificado,
      conFacturaVinculada,
      conFacturaEmitidaVinculada,
      sinProveedorGastos,
      pendienteFacturaCount,
      pendienteFacturaImporte: Math.abs(pendienteFacturaImporte._sum.importe || 0),
      sinDocumentoCount,
      sinDocumentoImporte: Math.abs(sinDocumentoImporte._sum.importe || 0),
      facturasPendientesValidar: {
        count: facturasPendientesValidar._count + facturasSinVincularPendientes._count,
        base: (facturasPendientesValidar._sum.base || 0) + (facturasSinVincularPendientes._sum.base || 0),
        iva: (facturasPendientesValidar._sum.importeIva || 0) + (facturasSinVincularPendientes._sum.importeIva || 0),
        total: (facturasPendientesValidar._sum.total || 0) + (facturasSinVincularPendientes._sum.total || 0),
      },
      pagosVolaCount,
      pagosVolaImporte: Math.abs(pagosVolaImporte._sum.importe || 0),
      entregasACuentaCount,
      entregasACuentaImporte: Math.abs(entregasACuentaImporte._sum.importe || 0),
      facturasEmitidas: {
        total: facturasEmitidas._count,
        facturado: facturasEmitidas._sum.total || 0,
        cobrado: facturasEmitidas._sum.importeCobrado || 0,
        pendienteCobro,
      },
      facturasRecibidasSinConciliar,
      traspasosTotal,
      traspasosConContrapartida,
      traspasosPendientes,
      traspasosImporte: Math.abs(traspasosImporte._sum.importe || 0),
      porCategoria,
      porBanco,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
