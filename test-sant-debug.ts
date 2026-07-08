import * as fs from 'fs';

async function main() {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync('/home/ubuntu/upload/SantanderEmpresas_Junio2026_Comunidad.pdf');
  const data = await pdfParse(buffer);
  const text: string = data.text;

  console.log('=== TEXTO COMPLETO ===');
  console.log(JSON.stringify(text));
  console.log('\n=== SPLIT POR LISTADO ===');
  const bloques = text.split(/Listado\s+de\s+[óo]rdenes\s*\(\d+\)/i);
  for (let i = 0; i < bloques.length; i++) {
    console.log(`\n--- BLOQUE ${i} ---`);
    console.log(JSON.stringify(bloques[i]));
  }

  // Test regex subtotal
  console.log('\n=== BUSCAR SUBTOTAL ===');
  const subtotalRegex = /Subtotal\s+importe:?\s*[\n\s]*([\d.,]+)\s*EUR/gi;
  let m;
  while ((m = subtotalRegex.exec(text)) !== null) {
    console.log(`Found: "${m[0]}" -> value: "${m[1]}"`);
  }

  // Test all EUR amounts
  console.log('\n=== TODOS LOS EUR ===');
  const eurRegex = /([\d.,]+)\s*EUR/g;
  while ((m = eurRegex.exec(text)) !== null) {
    console.log(`"${m[1]}" EUR`);
  }
}

main().catch(console.error);
