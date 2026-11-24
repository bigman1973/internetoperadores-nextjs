import { prisma } from '@/lib/prisma';
import vercelConfig from '@/vercel.json';

/**
 * Estado técnico en vivo. SOLO LECTURA: únicamente peticiones GET (y la consulta GraphQL de lectura de Railway).
 * Los tokens salen de variables de entorno y nunca se devuelven. De las variables de entorno solo se leen NOMBRES.
 */
export type EstadoConector = 'ok' | 'no_conectado' | 'error';
export interface Conector<T> { estado: EstadoConector; motivo?: string; variables?: string[]; datos?: T; leidoAt: string }

const TIMEOUT = 8000;
const ahora = () => new Date().toISOString();
const noConectado = <T,>(motivo: string, variables: string[]): Conector<T> => ({ estado: 'no_conectado', motivo, variables, leidoAt: ahora() });
const conError = <T,>(motivo: string): Conector<T> => ({ estado: 'error', motivo: limpia(motivo), leidoAt: ahora() });
/** Quita cualquier cosa que parezca un token antes de devolver un mensaje de error. */
export function limpia(s: string): string { return String(s).replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***').replace(/[A-Za-z0-9_-]{32,}/g, '***').slice(0, 240); }

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { method: 'GET', headers, signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------------- Vercel ---------------- */
export interface DespliegueVercel { entorno: 'produccion' | 'staging' | 'preview'; sha: string; rama: string; mensaje: string; estado: string; fecha: string }
export interface DatosVercel { produccion: DespliegueVercel | null; staging: DespliegueVercel | null; mainSha: string | null; produccionCoincideConMain: boolean | null; envPorEntorno: Record<string, string[]> }
const VERCEL_VARS = ['SISTEMAS_VERCEL_TOKEN', 'SISTEMAS_VERCEL_PROJECT_ID'];
export async function leerVercel(mainSha: string | null): Promise<Conector<DatosVercel>> {
  const token = process.env.SISTEMAS_VERCEL_TOKEN, proyecto = process.env.SISTEMAS_VERCEL_PROJECT_ID, team = process.env.SISTEMAS_VERCEL_TEAM_ID;
  if (!token || !proyecto) return noConectado('Falta el token de solo lectura de Vercel. Añade SISTEMAS_VERCEL_TOKEN y SISTEMAS_VERCEL_PROJECT_ID (y SISTEMAS_VERCEL_TEAM_ID si el proyecto es de un equipo).', VERCEL_VARS);
  const h = { Authorization: `Bearer ${token}` }; const q = team ? `&teamId=${encodeURIComponent(team)}` : '';
  try {
    const dep = await getJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(proyecto)}&limit=30${q}`, h);
    const mapa = (d: any, entorno: DespliegueVercel['entorno']): DespliegueVercel => ({ entorno, sha: String(d.meta?.githubCommitSha ?? '').slice(0, 8), rama: String(d.meta?.githubCommitRef ?? ''), mensaje: String(d.meta?.githubCommitMessage ?? '').split('\n')[0].slice(0, 140), estado: String(d.state ?? d.readyState ?? ''), fecha: new Date(d.created ?? d.createdAt ?? 0).toISOString() });
    const lista: any[] = dep.deployments ?? [];
    const prod = lista.find(d => d.target === 'production' && (d.state ?? d.readyState) === 'READY');
    const stg = lista.find(d => d.target !== 'production' && d.meta?.githubCommitRef === 'staging' && (d.state ?? d.readyState) === 'READY');
    const envPorEntorno: Record<string, string[]> = { production: [], preview: [], development: [] };
    try {
      // Sin decrypt: Vercel devuelve valores cifrados; aun así solo se extrae `key` y `target`.
      const env = await getJson(`https://api.vercel.com/v9/projects/${encodeURIComponent(proyecto)}/env?limit=200${q}`, h);
      for (const v of env.envs ?? []) for (const t of (Array.isArray(v.target) ? v.target : [v.target])) if (envPorEntorno[t]) envPorEntorno[t].push(String(v.key));
      for (const k of Object.keys(envPorEntorno)) envPorEntorno[k] = [...new Set(envPorEntorno[k])].sort();
    } catch { /* sin permiso para ver variables: se informa con lista vacía */ }
    const p = prod ? mapa(prod, 'produccion') : null;
    return { estado: 'ok', leidoAt: ahora(), datos: { produccion: p, staging: stg ? mapa(stg, 'staging') : null, mainSha, produccionCoincideConMain: p && mainSha ? p.sha === mainSha.slice(0, 8) : null, envPorEntorno } };
  } catch (e: any) { return conError(`No se pudo leer Vercel: ${e?.message ?? e}`); }
}

