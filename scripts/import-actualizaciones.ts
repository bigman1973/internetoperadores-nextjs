import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Datos históricos de actualizaciones Draxton - Alejandro Martínez
const registros = [
  { fecha: '2023-09-09', horas: 10, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2023-10-09', horas: 2.33, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2023-10-01', horas: 3, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-03-03', horas: 3, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-03-17', horas: 5, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-04-14', horas: 6, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-06-24', horas: 6, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-07-22', horas: 9, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-08-19', horas: 8, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-09-16', horas: 8, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-10-28', horas: 7, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-11-25', horas: 7.5, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2024-12-09', horas: 8, plantas: 'Draxton', desc: 'Actualizaciones Draxton' },
  { fecha: '2025-02-08', horas: 6, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-03-08', horas: 6, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-04-05', horas: 7, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-05-10', horas: 8, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-06-14', horas: 8, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-07-12', horas: 8, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-09-20', horas: 6, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-10-18', horas: 8, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2025-11-15', horas: 9, plantas: 'Lleida, Teruel', desc: 'Actualizaciones Draxton Lleida/Teruel' },
  { fecha: '2026-01-24', horas: 9, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-02-14', horas: 1, plantas: 'Lleida', desc: 'Varias Llamadas Atendidas a Pol, Patricia para asistencia en parada/arranque de servidores Draxton Lleida' },
  { fecha: '2026-02-21', horas: 7, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-03-21', horas: 6, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-04-18', horas: 7, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-05-16', horas: 8, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-06-27', horas: 8, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
  { fecha: '2026-06-25', horas: 8, plantas: 'Teruel, Lleida', desc: 'Parcheos de seguridad DXN Teruel-Lleida' },
]

async function main() {
  console.log(`Importando ${registros.length} registros historicos de actualizaciones...`)
  let importados = 0
  let errores = 0

  for (const r of registros) {
    try {
      await prisma.actualizacionEjecucion.create({
        data: {
          fecha: new Date(r.fecha),
          tecnicoNombre: 'Alejandro Martinez Cayuelas',
          nivelTecnico: 2,
          horasDedicadas: r.horas,
          tipo: 'remoto',
          plantasAfectadas: r.plantas,
          descripcion: r.desc,
          costeHora: null, // Pendiente de definir coste fin de semana
          costeTotal: null,
          totalImputado: 0,
          pendienteImputar: r.horas,
        }
      })
      importados++
    } catch (e: any) {
      console.error(`Error en ${r.fecha}: ${e.message}`)
      errores++
    }
  }

  console.log(`\nResultado: ${importados} importados, ${errores} errores`)
  console.log(`Total horas importadas: ${registros.reduce((s, r) => s + r.horas, 0)}h`)
  await prisma.$disconnect()
}

main()
