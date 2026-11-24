import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calcularCostes, type FacturaIn, type MovIn, type ReglaIn, type ManualIn, type ServicioIn, type ResultadoCostes, listaMeses } from './costes';

export const CATEGORIAS = ['web_infraestructura', 'base_datos', 'desarrollo_ia', 'marketing', 'ofimatica', 'crm', 'operaciones_isp'] as const;
export const ESTADOS = ['activo', 'en_prueba', 'en_baja', 'por_confirmar'] as const;
export const ENTORNOS = ['produccion', 'staging'] as const;
export const PERIODICIDADES = ['MENSUAL', 'ANUAL', 'VARIABLE'] as const;

export interface Servicio {
  id: string; slug: string; nombre: string; proveedor: string; categoria: string; descripcion: string | null; modulos: string[]; entornos: string[];
  titular: string | null; responsable: string | null; plan: string | null; estado: string; fechaAlta: string | null; fechaRenovacion: string | null; periodicidad: string;
  variablesEsperadas: string[]; url: string | null; notas: string | null; estadoManual: string | null; estadoManualAt: string | null; prevision2027Manual: number | null; orden: number;
}
export const mesActualMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

export async function sistemasDisponible(): Promise<boolean> {
  try { const r: any[] = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.area9_sis_servicios') IS NOT NULL AS ok`); return !!r[0]?.ok; } catch { return false; }
}

export async function listarServicios(): Promise<Servicio[]> {
  const rows: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id, slug, nombre, proveedor, categoria, descripcion, modulos, entornos, titular, responsable, plan, estado,
    to_char(fecha_alta,'YYYY-MM-DD') AS fecha_alta, to_char(fecha_renovacion,'YYYY-MM-DD') AS fecha_renovacion, periodicidad, variables_esperadas, url, notas, estado_manual,
    to_char(estado_manual_at,'YYYY-MM-DD"T"HH24:MI') AS estado_manual_at, prevision_2027_manual::float8 AS prev, orden FROM area9_sis_servicios ORDER BY orden, nombre`);
  return rows.map(r => ({ id: r.id, slug: r.slug, nombre: r.nombre, proveedor: r.proveedor, categoria: r.categoria, descripcion: r.descripcion, modulos: r.modulos ?? [], entornos: r.entornos ?? [], titular: r.titular, responsable: r.responsable, plan: r.plan, estado: r.estado, fechaAlta: r.fecha_alta, fechaRenovacion: r.fecha_renovacion, periodicidad: r.periodicidad, variablesEsperadas: r.variables_esperadas ?? [], url: r.url, notas: r.notas, estadoManual: r.estado_manual, estadoManualAt: r.estado_manual_at, prevision2027Manual: r.prev, orden: r.orden }));
}

export async function cargarCostes(desde: string, hasta: string, subidaPct: number): Promise<ResultadoCostes & { catalogo: { id: string; slug: string; nombre: string }[] }> {
  const servicios = await listarServicios();
  const reglasRaw: any[] = await prisma.$queryRaw(Prisma.sql`SELECT servicio_id, prioridad, proveedor_regex, concepto_regex, banco_regex, activa FROM area9_sis_reglas_coste`);
  const reglas: ReglaIn[] = reglasRaw.map(r => ({ servicioId: r.servicio_id, prioridad: r.prioridad, proveedorRegex: r.proveedor_regex, conceptoRegex: r.concepto_regex, bancoRegex: r.banco_regex, activa: r.activa }));
  // Mismo criterio que «incluida en totales» de Facturas recibidas: válida, sin copia, sin duplicado externo y sin lecturas fallidas.
  const f: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id, proveedor, num_factura, to_char(fecha,'YYYY-MM-DD') AS fecha, base::float8 AS base, total::float8 AS total, concepto
    FROM facturas_recibidas WHERE calidad = 'VALIDA' AND copia_de_id IS NULL AND duplicado_externo = false AND upper(proveedor) NOT IN ('ERROR_OCR','DESCONOCIDO')
      AND fecha >= ${desde + '-01'}::date AND fecha < (${hasta + '-01'}::date + interval '1 month')`);
  const facturas: FacturaIn[] = f.map(x => ({ id: x.id, proveedor: x.proveedor, numFactura: x.num_factura, fecha: x.fecha, base: Number(x.base), total: Number(x.total), concepto: x.concepto }));
  const bancos = reglas.filter(r => r.activa && r.bancoRegex).map(r => r.bancoRegex as string);
  let movimientos: MovIn[] = [];
  if (bancos.length) {
    const patron = bancos.join('|');
    const m: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id, to_char(fecha_operacion,'YYYY-MM-DD') AS fecha, importe::float8 AS importe, concepto, tercero, factura_id,
        (tipo_documento IS NOT NULL OR documento_recibido IS TRUE) AS con_doc
      FROM movimientos_bancarios WHERE importe < 0 AND (concepto ~* ${patron} OR coalesce(tercero,'') ~* ${patron})
        AND fecha_operacion >= ${desde + '-01'}::date AND fecha_operacion < (${hasta + '-01'}::date + interval '1 month')`);
    movimientos = m.map(x => ({ id: x.id, fecha: x.fecha, importe: Number(x.importe), concepto: x.concepto, tercero: x.tercero, facturaId: x.factura_id, conDocumento: !!x.con_doc }));
  }
  const mm: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id, servicio_id, to_char(fecha,'YYYY-MM-DD') AS fecha, concepto, importe::float8 AS importe, moneda, iva_pct::float8 AS iva, tipo, estado, (anulado_at IS NOT NULL) AS anulado FROM area9_sis_costes_manuales`);
  const manuales: ManualIn[] = mm.map(x => ({ id: x.id, servicioId: x.servicio_id, fecha: x.fecha, concepto: x.concepto, importe: Number(x.importe), moneda: x.moneda, ivaPct: Number(x.iva), tipo: x.tipo, estado: x.estado, anulado: !!x.anulado }));
  const tr: any[] = await prisma.$queryRaw(Prisma.sql`SELECT mes, usd_eur::float8 AS t FROM area9_sis_tasas`);
  const tasas = Object.fromEntries(tr.map(x => [x.mes, Number(x.t)]));
  const sIn: ServicioIn[] = servicios.map(s => ({ id: s.id, slug: s.slug, nombre: s.nombre, periodicidad: s.periodicidad as any, estado: s.estado, prevision2027Manual: s.prevision2027Manual }));
  const res = calcularCostes({ desde, hasta, mesActual: mesActualMadrid(), subidaPct, servicios: sIn, reglas, facturas, movimientos, manuales, tasas });
  return { ...res, catalogo: servicios.map(s => ({ id: s.id, slug: s.slug, nombre: s.nombre })) };
}

