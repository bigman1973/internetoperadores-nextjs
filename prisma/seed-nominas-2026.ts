/**
 * Seed script to insert nóminas from January to April 2026
 * (May 2026 already exists in the database)
 * 
 * Data extracted from COSTES IO PDFs downloaded from SharePoint
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Mapping from PDF names to DB codigoNomina
const EMPLOYEE_CODES: Record<string, string> = {
  'PEREZ SOLIS, IVAN': '000004',
  'POSTAL QUIROZ, GONZALO': '000005',
  'TERRES DURO, POL': '000006',
  'PARRA GARCIA, JESUS': '000008',
  'MARTINEZ CAYUELAS, ALEJANDRO': '000010',
  'BUSQUETS JOFRE, ESTEVE': '000012',
  'PARRA GARCIA, PATRICIA': '000013',
  'BENET LOPETEGUI, JOEL': '000014',
  'GIMENO MARTINEZ, LORENA': '000015',
}

interface NominaData {
  codigoNomina: string
  mes: number
  anio: number
  devengadoTotal: number
  netoPercibir: number
  irpf: number
  ssTrabajador: number
  ssEmpresa: number
  baseIrpf: number
  costeTotalEmpresa: number
  complementoEspecie: number
}

// Data extracted from PDFs (all verified: Bruto = Neto + IRPF + SS_Trab ✓)
const nominasData: NominaData[] = [
  // ============ ENERO 2026 ============
  { codigoNomina: '000004', mes: 1, anio: 2026, devengadoTotal: 1389.15, netoPercibir: 1270.38, irpf: 28.48, ssTrabajador: 90.29, ssEmpresa: 536.90, baseIrpf: 1389.15, costeTotalEmpresa: 1926.05, complementoEspecie: 0 },
  { codigoNomina: '000005', mes: 1, anio: 2026, devengadoTotal: 1458.34, netoPercibir: 1305.36, irpf: 58.19, ssTrabajador: 94.79, ssEmpresa: 563.66, baseIrpf: 1458.34, costeTotalEmpresa: 2021.99, complementoEspecie: 0 },
  { codigoNomina: '000006', mes: 1, anio: 2026, devengadoTotal: 1951.39, netoPercibir: 1681.84, irpf: 162.91, ssTrabajador: 106.64, ssEmpresa: 634.07, baseIrpf: 1640.58, costeTotalEmpresa: 2585.46, complementoEspecie: 334.72 },
  { codigoNomina: '000008', mes: 1, anio: 2026, devengadoTotal: 2001.77, netoPercibir: 1657.61, irpf: 224.21, ssTrabajador: 119.95, ssEmpresa: 713.24, baseIrpf: 1845.36, costeTotalEmpresa: 2715.01, complementoEspecie: 168.44 },
  { codigoNomina: '000010', mes: 1, anio: 2026, devengadoTotal: 2731.22, netoPercibir: 2207.39, irpf: 370.32, ssTrabajador: 153.51, ssEmpresa: 912.81, baseIrpf: 2361.75, costeTotalEmpresa: 3644.03, complementoEspecie: 397.89 },
  { codigoNomina: '000012', mes: 1, anio: 2026, devengadoTotal: 3430.77, netoPercibir: 2641.06, irpf: 582.64, ssTrabajador: 207.07, ssEmpresa: 1231.21, baseIrpf: 3185.54, costeTotalEmpresa: 4661.98, complementoEspecie: 264.10 },
  { codigoNomina: '000013', mes: 1, anio: 2026, devengadoTotal: 1381.34, netoPercibir: 1263.24, irpf: 27.63, ssTrabajador: 90.47, ssEmpresa: 551.15, baseIrpf: 1381.34, costeTotalEmpresa: 1932.49, complementoEspecie: 0 },
  { codigoNomina: '000014', mes: 1, anio: 2026, devengadoTotal: 3470.06, netoPercibir: 2605.20, irpf: 647.56, ssTrabajador: 217.30, ssEmpresa: 1292.11, baseIrpf: 3343.11, costeTotalEmpresa: 4762.17, complementoEspecie: 136.72 },
  { codigoNomina: '000015', mes: 1, anio: 2026, devengadoTotal: 888.89, netoPercibir: 773.87, irpf: 57.24, ssTrabajador: 57.78, ssEmpresa: 343.56, baseIrpf: 888.89, costeTotalEmpresa: 1232.45, complementoEspecie: 0 },

  // ============ FEBRERO 2026 ============
  { codigoNomina: '000004', mes: 2, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1288.32, irpf: 43.59, ssTrabajador: 92.59, ssEmpresa: 550.57, baseIrpf: 1424.50, costeTotalEmpresa: 1975.07, complementoEspecie: 0 },
  { codigoNomina: '000005', mes: 2, anio: 2026, devengadoTotal: 1458.34, netoPercibir: 1305.36, irpf: 58.19, ssTrabajador: 94.79, ssEmpresa: 563.66, baseIrpf: 1458.34, costeTotalEmpresa: 2022.00, complementoEspecie: 0 },
  { codigoNomina: '000006', mes: 2, anio: 2026, devengadoTotal: 1920.22, netoPercibir: 1651.04, irpf: 162.69, ssTrabajador: 106.49, ssEmpresa: 633.23, baseIrpf: 1638.35, costeTotalEmpresa: 2553.45, complementoEspecie: 303.55 },
  { codigoNomina: '000008', mes: 2, anio: 2026, devengadoTotal: 2065.23, netoPercibir: 1720.23, irpf: 224.76, ssTrabajador: 120.24, ssEmpresa: 714.99, baseIrpf: 1849.90, costeTotalEmpresa: 2780.22, complementoEspecie: 231.90 },
  { codigoNomina: '000010', mes: 2, anio: 2026, devengadoTotal: 2883.84, netoPercibir: 2357.59, irpf: 372.03, ssTrabajador: 154.22, ssEmpresa: 917.03, baseIrpf: 2372.65, costeTotalEmpresa: 3800.87, complementoEspecie: 550.51 },
  { codigoNomina: '000012', mes: 2, anio: 2026, devengadoTotal: 3455.36, netoPercibir: 2665.55, irpf: 582.64, ssTrabajador: 207.17, ssEmpresa: 1231.88, baseIrpf: 3187.29, costeTotalEmpresa: 4687.24, complementoEspecie: 288.69 },
  { codigoNomina: '000013', mes: 2, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1302.71, irpf: 28.49, ssTrabajador: 93.30, ssEmpresa: 568.37, baseIrpf: 1424.50, costeTotalEmpresa: 1992.87, complementoEspecie: 0 },
  { codigoNomina: '000014', mes: 2, anio: 2026, devengadoTotal: 3333.34, netoPercibir: 2471.00, irpf: 645.67, ssTrabajador: 216.67, ssEmpresa: 1288.34, baseIrpf: 3333.34, costeTotalEmpresa: 4621.68, complementoEspecie: 0 },
  { codigoNomina: '000015', mes: 2, anio: 2026, devengadoTotal: 1666.67, netoPercibir: 1451.01, irpf: 107.33, ssTrabajador: 108.33, ssEmpresa: 644.17, baseIrpf: 1666.67, costeTotalEmpresa: 2310.84, complementoEspecie: 0 },

  // ============ MARZO 2026 ============
  { codigoNomina: '000004', mes: 3, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1288.32, irpf: 43.59, ssTrabajador: 92.59, ssEmpresa: 550.57, baseIrpf: 1424.50, costeTotalEmpresa: 1975.07, complementoEspecie: 0 },
  { codigoNomina: '000005', mes: 3, anio: 2026, devengadoTotal: 1458.34, netoPercibir: 1305.36, irpf: 58.19, ssTrabajador: 94.79, ssEmpresa: 563.66, baseIrpf: 1458.34, costeTotalEmpresa: 2022.00, complementoEspecie: 0 },
  { codigoNomina: '000006', mes: 3, anio: 2026, devengadoTotal: 1920.22, netoPercibir: 1651.04, irpf: 162.69, ssTrabajador: 106.49, ssEmpresa: 633.23, baseIrpf: 1638.35, costeTotalEmpresa: 2553.45, complementoEspecie: 303.55 },
  { codigoNomina: '000008', mes: 3, anio: 2026, devengadoTotal: 1985.35, netoPercibir: 1641.41, irpf: 224.07, ssTrabajador: 119.87, ssEmpresa: 712.79, baseIrpf: 1844.19, costeTotalEmpresa: 2698.14, complementoEspecie: 152.02 },
  { codigoNomina: '000010', mes: 3, anio: 2026, devengadoTotal: 2716.18, netoPercibir: 2192.59, irpf: 370.15, ssTrabajador: 153.44, ssEmpresa: 912.40, baseIrpf: 2360.68, costeTotalEmpresa: 3628.58, complementoEspecie: 382.85 },
  { codigoNomina: '000012', mes: 3, anio: 2026, devengadoTotal: 3415.86, netoPercibir: 2626.75, irpf: 582.12, ssTrabajador: 206.99, ssEmpresa: 1230.81, baseIrpf: 3184.47, costeTotalEmpresa: 4646.67, complementoEspecie: 249.19 },
  { codigoNomina: '000013', mes: 3, anio: 2026, devengadoTotal: 1459.22, netoPercibir: 1337.21, irpf: 28.54, ssTrabajador: 93.47, ssEmpresa: 569.37, baseIrpf: 1426.98, costeTotalEmpresa: 2028.59, complementoEspecie: 34.72 },
  { codigoNomina: '000014', mes: 3, anio: 2026, devengadoTotal: 3373.02, netoPercibir: 2509.95, irpf: 646.22, ssTrabajador: 216.85, ssEmpresa: 1289.43, baseIrpf: 3336.18, costeTotalEmpresa: 4662.45, complementoEspecie: 39.68 },
  { codigoNomina: '000015', mes: 3, anio: 2026, devengadoTotal: 1666.67, netoPercibir: 1451.01, irpf: 107.33, ssTrabajador: 108.33, ssEmpresa: 644.17, baseIrpf: 1666.67, costeTotalEmpresa: 2310.84, complementoEspecie: 0 },

  // ============ ABRIL 2026 ============
  { codigoNomina: '000004', mes: 4, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1288.32, irpf: 43.59, ssTrabajador: 92.59, ssEmpresa: 550.57, baseIrpf: 1424.50, costeTotalEmpresa: 1975.07, complementoEspecie: 0 },
  { codigoNomina: '000005', mes: 4, anio: 2026, devengadoTotal: 1458.34, netoPercibir: 1305.36, irpf: 58.19, ssTrabajador: 94.79, ssEmpresa: 563.66, baseIrpf: 1458.34, costeTotalEmpresa: 2022.00, complementoEspecie: 0 },
  { codigoNomina: '000006', mes: 4, anio: 2026, devengadoTotal: 1773.50, netoPercibir: 1506.04, irpf: 161.65, ssTrabajador: 105.81, ssEmpresa: 629.18, baseIrpf: 1627.87, costeTotalEmpresa: 2402.68, complementoEspecie: 156.83 },
  { codigoNomina: '000008', mes: 4, anio: 2026, devengadoTotal: 2267.35, netoPercibir: 1919.47, irpf: 226.70, ssTrabajador: 121.18, ssEmpresa: 720.57, baseIrpf: 1864.33, costeTotalEmpresa: 2987.92, complementoEspecie: 434.02 },
  { codigoNomina: '000010', mes: 4, anio: 2026, devengadoTotal: 2835.67, netoPercibir: 2310.19, irpf: 371.49, ssTrabajador: 153.99, ssEmpresa: 915.69, baseIrpf: 2369.21, costeTotalEmpresa: 3751.36, complementoEspecie: 502.34 },
  { codigoNomina: '000012', mes: 4, anio: 2026, devengadoTotal: 3399.35, netoPercibir: 2610.54, irpf: 581.91, ssTrabajador: 206.90, ssEmpresa: 1230.34, baseIrpf: 3183.29, costeTotalEmpresa: 4629.69, complementoEspecie: 232.68 },
  { codigoNomina: '000013', mes: 4, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1331.91, irpf: 0, ssTrabajador: 92.59, ssEmpresa: 550.57, baseIrpf: 1424.50, costeTotalEmpresa: 1975.07, complementoEspecie: 0 },
  { codigoNomina: '000014', mes: 4, anio: 2026, devengadoTotal: 3427.70, netoPercibir: 2563.63, irpf: 646.97, ssTrabajador: 217.10, ssEmpresa: 1290.94, baseIrpf: 3340.08, costeTotalEmpresa: 4718.64, complementoEspecie: 94.36 },
  { codigoNomina: '000015', mes: 4, anio: 2026, devengadoTotal: 1666.67, netoPercibir: 1451.01, irpf: 107.33, ssTrabajador: 108.33, ssEmpresa: 644.17, baseIrpf: 1666.67, costeTotalEmpresa: 2310.84, complementoEspecie: 0 },

  // ============ MAYO 2026 ============
  { codigoNomina: '000004', mes: 5, anio: 2026, devengadoTotal: 1424.50, netoPercibir: 1288.32, irpf: 43.59, ssTrabajador: 92.59, ssEmpresa: 550.57, baseIrpf: 1424.50, costeTotalEmpresa: 1975.07, complementoEspecie: 0 },
  { codigoNomina: '000005', mes: 5, anio: 2026, devengadoTotal: 1458.34, netoPercibir: 1305.36, irpf: 58.19, ssTrabajador: 94.79, ssEmpresa: 563.66, baseIrpf: 1458.34, costeTotalEmpresa: 2022.00, complementoEspecie: 0 },
  { codigoNomina: '000006', mes: 5, anio: 2026, devengadoTotal: 2071.99, netoPercibir: 1801.04, irpf: 163.76, ssTrabajador: 107.19, ssEmpresa: 637.40, baseIrpf: 1649.19, costeTotalEmpresa: 2709.39, complementoEspecie: 455.32 },
  { codigoNomina: '000008', mes: 5, anio: 2026, devengadoTotal: 1985.35, netoPercibir: 1641.23, irpf: 224.25, ssTrabajador: 119.87, ssEmpresa: 712.79, baseIrpf: 1844.19, costeTotalEmpresa: 2698.14, complementoEspecie: 152.02 },
  { codigoNomina: '000010', mes: 5, anio: 2026, devengadoTotal: 2596.70, netoPercibir: 2074.99, irpf: 368.82, ssTrabajador: 152.89, ssEmpresa: 909.10, baseIrpf: 2352.14, costeTotalEmpresa: 3505.80, complementoEspecie: 263.37 },
  { codigoNomina: '000012', mes: 5, anio: 2026, devengadoTotal: 3462.96, netoPercibir: 2673.01, irpf: 582.74, ssTrabajador: 207.21, ssEmpresa: 1232.09, baseIrpf: 3187.83, costeTotalEmpresa: 4695.05, complementoEspecie: 296.29 },
  { codigoNomina: '000013', mes: 5, anio: 2026, devengadoTotal: 1481.76, netoPercibir: 1388.91, irpf: 0, ssTrabajador: 92.85, ssEmpresa: 552.16, baseIrpf: 1428.59, costeTotalEmpresa: 2033.92, complementoEspecie: 57.26 },
  { codigoNomina: '000014', mes: 5, anio: 2026, devengadoTotal: 3521.79, netoPercibir: 2655.96, irpf: 648.28, ssTrabajador: 217.55, ssEmpresa: 1293.53, baseIrpf: 3346.80, costeTotalEmpresa: 4815.32, complementoEspecie: 188.45 },
  { codigoNomina: '000015', mes: 5, anio: 2026, devengadoTotal: 1666.67, netoPercibir: 1451.01, irpf: 107.33, ssTrabajador: 108.33, ssEmpresa: 644.17, baseIrpf: 1666.67, costeTotalEmpresa: 2310.84, complementoEspecie: 0 },
]

async function main() {
  console.log('🔄 Iniciando carga de nóminas enero-mayo 2026...')
  
  // First, delete existing nóminas for these months to avoid duplicates
  const deleted = await prisma.nomina.deleteMany({
    where: {
      anio: 2026,
      mes: { in: [1, 2, 3, 4, 5] }
    }
  })
  console.log(`🗑️  Eliminadas ${deleted.count} nóminas existentes (meses 1-5 de 2026)`)
  
  // Get all employees by codigoNomina
  const empleados = await prisma.empleado.findMany()
  const empleadoMap = new Map(empleados.map(e => [e.codigoNomina, e.id]))
  
  console.log(`👥 Empleados en BD: ${empleados.length}`)
  for (const e of empleados) {
    console.log(`   ${e.codigoNomina} - ${e.nombreCompleto}`)
  }
  
  let inserted = 0
  let errors = 0
  
  for (const nomina of nominasData) {
    const empleadoId = empleadoMap.get(nomina.codigoNomina)
    if (!empleadoId) {
      console.error(`❌ Empleado no encontrado: ${nomina.codigoNomina}`)
      errors++
      continue
    }
    
    await prisma.nomina.create({
      data: {
        empleadoId,
        mes: nomina.mes,
        anio: nomina.anio,
        devengadoTotal: nomina.devengadoTotal,
        netoPercibir: nomina.netoPercibir,
        irpf: nomina.irpf,
        ssTrabajador: nomina.ssTrabajador,
        ssEmpresa: nomina.ssEmpresa,
        baseIrpf: nomina.baseIrpf,
        costeTotalEmpresa: nomina.costeTotalEmpresa,
        complementoEspecie: nomina.complementoEspecie > 0 ? nomina.complementoEspecie : null,
      }
    })
    inserted++
  }
  
  console.log(`\n✅ Insertadas ${inserted} nóminas`)
  if (errors > 0) console.log(`⚠️  ${errors} errores`)
  
  // Verify totals
  const totals = await prisma.nomina.groupBy({
    by: ['mes'],
    where: { anio: 2026 },
    _sum: {
      devengadoTotal: true,
      netoPercibir: true,
      irpf: true,
      ssTrabajador: true,
      ssEmpresa: true,
      costeTotalEmpresa: true,
    },
    _count: true,
  })
  
  console.log('\n📊 Resumen por mes:')
  console.log('Mes | Empleados | Bruto Total | Neto Total | IRPF | SS Trab | SS Emp | Coste Total')
  console.log('-'.repeat(100))
  for (const t of totals.sort((a, b) => a.mes - b.mes)) {
    console.log(`${t.mes.toString().padStart(3)} | ${t._count.toString().padStart(9)} | ${t._sum.devengadoTotal?.toFixed(2).padStart(11)} | ${t._sum.netoPercibir?.toFixed(2).padStart(10)} | ${t._sum.irpf?.toFixed(2).padStart(8)} | ${t._sum.ssTrabajador?.toFixed(2).padStart(7)} | ${t._sum.ssEmpresa?.toFixed(2).padStart(8)} | ${t._sum.costeTotalEmpresa?.toFixed(2).padStart(11)}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
