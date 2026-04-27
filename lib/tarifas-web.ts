import prisma from './prisma';

export interface TarifaWeb {
  id: number;
  tipoCliente: string;
  categoria: string;
  nombre: string;
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
}

const tarifaSelect = {
  id: true,
  tipoCliente: true,
  categoria: true,
  nombre: true,
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
};

function convertTarifa(t: any): TarifaWeb {
  return {
    ...t,
    precioSinIva: Number(t.precioSinIva),
    precioConIva: Number(t.precioConIva),
  };
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

  const tarifas = await prisma.tarifa.findMany({
    where,
    select: tarifaSelect,
    orderBy: [
      { destacada: 'desc' },
      { categoria: 'asc' },
      { orden: 'asc' },
      { nombre: 'asc' },
    ],
  });

  const tarifasConverted = tarifas.map(convertTarifa);

  const categorias: Record<string, TarifaWeb[]> = {};
  for (const t of tarifasConverted) {
    const cat = t.categoria || 'OTROS';
    if (!categorias[cat]) categorias[cat] = [];
    categorias[cat].push(t);
  }

  return {
    tarifas: tarifasConverted,
    categorias,
    total: tarifasConverted.length,
  };
}

// Get tarifas for a specific section of the particulares menu (internet, movil, packs, ofertas)
export async function getTarifasSeccionParticular(seccionMenu: 'internet' | 'movil' | 'packs' | 'ofertas'): Promise<{
  tarifas: TarifaWeb[];
  top3: TarifaWeb[];
  total: number;
}> {
  const tarifas = await prisma.tarifa.findMany({
    where: {
      activa: true,
      publicarWebParticular: true,
      seccionWebParticular: seccionMenu,
    },
    select: tarifaSelect,
    orderBy: [
      { destacada: 'desc' },
      { orden: 'asc' },
      { precioConIva: 'asc' },
    ],
  });

  const tarifasConverted = tarifas.map(convertTarifa);

  return {
    tarifas: tarifasConverted,
    top3: tarifasConverted.slice(0, 3),
    total: tarifasConverted.length,
  };
}

// Get the top 3 highlighted tarifas for the landing page
export async function getTarifasLandingParticular(): Promise<TarifaWeb[]> {
  const tarifas = await prisma.tarifa.findMany({
    where: {
      activa: true,
      publicarWebParticular: true,
      destacada: true,
    },
    select: tarifaSelect,
    orderBy: [
      { orden: 'asc' },
      { precioConIva: 'asc' },
    ],
    take: 3,
  });

  // If less than 3 destacadas, fill with cheapest non-destacadas
  if (tarifas.length < 3) {
    const extra = await prisma.tarifa.findMany({
      where: {
        activa: true,
        publicarWebParticular: true,
        destacada: false,
        id: { notIn: tarifas.map(t => t.id) },
      },
      select: tarifaSelect,
      orderBy: [{ precioConIva: 'asc' }],
      take: 3 - tarifas.length,
    });
    tarifas.push(...extra);
  }

  return tarifas.map(convertTarifa);
}
