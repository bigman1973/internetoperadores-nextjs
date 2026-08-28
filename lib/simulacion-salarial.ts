export interface MuestraNominaSimulacion {
  anio: number;
  mes: number;
  devengadoTotal: number;
  baseSS: number | null;
  ssEmpresa: number | null;
  gastosDesplazamiento: number | null;
}

export interface EntradaSimulacionSalarial {
  brutoAnualActual: number;
  brutoAnualPropuesto: number;
  fechaEfectiva: string;
  nominas: MuestraNominaSimulacion[];
}

export interface ResultadoSimulacionSalarial {
  actual: {
    brutoAnual: number;
    brutoMensual: number;
    costeEmpresaAnual: number;
    costeEmpresaMensual: number;
  };
  propuesta: {
    brutoAnual: number;
    brutoMensual: number;
    costeEmpresaAnual: number;
    costeEmpresaMensual: number;
  };
  incremento: {
    brutoAnual: number;
    brutoMensual: number;
    porcentaje: number;
    costeEmpresaAnual: number;
    costeEmpresaMensual: number;
  };
  impactoEjercicio: {
    anio: number;
    mesesComputados: number;
    incrementoBruto: number;
    incrementoCosteEmpresa: number;
  };
  baseCalculo: {
    tasaSSEmpresa: number;
    tasaSSEmpresaPct: number;
    nominasUtilizadas: number;
    advertencia: string | null;
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEffectiveCompanyRate(nominas: MuestraNominaSimulacion[]) {
  const valid = nominas.filter(nomina => {
    const base = nomina.baseSS ?? Math.max(0, nomina.devengadoTotal - (nomina.gastosDesplazamiento || 0));
    return base > 0 && nomina.ssEmpresa !== null && nomina.ssEmpresa >= 0;
  });

  const totalBase = valid.reduce((sum, nomina) => sum + (nomina.baseSS ?? Math.max(0, nomina.devengadoTotal - (nomina.gastosDesplazamiento || 0))), 0);
  const totalSS = valid.reduce((sum, nomina) => sum + (nomina.ssEmpresa || 0), 0);
  const rawRate = totalBase > 0 ? totalSS / totalBase : 0;

  return {
    rate: Math.min(0.6, Math.max(0, rawRate)),
    samples: valid.length,
  };
}

export function calculateSalarySimulation(input: EntradaSimulacionSalarial): ResultadoSimulacionSalarial {
  if (!Number.isFinite(input.brutoAnualActual) || input.brutoAnualActual <= 0) {
    throw new Error('No existe un salario bruto anual actual válido para comparar.');
  }
  if (!Number.isFinite(input.brutoAnualPropuesto) || input.brutoAnualPropuesto <= 0) {
    throw new Error('El bruto anual propuesto debe ser superior a cero.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaEfectiva)) {
    throw new Error('La fecha efectiva no es válida.');
  }

  const effectiveDate = new Date(`${input.fechaEfectiva}T00:00:00.000Z`);
  if (Number.isNaN(effectiveDate.getTime())) throw new Error('La fecha efectiva no es válida.');

  const rateData = calculateEffectiveCompanyRate(input.nominas);
  const currentAnnualCompanyCost = input.brutoAnualActual * (1 + rateData.rate);
  const proposedAnnualCompanyCost = input.brutoAnualPropuesto * (1 + rateData.rate);
  const grossAnnualIncrease = input.brutoAnualPropuesto - input.brutoAnualActual;
  const companyAnnualIncrease = proposedAnnualCompanyCost - currentAnnualCompanyCost;
  const monthsInYear = 12 - effectiveDate.getUTCMonth();

  return {
    actual: {
      brutoAnual: roundMoney(input.brutoAnualActual),
      brutoMensual: roundMoney(input.brutoAnualActual / 12),
      costeEmpresaAnual: roundMoney(currentAnnualCompanyCost),
      costeEmpresaMensual: roundMoney(currentAnnualCompanyCost / 12),
    },
    propuesta: {
      brutoAnual: roundMoney(input.brutoAnualPropuesto),
      brutoMensual: roundMoney(input.brutoAnualPropuesto / 12),
      costeEmpresaAnual: roundMoney(proposedAnnualCompanyCost),
      costeEmpresaMensual: roundMoney(proposedAnnualCompanyCost / 12),
    },
    incremento: {
      brutoAnual: roundMoney(grossAnnualIncrease),
      brutoMensual: roundMoney(grossAnnualIncrease / 12),
      porcentaje: roundPercentage((grossAnnualIncrease / input.brutoAnualActual) * 100),
      costeEmpresaAnual: roundMoney(companyAnnualIncrease),
      costeEmpresaMensual: roundMoney(companyAnnualIncrease / 12),
    },
    impactoEjercicio: {
      anio: effectiveDate.getUTCFullYear(),
      mesesComputados: monthsInYear,
      incrementoBruto: roundMoney((grossAnnualIncrease / 12) * monthsInYear),
      incrementoCosteEmpresa: roundMoney((companyAnnualIncrease / 12) * monthsInYear),
    },
    baseCalculo: {
      tasaSSEmpresa: rateData.rate,
      tasaSSEmpresaPct: roundPercentage(rateData.rate * 100),
      nominasUtilizadas: rateData.samples,
      advertencia: rateData.samples > 0
        ? 'Coste empresa estimado con la tasa efectiva media de Seguridad Social de las últimas nóminas disponibles.'
        : 'No hay cuota empresarial utilizable; el coste empresa estimado coincide con el bruto propuesto.',
    },
  };
}
