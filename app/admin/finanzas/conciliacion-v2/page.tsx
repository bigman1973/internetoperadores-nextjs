import { redirect } from 'next/navigation';
import { REDIRECTS_ANTIGUOS, destinoConciliar } from '@/lib/finanzas/conciliar-unificado';

export const dynamic = 'force-dynamic';

/** Encargo J: esta pantalla se ha integrado en /admin/finanzas/conciliar (vista «bandeja»). Las APIs no cambian. */
export default function Page(): never {
  redirect(destinoConciliar(REDIRECTS_ANTIGUOS['/admin/finanzas/conciliacion-v2'] ?? 'bandeja'));
}
