import { requireSistemasAuth } from '@/lib/sistemas/auth';
import { listarServicios } from '@/lib/sistemas/data';
import { leerBd, leerGithub, leerRailway, leerVercel, variablesDeEsteEntorno } from '@/lib/sistemas/vivo';
import { failure, reply } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Estado técnico en vivo. Solo lectura. Nunca devuelve valores de variables de entorno ni tokens:
 * solo nombres y si están configuradas. Si una API no está conectada lo dice y la pantalla permite rellenar a mano.
 */
export async function GET() {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const [github, railway, bd, servicios] = await Promise.all([leerGithub(), leerRailway(), leerBd(), listarServicios()]);
    const vercel = await leerVercel(github.datos?.mainSha ?? null);
    const entorno = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
    const variables = servicios.filter(s => s.variablesEsperadas.length).map(s => ({ slug: s.slug, nombre: s.nombre, variables: variablesDeEsteEntorno(s.variablesEsperadas) }));
    const pendientes = variables.flatMap(v => v.variables.filter(x => !x.configurada).map(x => `${x.nombre} no configurada (${v.nombre})`));
    // Variables extra que Vercel tiene definidas por entorno: solo nombres.
    const envPorEntorno = vercel.datos?.envPorEntorno ?? null;
    const faltanEnProduccion = envPorEntorno ? servicios.flatMap(s => s.variablesEsperadas.filter(v => !envPorEntorno.production.includes(v)).map(v => ({ servicio: s.nombre, variable: v }))) : null;
    return reply({
      leidoAt: new Date().toISOString(), entornoActual: entorno,
      vercel, github, railway, bd, variables, pendientes, envPorEntorno, faltanEnProduccion,
      region: process.env.VERCEL_REGION ?? null,
    });
  } catch (e) { return failure(e); }
}
