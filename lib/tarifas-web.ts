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
    select: {
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
    },
    orderBy: [
      { destacada: 'desc' },
      { categoria: 'asc' },
      { orden: 'asc' },
      { nombre: 'asc' },
    ],
  });

  const tarifasConverted: TarifaWeb[] = tarifas.map(t => ({
    ...t,
    precioSinIva: Number(t.precioSinIva),
    precioConIva: Number(t.precioConIva),
  }));

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
