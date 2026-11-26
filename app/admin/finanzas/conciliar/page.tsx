import { notFound } from 'next/navigation';
import ConciliarClasica from './ConciliarClasica';
import ConciliarUnificado from '@/components/finanzas/conciliar-unificado/ConciliarUnificado';
import { ioFontClasses } from '@/components/io-ui/fonts';
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime';
import { readConteosBandeja, readCuentasCuadre, readRemesasResumen, readResumenMovimientos } from '@/lib/finanzas/conciliar-cuadre';
import { parseVista } from '@/lib/finanzas/conciliar-unificado';
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { requireAuth } from '@/lib/middleware/auth';
import { requireArea4Capability } from '@/lib/area4/live-admin';
import { documentosPanelRuntime } from '@/lib/finanzas/documentos-panel-runtime';
import { verificarPermisoServer } from '@/lib/permisos';
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
    const access = await requireB4FinanceAccess('lectura', await requireAuth('admin'));
    if (!access.ok) notFound();
    const query = await searchParams;
    if (query.vista === 'clasica') return <ConciliarClasica searchParams={searchParams} />;
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
    const [cuentas, resumen, conteos, remesas] = await Promise.all([readCuentasCuadre(), readResumenMovimientos(), readConteosBandeja(), readRemesasResumen()]);
    // The document shell has its own default-closed gate and exact live capability.
    // It does not change MODO_FACIL_ONLY, roles, grants or the other Conciliar tabs.
    const documentosRuntime = documentosPanelRuntime();
    let documentosHabilitados = false;
    let documentosCanWrite = false;
    if (documentosRuntime) {
      const documentos = await requireArea4Capability(prisma, 'admin.finanzas.facturas', 'lectura', '/api/admin/finanzas/documentos');
      documentosHabilitados = documentos.ok && documentos.principal.id === access.actor.id
        && documentos.session?.impersonation == null && (documentos.session?.user as { impersonation?: unknown })?.impersonation == null;
      if (documentosHabilitados && !documentosRuntime.readOnly) {
        const [write, facturas, conciliacion] = await Promise.all([
          requireArea4Capability(prisma, 'admin.finanzas.facturas', 'escritura', '/api/admin/finanzas/documentos'),
          verificarPermisoServer(access.actor.id, 'admin.finanzas.facturas'),
          verificarPermisoServer(access.actor.id, 'admin.finanzas.conciliacion'),
        ]);
        documentosCanWrite = write.ok && write.principal.id === access.actor.id && write.session?.impersonation == null
          && facturas.lectura && facturas.escritura && conciliacion.lectura && conciliacion.escritura;
      }
    }
    return (
      <div className={`io-ui area3-conciliar ${ioFontClasses}`}>
        <ConciliarUnificado hoy={new Date().toISOString().slice(0, 10)} vistaInicial={parseVista(query.vista)} qInicial={q} cuentas={cuentas} resumen={resumen} conteos={conteos} remesas={remesas} documentosHabilitados={documentosHabilitados} documentosEnvironment={documentosRuntime?.environment} documentosCanWrite={documentosCanWrite} />
      </div>
    );
  } catch (error) {
    if (error instanceof ConciliarRuntimeError) notFound();
    throw error;
  }
}
