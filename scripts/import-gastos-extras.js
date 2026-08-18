// Script para importar gastos y horas extras desde los datos extraídos de HRLog
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Datos de gastos extraídos de HRLog (35 registros)
const gastosData = [
  { nombre: "Esteve Busquets Jofre", fecha: "2026-08-13", motivo: "Aparcamiento", tipo: "Gastos VISA Empresa", importe: 0.80, estado: "en_tramite", fechaSolicitud: "2026-08-13T11:33:00" },
  { nombre: "David Pérez Montano", fecha: "2026-08-11", motivo: "Otros motivos", tipo: "Gastos VISA Empresa", importe: 63.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-11T15:24:00" },
  { nombre: "Jesús Parra García", fecha: "2026-08-10", motivo: "Desplazamiento", tipo: "Desplazamiento vehículo propio", importe: 52.64, estado: "en_tramite", fechaSolicitud: "2026-08-11T12:46:00" },
  { nombre: "Jesús Parra García", fecha: "2026-08-03", motivo: "Desplazamiento", tipo: "Desplazamiento vehículo propio", importe: 52.64, estado: "en_tramite", fechaSolicitud: "2026-08-11T12:45:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-08-11", motivo: "Combustible (sólo vehículo de empresa)", tipo: "Gastos VISA Empresa", importe: 73.18, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-11T12:19:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-08-11", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.00, estado: "en_tramite", fechaSolicitud: "2026-08-11T09:53:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-08-11", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-11T09:53:00" },
  { nombre: "Jesús Parra García", fecha: "2026-08-10", motivo: "Dietas", tipo: "Dietas", importe: 13.00, estado: "en_tramite", fechaSolicitud: "2026-08-10T14:29:00" },
  { nombre: "David Pérez Montano", fecha: "2026-08-07", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 7.80, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-07T10:13:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-08-04", motivo: "Combustible (sólo vehículo de empresa)", tipo: "Gastos VISA Empresa", importe: 97.08, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-04T17:05:00" },
  { nombre: "Jesús Parra García", fecha: "2026-08-03", motivo: "Dietas", tipo: "Dietas", importe: 41.20, estado: "en_tramite", fechaSolicitud: "2026-08-03T15:42:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-30", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 0.80, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-30T12:50:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-30", motivo: "Dietas", tipo: "Dietas", importe: 2.80, estado: "en_tramite", fechaSolicitud: "2026-07-30T11:56:00" },
  { nombre: "David Pérez Montano", fecha: "2026-07-29", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 1.80, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-29T10:57:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-27", motivo: "Dietas", tipo: "Dietas", importe: 3.30, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-27T10:07:00" },
  { nombre: "David Pérez Montano", fecha: "2026-07-21", motivo: "Dietas", tipo: "Otros", importe: 3.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-21T15:31:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-21", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 24.50, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-21T14:09:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-21", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 17.60, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-21T08:08:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-13", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-13T07:28:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-13", motivo: "Combustible (sólo vehículo de empresa)", tipo: "Gastos VISA Empresa", importe: 83.03, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-13T05:13:00" },
  { nombre: "David Pérez Montano", fecha: "2026-07-13", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.10, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-13T05:11:00" },
  { nombre: "David Pérez Montano", fecha: "2026-07-06", motivo: "Dietas", tipo: "Dietas", importe: 35.30, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-11T13:45:00" },
  { nombre: "David Pérez Montano", fecha: "2026-07-06", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 12.50, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-11T13:44:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-09", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-09T07:03:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-07", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.30, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-07-07T07:53:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-07-03", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.30, estado: "en_tramite", fechaSolicitud: "2026-07-03T07:36:00" },
  { nombre: "Jesús Parra García", fecha: "2026-06-23", motivo: "Dietas", tipo: "Dietas", importe: 13.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-06-26T13:06:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-06-26", motivo: "Combustible (sólo vehículo de empresa)", tipo: "Gastos VISA Empresa", importe: 81.87, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-06-26T08:38:00" },
  { nombre: "Jesús Parra García", fecha: "2026-06-23", motivo: "Desplazamiento", tipo: "Desplazamiento vehículo propio", importe: 59.92, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-06-25T15:56:00" },
  { nombre: "Esteve Busquets Jofre", fecha: "2026-06-16", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 3.10, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-06-16T22:06:00" },
  { nombre: "Alejandro Martínez Cayuelas", fecha: "2026-06-08", motivo: "Desplazamiento", tipo: "Desplazamiento vehículo propio", importe: 16.24, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-06-09T12:08:00" },
  { nombre: "Patricia Parra García", fecha: "2026-05-15", motivo: "Otros motivos", tipo: "Otros", importe: 57.00, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-05-21T11:54:00" },
  { nombre: "David Pérez Montano", fecha: "2026-05-14", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 27.80, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-05-14T14:39:00" },
  { nombre: "David Pérez Montano", fecha: "2026-05-12", motivo: "Dietas", tipo: "Gastos VISA Empresa", importe: 53.80, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-05-14T14:38:00" },
  { nombre: "David Pérez Montano", fecha: "2026-05-05", motivo: "Aparcamiento", tipo: "Gastos VISA Empresa", importe: 0.65, estado: "aprobado", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-05-05T15:30:00" },
];

// Datos de horas extras extraídos de HRLog (del pantallazo)
const extrasData = [
  { nombre: "Alejandro Martínez Cayuelas", inicio: "2026-08-12T16:50:00", fin: "2026-08-12T17:14:00", totalMinutos: 24, estado: "en_tramite", fechaSolicitud: "2026-08-12T17:14:00" },
  { nombre: "Esteve Busquets Jofre", inicio: "2026-08-11T16:03:00", fin: "2026-08-11T18:05:00", totalMinutos: 122, estado: "en_tramite", fechaSolicitud: "2026-08-11T18:05:00" },
  { nombre: "Patricia Parra García", inicio: "2026-08-11T16:27:00", fin: "2026-08-11T17:07:00", totalMinutos: 40, estado: "en_tramite", fechaSolicitud: "2026-08-11T17:07:00" },
  { nombre: "Esteve Busquets Jofre", inicio: "2026-08-11T14:00:00", fin: "2026-08-11T14:23:00", totalMinutos: 23, estado: "en_tramite", fechaSolicitud: "2026-08-11T14:23:00" },
  { nombre: "Esteve Busquets Jofre", inicio: "2026-08-10T17:54:00", fin: "2026-08-10T18:20:00", totalMinutos: 26, estado: "en_tramite", fechaSolicitud: "2026-08-10T18:20:00" },
  { nombre: "Jesús Parra García", inicio: "2026-08-10T17:16:00", fin: "2026-08-10T17:22:00", totalMinutos: 6, estado: "en_tramite", fechaSolicitud: "2026-08-10T17:22:00" },
  { nombre: "Patricia Parra García", inicio: "2026-08-10T16:28:00", fin: "2026-08-10T17:02:00", totalMinutos: 34, estado: "denegada", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-10T17:02:00" },
  { nombre: "Patricia Parra García", inicio: "2026-08-06T15:06:00", fin: "2026-08-06T15:22:00", totalMinutos: 16, estado: "en_tramite", fechaSolicitud: "2026-08-06T15:22:00" },
  { nombre: "Jesús Parra García", inicio: "2026-08-06T15:06:00", fin: "2026-08-06T15:21:00", totalMinutos: 15, estado: "en_tramite", fechaSolicitud: "2026-08-06T15:21:00" },
  { nombre: "Jesús Parra García", inicio: "2026-08-04T15:04:00", fin: "2026-08-04T15:19:00", totalMinutos: 15, estado: "aprobada", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-04T15:19:00" },
  { nombre: "Patricia Parra García", inicio: "2026-08-04T15:06:00", fin: "2026-08-04T15:17:00", totalMinutos: 11, estado: "aprobada", gestionadoPor: "Lorena Gimeno Martínez", fechaSolicitud: "2026-08-04T15:17:00" },
];

// Mapeo de nombres HRLog a NIF de empleados
const nombreToNif = {
  "Esteve Busquets Jofre": "78090248G",
  "David Pérez Montano": "43747194K",
  "Jesús Parra García": "53147813B",
  "Patricia Parra García": "43724870F",
  "Alejandro Martínez Cayuelas": "26071099R",
  "Lorena Gimeno Martínez": "53672064T",
};

async function main() {
  // Obtener empleados por NIF
  const empleados = await prisma.empleado.findMany({
    select: { id: true, nif: true, nombreCompleto: true }
  });
  const nifToId = {};
  empleados.forEach(e => { nifToId[e.nif] = e.id; });
  
  console.log('Empleados encontrados:', empleados.length);
  
  // Importar gastos
  let gastosCreados = 0;
  for (const g of gastosData) {
    const nif = nombreToNif[g.nombre];
    const empleadoId = nif ? nifToId[nif] : null;
    if (!empleadoId) {
      console.log(`  SKIP gasto: empleado no encontrado: ${g.nombre}`);
      continue;
    }
    // Generar hrlogId unico basado en nombre+fecha+importe
    const hrlogId = `gasto-${g.nombre.replace(/\s/g,'_')}-${g.fecha}-${g.importe}`;
    try {
      await prisma.gastoEmpleado.upsert({
        where: { hrlogId },
        update: { estado: g.estado, gestionadoPor: g.gestionadoPor || null },
        create: {
          empleadoId,
          hrlogId,
          nombre: g.nombre,
          fecha: new Date(g.fecha),
          motivo: g.motivo,
          tipo: g.tipo,
          importe: g.importe,
          estado: g.estado,
          gestionadoPor: g.gestionadoPor || null,
          fechaSolicitud: g.fechaSolicitud ? new Date(g.fechaSolicitud) : null,
        }
      });
      gastosCreados++;
    } catch (e) {
      console.log(`  ERROR gasto: ${g.nombre} ${g.fecha}: ${e.message}`);
    }
  }
  console.log(`Gastos importados: ${gastosCreados}`);
  
  // Importar horas extras
  let extrasCreados = 0;
  for (const h of extrasData) {
    const nif = nombreToNif[h.nombre];
    const empleadoId = nif ? nifToId[nif] : null;
    if (!empleadoId) {
      console.log(`  SKIP extra: empleado no encontrado: ${h.nombre}`);
      continue;
    }
    const hrlogId = `extra-${h.nombre.replace(/\s/g,'_')}-${h.inicio}`;
    try {
      await prisma.horaExtraEmpleado.upsert({
        where: { hrlogId },
        update: { estado: h.estado, gestionadoPor: h.gestionadoPor || null },
        create: {
          empleadoId,
          hrlogId,
          nombre: h.nombre,
          inicio: new Date(h.inicio),
          fin: new Date(h.fin),
          totalMinutos: h.totalMinutos,
          estado: h.estado,
          gestionadoPor: h.gestionadoPor || null,
          fechaSolicitud: h.fechaSolicitud ? new Date(h.fechaSolicitud) : null,
        }
      });
      extrasCreados++;
    } catch (e) {
      console.log(`  ERROR extra: ${h.nombre} ${h.inicio}: ${e.message}`);
    }
  }
  console.log(`Horas extras importadas: ${extrasCreados}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