/** Facturas recibidas de proveedores de software que ninguna regla asigna: ayudan a mantener el inventario sin trabajo manual. */
export async function facturasSinServicio(desde: string): Promise<{ proveedor: string; n: number; base: number }[]> {
  const reglas: any[] = await prisma.$queryRaw(Prisma.sql`SELECT proveedor_regex FROM area9_sis_reglas_coste WHERE activa AND proveedor_regex IS NOT NULL`);
  const res: any[] = await prisma.$queryRaw(Prisma.sql`SELECT proveedor, count(*)::int AS n, round(sum(base)::numeric,2)::float8 AS base FROM facturas_recibidas
    WHERE calidad='VALIDA' AND copia_de_id IS NULL AND duplicado_externo=false AND fecha >= ${desde + '-01'}::date
      AND proveedor ~* 'software|cloud|hosting|saas|licen|digital|tech|online|internet|data|systems|google|amazon|apple|zoom|canva|adobe|slack|notion|figma|domain|dominio'
    GROUP BY proveedor ORDER BY 3 DESC LIMIT 40`);
  const ex = reglas.map(r => { try { return new RegExp(String(r.proveedor_regex), 'i'); } catch { return null; } }).filter(Boolean) as RegExp[];
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return res.filter(r => !ex.some(e => e.test(norm(r.proveedor)))).slice(0, 10).map(r => ({ proveedor: r.proveedor, n: r.n, base: r.base }));
}

export async function auditar(accion: string, entidad: string, entidadId: string | null, actor: number, detalle?: unknown) {
  await prisma.$executeRaw(Prisma.sql`INSERT INTO area9_sis_auditoria (accion, entidad, entidad_id, actor_id, detalle) VALUES (${accion}, ${entidad}, ${entidadId}, ${actor}, ${detalle ? JSON.stringify(detalle) : null}::jsonb)`);
}

/** Lee la tasa mensual media USD→EUR del BCE (Frankfurter, solo GET). Guarda las que faltan; no sobrescribe las existentes. */
export async function actualizarTasas(desde: string, hasta: string, actor: number): Promise<{ guardadas: string[]; error?: string }> {
  const meses = listaMeses(desde, hasta);
  const ex: any[] = await prisma.$queryRaw(Prisma.sql`SELECT mes FROM area9_sis_tasas`);
  const tengo = new Set(ex.map(x => x.mes)); const faltan = meses.filter(m => !tengo.has(m));
  if (!faltan.length) return { guardadas: [] };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const ini = faltan[0] + '-01'; const fin = new Date(Date.UTC(Number(faltan[faltan.length - 1].slice(0, 4)), Number(faltan[faltan.length - 1].slice(5)), 0)).toISOString().slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetch(`https://api.frankfurter.dev/v1/${ini}..${fin > hoy ? hoy : fin}?base=USD&symbols=EUR`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json(); const acum: Record<string, number[]> = {};
    for (const [d, v] of Object.entries<any>(j.rates ?? {})) if (typeof v?.EUR === 'number') (acum[d.slice(0, 7)] ??= []).push(v.EUR);
    const guardadas: string[] = [];
    for (const m of faltan) {
      const xs = acum[m]; if (!xs?.length) continue;
      const media = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100000) / 100000;
      await prisma.$executeRaw(Prisma.sql`INSERT INTO area9_sis_tasas (mes, usd_eur, fuente, actor_id) VALUES (${m}, ${media}, 'BCE (Frankfurter), media mensual', ${actor}) ON CONFLICT (mes) DO NOTHING`);
      guardadas.push(m);
    }
    await auditar('TASAS_ACTUALIZADAS', 'tasas', null, actor, { guardadas });
    return { guardadas };
  } catch (e: any) { return { guardadas: [], error: `No se pudieron leer las tasas del BCE: ${String(e?.message ?? e).slice(0, 120)}` }; } finally { clearTimeout(t); }
}
