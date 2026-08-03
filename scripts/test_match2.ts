function normalizeStr(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const empleados = [
  "BENET LOPETEGUI, JOEL",
  "BUSQUETS JOFRE, ESTEVE",
  "GIMENO MARTINEZ, LORENA",
  "MARTINEZ CAYUELAS, ALEJANDRO",
  "PARRA GARCIA, JESUS",
  "PARRA GARCIA, PATRICIA",
  "PEREZ MONTANO, DAVID JAVIER",
  "PEREZ SOLIS, IVAN",
  "POSTAL QUIROZ, GONZALO",
  "TERRES DURO, POL",
];

// Build map like the code does
const empleadoByName = new Map(empleados.map(e => [normalizeStr(e), e]));

// Test: "DAVID PÉREZ" from filename
const employeeName = normalizeStr("DAVID PÉREZ");
console.log("Looking for:", employeeName);
console.log("Direct match:", empleadoByName.get(employeeName));

// Partial match
const nameParts = employeeName.split(/\s+/);
console.log("Name parts:", nameParts);
for (const [key, emp] of empleadoByName) {
  const matches = nameParts.every(part => key.includes(part));
  if (matches) {
    console.log(`MATCH: "${key}" contains all parts → ${emp}`);
  }
}

// But wait - "PEREZ" matches both "PEREZ MONTANO" and "PEREZ SOLIS"!
// And "DAVID" only matches "PEREZ MONTANO, DAVID JAVIER"
// So the combined check should work... let's verify
for (const [key, emp] of empleadoByName) {
  console.log(`  Testing "${key}": DAVID=${key.includes('DAVID')}, PEREZ=${key.includes('PEREZ')}`);
}
