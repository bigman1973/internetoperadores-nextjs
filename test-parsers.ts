import { parsearPdfRemesaISP } from './lib/finanzas/parsers/remesa-ispgestion';
import { parsearPdfRemesaSantander } from './lib/finanzas/parsers/remesa-santander';
import * as fs from 'fs';

async function main() {
  console.log('=== TEST PARSER ISPGestión ===');
  const bufferISP = fs.readFileSync('/home/ubuntu/upload/84-JUNIO2026COMUNIDAD.pdf');
  const resultISP = await parsearPdfRemesaISP(bufferISP);
  console.log('Número remesa:', resultISP.numeroRemesa);
  console.log('Fecha remesa:', resultISP.fechaRemesa);
  console.log('Total registros:', resultISP.totalRegistros);
  console.log('Total importe:', resultISP.totalImporte);
  console.log('Recibos encontrados:', resultISP.recibos.length);
  console.log('\nSub-grupos por vencimiento:');
  for (const sg of resultISP.subGrupos) {
    console.log(`  ${sg.fechaVencimiento}: ${sg.numRecibos} recibos, ${sg.importeTotal.toFixed(2)}€`);
  }

  console.log('\n=== TEST PARSER SANTANDER ===');
  const bufferSant = fs.readFileSync('/home/ubuntu/upload/SantanderEmpresas_Junio2026_Comunidad.pdf');
  const resultSant = await parsearPdfRemesaSantander(bufferSant);
  console.log('Importe total:', resultSant.importeTotal);
  console.log('Fecha envío:', resultSant.fechaEnvio);
  console.log('Sub-remesas:', resultSant.subRemesas.length);
  for (const sr of resultSant.subRemesas) {
    console.log(`  Fecha cobro ${sr.fechaCobro}: ${sr.numOrdenes} órdenes, subtotal ${sr.subtotal.toFixed(2)}€`);
  }

  console.log('\n=== VERIFICACIÓN CRUCE ===');
  // Verificar que los sub-grupos ISP coinciden con las sub-remesas Santander
  if (resultISP.subGrupos.length === resultSant.subRemesas.length) {
    console.log('✓ Mismo número de sub-grupos');
    for (let i = 0; i < resultISP.subGrupos.length; i++) {
      const isp = resultISP.subGrupos[i];
      const sant = resultSant.subRemesas[i];
      const fechaOk = isp.fechaVencimiento === sant.fechaCobro;
      const recibosOk = isp.numRecibos === sant.numOrdenes;
      const importeOk = Math.abs(isp.importeTotal - sant.subtotal) < 0.02;
      console.log(`  Grupo ${i + 1}: fecha ${fechaOk ? '✓' : '✗'} (${isp.fechaVencimiento} vs ${sant.fechaCobro}), recibos ${recibosOk ? '✓' : '✗'} (${isp.numRecibos} vs ${sant.numOrdenes}), importe ${importeOk ? '✓' : '✗'} (${isp.importeTotal.toFixed(2)} vs ${sant.subtotal.toFixed(2)})`);
    }
  } else {
    console.log(`✗ Diferente número de sub-grupos: ISP=${resultISP.subGrupos.length} vs Santander=${resultSant.subRemesas.length}`);
  }
}

main().catch(console.error);
