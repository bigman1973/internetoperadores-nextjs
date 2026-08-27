export const EMPRESAS_GRUPO = [
  'INTERNET OPERADORES',
  'LFGD',
  'LFDEAL',
  'LFKAPITAL',
  'FARMSPLANET',
  'MIKELS',
] as const;

export const ACTIVIDADES_COMERCIALES = [
  { value: 'LLAMADAS', label: 'Llamadas', unidad: 'llamadas', permiteEfectivos: true },
  { value: 'CORREOS', label: 'Correos', unidad: 'correos', permiteEfectivos: false },
  { value: 'REUNIONES', label: 'Reuniones', unidad: 'reuniones', permiteEfectivos: false },
  { value: 'PREPARACION_OFERTA', label: 'Preparación de oferta', unidad: 'ofertas', permiteEfectivos: false },
  { value: 'SEGUIMIENTO', label: 'Seguimiento', unidad: 'gestiones', permiteEfectivos: true },
  { value: 'PROSPECCION', label: 'Prospección', unidad: 'contactos', permiteEfectivos: true },
  { value: 'VISITA_COMERCIAL', label: 'Visita comercial', unidad: 'visitas', permiteEfectivos: false },
  { value: 'GESTION_CRM', label: 'Gestión CRM / administrativa', unidad: 'gestiones', permiteEfectivos: false },
  { value: 'OTRA', label: 'Otra actividad', unidad: 'acciones', permiteEfectivos: false },
] as const;

export const RESULTADOS_COMERCIALES = [
  { value: 'SIN_CONTACTO', label: 'Sin contacto' },
  { value: 'CONTACTO_REALIZADO', label: 'Contacto realizado' },
  { value: 'REUNION_CONCERTADA', label: 'Reunión concertada' },
  { value: 'OFERTA_ENVIADA', label: 'Oferta enviada' },
  { value: 'EN_NEGOCIACION', label: 'En negociación' },
  { value: 'VENTA_CONSEGUIDA', label: 'Venta conseguida' },
  { value: 'SEGUIMIENTO_PENDIENTE', label: 'Seguimiento pendiente' },
  { value: 'OPORTUNIDAD_PERDIDA', label: 'Oportunidad perdida' },
] as const;

export const COMPLEJIDADES_COMERCIALES = [
  { value: 'SENCILLA', label: 'Sencilla', description: 'Gestión breve o rutinaria', weight: 1 },
  { value: 'ESTANDAR', label: 'Estándar', description: 'Requiere preparación o varios interlocutores', weight: 2 },
  { value: 'COMPLEJA', label: 'Compleja', description: 'Gestión estratégica, técnica o de larga duración', weight: 3 },
] as const;

export const RESULTADOS_CERRADOS = new Set(['VENTA_CONSEGUIDA', 'OPORTUNIDAD_PERDIDA']);

export type EmpresaGrupo = (typeof EMPRESAS_GRUPO)[number];

export function getActividadComercial(value?: string | null) {
  return ACTIVIDADES_COMERCIALES.find((item) => item.value === value);
}

export function getResultadoComercial(value?: string | null) {
  return RESULTADOS_COMERCIALES.find((item) => item.value === value);
}

export function getComplejidadComercial(value?: string | null) {
  return COMPLEJIDADES_COMERCIALES.find((item) => item.value === value);
}

export function parseOptionalNonNegativeInt(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
    throw new Error('Las cantidades comerciales deben ser números enteros entre 0 y 9.999');
  }
  return parsed;
}

export function normalizeCommercialInput(body: Record<string, unknown>, categoria: string) {
  if (categoria !== 'Comercial') {
    return {
      empresaGrupo: 'INTERNET OPERADORES',
      tipoActividad: null,
      cantidadActividad: null,
      contactosEfectivos: null,
      resultadoComercial: null,
      complejidadComercial: null,
      proximaAccion: null,
      fechaProximaAccion: null,
    };
  }

  const empresaGrupo = typeof body.empresaGrupo === 'string' && EMPRESAS_GRUPO.includes(body.empresaGrupo as EmpresaGrupo)
    ? body.empresaGrupo
    : 'INTERNET OPERADORES';
  const tipoActividad = typeof body.tipoActividad === 'string' && ACTIVIDADES_COMERCIALES.some((item) => item.value === body.tipoActividad)
    ? body.tipoActividad
    : null;
  const cantidadActividad = parseOptionalNonNegativeInt(body.cantidadActividad);
  const activityAllowsEffective = ACTIVIDADES_COMERCIALES.find((item) => item.value === tipoActividad)?.permiteEfectivos === true;
  const contactosEfectivos = activityAllowsEffective ? parseOptionalNonNegativeInt(body.contactosEfectivos) : null;
  const resultadoComercial = typeof body.resultadoComercial === 'string' && RESULTADOS_COMERCIALES.some((item) => item.value === body.resultadoComercial)
    ? body.resultadoComercial
    : null;
  const complejidadComercial = typeof body.complejidadComercial === 'string' && COMPLEJIDADES_COMERCIALES.some((item) => item.value === body.complejidadComercial)
    ? body.complejidadComercial
    : null;
  const proximaAccion = typeof body.proximaAccion === 'string' && body.proximaAccion.trim()
    ? body.proximaAccion.trim().slice(0, 500)
    : null;
  let fechaProximaAccion: Date | null = null;
  if (typeof body.fechaProximaAccion === 'string' && body.fechaProximaAccion) {
    fechaProximaAccion = new Date(`${body.fechaProximaAccion}T00:00:00`);
    if (Number.isNaN(fechaProximaAccion.getTime())) throw new Error('La fecha de próxima acción no es válida');
  }

  if (cantidadActividad !== null && contactosEfectivos !== null && contactosEfectivos > cantidadActividad) {
    throw new Error('Los contactos efectivos no pueden superar la actividad total');
  }

  return {
    empresaGrupo,
    tipoActividad,
    cantidadActividad,
    contactosEfectivos,
    resultadoComercial,
    complejidadComercial,
    proximaAccion,
    fechaProximaAccion,
  };
}
