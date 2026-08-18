const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const uploadDir = '/home/ubuntu/upload';

const mapping = [
  { titulo: 'Requerimiento presentacion IBE 2023', pattern: 'REQUERIMIENTO' },
  { titulo: 'Recordatorio obligacion presentacion IBE 2024', pattern: 'OBLIGACI' },
  { titulo: 'Resolucion subasignacion Air Networks', pattern: 'RESOLUCI' },
  { titulo: 'Modificacion datos registro operadores', pattern: 'MODIFICACI' },
  { titulo: 'Comunicacion procedimiento revision portas fijas y moviles', pattern: 'COMUNICACI' }
];

(async () => {
  const allFiles = fs.readdirSync(uploadDir);
  for (const m of mapping) {
    const match = allFiles.find(f => f.includes(m.pattern) && f.endsWith('.pdf') && f.includes('CNMC'));
    if (match) {
      const fullPath = path.join(uploadDir, match);
      const buf = fs.readFileSync(fullPath);
      const b64 = 'data:application/pdf;base64,' + buf.toString('base64');
      const doc = await prisma.documentoAAPP.findFirst({ where: { titulo: m.titulo } });
      if (doc) {
        await prisma.documentoAAPP.update({ where: { id: doc.id }, data: { archivoPdf: b64, nombreArchivo: match } });
        console.log('OK:', m.titulo, '->', match, '(' + (buf.length/1024).toFixed(0) + ' KB)');
      } else {
        console.log('DOC NOT FOUND:', m.titulo);
      }
    } else {
      console.log('FILE NOT FOUND for:', m.pattern);
    }
  }
  await prisma.$disconnect();
})();
