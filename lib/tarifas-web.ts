import prisma from './prisma';

export interface TarifaWeb {
  id: number;
  tipoCliente: string;
  categoria: string;
  nombre: string;
  nombreComercial: string | null;
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  velocidad: string | null;
  velocidadBajada: string | null;
  velocidadSubida: string | null;
  fibraBajada: string | null;
  fibraSubida: string | null;
  datosIncluidos: string | null;
  minutosIncluidos: string | null;
  smsIncluidos: string | null;
  precioSinIva: number;
  precioConIva: number;
  permanencia: string | null;
  duracionPermanenciaMeses: number | null;
  garantia: string | null;
  destacada: boolean;
  esMovil: boolean;
  esFijo: boolean;
  esInternet: boolean;
  esTv: boolean;
  esCompuesta: boolean;
  seccionWebParticular: string | null;
  seccionWebEmpresa: string | null;
  contratosActivos?: number;
  esPopular?: boolean;
}

const tarifaSelect = {
  id: true,
  tipoCliente: true,
  categoria: true,
  nombre: true,
  nombreComercial: true,
  descripcionCorta: true,
  descripcionLarga: true,
  velocidad: true,
  velocidadBajada: true,
  velocidadSubida: true,
  fibraBajada: true,
  fibraSubida: true,
  datosIncluidos: true,
  minutosIncluidos: true,
  smsIncluidos: true,
  precioSinIva: true,
  precioConIva: true,
  permanencia: true,
  duracionPermanenciaMeses: true,
  garantia: true,
  destacada: true,
  esMovil: true,
  esFijo: true,
  esInternet: true,
  esTv: true,
  esCompuesta: true,
  seccionWebParticular: true,
  seccionWebEmpresa: true,
};

function convertTarifa(t: any): TarifaWeb {
  return {
    ...t,
    precioSinIva: Number(t.precioSinIva),
    precioConIva: Number(t.precioConIva),
    contratosActivos: 0,
    esPopular: false,
  };
}

// Get active contract counts per tarifa name
async function getContratosActivosPorTarifa(): Promise<Record<string, number>> {
  const result = await prisma.contratoServicio.groupBy({
    by: ['tarifa'],
    where: {
      fechaBaja: null,
    },
    _count: {
      tarifa: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const r of result) {
    // Use lowercase trimmed name as key for matching
    const key = r.tarifa.toLowerCase().trim();
    counts[key] = (counts[key] || 0) + r._count.tarifa;
  }
  return counts;
}

// Enrich tarifas with contract counts and mark the most popular
function enrichWithContractData(
  tarifas: TarifaWeb[],
  contratosMap: Record<string, number>
): TarifaWeb[] {
  // Add contract counts
  const enriched = tarifas.map(t => ({
    ...t,
    contratosActivos: contratosMap[t.nombre.toLowerCase().trim()] || 0,
  }));

  // Sort by contratos activos descending (most contracted first)
  enriched.sort((a, b) => b.contratosActivos - a.contratosActivos);

  return enriched;
}

// Mark the most popular tarifa in a list (top 3)
// Rules: mark as popular the one with most contracts, unless:
// - All have 0 contracts
// - All 3 have the same number of contracts
function markPopular(tarifas: TarifaWeb[]): TarifaWeb[] {
  if (tarifas.length === 0) return tarifas;

  const maxContratos = Math.max(...tarifas.map(t => t.contratosActivos || 0));

  // If all have 0 contracts, don't mark any
  if (maxContratos === 0) return tarifas;

  // If all have the same number, don't mark any
  const allSame = tarifas.every(t => (t.contratosActivos || 0) === (tarifas[0].contratosActivos || 0));
  if (allSame) return tarifas;

  // Mark the one with the most contracts as popular
  return tarifas.map(t => ({
    ...t,
    esPopular: (t.contratosActivos || 0) === maxContratos,
  }));
}

export async function getTarifasWeb(seccion: 'empresa' | 'particular'): Promise<{
  tarifas: TarifaWeb[];
  categorias: Record<string, TarifaWeb[]>;
  total: number;
}> {
  const where: any = {
    activa: true,
  };

  if (seccion === 'particular') {
    where.publicarWebParticular = true;
  } else {
    where.publicarWebEmpresa = true;
  }

  const [tarifasRaw, contratosMap] = await Promise.all([
    prisma.tarifa.findMany({
      where,
      select: tarifaSelect,
    }),
    getContratosActivosPorTarifa(),
  ]);

  const tarifasConverted = tarifasRaw.map(convertTarifa);
  const tarifasEnriched = enrichWithContractData(tarifasConverted, contratosMap);

  const categorias: Record<string, TarifaWeb[]> = {};
  for (const t of tarifasEnriched) {
    const cat = t.categoria || 'OTROS';
    if (!categorias[cat]) categorias[cat] = [];
    categorias[cat].push(t);
  }

  return {
    tarifas: tarifasEnriched,
    categorias,
    total: tarifasEnriched.length,
  };
}

// Get tarifas for a specific section of the particulares menu (internet, movil, packs, ofertas)
export async function getTarifasSeccionParticular(seccionMenu: 'internet' | 'movil' | 'packs' | 'ofertas'): Promise<{
  tarifas: TarifaWeb[];
  top3: TarifaWeb[];
  total: number;
}> {
  const [tarifasRaw, contratosMap] = await Promise.all([
    prisma.tarifa.findMany({
      where: {
        activa: true,
        publicarWebParticular: true,
        seccionWebParticular: seccionMenu,
      },
      select: tarifaSelect,
    }),
    getContratosActivosPorTarifa(),
  ]);

  const tarifasConverted = tarifasRaw.map(convertTarifa);
  const tarifasEnriched = enrichWithContractData(tarifasConverted, contratosMap);

  // Top 3 = the 3 most contracted, with popular marking
  const top3 = markPopular(tarifasEnriched.slice(0, 3));

  return {
    tarifas: tarifasEnriched,
    top3,
    total: tarifasEnriched.length,
  };
}

// Get tarifas for a specific solution of the empresa section
export async function getTarifasSolucionEmpresa(solucion: string): Promise<{
  tarifas: TarifaWeb[];
  top3: TarifaWeb[];
  total: number;
}> {
  const [tarifasRaw, contratosMap] = await Promise.all([
    prisma.tarifa.findMany({
      where: {
        activa: true,
        publicarWebEmpresa: true,
        seccionWebEmpresa: solucion,
      },
      select: tarifaSelect,
    }),
    getContratosActivosPorTarifa(),
  ]);

  const tarifasConverted = tarifasRaw.map(convertTarifa);
  const tarifasEnriched = enrichWithContractData(tarifasConverted, contratosMap);

  // Top 3 = the 3 most contracted, with popular marking
  const top3 = markPopular(tarifasEnriched.slice(0, 3));

  return {
    tarifas: tarifasEnriched,
    top3,
    total: tarifasEnriched.length,
  };
}

// Get the top 3 highlighted tarifas for the landing page
export async function getTarifasLandingParticular(): Promise<TarifaWeb[]> {
  const [tarifasRaw, contratosMap] = await Promise.all([
    prisma.tarifa.findMany({
      where: {
        activa: true,
        publicarWebParticular: true,
      },
      select: tarifaSelect,
    }),
    getContratosActivosPorTarifa(),
  ]);

  const tarifasConverted = tarifasRaw.map(convertTarifa);
  const tarifasEnriched = enrichWithContractData(tarifasConverted, contratosMap);

  // Top 3 most contracted, with popular marking
  const top3 = markPopular(tarifasEnriched.slice(0, 3));

  return top3;
}
