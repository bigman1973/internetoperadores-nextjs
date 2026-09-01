export interface ProyectoAsignacionFinanciera {
  empleadoId: string;
  horasEstimadas: number | null;
  costeHora: number | null;
  costeHoraEmpleado?: number | null;
  activa?: boolean;
}

export interface ProyectoImputacionFinanciera {
  empleadoId: string;
  horas: number;
  costeImputado: number | null;
}

export interface ProyectoFinanzasInput {
  importeVenta: number;
  costeProveedores: number;
  otrosCostes: number;
  asignaciones: ProyectoAsignacionFinanciera[];
  imputaciones: ProyectoImputacionFinanciera[];
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundHours = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calcularFinanzasProyecto(input: ProyectoFinanzasInput) {
  const importeVenta = Number(input.importeVenta || 0);
  const costeProveedores = Number(input.costeProveedores || 0);
  const otrosCostes = Number(input.otrosCostes || 0);

  const horasImputadasPorEmpleado = input.imputaciones.reduce<Record<string, number>>((acc, imputacion) => {
    acc[imputacion.empleadoId] = (acc[imputacion.empleadoId] || 0) + Number(imputacion.horas || 0);
    return acc;
  }, {});

  const costeRecursosRealRaw = input.imputaciones.reduce(
    (sum, imputacion) => sum + Number(imputacion.costeImputado || 0),
    0,
  );

  const costeRecursosPendienteRaw = input.asignaciones
    .filter((asignacion) => asignacion.activa !== false)
    .reduce((sum, asignacion) => {
      const horasEstimadas = Number(asignacion.horasEstimadas || 0);
      const horasImputadas = Number(horasImputadasPorEmpleado[asignacion.empleadoId] || 0);
      const horasPendientes = Math.max(0, horasEstimadas - horasImputadas);
      const costeHora = Number(asignacion.costeHora ?? asignacion.costeHoraEmpleado ?? 0);
      return sum + (horasPendientes * costeHora);
    }, 0);

  const horasImputadas = input.imputaciones.reduce(
    (sum, imputacion) => sum + Number(imputacion.horas || 0),
    0,
  );
  const horasEstimadas = input.asignaciones
    .filter((asignacion) => asignacion.activa !== false)
    .reduce((sum, asignacion) => sum + Number(asignacion.horasEstimadas || 0), 0);
  const horasPendientes = input.asignaciones
    .filter((asignacion) => asignacion.activa !== false)
    .reduce((sum, asignacion) => {
      const estimadas = Number(asignacion.horasEstimadas || 0);
      const imputadas = Number(horasImputadasPorEmpleado[asignacion.empleadoId] || 0);
      return sum + Math.max(0, estimadas - imputadas);
    }, 0);

  // Redondeamos cada componente monetario antes de formar los totales para que
  // venta - costes = margen cuadre siempre al céntimo en la interfaz.
  const costeRecursosReal = roundMoney(costeRecursosRealRaw);
  const costeRecursosPendiente = roundMoney(costeRecursosPendienteRaw);
  const costeRecursosPrevisto = roundMoney(costeRecursosReal + costeRecursosPendiente);
  const costeTotalReal = roundMoney(costeProveedores + otrosCostes + costeRecursosReal);
  const costeTotalPrevisto = roundMoney(costeProveedores + otrosCostes + costeRecursosPrevisto);
  const margenRealBruto = roundMoney(importeVenta - costeTotalReal);
  const margenPrevistoBruto = roundMoney(importeVenta - costeTotalPrevisto);

  return {
    horasImputadas: roundHours(horasImputadas),
    horasEstimadas: roundHours(horasEstimadas),
    horasPendientes: roundHours(horasPendientes),
    costeRecursosReal,
    costeRecursosPendiente,
    costeRecursosPrevisto,
    costeTotalReal,
    costeTotalPrevisto,
    margenRealBruto,
    margenRealPct: importeVenta > 0 ? Math.round((margenRealBruto / importeVenta) * 1000) / 10 : 0,
    margenPrevistoBruto,
    margenPrevistoPct: importeVenta > 0 ? Math.round((margenPrevistoBruto / importeVenta) * 1000) / 10 : 0,
  };
}
