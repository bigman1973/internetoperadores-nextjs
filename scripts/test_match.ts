// Test matching logic
function normalizeStr(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// File name: "NÓMINA IO JULIO 2026_DAVID PÉREZ.pdf"
const fileName = "NÓMINA IO JULIO 2026_DAVID PÉREZ.pdf";
const nameMatch = fileName.match(/_([^.]+)\.pdf$/i);
const rawEmployeeName = nameMatch ? nameMatch[1].trim() : '';
const employeeName = normalizeStr(rawEmployeeName);

console.log("Nombre extraído del archivo:", rawEmployeeName);
console.log("Normalizado:", employeeName);

// DB name
const dbName = "PEREZ MONTANO, DAVID JAVIER";
const dbNorm = normalizeStr(dbName);
console.log("Nombre en BD:", dbName);
console.log("Normalizado BD:", dbNorm);

// Test matching strategies
const nameParts = employeeName.split(/\s+/);
console.log("Partes del nombre archivo:", nameParts);
console.log("Todas las partes en BD?", nameParts.every(part => dbNorm.includes(part)));
console.log("BD includes archivo?", dbNorm.includes(employeeName));
console.log("Archivo includes BD?", employeeName.includes(dbNorm));
