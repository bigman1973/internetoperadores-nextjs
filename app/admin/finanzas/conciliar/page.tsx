import { notFound } from 'next/navigation';
import ConciliarClasica from './ConciliarClasica';
import ConciliarUnificado from '@/components/finanzas/conciliar-unificado/ConciliarUnificado';
import { ioFontClasses } from '@/components/io-ui/fonts';
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime';
import { readConteosBandeja, readCuentasCuadre, readRemesasResumen, readResumenMovimientos } from '@/lib/finanzas/conciliar-cuadre';
import { parseVista } from '@/lib/finanzas/conciliar-unificado';
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { requireAuth } from '@/lib/middleware/auth';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';
import { requireArea4Capability } from '@/lib/area4/live-admin';
import prisma from '@/lib/prisma';
import '@/components/io-ui/io-ui.css';
import './area3-conciliar.css';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sfo1';

/*
 * Encargo J · Conciliar, pantalla única (maqueta_conciliar_aprobada.html).
 * Sustituye a Conciliar, Conciliación v2, Modo fácil, Pendientes y Conciliación de remesas.
 * Mismas guardas que la página anterior: runtime cerrado -> 404 y acceso de lectura B4 vivo.
 * Las cifras salen de la BD con lectores de solo lectura; las listas se piden desde el cliente
 * a las APIs existentes, que conservan sus guardas, su auditoría y su deshacer.
 */
export default async function ConciliarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try {
    await assertConciliarRuntime();
    // requireAuth usa cache() de React: comparte sólo la sesión ya comprobada por el layout en este render.
    const access = await requireB4FinanceAccess('lectura', await requireAuth('admin'));
    if (!access.ok) notFound();
    const query = await searchParams;
    if (query.vista === 'clasica') return <ConciliarClasica searchParams={searchParams} />; // vía de retorno a la pantalla anterior
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
    const [cuentas, resumen, conteos, remesas] = await Promise.all([readCuentasCuadre(), readResumenMovimientos(), readConteosBandeja(), readRemesasResumen()]);
    // New Documentos is not a production opt-in and never inherits a parent ACL.
    let documentosHabilitados = false;
    if (process.env.FINANCE_DEPLOYMENT_READ_ONLY !== '1' && process.env.IO_PRODUCTION_READ_ONLY !== '1') {
      try {
        await assertPrototypeStaging();
        const documentos = await requireArea4Capability(prisma, 'admin.finanzas.facturas', 'lectura', '/api/admin/finanzas/documentos');
        documentosHabilitados = documentos.ok && documentos.session?.impersonation == null;
      } catch (error) { if (!(error instanceof PrototypeStagingError)) throw error; }
    }
    return (
      <div className={`io-ui area3-conciliar ${ioFontClasses}`}>
        <ConciliarUnificado hoy={new Date().toISOString().slice(0, 10)} vistaInicial={parseVista(query.vista)} qInicial={q} cuentas={cuentas} resumen={resumen} conteos={conteos} remesas={remesas} documentosHabilitados={documentosHabilitados} />
      </div>
    );
  } catch (error) {
    if (error instanceof ConciliarRuntimeError) notFound();
    throw error;
  }
}
