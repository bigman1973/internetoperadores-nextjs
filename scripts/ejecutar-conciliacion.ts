/**
 * Script para ejecutar la conciliación automática
 * Clasifica movimientos y cruza con facturas
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Reglas de clasificación automática por concepto
const REGLAS_CLASIFICACION = [
  // Nóminas
  { patron: /Concepto\s*(Nomina|Nómina)/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  { patron: /Concepto\s*Adelanto\s*Nomina/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  { patron: /Concepto\s*Liquidacion\s/i, categoria: 'Sueldos y Salarios', tipoPago: 'Nómina' },
  
  // Impuestos
  { patron: /Domiciliacion\s*Impuesto|Impuesto:\s*2\.\d{3}/i, categoria: 'IMPUESTOS', tipoPago: 'IVA' },
  { patron: /A\.?E\.?A\.?T/i, categoria: 'IMPUESTOS', tipoPago: 'IVA' },
  { patron: /Imp\.\s*Sociedades/i, categoria: 'IMPUESTOS', tipoPago: 'IS' },
  { patron: /Modelo\s*(303|111|115|202|200|390)/i, categoria: 'IMPUESTOS', tipoPago: 'IVA' },
  
  // Seguridad Social
  { patron: /TGSS|Cotizacion\s*\d{3}/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS' },
  { patron: /R\.E\.Autonomos|R\.E\.AUTONOMOS/i, categoria: 'Sueldos y Salarios', tipoPago: 'SS' },
  
  // Confirming
  { patron: /Cesion De Creditos.*Draxton/i, categoria: 'Draxton', tipoPago: 'Confirming' },
  { patron: /Confirming.*Claveria/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Santander Factoring.*Confirming/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  { patron: /Liquidacion Anticipo/i, categoria: 'Estructura', tipoPago: 'Confirming' },
  
  // Remesas (cobros)
  { patron: /Emision Remesa Sepa/i, categoria: 'Operadora', tipoPago: 'Remesa' },
  { patron: /Liquidacion Por Emision/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Traspasos propios
  { patron: /Traspas/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  { patron: /Transferencia Inmediata A Favor De Internet Operadores/i, categoria: 'Traspaso', tipoPago: 'Transferencia' },
  
  // Proveedores conocidos
  { patron: /Instant Byte/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Neutra Fiber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Vola Los Del Internet/i, categoria: 'Vola', tipoPago: 'Factura' },
  { patron: /Looking Forward|Giro Dolcet/i, categoria: 'Estructura', tipoPago: 'Factura' },
  { patron: /V-valley|V Valley/i, categoria: 'Comisiones V-Valley', tipoPago: 'Factura' },
  { patron: /Santber/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Lodeal/i, categoria: 'Operadora', tipoPago: 'Factura' },
  { patron: /Claveria/i, categoria: 'Estructura', tipoPago: 'Factura' },
  
  // Telecomunicaciones (recibos)
  { patron: /Telefonica De Espana/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Telefonica Moviles/i, categoria: 'Operadora', tipoPago: 'Domiciliación' },
  { patron: /Acens.*Telefonica/i, categoria: 'Estructura', tipoPago: 'Domiciliación' },
  
  // Tarjeta - Restaurantes/Comida
  { patron: /Glovo|Uber\s*Eats|Just\s*Eat|Deliveroo/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Restaurant|Restaurante|Pizz|Burger|Kebab|Wok|Sushi|Bar\s|Cafe\s|Cafeteria/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Mcdonalds|Mcdonald|Telepizza|Dominos/i, categoria: 'Dietas', tipoPago: 'Débito' },
  { patron: /Can Gallet|Masia|Forn\s|Flequer/i, categoria: 'Dietas', tipoPago: 'Débito' },
  
  // Tarjeta - Gasolina/Desplazamientos
  { patron: /Benzinera|Gasolinera|Repsol|Cepsa|Shell|Bp\s|Bonarea.*Gasoil|Estacion Servicio/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /Renfe|Alsa|Blabla|Parking|Peaje|Autopista|Toll/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  { patron: /E\.s\.\s|Gasoil|Diesel|Carburant/i, categoria: 'Desplazamientos', tipoPago: 'Débito' },
  
  // Tarjeta - Suscripciones tech
  { patron: /Apple\.com|Itunes|Google\s*(Cloud|Storage|Play)|Microsoft|Github|Aws|Amazon\s*Web/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Zoom|Slack|Notion|Figma|Canva|Adobe|Dropbox|Openai/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  { patron: /Nominalia|Ovh|Hetzner|Digitalocean|Cloudflare/i, categoria: 'Estructura', tipoPago: 'Suscripción' },
  
  // Tarjeta - Material oficina/hardware
  { patron: /Amazon\.es|Amazon\.com|Pccomponentes|Mediamarkt/i, categoria: 'Estructura', tipoPago: 'Débito' },
  
  // Préstamos
  { patron: /Venciment Prestec|PRES\.\d+/i, categoria: 'Gastos Financieros', tipoPago: 'Préstamo' },
  
  // Comisiones bancarias
  { patron: /Manteniment|Cobrament Pendent|Gastos Devoluciones/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  { patron: /Targeta Visa|V\.Negocis|Comision/i, categoria: 'Gastos Financieros', tipoPago: 'Comisión' },
  
  // Devoluciones de recibos
  { patron: /Devolucion De Recibo/i, categoria: 'Morosos', tipoPago: 'Devolución' },
  
  // Pagos con tarjeta genéricos
  { patron: /Pago Movil En|Compra\s/i, categoria: 'Otros Gastos', tipoPago: 'Débito' },
  
  // Transferencias de clientes (cobros)
  { patron: /Transferencia (De|Inmediata De)/i, categoria: 'Operadora', tipoPago: 'Transferencia' },
  { patron: /Fra\s*(Cll|Cpl|Cmv|Inst)/i, categoria: 'Operadora', tipoPago: 'Transferencia' },
];

async function main() {
  console.log('=== EJECUTANDO CONCILIACIÓN AUTOMÁTICA ===\n');

  // 1. CLASIFICACIÓN
  console.log('--- 1. Clasificando movimientos ---');
  const sinCategoria = await prisma.movimientoBancario.findMany({
    where: { categoria: null },
    select: { id: true, concepto: true, importe: true },
  });
  console.log(`  ${sinCategoria.length} movimientos sin categorizar`);

  let clasificados = 0;
  for (const mov of sinCategoria) {
    for (const regla of REGLAS_CLASIFICACION) {
      if (regla.patron.test(mov.concepto)) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: { categoria: regla.categoria, tipoPago: regla.tipoPago },
        });
        clasificados++;
        break;
      }
    }
  }
  console.log(`  ${clasificados} clasificados automáticamente`);

  // También aplicar reglas de la BD
  const reglasDB = await prisma.reglaImputacion.findMany({
    where: { activa: true },
    orderBy: { confianza: 'desc' },
  });

  if (reglasDB.length > 0) {
    const aun_sin = await prisma.movimientoBancario.findMany({
      where: { categoria: null },
      select: { id: true, concepto: true },
    });
    let clasificadosDB = 0;
    for (const mov of aun_sin) {
      for (const regla of reglasDB) {
        if (mov.concepto.toLowerCase().includes(regla.patron.toLowerCase())) {
          await prisma.movimientoBancario.update({
            where: { id: mov.id },
            data: { categoria: regla.imputacion, tipoPago: regla.tipoPago },
          });
          clasificadosDB++;
          break;
        }
      }
    }
    console.log(`  ${clasificadosDB} clasificados por reglas de BD`);
  }

  // 2. CONCILIACIÓN CONFIRMING DRAXTON
  console.log('\n--- 2. Conciliando Confirming Draxton ---');
  const ingresosConfirming = await prisma.movimientoBancario.findMany({
    where: {
      conciliado: false,
      importe: { gt: 0 },
      concepto: { contains: 'Draxton', mode: 'insensitive' },
    },
  });
  let conciliadosConfirming = 0;
  for (const mov of ingresosConfirming) {
    await prisma.movimientoBancario.update({
      where: { id: mov.id },
      data: { conciliado: true, categoria: 'Draxton', tipoPago: 'Confirming' },
    });
    conciliadosConfirming++;
  }
  console.log(`  ${conciliadosConfirming} ingresos de confirming conciliados`);

  // 3. CONCILIACIÓN REMESAS (marcar como conciliados)
  console.log('\n--- 3. Conciliando Remesas ---');
  const remesas = await prisma.movimientoBancario.findMany({
    where: {
      conciliado: false,
      importe: { gt: 0 },
      concepto: { contains: 'Remesa', mode: 'insensitive' },
    },
  });
  let conciliadosRemesa = 0;
  for (const mov of remesas) {
    await prisma.movimientoBancario.update({
      where: { id: mov.id },
      data: { conciliado: true, categoria: 'Operadora', tipoPago: 'Remesa' },
    });
    conciliadosRemesa++;
  }
  console.log(`  ${conciliadosRemesa} remesas conciliadas`);

  // 4. CONCILIACIÓN TRASPASOS
  console.log('\n--- 4. Conciliando Traspasos ---');
  const traspasos = await prisma.movimientoBancario.findMany({
    where: {
      conciliado: false,
      categoria: 'Traspaso',
    },
  });
  for (const mov of traspasos) {
    await prisma.movimientoBancario.update({
      where: { id: mov.id },
      data: { conciliado: true },
    });
  }
  console.log(`  ${traspasos.length} traspasos conciliados`);

  // 5. RESUMEN FINAL
  console.log('\n=== RESUMEN FINAL ===');
  const total = await prisma.movimientoBancario.count();
  const conciliados = await prisma.movimientoBancario.count({ where: { conciliado: true } });
  const sinCat = await prisma.movimientoBancario.count({ where: { categoria: null } });
  
  console.log(`  Total movimientos: ${total}`);
  console.log(`  Conciliados: ${conciliados} (${Math.round(conciliados/total*100)}%)`);
  console.log(`  Sin categorizar: ${sinCat}`);
  
  // Mostrar categorías
  const cats = await prisma.$queryRaw`
    SELECT categoria, count(*)::text as total, sum(importe)::text as importe 
    FROM movimientos_bancarios 
    WHERE categoria IS NOT NULL 
    GROUP BY categoria 
    ORDER BY count(*) DESC
  ` as any[];
  console.log('\n  Distribución por categoría:');
  for (const c of cats) {
    console.log(`    ${c.categoria}: ${c.total} mov (${parseFloat(c.importe).toFixed(2)}€)`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