/* ---------------- GitHub ---------------- */
export interface DatosGithub { mainSha: string | null; mainMensaje: string | null; workflows: { nombre: string; estado: string; ultimaEjecucion: string | null; resultado: string | null }[]; crons: { ruta: string; programacion: string }[]; ramasArea: string[] }
const GH_VARS = ['SISTEMAS_GITHUB_TOKEN'];
const REPO = 'bigman1973/internetoperadores-nextjs';
export function cronsDeVercel(): { ruta: string; programacion: string }[] {
  const c = (vercelConfig as any)?.crons; return Array.isArray(c) ? c.map((x: any) => ({ ruta: String(x.path), programacion: String(x.schedule) })) : [];
}
export async function leerGithub(): Promise<Conector<DatosGithub>> {
  const token = process.env.SISTEMAS_GITHUB_TOKEN;
  if (!token) return noConectado('Falta el token de solo lectura de GitHub (SISTEMAS_GITHUB_TOKEN, permiso «Contents» y «Actions» de lectura).', GH_VARS);
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    const main = await getJson(`https://api.github.com/repos/${REPO}/commits/main`, h);
    const wf = await getJson(`https://api.github.com/repos/${REPO}/actions/workflows`, h);
    const workflows: DatosGithub['workflows'] = [];
    for (const w of (wf.workflows ?? []).slice(0, 12)) {
      let ult: any = null;
      try { const r = await getJson(`https://api.github.com/repos/${REPO}/actions/workflows/${w.id}/runs?per_page=1`, h); ult = r.workflow_runs?.[0] ?? null; } catch { /* sin ejecuciones */ }
      workflows.push({ nombre: String(w.name), estado: String(w.state), ultimaEjecucion: ult?.created_at ?? null, resultado: ult ? String(ult.conclusion ?? ult.status) : null });
    }
    let ramasArea: string[] = [];
    try { const br = await getJson(`https://api.github.com/repos/${REPO}/branches?per_page=100`, h); ramasArea = (br as any[]).map(b => String(b.name)).filter(n => /^(area\d|staging$|main$|backup\/)/.test(n)).sort(); } catch { /* opcional */ }
    return { estado: 'ok', leidoAt: ahora(), datos: { mainSha: String(main.sha ?? '').slice(0, 8) || null, mainMensaje: String(main.commit?.message ?? '').split('\n')[0].slice(0, 140) || null, workflows, crons: cronsDeVercel(), ramasArea } };
  } catch (e: any) { return conError(`No se pudo leer GitHub: ${e?.message ?? e}`); }
}

/* ---------------- Railway ---------------- */
export interface DatosRailway { proyectos: { nombre: string; entornos: string[]; servicios: { nombre: string; ultimoDespliegue: string | null }[] }[] }
const RW_VARS = ['SISTEMAS_RAILWAY_TOKEN'];
export async function leerRailway(): Promise<Conector<DatosRailway>> {
  const token = process.env.SISTEMAS_RAILWAY_TOKEN;
  if (!token) return noConectado('Falta el token de solo lectura de Railway (SISTEMAS_RAILWAY_TOKEN, token de cuenta o de equipo).', RW_VARS);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const query = 'query { me { projects { edges { node { name environments { edges { node { name } } } services { edges { node { name serviceInstances { edges { node { latestDeployment { status createdAt } } } } } } } } } } } }';
    const r = await fetch('https://backboard.railway.app/graphql/v2', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json(); if (j.errors?.length) throw new Error(String(j.errors[0]?.message ?? 'error GraphQL').slice(0, 120));
    const proyectos = (j.data?.me?.projects?.edges ?? []).map((p: any) => ({
      nombre: String(p.node.name), entornos: (p.node.environments?.edges ?? []).map((x: any) => String(x.node.name)),
      servicios: (p.node.services?.edges ?? []).map((s: any) => { const d = s.node.serviceInstances?.edges?.[0]?.node?.latestDeployment; return { nombre: String(s.node.name), ultimoDespliegue: d ? `${d.status} · ${String(d.createdAt).slice(0, 16).replace('T', ' ')}` : null }; }),
    }));
    return { estado: 'ok', leidoAt: ahora(), datos: { proyectos } };
  } catch (e: any) { return conError(`No se pudo leer Railway: ${e?.message ?? e}`); } finally { clearTimeout(t); }
}

/* ---------------- Salud de la base de datos (consultas de solo lectura) ---------------- */
export interface DatosBd { baseDatos: string; latenciaMs: number; tamanoMb: number; conexiones: number; maxConexiones: number; tablas: number; migracionesAplicadas: number; ultimaMigracion: string | null; versionPg: string }
export async function leerBd(): Promise<Conector<DatosBd>> {
  try {
    const t0 = Date.now(); await prisma.$queryRawUnsafe('SELECT 1'); const latenciaMs = Date.now() - t0;
    const r: any[] = await prisma.$queryRawUnsafe(`SELECT current_database() AS bd, round(pg_database_size(current_database())/1048576.0)::int AS mb,
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS conex,
      current_setting('max_connections')::int AS maxc,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tablas,
      split_part(version(), ' ', 2) AS ver`);
    let mig = 0, ult: string | null = null;
    try { const m: any[] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n, max(migration_name) AS ult FROM _prisma_migrations WHERE finished_at IS NOT NULL'); mig = m[0]?.n ?? 0; ult = m[0]?.ult ?? null; } catch { /* sin tabla de migraciones */ }
    const x = r[0];
    return { estado: 'ok', leidoAt: ahora(), datos: { baseDatos: String(x.bd), latenciaMs, tamanoMb: Number(x.mb), conexiones: Number(x.conex), maxConexiones: Number(x.maxc), tablas: Number(x.tablas), migracionesAplicadas: mig, ultimaMigracion: ult, versionPg: String(x.ver) } };
  } catch (e: any) { return conError(`No se pudo comprobar la base de datos: ${e?.message ?? e}`); }
}

/* ---------------- Variables de entorno de ESTE despliegue (solo nombres) ---------------- */
export function variablesDeEsteEntorno(esperadas: string[]): { nombre: string; configurada: boolean }[] {
  return [...new Set(esperadas)].sort().map(nombre => ({ nombre, configurada: typeof process.env[nombre] === 'string' && process.env[nombre]!.length > 0 }));
}
